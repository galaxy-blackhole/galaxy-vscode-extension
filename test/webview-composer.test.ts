/**
 * Webview UI test: an ordinary message still starts a run.
 *
 * One boot per file on purpose — the bundle keeps module-level state, so a second boot in
 * the same process renders into a stale root. Node runs each test file in its own process.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, submitComposer, typeComposer } from "./helpers/webview-harness.ts";

test("an ordinary message still starts a run and never asks for a compaction", async () => {
  const booted = await bootWebview();
  typeComposer(booted, "sửa lỗi build");
  await submitComposer(booted);
  assert.equal(
    booted.posted.filter(message => message.type === "ui-action" && message.action?.type === "context/compact").length,
    0,
    "a plain message must not ask for a compaction",
  );
  const starts = booted.posted.filter(message => message.type === "ui-action" && message.action?.type === "run/start");
  assert.equal(starts.length, 1, "a normal message still starts a run");
  assert.equal(starts[0]?.action?.input, "sửa lỗi build", "the run carries the typed task");
});
