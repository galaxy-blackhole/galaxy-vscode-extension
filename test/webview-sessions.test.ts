/**
 * The sessions bar was removed from above the composer on request. The session history still lives in the
 * host (see session-store.test.ts and run-session-e2e.test.ts); here we only guard that the composer no
 * longer renders the bar and that session messages still arrive without upsetting the view.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

test("the composer carries no sessions bar, and a session list is harmless", async () => {
  const booted = await bootWebview();
  assert.equal(booted.document.querySelector(".session-chip"), null, "no sessions chip above the composer");
  assert.equal(booted.document.querySelector(".session-list"), null, "and no sessions panel");

  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: {
    type: "session-list",
    sessions: [{ id: "s-1", messageCount: 4, title: "Sửa lỗi build", updatedAt: "2026-10-05T12:00:00.000Z" }],
  } }));
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: {
    type: "session-loaded",
    session: { id: "s-1", messages: [] },
  } }));
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.ok(booted.document.querySelector(".composer-card"), "the composer still renders after session traffic");
});