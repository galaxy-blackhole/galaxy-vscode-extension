/**
 * A `ptc` program is one tool in the run, and the calls it made hang under it: they never count as their own
 * top-level tools, and the card renders them nested.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { nestedToolPartsFor, toolRunFor } from "../webview/src/tool-run.ts";
import type { UiMessage, UiToolPart } from "../webview/src/ui-store.ts";

function call(toolCallId: string, name: string, parent?: string): UiToolPart {
  return { args: {}, argsText: "", toolCallId, toolName: name, type: "tool-call", ...(parent === undefined ? {} : { parent }) };
}

test("a program's calls belong to their parent instead of the run", () => {
  const messages: UiMessage[] = [{
    content: [call("code-1", "run_code"), call("code-1:a", "list_files", "code-1"), call("code-1:b", "read_file", "code-1")],
    id: "a1",
    role: "assistant",
  }];
  const run = toolRunFor(messages, "code-1") ?? [];
  assert.deepEqual(run.map(part => part.toolCallId), ["code-1"], "the run is the program alone: " + JSON.stringify(run.map(part => part.toolCallId)));
  assert.deepEqual(
    nestedToolPartsFor(messages, "code-1").map(part => part.toolCallId),
    ["code-1:a", "code-1:b"],
    "and its calls are what the card renders nested",
  );
});
