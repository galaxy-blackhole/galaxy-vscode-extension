import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { appendUserMessage, getUiState, subscribeUiState, type UiMessage } from "./ui-store";
import { useSyncExternalStore } from "react";
import { cancelUiRun, dispatchUiAction, startUiRun } from "./host-bridge";

function toThreadMessageLike(message: UiMessage): ThreadMessageLike {
  return {
    content: message.content.map((part) => {
      if (part.type === "text") return { type: "text" as const, text: part.text };
      if (part.type === "reasoning") return { type: "reasoning" as const, text: part.text };
      return {
        args: part.args as never,
        argsText: part.argsText,
        ...(part.result !== undefined ? { result: part.result } : {}),
        ...(part.isError ? { isError: true } : {}),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        type: "tool-call" as const,
      };
    }),
    id: message.id,
    role: message.role,
  };
}

/**
 * Send one prompt exactly as the composer does: append it, let \`/compact\` act on the live run instead of
 * becoming a model turn, and otherwise start one. The extension-host suite drives this through the
 * test-only channel, so a real editor can be exercised without reaching into the DOM.
 */
export function submitPrompt(text: string, workspacePath: string): void {
  if (!text) return;
  appendUserMessage(text);
  if (text === "/compact") {
    dispatchUiAction({ type: "context/compact" });
    return;
  }
  startUiRun(text, workspacePath || ".");
}

/**
 * Steering: a message sent while a run is live cancels that turn and then goes through the same path a normal
 * send takes. The composer calls this when Settings says the next message should steer.
 */
export function steerRun(text: string, workspacePath: string): void {
  cancelUiRun();
  submitPrompt(text, workspacePath);
}

export function useGalaxyUiRuntime(workspacePath: string) {
  /* Subscribed, not read once: the run state drives the send/stop/steer buttons. */
  const state = useSyncExternalStore(subscribeUiState, getUiState);
  const adapter: ExternalStoreAdapter<UiMessage> = {
    convertMessage: toThreadMessageLike,
    isRunning: state.status === "running",
    messages: state.messages,
    onCancel: async () => cancelUiRun(),
    onNew: async (message: AppendMessage) => {
      submitPrompt(message.content.map((part) => (part.type === "text" ? part.text : "")).join("\n").trim(), workspacePath);
    },
  };
  return useExternalStoreRuntime(adapter);
}
