/**
 * The run controller tracks tool-call ids for the whole run, so an id may never be reused by a later round.
 * The old counter restarted at call-1 every round and the run died with "already used in this run".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaCoreModel } from "../src/host/core-model.ts";

function stubFetch(body: string): () => void {
  const original = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(body)); controller.close(); },
  }), { status: 200 })) as unknown as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("a second round does not reuse the first round tool-call id", async () => {
  const body = '{"message":{"tool_calls":[{"function":{"arguments":{},"name":"list_files"}}]},"done":true}\n';
  const restore = stubFetch(body);
  try {
    const model = createOllamaCoreModel({ apiKey: "k", baseUrl: "https://example.test", model: "glm" } as never);
    const ids: string[] = [];
    for (let round = 0; round < 2; round += 1) {
      for await (const event of model.streamRound(
        { messages: [], tools: [] } as never,
        { signal: new AbortController().signal } as never,
      )) {
        if ((event as { type?: string }).type === "tool_call") {
          ids.push((event as { call: { toolCallId: string } }).call.toolCallId);
        }
      }
    }
    assert.equal(ids.length, 2, "one call per round: " + JSON.stringify(ids));
    assert.notEqual(ids[0], ids[1], "the second round must not reuse an id: " + JSON.stringify(ids));
    assert.ok(ids.every(id => typeof id === "string" && id.length >= 8), "ids are real identifiers: " + JSON.stringify(ids));
  } finally {
    restore();
  }
});