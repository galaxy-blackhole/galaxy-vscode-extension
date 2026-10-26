import assert from "node:assert/strict";
import test from "node:test";
import { authenticate, buildRequest, callRemote, endpointOf, listSessions, mapSessionItem, parseSessionCookie } from "../src/gbh/remote.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";

/**
 * The Remote wire, locked to what the running host actually answers (read 26/10/2026): a 303 carrying
 * dsh-auth-*, a POST to /api/<dotted method with slashes>, args wrapped in payload.args, and a
 * server-response envelope whose result may be ok or an error.
 */
const READY = "http://127.0.0.1:5439/?token=fixture-token";
const HOST = parseReadyUrl(READY);
const COOKIE = "dsh-auth-839a4abd7d12a886=v1.eyJ2ZXJzaW9uIjoxfQ.sig";

test("the token exchange keeps the cookie pair and drops its attributes", async () => {
  assert.ok(HOST);
  const seen: string[] = [];
  const cookie = await authenticate(HOST, async (input) => {
    seen.push(input);
    return new Response(null, { status: 303, headers: { "set-cookie": COOKIE + "; Path=/; HttpOnly; SameSite=Strict" } });
  });
  assert.equal(cookie, COOKIE);
  assert.equal(seen[0], READY, "the token URL is what the browser would open");
});

test("a host that sets no cookie authenticates to undefined instead of throwing", async () => {
  assert.ok(HOST);
  const cookie = await authenticate(HOST, async () => new Response(null, { status: 200 }));
  assert.equal(cookie, undefined);
  assert.equal(parseSessionCookie(null), undefined);
  assert.equal(parseSessionCookie("junk"), undefined);
});

test("the endpoint is the dotted method with dots turned into slashes, and args ride under payload.args", () => {
  assert.equal(endpointOf("session.list"), "session/list");
  assert.deepEqual(buildRequest("session.list", { _request: {} }, "r1"), {
    type: "client-request",
    rpcId: "r1",
    method: "session.list",
    payload: { args: { _request: {} } },
  });
});

test("a session row becomes the summary the view paints", () => {
  const summary = mapSessionItem({
    sessionId: "session-a",
    cwd: "/Users/dev/repo",
    updatedAt: 1792897103040,
    projections: { values: { title: "chạy lệnh ls", workingDirectory: "/Users/dev/repo", tokenUsage: { uncachedInputTokens: 7, outputTokens: 3 } } },
  });
  assert.deepEqual(summary, {
    id: "session-a",
    title: "chạy lệnh ls",
    cwd: "/Users/dev/repo",
    workingDirectory: "/Users/dev/repo",
    createdAt: 1792897103040,
    uncachedInputTokens: 7,
    outputTokens: 3,
  });
  assert.equal(mapSessionItem({ nope: true }), undefined);
});

test("callRemote posts the envelope to the right path with the cookie, and unwraps the value", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const session = { host: HOST!, cookie: COOKIE };
  const value = await callRemote(session, "session.list", { _request: {} }, async (url, init) => {
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify({ type: "server-response", rpcId: "x", result: { ok: true, value: { items: [] } } }), { status: 200 });
  });
  assert.deepEqual(value, { items: [] });
  assert.equal(calls[0]?.url, "http://127.0.0.1:5439/api/session/list");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.cookie, COOKIE);
  assert.equal(headers["content-type"], "application/json");
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.method, "session.list");
  assert.deepEqual(body.payload, { args: { _request: {} } });
});

test("a failed result becomes an error carrying the gateway code, and HTTP failures too", async () => {
  const session = { host: HOST!, cookie: COOKIE };
  await assert.rejects(
    callRemote(session, "session.list", { _request: {} }, async () =>
      new Response(JSON.stringify({ type: "server-response", rpcId: "x", result: { ok: false, error: { code: "gateway/arguments-invalid", message: "missing _request" } } }), { status: 200 }),
    ),
    /gateway\/arguments-invalid/u,
  );
  await assert.rejects(callRemote(session, "session.list", {}, async () => new Response("not found", { status: 404 })), /HTTP 404/u);
});

test("listSessions keeps the newest first and drops rows without an id", async () => {
  const session = { host: HOST!, cookie: COOKIE };
  const sessions = await listSessions(session, async () =>
    new Response(
      JSON.stringify({
        type: "server-response",
        rpcId: "x",
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "old", updatedAt: 10, cwd: "/repo", projections: { values: { title: "cũ" } } },
              { sessionId: "new", updatedAt: 20, cwd: "/repo", projections: { values: { title: "mới" } } },
              { nope: true },
            ],
          },
        },
      }),
      { status: 200 },
    ),
  );
  assert.deepEqual(sessions.map((item) => item.id), ["new", "old"]);
});
