import { submitPrompt } from "./galaxy-ui-runtime";
import { postToHost } from "./vscode";
import type { GalaxyUiAction, GalaxyUiEvent } from "../../src/ui-protocol";
import type { OllamaChatMessage, OllamaToolSchema } from "../../src/protocol";
import type { HostToWebviewMessage, ProviderDraft } from "../../src/protocol";
import type { ModelSettingsSummary } from "../../src/model-settings-types";

export type HostInfo = Readonly<{
  workspaceName: string;
  workspacePath: string;
  platform: string;
  shell: string;
  model: string;
  baseUrl: string;
  credentialSource: string;
  modelLibraryUrl?: string;
  modelSettings: ModelSettingsSummary;
}>;

type UiEventListener = (event: GalaxyUiEvent) => void;
type PendingApprovalListener = (pending: { requestId: string; tool: string; args: Record<string, unknown>; reason: string }) => void;

const uiEventListeners = new Set<UiEventListener>();
const pendingApprovalListeners = new Set<PendingApprovalListener>();
type SessionMessage = Extract<HostToWebviewMessage, { type: "session-list" | "session-loaded" }>;
const sessionListeners = new Set<(message: SessionMessage) => void>();

export function subscribeSessionMessages(listener: (message: SessionMessage) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** The session list panel: new, list, open and delete all travel as one action. */
export function sessionAction(action: Readonly<{ type: "delete" | "list" | "new" | "open"; id?: string }>): void {
  postToHost({ type: "session/action", action });
}

/**
 * Test-only driver (see test/vscode/suite.cjs): the host asks for what a click in the view would do, so
 * the extension-host suite can exercise the editor↔webview round trip it otherwise cannot reach.
 */
function handleTestCommand(command: Readonly<{ kind: "submit"; text: string } | { kind: "open-session"; id: string }>): void {
  if (command.kind === "open-session") {
    sessionAction({ type: "open", id: command.id });
    return;
  }
  submitPrompt(command.text, hostInfo?.workspacePath ?? ".");
}

export function subscribeUiEvents(listener: UiEventListener): () => void {
  uiEventListeners.add(listener);
  return () => uiEventListeners.delete(listener);
}

export function subscribePendingApprovals(listener: PendingApprovalListener): () => void {
  pendingApprovalListeners.add(listener);
  return () => pendingApprovalListeners.delete(listener);
}

export function dispatchUiAction(action: GalaxyUiAction): void {
  postToHost({ type: "ui-action", action });
}

export function startUiRun(input: string, workspacePath: string): void {
  dispatchUiAction({ type: "run/start", input, taskId: `ui-${Date.now()}`, workspace: workspacePath });
}

export function cancelUiRun(): void {
  dispatchUiAction({ type: "run/cancel" });
}

export function resolveApproval(requestId: string, approved: boolean): void {
  dispatchUiAction({ type: "approval/resolve", approved, requestId });
}

export function setPermissionMode(mode: "ask" | "smart" | "auto"): void {
  dispatchUiAction({ type: "permission/mode", mode });
}

type ChatHandlers = {
  onDelta: (delta: { content?: string; thinking?: string; toolCalls?: readonly { name: string; args: Record<string, unknown> }[] }) => void;
  onDone: (stats: { promptTokens?: number; completionTokens?: number; durationMs?: number }) => void;
  onError: (message: string) => void;
};

const chatRuns = new Map<string, ChatHandlers>();
const toolPending = new Map<string, { resolve: (value: { ok: boolean; result: string }) => void }>();
const infoListeners = new Set<(info: HostInfo) => void>();
const newThreadListeners = new Set<() => void>();
let hostInfo: HostInfo | null = null;
let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function startChatRun(
  request: { messages: readonly OllamaChatMessage[]; tools: readonly OllamaToolSchema[]; system?: string },
  handlers: ChatHandlers,
  signal: AbortSignal,
): void {
  const runId = nextId("run");
  chatRuns.set(runId, handlers);
  const onAbort = () => {
    postToHost({ type: "chat-cancel", runId });
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  const cleanup = () => {
    chatRuns.delete(runId);
    signal.removeEventListener("abort", onAbort);
  };
  chatRuns.set(runId, {
    onDelta: handlers.onDelta,
    onDone: (stats) => { cleanup(); handlers.onDone(stats); },
    onError: (message) => { cleanup(); handlers.onError(message); },
  });
  postToHost({ type: "chat-start", runId, request });
  postToHost({ type: "ui-ready" });
}

export async function execTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }> {
  const requestId = nextId("tool");
  return await new Promise((resolvePromise) => {
    toolPending.set(requestId, { resolve: resolvePromise });
    postToHost({ type: "tool-exec", requestId, name, args });
  });
}

export function subscribeHostInfo(listener: (info: HostInfo) => void): () => void {
  infoListeners.add(listener);
  return () => infoListeners.delete(listener);
}

export function currentHostInfo(): HostInfo | null {
  return hostInfo;
}

export function subscribeNewThread(listener: () => void): () => void {
  newThreadListeners.add(listener);
  return () => newThreadListeners.delete(listener);
}

export function announceReady(): void {
  postToHost({ type: "ui-ready" });
}

export function openExternal(url: string): void {
  postToHost({ type: "open-external", url });
}

/** Store one provider key; an empty value clears it. */
export function saveApiKey(providerId: string, apiKey: string): void {
  postToHost({ type: "model-settings/save-key", providerId, apiKey });
}

/** Create or replace one provider from the model-setup panel. */
export function saveProvider(provider: ProviderDraft): void {
  postToHost({ type: "model-settings/save-provider", provider });
}

export function setActiveProvider(providerId: string): void {
  postToHost({ type: "model-settings/set-active", providerId });
}

export function removeProvider(providerId: string): void {
  postToHost({ type: "model-settings/remove", providerId });
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
    const message = event.data;
    switch (message.type) {
      case "ui-event":
        for (const listener of uiEventListeners) listener(message.event);
        return;
      case "pending-approval":
        for (const listener of pendingApprovalListeners) listener(message);
        return;
      case "chat-delta":
        chatRuns.get(message.runId)?.onDelta(message.delta);
        return;
      case "chat-done":
        chatRuns.get(message.runId)?.onDone(message.stats);
        return;
      case "chat-error":
        chatRuns.get(message.runId)?.onError(message.message);
        return;
      case "tool-result":
        toolPending.get(message.requestId)?.resolve({ ok: message.ok, result: message.result });
        toolPending.delete(message.requestId);
        return;
      case "test/command":
        handleTestCommand(message.command);
        return;
      case "session-list":
      case "session-loaded":
        for (const listener of sessionListeners) listener(message);
        return;
      case "host-info":
        hostInfo = message;
        for (const listener of infoListeners) listener(message);
        return;
      case "new-thread":
        for (const listener of newThreadListeners) listener();
        return;
    }
  });
}
