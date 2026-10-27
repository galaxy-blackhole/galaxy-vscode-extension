import assert from "node:assert/strict";
import test from "node:test";
import { looksUnanswered, messagesOfRecords, readTranscript, textOfContent, throughSeqHint } from "../src/gbh/transcript.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";

/**
 * session.page is what the panel paints, so the two things that decide correctness live here: which
 * events become lines (only user/assistant messages with text) and which throughSeq the request carries.
 */
const HOST = parseReadyUrl("http://127.0.0.1:5439/?token=x")!;
const COOKIE = "dsh-auth-fixture";

/** One page answer carrying two messages plus noise the view must ignore. */
const PAGE = {
  type: "server-response",
  rpcId: "r",
  result: {
    ok: true,
    value: {
      hasMore: false,
      records: [
        { type: "event", event: { type: "user/message", seq: 2, time: 1, data: { role: "user", content: [{ type: "text", text: "chạy ls giúp tôi" }] } } },
        { type: "event", event: { type: "tool/result", seq: 3, data: { content: [] } } },
        { type: "event", event: { type: "assistant/message", seq: 4, time: 2, data: { role: "assistant", content: [{ type: "text", text: "xong" }, { type: "image" }] } } },
        { type: "event", event: { type: "user/message", seq: 5, data: { role: "user", content: [{ type: "text", text: "   " }] } } },
        { type: "frame" },
      ],
    },
  },
};

/** A kernel double: session.list first (to learn the cut), then session.page. */
function kernelDouble(onRequest: (method: string, args: Record<string, unknown>) => void) {
  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    onRequest(body.method, body.payload?.args ?? {});
    if (body.method === "session.list") {
      return new Response(
        JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value: { items: [{ sessionId: "s1", projections: { asOfSeq: 42, values: { title: "phiên A" } } }] } } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(PAGE), { status: 200 });
  };
}

test("only real text messages become lines, in order, and block kinds other than text are skipped", () => {
  assert.equal(textOfContent([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }]), "a\nb");
  assert.equal(textOfContent(undefined), "");
  const messages = messagesOfRecords(PAGE.result.value.records);
  assert.deepEqual(messages.map((item) => [item.role, item.text, item.seq]), [
    ["user", "chạy ls giúp tôi", 2],
    ["assistant", "xong", 4],
  ]);
  assert.deepEqual(messagesOfRecords(undefined), []);
});

test("the page request carries the session's own log cut, and the transcript keeps the title", async () => {
  const asked: { method: string; args: Record<string, unknown> }[] = [];
  const transcript = await readTranscript({ host: HOST, cookie: COOKIE }, "s1", 7, kernelDouble((method, args) => asked.push({ method, args })));
  assert.equal(transcript.title, "phiên A");
  assert.equal(transcript.messages.length, 2);
  assert.equal(transcript.hasMore, false);
  const page = asked.find((call) => call.method === "session.page");
  assert.ok(page, "the page call happened");
  const request = (page.args as { request: { address: unknown; throughSeq: number; maxMessages: number } }).request;
  assert.deepEqual(request.address, { kind: "session", sessionId: "s1" });
  assert.equal(request.throughSeq, 42, "throughSeq is the asOfSeq the kernel reported");
  assert.equal(request.maxMessages, 7);
});

test("an unlisted session still pages, using the largest safe cut", async () => {
  const asked: Record<string, unknown>[] = [];
  const fetchDouble = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.method === "session.page") asked.push(body.payload.args);
    if (body.method === "session.list") return new Response(JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value: { items: [] } } }), { status: 200 });
    return new Response(JSON.stringify(PAGE), { status: 200 });
  };
  const transcript = await readTranscript({ host: HOST, cookie: COOKIE }, "missing", 3, fetchDouble);
  assert.equal(transcript.title, undefined);
  assert.equal((asked[0] as { request: { throughSeq: number } }).request.throughSeq, Number.MAX_SAFE_INTEGER);
  assert.equal(throughSeqHint(undefined), Number.MAX_SAFE_INTEGER);
  assert.equal(throughSeqHint({ asOfSeq: 5 }), 5);
});

test("an unanswered last prompt is detected only when nothing is running", () => {
  const user = { role: "user" as const, text: "hỏi", seq: 5 };
  const assistant = { role: "assistant" as const, text: "đáp", seq: 6 };
  assert.equal(looksUnanswered([user, assistant], false), false);
  const newer = { ...user, seq: 7 };
  assert.equal(looksUnanswered([assistant, newer], false), true, "a user message newer than every reply");
  assert.equal(looksUnanswered([assistant, user], true), false, "a running turn is not an error");
  assert.equal(looksUnanswered([], false), false);
});
