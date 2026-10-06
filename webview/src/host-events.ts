/**
 * The webview's event registries, kept in a leaf module on purpose: the store subscribes at module
 * scope, and importing those subscriptions from the bridge that fills them made the bundle evaluate
 * the store before the listener sets existed ("Cannot access 'uiEventListeners' before initialization").
 */
import type { GalaxyUiEvent } from "../../src/ui-protocol";
import type { HostToWebviewMessage } from "../../src/protocol";
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
  version: string;
}>;

export type UiEventListener = (event: GalaxyUiEvent) => void;
export type PendingApprovalListener = (pending: { requestId: string; tool: string; args: Record<string, unknown>; reason: string }) => void;
export type SessionMessage = Extract<HostToWebviewMessage, { type: "session-list" | "session-loaded" }>;
export type ThinkingMessage = Extract<HostToWebviewMessage, { type: "thinking" }>;

const uiEventListeners = new Set<UiEventListener>();
const pendingApprovalListeners = new Set<PendingApprovalListener>();
const sessionListeners = new Set<(message: SessionMessage) => void>();
const thinkingListeners = new Set<(message: ThinkingMessage) => void>();
const infoListeners = new Set<(info: HostInfo) => void>();
const newThreadListeners = new Set<() => void>();

export function subscribeUiEvents(listener: UiEventListener): () => void {
  uiEventListeners.add(listener);
  return () => uiEventListeners.delete(listener);
}

export function subscribePendingApprovals(listener: PendingApprovalListener): () => void {
  pendingApprovalListeners.add(listener);
  return () => pendingApprovalListeners.delete(listener);
}

export function subscribeSessionMessages(listener: (message: SessionMessage) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** The host says which reasoning levels exist for the active model, and which is stored. */
export function subscribeThinking(listener: (message: ThinkingMessage) => void): () => void {
  thinkingListeners.add(listener);
  return () => thinkingListeners.delete(listener);
}

export function subscribeHostInfo(listener: (info: HostInfo) => void): () => void {
  infoListeners.add(listener);
  return () => infoListeners.delete(listener);
}

export function subscribeNewThread(listener: () => void): () => void {
  newThreadListeners.add(listener);
  return () => newThreadListeners.delete(listener);
}

export function emitUiEvent(event: GalaxyUiEvent): void {
  for (const listener of uiEventListeners) listener(event);
}

export function emitPendingApproval(pending: Parameters<PendingApprovalListener>[0]): void {
  for (const listener of pendingApprovalListeners) listener(pending);
}

export function emitSessionMessage(message: SessionMessage): void {
  for (const listener of sessionListeners) listener(message);
}

export function emitThinking(message: ThinkingMessage): void {
  for (const listener of thinkingListeners) listener(message);
}

export function emitHostInfo(info: HostInfo): void {
  for (const listener of infoListeners) listener(info);
}

export function emitNewThread(): void {
  for (const listener of newThreadListeners) listener();
}