/**
 * The core announces a plan as `{ type: "plan", plan, planMode }`; the webview only knows `plan/updated`.
 * The host skipped that translation, so the checklist never moved however much the model updated it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planEventForWebview } from "../src/host/plan-event.ts";

test("the core plan event becomes the plan/updated the strip renders", () => {
  const mapped = planEventForWebview({
    plan: { completed: ["Khảo sát cấu trúc"], inProgress: "Đọc README", pending: ["Kiểm tra core", "Tổng hợp"], steps: [] },
    planMode: true,
    type: "plan",
  }) as { kind: string; mode: boolean; steps: readonly { status: string; title: string }[] };
  assert.equal(mapped.kind, "plan/updated");
  assert.equal(mapped.mode, true, "plan mode travels with it");
  assert.deepEqual(mapped.steps.map(step => step.title), ["Khảo sát cấu trúc", "Đọc README", "Kiểm tra core", "Tổng hợp"]);
  assert.deepEqual(mapped.steps.map(step => step.status), ["completed", "in_progress", "pending", "pending"]);
});

test("rich steps win over the legacy buckets, and other events pass through", () => {
  const mapped = planEventForWebview({
    plan: { completed: [], inProgress: null, pending: [], steps: [{ id: "s1", status: "skipped", title: "Bỏ qua" }, { id: "s2", status: "in_progress", title: "Đang làm" }] },
    planMode: false,
    type: "plan",
  }) as { steps: readonly { id: string; status: string }[] };
  assert.deepEqual(mapped.steps.map(step => step.id + ":" + step.status), ["s1:skipped", "s2:in_progress"]);
  const other = { kind: "run/status", status: "running" };
  assert.equal(planEventForWebview(other), other, "an unrelated event is forwarded untouched");
});