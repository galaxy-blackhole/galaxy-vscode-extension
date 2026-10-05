/**
 * Webview UI test: the permanent plan strip above the composer.
 *
 * The host sends one plan/updated event; the strip must render the checklist, mark the
 * step being worked on and offer the plan-mode toggle the host understands.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

test("the plan strip renders the checklist and toggles plan mode", async () => {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: {
    type: "ui-event",
    event: {
      kind: "plan/updated",
      mode: true,
      steps: [
        { id: "doc-ma", status: "completed", title: "Đọc mã" },
        { id: "viet-test", status: "in_progress", title: "Viết test" },
        { id: "chay-suite", status: "pending", title: "Chạy suite" },
      ],
    },
  } }));
  await new Promise(resolve => setTimeout(resolve, 200));
  const strip = booted.document.querySelector(".plan-strip");
  assert.ok(strip, "the strip appears once the run has a plan");
  const text = strip?.textContent ?? "";
  assert.match(text, /Đọc mã/);
  assert.match(text, /Viết test/);
  assert.match(text, /KẾ HOẠCH/, "plan mode is visible while it is on");
  assert.equal(booted.document.querySelectorAll(".plan-step-active").length, 1, "exactly one step is the active one");

  booted.document.querySelector(".plan-chip")?.dispatchEvent(new booted.window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const actions = booted.posted
    .filter(message => message.type === "ui-action")
    .map(message => (message.action as { on?: boolean; type?: string } | undefined));
  assert.deepEqual(actions, [{ on: false, type: "plan/mode" }], "the chip asks the host to approve and leave plan mode");
});

test("a run with no plan shows no strip", async () => {
  const booted = await bootWebview();
  assert.equal(booted.document.querySelector(".plan-strip"), null, "an empty plan must not take space");
});
