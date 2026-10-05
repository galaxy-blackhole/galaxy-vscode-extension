/**
 * Webview UI test: the composer's /compact asks the runtime for a compaction instead of
 * becoming a model turn. The host bridge stub records exactly what the webview sent.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, submitComposer, typeComposer } from "./helpers/webview-harness.ts";

test("a bare /compact reaches the host as a runtime request, never as a model turn", async () => {
  const booted = await bootWebview();
  typeComposer(booted, "/compact");
  await submitComposer(booted);
  assert.deepEqual(
    booted.posted.filter(message => message.type === "ui-action").map(message => message.action?.type),
    ["context/compact"],
    "the composer must ask the host to compact",
  );
  assert.equal(booted.posted.filter(message => message.type === "run/start").length, 0, "/compact must not start a run");
});
