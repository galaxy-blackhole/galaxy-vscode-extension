import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { appendUserMessage, getUiState, type UiMessage } from "./ui-store";
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

export function useGalaxyUiRuntime(workspacePath: string) {
  const state = getUiState();
  const adapter: ExternalStoreAdapter<UiMessage> = {
    convertMessage: toThreadMessageLike,
    isRunning: state.status === "running",
    messages: state.messages,
    onCancel: async () => cancelUiRun(),
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
      if (!text) return;
      appendUserMessage(text);
      /* The composer's /compact mirrors the web GUI: it asks the runtime to compact the
         live run instead of becoming a model turn, and the host answers context/compacted. */
      if (text === "/compact") {
        dispatchUiAction({ type: "context/compact" });
        return;
      }
      startUiRun(text, workspacePath || ".");
    },
  };
  return useExternalStoreRuntime(adapter);
}
