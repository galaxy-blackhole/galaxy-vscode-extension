/**
 * The test-only channel the extension-host suite uses: a command from the host must reach the same code a
 * click in the view reaches. This covers the webview half quickly, so the slow layer 4 run only has to
 * cover the parts that need a real editor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

async function drive(booted: Awaited<ReturnType<typeof bootWebview>>, command: unknown) {
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "test/command", command } }));
  await new Promise(resolve => setTimeout(resolve, 120));
  return booted.posted;
}

test("an open-session command becomes the same session action the panel sends", async () => {
  const booted = await bootWebview();
  const posted = await drive(booted, { kind: "open-session", id: "session-42" });
  const actions = posted.filter(message => message.type === "session/action").map(message => message.action);
  assert.deepEqual(actions.at(-1), { id: "session-42", type: "open" });
});

test("a submit command starts a run exactly like the composer does", async () => {
  const booted = await bootWebview();
  const posted = await drive(booted, { kind: "submit", text: "Liệt kê giúp tôi" });
  /* The view asks for a run with a ui-action; the host is what turns it into a run. */
  assert.ok(posted.some(message => message.type === "ui-action" && message.action?.type === "run/start"), "the run was asked for: " + JSON.stringify(posted));
});
