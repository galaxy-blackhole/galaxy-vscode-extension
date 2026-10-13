import * as vscode from "vscode";
import { appendFileSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../protocol";
import { resolveThinkingPolicy, thinkingLabel } from "@galaxy-stack/ai-coder-core";
import { createOllamaCoreModel } from "./core-model";
import { createEvidenceVerifier } from "./core-host";
import { detectGitWorkTree } from "./core-tool-executor";
import { readPreferences, writePreferences } from "./preferences";
import { webviewHtml } from "./webview-html";
import { buildWorkspaceMap, type ContextItem } from "./workspace-map";
import { resolveModelLibraryUrl, resolveOllamaConnection, type OllamaConnection } from "./config";
import { streamOllamaChat } from "./ollama-client";
import { startCoreRun, warmUpCore, type CoreRunSession, type CoreWarmUp } from "./core-run-session";
import { DEFAULT_AGENT_PRESET_ID, resolveAgentPreset } from "@galaxy-stack/ai-coder-core/runtime/agent-presets";
import { appendSessionTurn, createSession, deleteSession, listSessions, readSession } from "./session-store";
import type { AgentTool } from "@galaxy-stack/ai-coder-core/agent";
import { tryConnectWorkspaceMcp, workspaceMcpServers, type WorkspaceMcpHandle } from "./workspace-mcp";
import type { PermissionMode } from "./core-tool-executor";
import type { GalaxyUiAction } from "../ui-protocol";
import { planEventForWebview } from "./plan-event";
import {
  activeModel,
  configPath,
  hydrateKeys,
  readModelSettings,
  removeProvider,
  setActiveProvider,
  setProviderModel,
  setProviderThinking,
  setApiKey,
  summarize,
  upsertProvider,
  validateBaseUrl,
  validateProviderId,
  writeCanonicalKey,
  writeModelSettings,
  type ProviderEntry,
} from "./model-settings";

export class GalaxyChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "galaxy-code.chatView";
  private view?: vscode.WebviewView;
  private readonly controllers = new Map<string, AbortController>();
  private readonly disposables: vscode.Disposable[] = [];
  private session: CoreRunSession | null = null;
  private permissionMode: PermissionMode = "smart";
  /** The named composition this session runs as; the preset answers how much to ask and how work is presented. */
  private presetId = DEFAULT_AGENT_PRESET_ID;
  private workspaceRoot: string | null = null;
  private connection: OllamaConnection | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Checkpoints, traces, and spilled output live in global storage, never in the workspace. */
  private get storageRoot(): string {
    return this.context.globalStorageUri.fsPath;
  }

  private get extensionUri(): vscode.Uri {
    return this.context.extensionUri;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [distUri],
    };
    view.webview.html = this.renderHtml(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        void this.handleMessage(message);
      }),
      view.onDidDispose(() => { this.session = null; }),
    );
  }

  newThread(): void {
    this.post({ type: "new-thread" });
  }

  private post(message: HostToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
    /* The settings tab listens to the same stream, so a key saved there refreshes in place. */
    void this.settingsPanel?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case "model-settings/save-key": {
        /* One secrets file for every host: write the shared document, then mirror it. */
        writeCanonicalKey(message.providerId, message.apiKey);
        const settings = setApiKey(hydrateKeys(readModelSettings(this.configPath)), message.providerId, message.apiKey);
        writeModelSettings(settings, this.configPath);
        this.refreshConnection();
        return;
      }
      case "model-settings/save-provider": {
        const draft = message.provider;
        const idError = validateProviderId(draft.id);
        if (idError !== undefined) { this.postModelSettings(`Provider ID: ${idError}`); return; }
        const urlError = validateBaseUrl(draft.baseUrl);
        if (urlError !== undefined) { this.postModelSettings(urlError); return; }
        const models = draft.models.map(value => value.trim()).filter(value => value.length > 0);
        if (models.length === 0) { this.postModelSettings("Nhà cung cấp tuỳ chỉnh cần ít nhất một model."); return; }
        const previous = readModelSettings(this.configPath).providers.find(entry => entry.id === draft.id);
        const apiKey = draft.apiKey !== undefined && draft.apiKey.trim().length > 0 ? draft.apiKey.trim() : previous?.apiKey;
        const entry: ProviderEntry = Object.freeze({
          api: draft.api,
          ...(apiKey === undefined ? {} : { apiKey }),
          baseUrl: draft.baseUrl.replace(/\/+$/, ""),
          displayName: draft.displayName.trim().length > 0 ? draft.displayName.trim() : draft.id,
          id: draft.id,
          models: Object.freeze(models.map(model => Object.freeze({ id: model }))),
        });
        if (apiKey !== undefined) writeCanonicalKey(entry.id, apiKey);
        const settings = upsertProvider(hydrateKeys(readModelSettings(this.configPath)), entry);
        writeModelSettings(settings, this.configPath);
        this.refreshConnection();
        return;
      }
      case "model-settings/set-thinking": {
        const document_ = readModelSettings(this.configPath);
        writeModelSettings(setProviderThinking(document_, document_.active, message.choice), this.configPath);
        this.refreshConnection();
        this.postThinking();
        return;
      }
      case "model-settings/set-model": {
        const current = readModelSettings(this.configPath);
        writeModelSettings(setProviderModel(current, current.active, message.model), this.configPath);
        this.refreshConnection();
        return;
      }
      case "model-settings/set-active": {
        writeModelSettings(setActiveProvider(readModelSettings(this.configPath), message.providerId), this.configPath);
        this.refreshConnection();
        return;
      }
      case "model-settings/remove": {
        writeModelSettings(removeProvider(readModelSettings(this.configPath), message.providerId), this.configPath);
        this.refreshConnection();
        return;
      }
      case "preferences/set": {
        this.post({ type: "preferences", preferences: writePreferences(this.storageRoot, message.patch) });
        return;
      }
      case "settings/open": {
        this.openSettingsPanel();
        return;
      }

      case "run-command": {
        /*
         * The Run button on a shell block. A modal confirmation stands between the click and the shell, and the
         * command runs where the owner can watch it: their active terminal, or a fresh one.
         */
        this.trace("run-command xin chạy: " + message.command.slice(0, 120));
        void vscode.window.showWarningMessage("Chạy lệnh này trong terminal?", { modal: true }, "Chạy").then((choice) => {
          if (choice !== "Chạy") { this.trace("run-command bị từ chối"); return; }
          const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal("Galaxy Blackhole");
          terminal.show();
          terminal.sendText(message.command, true);
          this.trace("run-command đã gửi vào terminal");
        });
        return;
      }
      case "ui-ready": {
        this.testLog.push("ui-ready");
        this.postThinking();
        this.postPreset();
        /*
         * Plan mode is a decision about the session, so it outlives a reload. The workspace keeps it, and the panel
         * is told what it is before anything else happens — a mode that silently resets teaches nobody.
         */
        this.planModeHeld = this.context.workspaceState.get<boolean>("galaxy.planMode") === true;
        this.post({ type: "ui-event", event: { kind: "plan/updated", mode: this.planModeHeld, steps: [] } });
        await this.session?.setPlanMode(this.planModeHeld);
        this.post({ type: "preferences", preferences: readPreferences(this.storageRoot) });
        const connection = resolveOllamaConnection();
        this.connection = connection;
        const workspace = vscode.workspace.workspaceFolders?.[0];
        this.workspaceRoot = workspace?.uri.fsPath ?? null;
        const modelLibraryUrl = resolveModelLibraryUrl(connection);
        this.post({
          type: "host-info",
          workspaceName: workspace?.name ?? "no workspace",
          workspacePath: workspace?.uri.fsPath ?? "",
          platform: process.platform,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
          model: connection.model,
          baseUrl: connection.baseUrl,
          credentialSource: connection.credentialSource,
          ...(modelLibraryUrl ? { modelLibraryUrl } : {}),
          modelSettings: summarize(hydrateKeys(readModelSettings(this.configPath))),
          version: this.context.extension.packageJSON.version as string,
        });
        void this.warmUpBoot();
    this.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("galaxy-payload", {
      provideTextDocumentContent: (uri: vscode.Uri) => this.payloads.get(uri.path.replace(/^\//, "")) ?? "",
    }));
        return;
      }
      case "chat-start": {
        const controller = new AbortController();
        this.controllers.set(message.runId, controller);
        try {
          const stats = await streamOllamaChat(
            resolveOllamaConnection(),
            message.request,
            (delta) => this.post({ type: "chat-delta", runId: message.runId, delta }),
            controller.signal,
          );
          this.post({ type: "chat-done", runId: message.runId, stats });
        } catch (error) {
          const isAbort = controller.signal.aborted;
          this.post({
            type: "chat-error",
            runId: message.runId,
            message: isAbort ? "cancelled" : error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.controllers.delete(message.runId);
        }
        return;
      }
      case "chat-cancel": {
        this.controllers.get(message.runId)?.abort(new Error("cancelled"));
        return;
      }
      case "session/action": {
        this.testLog.push("session/" + message.action.type + (typeof message.action.id === "string" ? ":" + message.action.id : ""));
        await this.handleSessionAction(message.action);
        return;
      }
      case "ui-action": {
        await this.handleUiAction(message.action);
        return;
      }
      case "open-external": {
        try {
          const uri = vscode.Uri.parse(message.url, true);
          if (uri.scheme === "http" || uri.scheme === "https") void vscode.env.openExternal(uri);
        } catch { /* ignore invalid url */ }
        return;
      }
    }
  }

  /** Where the shared Galaxy model/credential document lives. */
  private get configPath(): string {
    return configPath();
  }

  /** Re-read the shared document after an edit and tell the webview. */
  private refreshConnection(): void {
    this.connection = resolveOllamaConnection();
    this.postModelSettings();
  }

  private postModelSettings(error?: string): void {
    const settings = summarize(hydrateKeys(readModelSettings(this.configPath)));
    this.post({ type: "model-settings", settings });
    /* The active model changes with the provider list, so the header must follow. */
    this.post({
      type: "host-info",
      workspaceName: vscode.workspace.workspaceFolders?.[0]?.name ?? "no workspace",
      workspacePath: this.workspaceRoot ?? "",
      platform: process.platform,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      model: activeModel(readModelSettings(this.configPath)),
      baseUrl: this.connection?.baseUrl ?? "",
      credentialSource: this.connection?.credentialSource ?? "none",
      modelSettings: settings,
      version: this.context.extension.packageJSON.version as string,
    });
    if (error !== undefined) void vscode.window.showWarningMessage(error);
  }

  /** Set by `/compact` while idle: the next run compacts before its first model turn. */
  private compactOnNextRun = false;

  /**
   * Test-only breadcrumbs of what the webview asked for. The extension-host suite reads them through
   * the galaxy-code.__e2e command to prove the round trip happened inside a real editor.
   */
  readonly testLog: string[] = [];

  /** Test-only: send a command into the webview, i.e. do what a click in it would do. */
  sendTestCommand(command: Readonly<{ kind: "submit"; text: string } | { kind: "open-session"; id: string }>): void {
    this.post({ type: "test/command", command });
  }

  /** The Galaxy session this view shows; created lazily by the first run. */
  private sessionId: string | null = null;

  /** The settings tab, when one is open. */
  private settingsPanel: vscode.WebviewPanel | undefined;

  /** The workspace's MCP servers, connected once per window and reused for every run. */
  private mcp: Promise<WorkspaceMcpHandle | null> | null = null;
  /** Servers that did not come up; reported once per window instead of failing every run. */
  private mcpError: string | null = null;
  private mcpNoticeSent = false;

  /**
   * The boot half of the session panel: connect the workspace's MCP servers now, not on the first message. The
   * connect is once per window and slow enough that a run would otherwise open by waiting for it. Progress goes
   * to the webview so it can show the phase and offer to skip ahead; a failure is left to the run to report.
   */
  /**
   * A durable trace. `console.log` from an extension host reaches the Output panel but not the log file VS Code
   * keeps, so a session that misbehaves leaves nothing to read afterwards. These lines are appended to the
   * extension's own storage instead, where they survive the window.
   */
  /**
   * The same line the trace file keeps, mirrored into an output channel: VS Code's own place to watch a run.
   */
  private readonly runLog = vscode.window.createOutputChannel("Galaxy: Luồng chạy");
  /** Payloads the webview asked to read in full, keyed by the document name the tab opens. */
  private readonly payloads = new Map<string, string>();
  /** Plan mode as the last command left it; the session keeps its own copy, this one answers the next command. */
  private planModeHeld = false;
  /** The steps the last plan event carried, so the review card can show the plan without asking again. */
  private lastPlanSteps: readonly string[] = [];
  /** What each call in flight is, so a failure can name the tool and the arguments it was given. */
  private readonly callsInFlight = new Map<string, Readonly<{ name: string; args: unknown }>>();

  private trace(line: string): void {
    const storageRoot = this.sessionsRoot;
    if (storageRoot === null) return;
    try {
      const dir = join(storageRoot, "logs");
      this.runLog.appendLine(new Date().toISOString().slice(11, 19) + "  " + line);
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, "gbh.log"), new Date().toISOString() + " " + line + "\n", "utf8");
    } catch { /* a trace must never break a run */ }
  }

  /** The boot warm-up, kept so the first message reuses the probe and the index instead of repeating them. */
  private warm: CoreWarmUp | undefined;
  /**
   * The boot warm-up as a promise, so a message sent while it is still running waits for the same work instead of
   * repeating it. The log showed a 71-second round when send and boot overlapped.
   */
  private warmPromise: Promise<CoreWarmUp | undefined> = Promise.resolve(undefined);
  /** When the current run started, so the log can say how long the first model delta took. */
  private runStartedAt = 0;
  /** The workspace map, built once at boot so the first round does not pay for it. */
  private workspaceMap: ContextItem | null = null;

  /**
   * What the run changed, straight from Git: the transcript shows a card the owner can scan, and every path in it
   * opens the editor's own diff. A workspace that is not a work tree simply reports nothing.
   */
  private async reportChanges(): Promise<void> {
    const root = this.workspaceRoot;
    if (root === null) return;
    try {
      const { stdout } = await promisify(execFile)("git", ["-C", root, "diff", "--numstat", "HEAD"], { maxBuffer: 4 * 1024 * 1024 });
      const files = stdout.split(String.fromCharCode(10)).map((line: string) => line.split("\t")).flatMap((parts: readonly string[]) => {
        const [added, removed, path] = parts;
        if (path === undefined || added === undefined || removed === undefined) return [];
        const a = Number.parseInt(added, 10);
        const r = Number.parseInt(removed, 10);
        if (Number.isNaN(a) || Number.isNaN(r)) return [];
        return [{ added: a, path, removed: r }];
      });
      this.trace("thay đổi: " + files.length + " tệp");
      this.post({ type: "ui-event", event: { kind: "changes/summary", files } });
    } catch { /* not a work tree, or git is unavailable: nothing to report */ }
  }

  /**
   * Open one tool's payload as an editor tab. The transcript can only show a clipped row; a tab gives the whole
   * thing with the editor's own search, folding and copy — the part of DSH's trajectory panel worth keeping.
   */
  private openPayload(title: string, text: string): void {
    const name = title.replace(/[^\w.-]+/g, "-").slice(0, 60) + ".txt";
    this.payloads.set(name, text);
    void vscode.workspace.openTextDocument(vscode.Uri.parse("galaxy-payload:" + name)).then(
      (document) => vscode.window.showTextDocument(document, { preview: true }),
      () => undefined,
    );
  }

  private async warmUpBoot(): Promise<void> {
    const started = Date.now();
    this.trace("boot warm-up bắt đầu");
    const workspaceRoot = this.workspaceRoot;
    const storageRoot = this.sessionsRoot;
    if (workspaceRoot === null || storageRoot === null) {
      this.post({ type: "ui-event", event: { kind: "boot/ready", message: "" } });
      return;
    }
    /*
     * The map is cheap but it is still work: build it here, beside the probe, so the first message never waits for it.
     */
    this.workspaceMap = buildWorkspaceMap(workspaceRoot);
    this.trace(this.workspaceMap === null ? "bản đồ workspace: không dựng được" : "bản đồ workspace: " + this.workspaceMap.content.length + " ký tự");
    const servers = workspaceMcpServers(workspaceRoot);
    /*
     * The two steps a run would otherwise open with, done here while the owner is still reading the panel, and then
     * handed to the run so the first message does not repeat them. A failure is swallowed: the run does its own.
     */
    const connection = this.connection;
    /*
     * Warm the provider itself. The traces put 50-58 seconds between the run starting and the first delta with
     * nothing of ours in between: that is the provider's own first-request cost, best paid while the owner is
     * still reading the panel rather than after they press send.
     */
    if (connection !== null) {
      try {
        const warm = await fetch(new URL("/v1/chat/completions", connection.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(connection.apiKey === undefined ? {} : { authorization: "Bearer " + connection.apiKey }),
          },
          body: JSON.stringify({ model: connection.model, messages: [{ role: "user", content: "ok" }], max_tokens: 1, stream: false }),
        });
        this.trace("provider hâm nóng: HTTP " + warm.status);
      } catch (error) {
        this.trace("provider hâm nóng lỗi: " + String(error).slice(0, 80));
      }
    }
    if (connection !== null) {
      try {
        this.warm = await (this.warmPromise = warmUpCore({
          connection,
          workspaceRoot,
          onTrace: (line) => this.trace(line),
          onProgress: (reason) => this.post({ type: "ui-event", event: { kind: "boot/progress", phase: "index", message: reason } }),
        }).then((value) => { this.warm = value; return value; }, () => undefined));
      } catch { /* the run probes again and reports what went wrong */ }
    }
    if (servers.length > 0) {
      this.post({ type: "ui-event", event: { kind: "boot/progress", phase: "mcp", message: "Đang nạp MCP: " + servers.map((server) => server.name).join(", ") } });
      await this.mcpTools();
    }
    this.post({ type: "ui-event", event: { kind: "boot/ready", message: servers.length === 0 ? "Không có MCP server nào cho workspace này." : "" } });
    this.trace("boot warm-up xong sau " + (Date.now() - started) + "ms");
  }

  private async mcpTools(): Promise<readonly AgentTool[]> {
    const workspaceRoot = this.workspaceRoot;
    const storageRoot = this.sessionsRoot;
    if (workspaceRoot === null || storageRoot === null) return [];
    if (this.mcp === null) {
      const servers = workspaceMcpServers(workspaceRoot);
      if (servers.length === 0) {
        this.mcp = Promise.resolve(null);
      } else {
        const attempt = await tryConnectWorkspaceMcp({ servers, stateDir: storageRoot });
        this.mcp = Promise.resolve(attempt.handle);
        this.mcpError = attempt.error;
      }
    }
    const handle = await this.mcp;
    if (handle === null) {
      if (this.mcpError !== null && !this.mcpNoticeSent) {
        this.mcpNoticeSent = true;
        this.post({ type: "ui-event", event: { code: "MCP_UNAVAILABLE", kind: "error", message: "Không nối được MCP server của workspace: " + this.mcpError, retryable: true } });
      }
      return [];
    }
    try {
      return await handle.tools();
    } catch {
      return [];
    }
  }

  /** Whether history can be kept at all: without a storage root there is nowhere safe to write. */
  private get sessionsRoot(): string | null {
    return typeof this.storageRoot === "string" && this.storageRoot.length > 0 ? this.storageRoot : null;
  }

  /** Session list, open, new and delete: the webview's history panel talks to these. */
  private async handleSessionAction(action: Readonly<{ type: "delete" | "list" | "new" | "open"; id?: string }>): Promise<void> {
    const root = this.sessionsRoot;
    if (root === null) return;
    if (action.type === "list") { await this.postSessionList(); return; }
    if (action.type === "new") {
      this.sessionId = null;
      this.post({ type: "session-loaded", id: null, messages: [], title: "" });
      return;
    }
    if (action.type === "delete") {
      if (typeof action.id === "string" && await deleteSession(root, action.id)) {
        if (this.sessionId === action.id) this.sessionId = null;
        await this.postSessionList();
      }
      return;
    }
    const session = typeof action.id === "string" ? await readSession(root, action.id) : null;
    if (session === null) { await this.postSessionList(); return; }
    this.sessionId = session.id;
    this.testLog.push("session-loaded:" + session.id);
    this.post({
      type: "session-loaded",
      id: session.id,
      messages: session.messages.map(turn => Object.freeze({ content: turn.content, role: turn.role })),
      title: session.title,
    });
  }

