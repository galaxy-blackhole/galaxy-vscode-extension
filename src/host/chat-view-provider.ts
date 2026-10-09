import * as vscode from "vscode";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../protocol";
import { resolveThinkingPolicy, thinkingLabel } from "@galaxy-stack/ai-coder-core";
import { readPreferences, writePreferences } from "./preferences";
import { webviewHtml } from "./webview-html";
import { resolveModelLibraryUrl, resolveOllamaConnection, type OllamaConnection } from "./config";
import { streamOllamaChat } from "./ollama-client";
import { startCoreRun, type CoreRunSession } from "./core-run-session";
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
      case "ui-ready": {
        this.testLog.push("ui-ready");
        this.postThinking();
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

  private async postSessionList(): Promise<void> {
    const root = this.sessionsRoot;
    if (root === null) return;
    const sessions = await listSessions(root);
    this.post({ type: "session-list", sessions: sessions.map(item => Object.freeze({ id: item.id, messageCount: item.messageCount, title: item.title, updatedAt: item.updatedAt })) });
  }

  private async handleUiAction(action: GalaxyUiAction): Promise<void> {
    switch (action.type) {
      case "run/start": {
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
          this.session = await startCoreRun({
            compactOnStart,
            connection: this.connection,
            goal: action.input,
            /*
             * Connecting MCP servers and indexing the workspace both happen before the first model delta;
             * the UI said "thinking" throughout, which is why a slow start looked like a dead app.
             */
            mcpTools: await this.mcpTools(),
            onEvent: (event) => this.post({ type: "ui-event", event: planEventForWebview(event) }),
            onProgress: (reason) => this.post({ type: "ui-event", event: { kind: "run/status", reason, status: "running" } }),
            onPendingApproval: (pending) => this.post({
              type: "pending-approval",
              requestId: pending.requestId,
              tool: pending.tool,
              args: pending.args,
              reason: pending.reason,
            }),
            permissionMode: this.permissionMode,
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
      case "approval/resolve":
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
    return webviewHtml({
      cspSource: webview.cspSource,
      nonce: String(Math.random()).slice(2),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.js")).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.css")).toString(),
      view,
    });
  }

  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort(new Error("disposed"));
    for (const disposable of this.disposables) disposable.dispose();
  }
}
