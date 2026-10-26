import assert from "node:assert/strict";
import test from "node:test";
import { parseReadyUrl, probeHost } from "../src/gbh/host.ts";

/**
 * The ready URL is the only handle the extension has on a running kernel, and a bare request answers
 * 401 by design — both facts are locked here so the panel never reports a healthy app as broken.
 */
const READY = "http://127.0.0.1:5439/?token=NU8hQRZX4H01s06aAhGzAYLGrk7vXZTpbDbyL8lMbRI";

test("the ready URL splits into origin, token and the URL a browser would open", () => {
  const host = parseReadyUrl(READY + "\n");
  assert.equal(host?.baseUrl, "http://127.0.0.1:5439");
  assert.equal(host?.token, "NU8hQRZX4H01s06aAhGzAYLGrk7vXZTpbDbyL8lMbRI");
  assert.equal(host?.url, READY);
  assert.equal(parseReadyUrl(""), undefined);
  assert.equal(parseReadyUrl("not a url"), undefined);
  assert.equal(parseReadyUrl("ftp://127.0.0.1:1/?token=x"), undefined);
});

test("a listening server is alive on 200, and 401 is alive too (cookie not set yet)", async () => {
  const host = parseReadyUrl(READY);
  assert.ok(host);
  const alive = await probeHost(host, (async () => new Response("nope", { status: 401 })) as typeof fetch);
  assert.deepEqual(alive, { alive: true, status: 401 });
  const ok = await probeHost(host, (async () => new Response("{}", { status: 200 })) as typeof fetch);
  assert.equal(ok.alive, true);
});

test("a refused connection or an unexpected status is reported as not alive, with the reason", async () => {
  const host = parseReadyUrl(READY);
  assert.ok(host);
  const dead = await probeHost(host, (async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5439");
  }) as typeof fetch);
  assert.equal(dead.alive, false);
  assert.match(String(dead.reason), /ECONNREFUSED/u);
  const weird = await probeHost(host, (async () => new Response("", { status: 503 })) as typeof fetch);
  assert.equal(weird.alive, false);
  assert.equal(weird.status, 503);
});
