import assert from "node:assert/strict";
import test from "node:test";
import { sendPrompt } from "../src/gbh/remote.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";

/**
 * Sending is a unary call, not an uplink: the kernel's own client uses
 * remote.session.prompt({requestId, sessionId, mode, content, clientTimeZone}) and the gateway exposes
 * it as session/prompt with the arguments wrapped in "request".
 */
const HOST = parseReadyUrl("http://127.0.0.1:5439/?token=x")!;

test("a prompt travels as session/prompt with request fields and the text block", async () => {
  const seen: { url: string; body: unknown }[] = [];
  const accepted = await sendPrompt(
    { host: HOST, cookie: "dsh-auth-fixture" },
    { sessionId: "s1", text: "chào GBH", requestId: "fixed-id", clientTimeZone: "Asia/Saigon" },
    async (url, init) => {
      seen.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value: { accepted: true } } }), { status: 200 });
    },
  );
  assert.equal(accepted, true);
  assert.equal(seen[0]?.url, "http://127.0.0.1:5439/api/session/prompt");
  const body = seen[0]?.body as { method: string; payload: { args: { request: Record<string, unknown> } } };
  assert.equal(body.method, "session.prompt");
  assert.equal(body.payload.args.request.sessionId, "s1");
  assert.equal(body.payload.args.request.mode, "queue");
  assert.equal(body.payload.args.request.requestId, "fixed-id");
  assert.equal(body.payload.args.request.clientTimeZone, "Asia/Saigon");
  assert.deepEqual(body.payload.args.request.content, [{ type: "text", text: "chào GBH" }]);
});

test("a rejected admission answers false instead of throwing", async () => {
  const accepted = await sendPrompt(
    { host: HOST, cookie: "c" },
    { sessionId: "s1", text: "x" },
    async () => new Response(JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value: { accepted: false } } }), { status: 200 }),
  );
  assert.equal(accepted, false);
});
