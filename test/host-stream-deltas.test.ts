/**
 * Thinking and content stream as they arrive, one UI event per model delta — nothing waits for the thinking
 * phase to finish, and nothing is buffered until the round ends.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mapCoreEventToUi } from "../src/host/core-run-session.ts";

test("each thinking delta becomes its own UI event, in order and unmerged", () => {
  const seen: { kind: string; text?: string }[] = [];
  const sink = (event: { kind: string; text?: string }) => { seen.push(event); };
  const model = (type: "content" | "thinking", delta: string) => ({ event: { delta, type }, type: "model" });
  mapCoreEventToUi(model("thinking", "Tôi ") as never, sink as never);
  mapCoreEventToUi(model("thinking", "đang nghĩ") as never, sink as never);
  mapCoreEventToUi(model("content", "Xin chào") as never, sink as never);
  assert.deepEqual(seen.map(event => event.kind), ["message/thinking-delta", "message/thinking-delta", "message/text-delta"]);
  assert.deepEqual(seen.map(event => event.text), ["Tôi ", "đang nghĩ", "Xin chào"], "one event per delta, in the order the model produced them");
});