/**
 * The model bridge must hand text to the UI while the model is still writing. It used to accumulate the whole
 * answer and yield it once the round ended, which is why the transcript only appeared complete.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaCoreModel } from "../src/host/core-model.ts";

test("a text delta reaches the caller before the stream closes", async () => {
  const encoder = new TextEncoder();
  let push: (text: string) => void = () => undefined;
  let close: () => void = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (text) => { controller.enqueue(encoder.encode(text)); };
      close = () => { controller.close(); };
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
  try {
    const model = createOllamaCoreModel({ apiKey: "k", baseUrl: "https://example.test", model: "glm" } as never);
    const iterator = model.streamRound(
      { messages: [], tools: [] } as never,
      { signal: new AbortController().signal } as never,
    )[Symbol.asyncIterator]();

    push("{\"message\":{\"content\":\"Hel\"}}\n");
    const started = await iterator.next();
    assert.equal((started.value as { type?: string } | undefined)?.type, "started");

    /* The stream is deliberately still open: a buffered implementation would block here. */
    const raced = await Promise.race([
      iterator.next(),
      new Promise((resolve) => setTimeout(() => { resolve("timeout"); }, 1500)),
    ]);
    assert.notEqual(raced, "timeout", "the delta must arrive while the model is still writing");
    const event = (raced as IteratorResult<{ delta?: string; type?: string }>).value;
    assert.equal(event?.type, "content");
    assert.equal(event?.delta, "Hel", "and it carries exactly the text the model sent");

    push("{\"message\":{\"content\":\"lo\"},\"done\":true}\n");
    close();
    while (true) {
      const step = await iterator.next();
      if (step.done === true) break;
    }
  } finally {
    globalThis.fetch = original;
  }
});