import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWebArgs, missingCliMessage, parseWebUrl, resolveCliCommand, WEB_URL_PATTERN } from "../src/host/web-launcher-core.ts";

test("the launcher always asks the CLI not to open a browser itself", () => {
  assert.deepEqual(buildWebArgs(), ["web", "--no-open"]);
  assert.deepEqual(buildWebArgs({ port: 3091 }), ["web", "--no-open", "--port", "3091"]);
  assert.deepEqual(buildWebArgs({ port: 0 }), ["web", "--no-open", "--port", "0"]);
});

test("an invalid port is dropped instead of being forwarded", () => {
  for (const port of [-1, 70_000, 1.5, Number.NaN]) {
    assert.deepEqual(buildWebArgs({ port }), ["web", "--no-open"]);
  }
});

test("extra arguments are appended after the launcher's own flags", () => {
  assert.deepEqual(buildWebArgs({ port: 3090, extraArgs: ["--patch", "/tmp/x.yml"] }), ["web", "--no-open", "--port", "3090", "--patch", "/tmp/x.yml"]);
});

test("the CLI command falls back to blackhole on PATH", () => {
  assert.equal(resolveCliCommand(undefined), "blackhole");
  assert.equal(resolveCliCommand("   "), "blackhole");
  assert.equal(resolveCliCommand("/opt/bin/blackhole"), "/opt/bin/blackhole");
});

test("the URL is scraped from the CLI banner", () => {
  assert.equal(parseWebUrl("dsh web: http://127.0.0.1:3090/?token=abc\n"), "http://127.0.0.1:3090/?token=abc");
  assert.equal(parseWebUrl("starting…\ndsh web: http://127.0.0.1:3091/?token=xyz\n"), "http://127.0.0.1:3091/?token=xyz");
  assert.equal(parseWebUrl("no url yet"), undefined);
  assert.equal(parseWebUrl("dsh web: ftp://127.0.0.1/x"), undefined);
  assert.equal(parseWebUrl("dsh web: not-a-url"), undefined);
});

test("the banner pattern only matches the documented prefix", () => {
  assert.equal(WEB_URL_PATTERN.test("dsh web: http://127.0.0.1:1/"), true);
  assert.equal(WEB_URL_PATTERN.test("web: http://127.0.0.1:1/"), false);
});

test("the missing-CLI message names the command and the setting", () => {
  const message = missingCliMessage("blackhole");
  assert.match(message, /blackhole/);
  assert.match(message, /galaxy-code\.cliPath/);
});
