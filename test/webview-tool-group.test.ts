/**
 * Consecutive tool calls belong to one run: whoever is first renders the group, the rest render nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { toolRunFor } from "../webview/src/tool-run.ts";
import type { UiMessage, UiToolPart } from "../webview/src/ui-store.ts";

function call(toolCallId: string, name: string): UiToolPart {
  return { args: {}, argsText: "", toolCallId, toolName: name, type: "tool-call" };
}

test("consecutive tool calls gather into the run the first of them belongs to", () => {
  const messages: UiMessage[] = [{ content: [call("c1", "list_files"), call("c2", "detect_project"), call("c3", "read_file")], id: "a1", role: "assistant" }];
  const run = toolRunFor(messages, "c2");
  assert.equal(run?.length, 3, "one run of three: " + JSON.stringify(run?.map(part => part.toolCallId)));
  assert.equal(run?.[0]?.toolCallId, "c1", "and the head is the first call, which is the one that renders");
  assert.equal(toolRunFor(messages, "nope"), undefined, "an unknown id belongs to no run");
  assert.equal(toolRunFor(messages, undefined), undefined, "and neither does a part without an id");
});

test("a call on its own is its own run of one", () => {
  const messages: UiMessage[] = [{ content: [call("solo", "list_files")], id: "a2", role: "assistant" }];
  assert.equal(toolRunFor(messages, "solo")?.length, 1, "so the plain card renders it");
});