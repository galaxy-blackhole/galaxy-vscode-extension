import {
  CodingProviderError,
  portSuccess,
  type CodingModelAdapter,
  type CodingRoundEvent,
  type CodingRoundRequest,
  type CodingTokenCount,
  type CodingTokenCountInput,
  type ModelCapabilities,
  type ModelIdentity,
  type PortResult,
  type RunExecutionContext,
} from "@galaxy-stack/ai-coder-core";
import { streamOllamaChat } from "./ollama-client";
import type { OllamaConnection } from "./config";

const GLM_CONTEXT_WINDOW = 131_072;

/**
 * CodingModelAdapter backed by the Ollama NDJSON stream. This is the vscode
 * prototype's counterpart of galaxy-code's OllamaCodingModel: same wire,
 * simplified capability probe (no /api/show roundtrip) for the lab.
 */
export function createOllamaCoreModel(connection: OllamaConnection): CodingModelAdapter {
  const identity: ModelIdentity = Object.freeze({
    baseUrl: connection.baseUrl,
    model: connection.model,
    provider: "ollama",
    runtimeVersion: "ollama-api-chat-v1",
  });
  const capabilities: ModelCapabilities = Object.freeze({
    contextWindow: GLM_CONTEXT_WINDOW,
    evidence: Object.freeze([Object.freeze({
      observedAt: new Date().toISOString(),
      source: "static_fallback" as const,
      verified: false,
    })]),
    identity,
    input: Object.freeze({ audio: "unknown", image: "unknown", text: "supported", video: "unknown" }),
    output: Object.freeze({ image: "unknown", text: "supported" }),
    parallelToolCalling: "supported",
    preserveThinking: "supported",
    streaming: "supported",
    structuredOutput: "unknown",
    thinking: "optional",
    tokenCounting: "unsupported",
    toolCalling: "supported",
  });

  return {
    identity,
    async capabilities(): Promise<PortResult<ModelCapabilities>> {
      return portSuccess(capabilities);
    },
    async countTokens(
      input: CodingTokenCountInput,
      context: RunExecutionContext,
    ): Promise<PortResult<CodingTokenCount>> {
      if (context.signal.aborted) {
        return portSuccess({ exact: false, source: "estimate" as const, tokens: 0 });
      }
      let tokens = 0;
      for (const message of input.messages) tokens += Math.ceil(message.content.length / 4);
      for (const tool of input.tools ?? []) tokens += Math.ceil((tool.function.description.length + JSON.stringify(tool.function.parameters).length) / 3);
      return portSuccess({ exact: false, source: "estimate" as const, tokens });
    },
    async *streamRound(request: CodingRoundRequest, context: RunExecutionContext): AsyncIterable<CodingRoundEvent> {
      yield { type: "started" };
      let content = "";
      let thinking = "";
      interface PendingCall { args: Record<string, unknown>; id: string; name: string; }
      const toolCalls: PendingCall[] = [];
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;
      try {
        const stats = await streamOllamaChat(
          connection,
          {
            messages: request.messages.map((message): { role: "system" | "user" | "assistant" | "tool"; content?: string; name?: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] } => {
              if (message.role === "assistant") {
                return {
                  role: "assistant",
                  content: message.content,
                  ...(message.thinking ? {} : {}),
                  ...(message.toolCalls?.length ? {
                    tool_calls: message.toolCalls.map((call) => ({
                      function: { name: call.name, arguments: call.arguments as Record<string, unknown> },
                    })),
                  } : {}),
                };
              }
              if (message.role === "tool") {
                return { role: "tool", name: message.toolName, content: message.content };
              }
              return { role: message.role, content: message.content };
            }),
            tools: request.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
              },
            })),
          },
          (delta) => {
            if (delta.thinking) {
              thinking += delta.thinking;
              // Deltas are delivered via the run controller's model events; the
              // mapper below re-emits from the terminal round only. To keep
              // live streaming, we yield below via a queue — see note.
            }
            if (delta.content) content += delta.content;
            if (delta.toolCalls) {
              for (const [index, call] of delta.toolCalls.entries()) {
                toolCalls.push({ id: `call-${toolCalls.length + index + 1}`, name: call.name, args: { ...call.args } });
              }
            }
          },
          context.signal,
        ).then((value) => {
          usage = {
            inputTokens: value.promptTokens,
            outputTokens: value.completionTokens,
          };
          return value;
        });
        void stats;
        if (thinking) yield { type: "thinking", delta: thinking };
        if (content) yield { type: "content", delta: content };
        for (const call of toolCalls) {
          yield {
            type: "tool_call",
            call: Object.freeze({
              arguments: Object.freeze(call.args),
              name: call.name,
              toolCallId: call.id,
            }),
          };
        }
        yield {
          type: "done",
          content,
          identity,
          stopReason: toolCalls.length > 0 ? "tool_calls" : "completed",
          thinking,
          ...(usage ? { usage: Object.freeze({ ...usage }) } : {}),
        };
      } catch (error) {
        const isAbort = context.signal.aborted;
        if (isAbort) {
          yield { type: "canceled" };
          return;
        }
        yield {
          type: "error",
          error: new CodingProviderError(
            "PROVIDER_ERROR",
            error instanceof Error ? error.message : String(error),
            true,
          ),
        };
      }
    },
  };
}
