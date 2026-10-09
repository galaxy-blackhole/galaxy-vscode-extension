/**
 * The plan is a checklist, not a status word: numbered steps, a badge per state, and a fold in the header.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, clickElement } from "./helpers/webview-harness.ts";

test("the plan reads as a numbered checklist with a badge per step", async () => {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "zsh", model: "m", baseUrl: "https://o.com", credentialSource: "manual-config", modelSettings: { active: "galaxy", configPath: "/tmp/c.json", providers: [] } } }));
  await new Promise(resolve => setTimeout(resolve, 150));
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "ui-event", event: { kind: "plan/updated", mode: true, steps: [
    { id: "s1", status: "completed", title: "Khảo sát cấu trúc workspace" },
    { id: "s2", status: "in_progress", title: "Đọc README core" },
    { id: "s3", status: "pending", title: "Tổng hợp cho người dùng" },
  ] } } }));
  await new Promise(resolve => setTimeout(resolve, 150));

  const items = Array.from(booted.document.querySelectorAll(".plan-item"));
  assert.equal(items.length, 3, "one row per step");
  assert.deepEqual(items.map(item => item.querySelector(".plan-index")?.textContent), ["1.", "2.", "3."], "numbered");
  assert.ok(items[0]?.classList.contains("plan-completed"), "the finished step is marked done");
  assert.match(items[0]?.textContent ?? "", /✓/, "with a tick");
  assert.ok(items[1]?.querySelector(".plan-spinner"), "the step in flight spins");
  assert.equal(/Đang làm|Chờ|Xong/.test(items[1]?.textContent ?? ""), false, "no status words: the styling carries the state");
  assert.ok(items[2]?.classList.contains("plan-pending"), "a todo carries the grey badge state");
  assert.equal(/Đang làm|Chờ|Xong/.test(items[2]?.textContent ?? ""), false, "and a waiting step says nothing either");
  assert.equal(booted.document.querySelector(".plan-count")?.textContent, "1/3", "the header counts progress");

  clickElement(booted, booted.document.querySelector(".plan-toggle")!);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(booted.document.querySelectorAll(".plan-item").length, 0, "and the list folds away");
  assert.ok(booted.document.querySelector(".plan-count"), "the header stays so the fold can be reopened");
});