/** The pickable reasoning levels for the active model, and which one is stored. */
  private postThinking(): void {
    const connection = resolveOllamaConnection();
    const document = readModelSettings(this.configPath);
    const provider = document.providers.find(entry => entry.id === document.active);
    const stored = provider?.thinking;
    const policy = resolveThinkingPolicy({ model: connection.model, ...(stored === undefined ? {} : { preferred: stored }) });
    this.post({ type: "thinking", choice: stored ?? policy.default, options: policy.choices.map(value => Object.freeze({ label: thinkingLabel(value), value })) });
  }

  /** Tells the panel which composition is in force, so the badge is right before anything is changed. */
  private postPreset(): void {
    const preset = resolveAgentPreset(this.presetId);
    if (preset === null) return;
    this.post({ type: "ui-event", event: { kind: "preset/current", id: preset.id, label: preset.label } });
  }

  private async postSessionList(): Promise<void> {
    const root = this.sessionsRoot;
    if (root === null) return;
    const sessions = await listSessions(root);
    this.post({ type: "session-list", sessions: sessions.map(item => Object.freeze({ id: item.id, messageCount: item.messageCount, title: item.title, updatedAt: item.updatedAt })) });
  }

  private async handleUiAction(action: GalaxyUiAction): Promise<void> {
    switch (action.type) {
      case "run/start": {
        /*
         * `/plan` is a command about the mode, not a message: it turns plan mode on or off, says so, and sends
         * nothing. The reference gives plan mode exactly this — a direct slash command — so the transcript never
         * has to carry a turn whose only content was a switch.
         */
        const planCommand = /^\/plan(?:\s+(on|off))?$/i.exec(action.input.trim());
        if (planCommand !== null) {
          const on = planCommand[1] === undefined ? !this.planModeHeld : planCommand[1].toLowerCase() === "on";
          this.planModeHeld = on;
          await this.context.workspaceState.update("galaxy.planMode", on);
          await this.session?.setPlanMode(on);
          this.trace("plan mode: " + (on ? "bật" : "tắt") + " (lệnh /plan)");
          this.post({ type: "ui-event", event: { kind: "plan/updated", mode: on, steps: [] } });
          return;
        }
        this.testLog.push("run/start:" + action.input.slice(0, 60));
        if (this.session) return; // one run at a time in the prototype
        if (!this.connection || !this.workspaceRoot) return;
        this.post({ type: "ui-event", event: { kind: "run/status", status: "running" } });
        try {
          /* A `/compact` typed while idle rides into this run. */
          const compactOnStart = this.compactOnNextRun;
          this.compactOnNextRun = false;
          /* History is per session: the first run of a view creates one, later runs append to it. */
          const sessionsRoot = this.sessionsRoot;
          if (sessionsRoot !== null) {
            const existing = this.sessionId === null ? null : await readSession(sessionsRoot, this.sessionId);
            const session = existing ?? await createSession(sessionsRoot, action.input);
            this.sessionId = session.id;
            await appendSessionTurn(sessionsRoot, session.id, "user", action.input);
            this.testLog.push("session-created:" + session.id);
          }
          this.post({ type: "ui-event", event: { kind: "run/status", reason: "Đang kết nối công cụ và đọc workspace…", status: "running" } });
          const runToolsMode = readPreferences(this.storageRoot).toolsMode;
          this.trace("chế độ tool của lượt này: " + runToolsMode);
          this.runStartedAt = Date.now();
          this.trace("run bắt đầu");
          this.trace("mcp xong sau " + (Date.now() - this.runStartedAt) + "ms");
          this.session = await startCoreRun({
            compactOnStart,
            connection: this.connection,
            goal: action.input,
            /*
             * A message can arrive before the boot finished; waiting on the same promise keeps the work single.
             */
            ...(this.warm === undefined ? { warm: await this.warmPromise } : { warm: this.warm }),
            ...(this.workspaceMap === null ? {} : { contextData: [this.workspaceMap] }),
            /*
             * Connecting MCP servers and indexing the workspace both happen before the first model delta;
             * the UI said "thinking" throughout, which is why a slow start looked like a dead app.
             */
            mcpTools: await this.mcpTools(),
            onEvent: (event) => {
              /* The plan as the core last described it, for the review card to show without asking again. */
              if (event.kind === "plan/updated") {
                this.lastPlanSteps = event.steps.map((step) => step.title);
              }
              if (this.runStartedAt > 0 && (event.kind === "message/thinking-delta" || event.kind === "message/text-delta")) {
                this.trace("delta đầu tiên sau " + (Date.now() - this.runStartedAt) + "ms");
                this.runStartedAt = 0;
              }
              /*
               * A stop is the one thing the owner sees in red, and the only place its cause is legible. Tracing just
               * that line keeps the log short and makes "did this run fail, and why" answerable after the fact.
               */
              if (event.kind === "run/status" && event.status !== "running") {
                /*
                 * The run stopped with plan mode still on: the plan exists and nothing has been done with it. That is
                 * the moment the reference hands the plan to its person — a plan nobody approves is a plan that never
                 * becomes work, and one that runs itself is not plan mode at all.
                 */
                if (this.planModeHeld) {
                  const steps = this.lastPlanSteps;
                  this.trace("plan xong: " + steps.length + " bước, chờ người duyệt");
                  this.post({ type: "ui-event", event: { kind: "plan/review", steps } });
                }
                void this.reportChanges();
                /* A card outlives the program that asked for it: clear it, or the owner answers a dead question. */
                this.post({ type: "ui-event", event: { kind: "approval/cleared" } });
                this.trace("run dừng: " + event.status + " — " + (event.reason ?? ""));
              }
              /*
               * A tool that failed is the reason a program dies, and its own summary is the only place the cause is
               * written down. One line per failure keeps the log readable.
               */
              if (event.kind === "tool/result" && event.ok === false) {
                const known = this.callsInFlight.get(event.toolCallId);
        const args = (event as { args?: unknown }).args ?? known?.args;
        const name = (event as { name?: string }).name ?? known?.name ?? "";
                this.trace("tool lỗi: " + JSON.stringify(name) + " args=" + JSON.stringify(args ?? {}).slice(0, 220) + " → " + String(event.summary ?? "").slice(0, 120) + " | " + String(event.outputTail ?? "").replace(/\s+/g, " ").slice(0, 260));
              }
              return this.post({ type: "ui-event", event: planEventForWebview(event) });
            },
            onTrace: (line) => this.trace(line),
            onProgress: (reason) => this.post({ type: "ui-event", event: { kind: "run/status", reason, status: "running" } }),
            toolPresentation: runToolsMode,
            onPendingApproval: (pending) => {
              this.trace("approval xin cho " + pending.tool + " (" + pending.requestId + ")");
              this.post({
                type: "pending-approval",
                requestId: pending.requestId,
                tool: pending.tool,
                args: pending.args,
                reason: pending.reason,
              });
            },
            permissionMode: this.permissionMode,
            presetId: this.presetId,
            storageRoot: this.storageRoot,
            taskId: action.taskId,
            workspaceRoot: this.workspaceRoot,
          });
          const result = await this.session.handle.result;
          if (sessionsRoot !== null && this.sessionId !== null) {
            /* The runtime hands the final assistant text back as content; a failed run explains itself. */
            const text = result.content.trim().length > 0 ? result.content.trim() : (result.error?.message ?? "");
            if (text.length > 0) await appendSessionTurn(sessionsRoot, this.sessionId, "assistant", text);
            await this.postSessionList();
          }
          this.post({ type: "ui-event", event: { kind: "run/status", reason: result.error?.message, status: result.state === "completed" ? "completed" : result.state === "failed" ? "failed" : result.state === "paused" ? "paused" : "cancelled" } });
        } catch (error) {
          this.post({ type: "ui-event", event: { kind: "error", code: "SESSION_ERROR", message: error instanceof Error ? error.message : String(error), retryable: false } });
        } finally {
          this.session = null;
        }
        return;
      }
      case "run/cancel":
        this.session?.handle.cancel("Cancelled from webview.");
        return;
      case "preset/set": {
        const chosen = resolveAgentPreset(action.id);
        if (chosen === null) {
          this.trace("preset lạ, bỏ qua: " + action.id);
          return;
        }
        this.presetId = chosen.id;
        this.trace("preset: " + chosen.id + " (" + chosen.label + ")");
        this.post({ type: "ui-event", event: { kind: "preset/current", id: chosen.id, label: chosen.label } });
        return;
      }
      case "plan/mode": {
        await this.session?.setPlanMode(action.on);
        return;
      }
      case "context/compact": {
        // Nothing in flight: carry the intent into the next run, which compacts before its
        // first model turn (compactOnStart) — the idle half of the web's /compact.
        const session = this.session;
        if (session === null || (await session.compact()) === null) {
          this.compactOnNextRun = true;
          this.post({ type: "ui-event", event: { kind: "context/compacted", reason: "chưa có lượt nào đang chạy — lượt kế tiếp sẽ tự nén trước khi gọi model" } });
        }
        return;
      }
      /*
       * Anything the webview reports that this switch does not act on still reaches the trace: a probe is only
       * useful if the numbers survive the trip.
       */
      default: {
        this.trace("action " + JSON.stringify(action));
        return;
      }
      case "file/open": {
        /* A path in the transcript is a door: the editor opens the file itself, with its own navigation. */
        const root = this.workspaceRoot;
        if (root !== null) {
          const file = vscode.Uri.joinPath(vscode.Uri.file(root), action.path);
          try {
            await vscode.window.showTextDocument(file, { preview: true });
          } catch { /* the path is gone or outside the workspace: nothing to open */ }
        }
        return;
      }
      case "payload/open":
        this.openPayload(action.title, action.text);
        return;
      case "changes/openDiff": {
        /* The editor's own diff, when Git can supply the far side; otherwise just show the file. */
        const root = this.workspaceRoot;
        if (root !== null) {
          const file = vscode.Uri.joinPath(vscode.Uri.file(root), action.path);
          try {
            await vscode.commands.executeCommand("vscode.diff", vscode.Uri.parse("git:" + file.fsPath + "?ref=HEAD"), file, action.path);
          } catch {
            await vscode.window.showTextDocument(file);
          }
        }
        return;
      }
      case "approval/resolve":
        this.trace("approval " + (action.approved ? "granted" : "denied") + " cho " + action.requestId + " (session=" + (this.session === undefined ? "không có" : "có") + ")");
        this.session?.resolveApproval(action.requestId, action.approved);
        return;
      case "permission/mode":
        this.permissionMode = action.mode;
        this.session?.setPermissionMode(action.mode);
        return;
    }
  }

  /**
   * Open the settings in an editor tab, the way Codex does it. The sidebar's gear asks for this, and the
   * tab renders the same bundle in its settings mode.
   */
  openSettingsPanel(): void {
    if (this.settingsPanel !== undefined) { this.settingsPanel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel("galaxy-code.settings", "Galaxy Blackhole: Cài đặt", vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
      retainContextWhenHidden: true,
    });
    this.settingsPanel = panel;
    panel.webview.html = this.renderHtml(panel.webview, "settings");
    panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => { void this.handleMessage(message); });
    panel.onDidDispose(() => { this.settingsPanel = undefined; });
  }

  private renderHtml(webview: vscode.Webview, view: "chat" | "settings" = "chat"): string {
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    /*
     * The asset URIs carry a stamp. A webview caches a resource by its URI, and both files are rewritten under
     * the same name by every build, so without the stamp the panel keeps rendering the previous bundle after a
     * rebuild and a reload — which reads exactly as "the fix did not work". The stamp retires that whole class.
     */
    const stamp = "?v=" + Date.now().toString(36);
    return webviewHtml({
      cspSource: webview.cspSource,
      nonce: String(Math.random()).slice(2),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.js")).toString() + stamp,
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.css")).toString() + stamp,
      view,
    });
  }

  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort(new Error("disposed"));
    for (const disposable of this.disposables) disposable.dispose();
  }
}
