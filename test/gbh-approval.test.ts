import assert from "node:assert/strict";
import test from "node:test";
import { APPROVAL_EVENT, ApprovalBridge, describeApproval, outcomeForChoice } from "../src/gbh/approval-bridge.ts";
import { itemValueOf, muxUrl } from "../src/gbh/events.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import type { WaterfallRequest } from "../src/gbh/events.ts";

/**
 * The approval round trip has three places to get wrong: reading the request the host sent, mapping the
 * user's click to the host's ApprovalOutcome, and answering the frames the bridge does not own with
 * "next" so a run never hangs.
 */
const REQUEST: WaterfallRequest = {
  event: APPROVAL_EVENT,
  eventId: "e1",
  agentId: "session-a",
  request: { toolName: "bash", reason: "ghi ra ngoài workspace", displayReason: "Cần quyền ghi tệp", callId: "c1" },
};

test("the host's request becomes the four fields the editor shows", () => {
  assert.deepEqual(describeApproval(REQUEST.request), {
    toolName: "bash",
    reason: "ghi ra ngoài workspace",
    displayReason: "Cần quyền ghi tệp",
    callId: "c1",
  });
  assert.deepEqual(describeApproval({}), { toolName: "công cụ không tên" });
  assert.deepEqual(describeApproval({ toolName: "   ", reason: "" }), { toolName: "công cụ không tên" });
});

test("allow and reject map to the host's outcomes, a dismissal asks for next", () => {
  assert.deepEqual(outcomeForChoice("allow"), { kind: "result", value: "allowed-once" });
  assert.deepEqual(outcomeForChoice("reject"), { kind: "result", value: "rejected" });
  assert.deepEqual(outcomeForChoice(undefined), { kind: "next" });
});

test("an approval is asked and answered; other waterfalls answer next without asking", async () => {
  const asked: string[] = [];
  const answers: { eventId: string; outcome: unknown }[] = [];
  const bridge = new ApprovalBridge({
    ask: async (prompt) => {
      asked.push(prompt.toolName);
      return "allow";
    },
    answer: async (eventId, outcome) => {
      answers.push({ eventId, outcome });
    },
  });
  await bridge.handle(REQUEST);
  await bridge.handle({ event: "session/turn", eventId: "e2", agentId: "s", request: {} });
  assert.deepEqual(asked, ["bash"]);
  assert.deepEqual(answers, [
    { eventId: "e1", outcome: { kind: "result", value: "allowed-once" } },
    { eventId: "e2", outcome: { kind: "next" } },
  ]);
});

test("a failing question still answers, so the run is never left waiting", async () => {
  const answers: unknown[] = [];
  const logs: string[] = [];
  const bridge = new ApprovalBridge({
    ask: async () => {
      throw new Error("không mở được hộp thoại");
    },
    answer: async (_eventId, outcome) => {
      answers.push(outcome);
    },
    log: (message) => logs.push(message),
  });
  await bridge.handle(REQUEST);
  assert.deepEqual(answers, [{ kind: "next" }]);
  assert.equal(logs.length, 1);
});

test("the mux URL is the host origin over ws, and non-item frames are ignored", () => {
  const host = parseReadyUrl("http://127.0.0.1:5439/?token=x")!;
  assert.equal(muxUrl(host), "ws://127.0.0.1:5439/api/remote.mux");
  assert.equal(itemValueOf(JSON.stringify({ type: "item", streamId: "s", value: { type: "ready", clientId: "c" } })) !== undefined, true);
  assert.equal(itemValueOf(JSON.stringify({ type: "error", streamId: "s" })), undefined);
  assert.equal(itemValueOf("không phải json"), undefined);
});
