import assert from "node:assert/strict";
import test from "node:test";
import { archiveSession, cancelSession, createSession, pinSession, renameSession } from "../src/gbh/remote.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";

/**
 * The panel's write actions. Each one is a unary Remote call whose arguments the kernel validated above,
 * so the shapes are locked here — a wrong wrapper is a silent no-op in production.
 */
const HOST = parseReadyUrl("http://127.0.0.1:5439/?token=x")!;
const KERNEL = { host: HOST, cookie: "dsh-auth-fixture" };

/** A fetch double that records the envelope and answers ok. */
function recorder(value: unknown = null) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ method: body.method, args: body.payload?.args ?? {} });
    return new Response(JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value } }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("new session asks session/create with the folder the editor has open", async () => {
  const { calls, fetchImpl } = recorder({ sessionId: "session-new" });
  const id = await createSession(KERNEL, { cwd: "/repo" }, fetchImpl);
  assert.equal(id, "session-new");
  assert.deepEqual(calls[0], { method: "session.create", args: { request: { cwd: "/repo" } } });
});

test("a kernel that returns no id yields undefined instead of a broken panel", async () => {
  const { fetchImpl } = recorder({ unexpected: true });
  assert.equal(await createSession(KERNEL, {}, fetchImpl), undefined);
});

test("stop, rename, pin and archive each carry their own request shape", async () => {
  const stop = recorder();
  await cancelSession(KERNEL, "session-a", stop.fetchImpl);
  assert.deepEqual(stop.calls[0], { method: "session.cancel", args: { request: { sessionId: "session-a" } } });

  const rename = recorder();
  await renameSession(KERNEL, "session-a", "Tên mới", rename.fetchImpl);
  assert.deepEqual(rename.calls[0], { method: "session.rename", args: { request: { sessionId: "session-a", title: "Tên mới" } } });

  const pin = recorder();
  await pinSession(KERNEL, "session-a", pin.fetchImpl);
  assert.deepEqual(pin.calls[0], { method: "workspace.pinSession", args: { request: { sessionId: "session-a" } } });

  const archive = recorder();
  await archiveSession(KERNEL, "session-a", true, archive.fetchImpl);
  assert.deepEqual(archive.calls[0], { method: "workspace.archiveSession", args: { request: { sessionId: "session-a", stopActivity: true } } });
});
