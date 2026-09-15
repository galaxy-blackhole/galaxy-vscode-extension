import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import type { OllamaChatMessage, OllamaToolSchema } from "../../src/protocol";
import { currentHostInfo, startChatRun } from "./host-bridge";
import { buildSystemPrompt } from "./system-prompt";

type ToolSchemaParams = Readonly<{ type?: string; properties?: Record<string, unknown>; required?: string[] }>;

function toOllamaMessages(messages: readonly ThreadMessage[]): OllamaChatMessage[] {
  const out: OllamaChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.content
        .filter((part): part is Extract<ThreadMessage["content"][number], { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      if (text.trim()) out.push({ role: "user", content: text });
      continue;
    }
    if (message.role === "assistant") {
      for (const part of message.content) {
        if (part.type === "text" && part.text.trim()) {
          out.push({ role: "assistant", content: part.text });
          continue;
        }
        if (part.type === "tool-call") {
          out.push({
            role: "assistant",
            tool_calls: [{ function: { name: part.toolName, arguments: (part.args ?? {}) as Record<string, unknown> } }],
          });
          if (part.result !== undefined) {
            out.push({
              role: "tool",
              name: part.toolName,
              content: typeof part.result === "string" ? part.result : JSON.stringify(part.result ?? null),
            });
          }
        }
      }
    }
  }
  return out;
}

function toOllamaTools(tools: Record<string, { description?: string; parameters?: unknown }> | undefined): OllamaToolSchema[] {
  const out: OllamaToolSchema[] = [];
  for (const [name, tool] of Object.entries(tools ?? {})) {
    const parameters = tool.parameters as ToolSchemaParams | undefined;
    out.push({
      type: "function",
      function: {
        name,
        description: tool.description ?? "",
        parameters: parameters ?? { type: "object", properties: {} },
      },
    });
  }
  return out;
}

/** ChatModelAdapter that bridges assistant-ui LocalRuntime to the extension host's Ollama stream. */
export function createGalaxyChatModelAdapter(): ChatModelAdapter {
  return {
    async *run(options) {
      const info = currentHostInfo();
      const request = {
        messages: toOllamaMessages(options.messages),
        tools: toOllamaTools(options.context.tools as Record<string, { description?: string; parameters?: unknown }> | undefined),
        system: buildSystemPrompt(info),
      };

      let text = "";
      let thinking = "";
      interface PendingToolCall { name: string; args: Record<string, unknown>; }
      const toolCalls: PendingToolCall[] = [];

      const buildContent = (): readonly ThreadAssistantMessagePart[] => {
        const parts: ThreadAssistantMessagePart[] = [];
        if (thinking) {
          parts.push({ type: "reasoning", text: thinking });
        }
        if (text) {
          parts.push({ type: "text", text });
        }
        for (const [index, call] of toolCalls.entries()) {
          parts.push({
            type: "tool-call",
            toolCallId: `${options.unstable_assistantMessageId ?? "turn"}-${index}-${call.name}`,
            toolName: call.name,
            args: call.args as never,
            argsText: JSON.stringify(call.args),
          });
        }
        return parts;
      };

      const final = await new Promise<ChatModelRunResult>((resolve, reject) => {
        startChatRun(
          request,
          {
            onDelta: (delta) => {
              if (delta.thinking) thinking += delta.thinking;
              if (delta.content) text += delta.content;
              if (delta.toolCalls) toolCalls.push(...delta.toolCalls.map((call) => ({ name: call.name, args: { ...call.args } })));
            },
            onDone: () => {
              resolve({
                content: buildContent(),
                status: toolCalls.length > 0
                  ? { type: "requires-action", reason: "tool-calls" }
                  : { type: "complete", reason: "stop" },
              });
            },
            onError: (message) => {
              reject(new Error(message === "cancelled" ? "Run cancelled." : message));
            },
          },
          options.abortSignal,
        );
      });
      yield final;
      return;
    },
  };
}
