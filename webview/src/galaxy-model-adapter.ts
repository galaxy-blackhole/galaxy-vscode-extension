import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import type { OllamaChatMessage, OllamaToolSchema } from "../../src/protocol";
import { currentHostInfo, startChatRun } from "./host-bridge";
import { buildSystemPrompt } from "./system-prompt";

type TextPartOf = Extract<ThreadMessage["content"][number], { type: "text" }>;
type ToolSchemaParams = Readonly<{ type?: string; properties?: Record<string, unknown>; required?: string[] }>;
interface PendingToolCall { name: string; args: Record<string, unknown>; }

function toOllamaMessages(messages: readonly ThreadMessage[]): OllamaChatMessage[] {
  const out: OllamaChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.content
        .filter((part): part is TextPartOf => part.type === "text")
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

function toOllamaTools(
  tools: Record<string, { description?: string; parameters?: unknown }> | undefined,
): OllamaToolSchema[] {
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

/**
 * ChatModelAdapter bridging assistant-ui's LocalRuntime to the Ollama NDJSON
 * stream executed in the extension host. Intermediate snapshots are yielded so
 * the UI renders text and reasoning live rather than only at stream end.
 */
export function createGalaxyChatModelAdapter(): ChatModelAdapter {
  return {
    run(options) {
      const info = currentHostInfo();
      const request = {
        messages: toOllamaMessages(options.messages),
        tools: toOllamaTools(
          options.context.tools as Record<string, { description?: string; parameters?: unknown }> | undefined,
        ),
        system: buildSystemPrompt(info),
      };

      let text = "";
      let thinking = "";
      let version = 0;     // bumped whenever the accumulated content changes
      let finished = false;
      const toolCalls: PendingToolCall[] = [];
      const waiters: Array<() => void> = [];
      const notify = () => { for (const wake of waiters.splice(0)) wake(); };

      const buildContent = (): readonly ThreadAssistantMessagePart[] => {
        const parts: ThreadAssistantMessagePart[] = [];
        if (thinking) parts.push({ type: "reasoning", text: thinking });
        if (text) parts.push({ type: "text", text });
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

      const result = new Promise<ChatModelRunResult>((resolve, reject) => {
        startChatRun(
          request,
          {
            onDelta: (delta) => {
              if (delta.thinking) thinking += delta.thinking;
              if (delta.content) text += delta.content;
              if (delta.toolCalls) toolCalls.push(...delta.toolCalls.map((c) => ({ name: c.name, args: { ...c.args } })));
              version += 1;
              notify();
            },
            onDone: () => {
              finished = true;
              notify();
              resolve({
                content: buildContent(),
                status: toolCalls.length > 0
                  ? { type: "requires-action", reason: "tool-calls" }
                  : { type: "complete", reason: "stop" },
              });
            },
            onError: (message) => {
              finished = true;
              notify();
              if (message === "cancelled") reject(new DOMException("Run cancelled.", "AbortError"));
              else reject(new Error(message));
            },
          },
          options.abortSignal,
        );
      });

      const generator = (async function* (): AsyncGenerator<ChatModelRunResult, void> {
        let emitted = 0;
        try {
          for (;;) {
            if (emitted !== version) {
              emitted = version;
              const content = buildContent();
              if (content.length > 0) yield { content, status: { type: "running" } };
            }
            if (finished) break;
            await new Promise<void>((resolve) => {
              waiters.push(resolve);
              // Safety timeout so the generator eventually notices a finished flag.
              setTimeout(resolve, 250);
            });
          }
          yield await result;
        } finally {
          result.catch(() => undefined);
        }
      })();
      return generator;
    },
  };
}
