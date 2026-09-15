import { postToHost } from "./vscode";
import type {
  HostToWebviewMessage,
  OllamaChatMessage,
  OllamaToolSchema,
} from "../../src/protocol";

export type HostInfo = Readonly<{
  workspaceName: string;
  workspacePath: string;
  platform: string;
  shell: string;
  model: string;
  baseUrl: string;
  credentialSource: string;
}>;

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

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
    const message = event.data;
    switch (message.type) {
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
