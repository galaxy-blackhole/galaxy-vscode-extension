import type { OllamaChatMessage, OllamaStreamDelta, OllamaToolSchema } from "../protocol";
import type { OllamaConnection } from "./config";

export interface OllamaChatStats {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly durationMs?: number;
}

interface OllamaChunk {
  readonly message?: {
    readonly role?: string;
    readonly content?: string;
    readonly thinking?: string;
    readonly tool_calls?: readonly {
      readonly function?: { readonly name?: string; readonly arguments?: unknown };
    }[];
  };
  readonly done?: boolean;
  readonly done_reason?: string;
  readonly error?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
  readonly total_duration?: number;
}

/** How long the stream may stay silent before the run fails instead of hanging forever. */
export const OLLAMA_IDLE_MS = 180_000;

/**
 * Read one chunk, failing loudly if the server goes quiet. A stalled stream used to hang a run indefinitely:
 * the UI sat on the last tool call and the user had no idea anything was wrong.
 */
async function readWithIdle(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new Error("Ollama stream im lặng " + Math.round(idleMs / 1000).toString() + "s — lượt chạy đã dừng."));
    }, idleMs);
    reader.read().then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

/**
 * Stream one Ollama /api/chat round as NDJSON and emit normalized deltas.
 * Tool calls arrive in a single complete chunk, not token-by-token.
 */
export async function streamOllamaChat(
  connection: OllamaConnection,
  body: Readonly<{ messages: readonly OllamaChatMessage[]; tools: readonly OllamaToolSchema[]; system?: string }>,
  onDelta: (delta: OllamaStreamDelta) => void,
  signal: AbortSignal,
  idleMs: number = OLLAMA_IDLE_MS,
): Promise<OllamaChatStats> {
  const messages = body.system && body.system.trim().length > 0
    ? [{ role: "system" as const, content: body.system }, ...body.messages]
    : body.messages;
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  const started = Date.now();
  try {
    const response = await fetch(`${connection.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: connection.model,
        messages,
        stream: true,
        think: connection.thinking ?? true,
        options: { num_predict: 32768, temperature: 0 },
        ...(body.tools.length > 0 ? { tools: [...body.tools] } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`Ollama ${response.status}: ${text}`);
    }
    if (!response.body) throw new Error("Ollama response has no body.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let stats: OllamaChatStats = {};
    for (;;) {
      const { done, value } = await readWithIdle(reader, idleMs);
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
        if (!line) continue;
        const chunk = JSON.parse(line) as OllamaChunk;
        if (chunk.error) throw new Error(`Ollama stream error: ${chunk.error}`);
        const delta: { content?: string; thinking?: string; toolCalls?: { name: string; args: Record<string, unknown> }[] } = {};
        if (chunk.message?.thinking) delta.thinking = chunk.message.thinking;
        if (chunk.message?.content) delta.content = chunk.message.content;
        if (chunk.message?.tool_calls?.length) {
          delta.toolCalls = chunk.message.tool_calls.map((call) => ({
            name: call.function?.name ?? "unknown",
            args: (call.function?.arguments && typeof call.function.arguments === "object"
              ? call.function.arguments : {}) as Record<string, unknown>,
          }));
        }
        if (delta.content || delta.thinking || delta.toolCalls) onDelta(delta);
        if (chunk.done) {
          stats = {
            promptTokens: chunk.prompt_eval_count,
            completionTokens: chunk.eval_count,
            durationMs: chunk.total_duration ? Math.round(chunk.total_duration / 1e6) : Date.now() - started,
          };
        }
      }
    }
    const tail = buffered.trim();
    if (tail) {
      const chunk = JSON.parse(tail) as OllamaChunk;
      if (chunk.error) throw new Error(`Ollama stream error: ${chunk.error}`);
    }
    return stats;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
