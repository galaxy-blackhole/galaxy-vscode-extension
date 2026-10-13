import assert from "node:assert/strict";
import { test } from "node:test";
import { createChildRunFactory, type ChildRunHandle, type ChildRunInput } from "../src/host/subagent-factory";

/**
 * A child run that does exactly what the test says and then finishes — or does not, when the test is about stopping
 * it. The first version of this helper never finished at all, and the suite sat there for twenty-seven minutes
 * waiting for a promise nothing was ever going to resolve.
 */
function starter(script: (input: ChildRunInput, finish: () => void) => void): { readonly seen: ChildRunInput[]; readonly start: (input: ChildRunInput) => ChildRunHandle } {
  const seen: ChildRunInput[] = [];
  return {
    seen,
    start: (input) => {
      seen.push(input);
      let release = (): void => undefined;
      const done = new Promise<void>((resolve) => { release = resolve; });
      script(input, release);
      return { cancel: () => release(), done };
    },
  };
}

test("the child\u2019s prompt becomes its goal, and its words come back whole", async () => {
  const fake = starter((input, finish) => {
    input.onEvent({ kind: "message/text-delta", text: "xin " });
    input.onEvent({ kind: "message/text-delta", text: "chao" });
    input.onEvent({ kind: "run/status", status: "completed" });
    finish();
  });
  let counter = 0;
  const factory = createChildRunFactory({ nextTaskId: () => "task-" + String(++counter), start: fake.start });
  const outcome = await factory({ prompt: "đọc cấu hình", record: { depth: 1, description: "x", id: "agent-1", kind: "spawn", parentId: null, startedAt: 0, status: "running" }, signal: new AbortController().signal });
  assert.equal(fake.seen[0]?.goal, "đọc cấu hình");
  assert.equal(fake.seen[0]?.taskId, "task-1");
  assert.equal(outcome.text, "xin chao");
  assert.equal(outcome.ok, true);
});

test("a run that failed is reported as failed", async () => {
  const fake = starter((input, finish) => {
    input.onEvent({ kind: "run/status", status: "failed", reason: "hết ngân sách" });
    finish();
  });
  const factory = createChildRunFactory({ nextTaskId: () => "task-2", start: fake.start });
  const outcome = await factory({ prompt: "p", record: { depth: 1, description: "x", id: "agent-2", kind: "spawn", parentId: null, startedAt: 0, status: "running" }, signal: new AbortController().signal });
  assert.equal(outcome.ok, false);
});

test("aborting the child stops its run, and the outcome is not a success", async () => {
  let cancelled = false;
  const fake = starter(() => undefined);
  const start = (input: ChildRunInput): ChildRunHandle => {
    const handle = fake.start(input);
    return { cancel: () => { cancelled = true; handle.cancel(); }, done: handle.done };
  };
  const controller = new AbortController();
  const factory = createChildRunFactory({ nextTaskId: () => "task-3", start });
  const answer = factory({ prompt: "việc dài", record: { depth: 1, description: "x", id: "agent-3", kind: "spawn", parentId: null, startedAt: 0, status: "running" }, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  const outcome = await answer;
  assert.equal(cancelled, true);
  assert.equal(outcome.ok, false);
});
