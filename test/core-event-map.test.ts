/**
 * Contract test for the host seam: every core runtime event a run can emit must reach the webview as
 * a GalaxyUiEvent the webview already knows. When core internals grow an event, this table fails
 * until somebody maps it — which is exactly the drift the protocol doc promises to prevent.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mapCoreEventToUi } from "../src/host/core-run-session.ts";
import type { AiCoderRuntimeEvent } from "@galaxy-stack/ai-coder-core";
import type { GalaxyUiEvent } from "../src/ui-protocol.ts";

const identity = { model: "test", provider: "test" } as const;
const call = { arguments: { path: "." }, name: "workspace_list", toolCallId: "call-1" };

function mapped(event: AiCoderRuntimeEvent): GalaxyUiEvent[] {
  const seen: GalaxyUiEvent[] = [];
  mapCoreEventToUi(event, value => seen.push(value));
  return seen;
}

test("every core event a run emits lands on the webview as a known UI event", () => {
  const cases: Readonly<{ event: AiCoderRuntimeEvent; expect: readonly string[] }>[] = [
    { event: { event: { delta: "hi", type: "content" }, type: "model" } as AiCoderRuntimeEvent, expect: ["message/text-delta"] },
    { event: { event: { delta: "nghĩ", type: "thinking" }, type: "model" } as AiCoderRuntimeEvent, expect: ["message/thinking-delta"] },
    { event: { call, type: "tool_start" } as AiCoderRuntimeEvent, expect: ["tool/start"] },
    { event: { call, result: { canonicalToolId: "workspace_list", content: "{}", ok: true, summary: "ok", trust: "workspace" }, type: "tool_result" } as AiCoderRuntimeEvent, expect: ["tool/result"] },
    { event: { attempt: 2, delayMs: 100, message: "retry", type: "model_retry" } as AiCoderRuntimeEvent, expect: ["model/retry"] },
    { event: { reason: "manual", type: "compaction", itemsShadowed: 3, tokensAfter: 100, tokensBefore: 200 } as AiCoderRuntimeEvent, expect: ["context/compacted"] },
    { event: { plan: { completed: [], inProgress: null, pending: [], steps: [] }, planMode: true, turn: 2, type: "plan" } as AiCoderRuntimeEvent, expect: ["plan/updated"] },
    { event: { pressure: { level: "normal" }, tokens: 42, type: "context_pressure" } as AiCoderRuntimeEvent, expect: ["context/pressure"] },
    { event: { issues: ["a"], type: "completion_rejected" } as AiCoderRuntimeEvent, expect: ["completion/rejected"] },
    { event: { transition: { from: "preparing", reason: "start", sequence: 1, timestamp: "2026-01-01T00:00:00.000Z", to: "inspecting" }, type: "state" } as AiCoderRuntimeEvent, expect: ["run/status"] },
  ];
  for (const item of cases) {
    const seen = mapped(item.event);
    assert.deepEqual(seen.map(value => value.kind), item.expect, "unmapped core event: " + item.event.type);
  }
  assert.equal(identity.provider, "test");
});

test("the plan event carries the checklist and the mode the strip renders", () => {
  const seen = mapped({
    plan: { completed: ["a"], inProgress: "b", pending: ["c"], steps: [{ id: "a", status: "completed", title: "a" }] },
    planMode: true,
    toolCallId: "call-9",
    turn: 3,
    type: "plan",
  } as AiCoderRuntimeEvent);
  assert.deepEqual(seen, [{ kind: "plan/updated", mode: true, steps: [{ id: "a", status: "completed", title: "a" }] }]);
});
