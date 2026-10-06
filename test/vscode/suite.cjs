/**
 * Runs inside the VS Code extension host.
 *
 * Layer 4 is about the pieces only a real editor can exercise: does it activate, are the commands
 * there, does the sidebar view open without falling over, and does one whole goal — connection, core,
 * tool executor, session store — actually run. The model is a scripted local endpoint the runner
 * starts; everything else is the real extension.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");

const EXTENSION_ID = "kevinbui.galaxy-code-vscode";
const COMMANDS = ["galaxy-code.openChat", "galaxy-code.newThread", "galaxy-code.openWeb"];
const GOAL = "Đếm các tệp ở gốc workspace giúp tôi";
const WEBVIEW_GOAL = "Liệt kê giúp tôi những gì có ở gốc workspace";

/** Poll the provider's breadcrumbs through the probe until one matches, or give up. */
async function logUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const answer = await vscode.commands.executeCommand("galaxy-code.__e2e", { kind: "log" });
    const entries = (answer && answer.testLog) || [];
    if (entries.some(predicate)) return entries;
    if (Date.now() > deadline) {
      console.log("[galaxy] timed out waiting for a breadcrumb; log so far: " + entries.join(", "));
      return null;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function run() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, "the extension is installed in the host");
  await extension.activate();
  assert.equal(extension.isActive, true, "it activates without an error");

  const commands = await vscode.commands.getCommands(true);
  for (const id of COMMANDS) assert.ok(commands.includes(id), "the command is contributed: " + id);
  await vscode.commands.executeCommand("galaxy-code.openChat");
  console.log("[galaxy] activation, contributions and the chat view opened cleanly");

  const report = await vscode.commands.executeCommand("galaxy-code.__e2e", { goal: GOAL });
  assert.ok(report, "the probe answered");
  assert.equal(report.state, "completed", "the run completed: " + JSON.stringify(report.error));
  assert.ok(Array.isArray(report.mcpServers), "the probe reports the workspace's MCP servers");
  assert.ok(report.sessions.length >= 1, "the run left a session behind");

  const document = JSON.parse(await fs.readFile(path.join(report.storageRoot, "sessions", report.sessionId + ".json"), "utf8"));
  assert.equal(document.title, GOAL, "the session is titled by its first message");
  assert.ok(document.messages.some(turn => turn.role === "user" && turn.content === GOAL), "the question is in the history");
  const answers = document.messages.filter(turn => turn.role === "assistant");
  assert.ok(answers.length >= 1 && answers[0].content.length > 0, "and so is the report");
  assert.ok(report.sessions.every(item => typeof item.id === "string" && item.messageCount >= 1), "the list carries the stored sessions");

  /*
   * The workspace declares one MCP server that cannot start: the run must still finish, and the failure
   * must be reported rather than silently dropping those tools.
   */
  assert.equal(report.mcp.names.length, 0, "a broken server contributes no tools");
  assert.match(String(report.mcp.error), /broken-docs/, "and it is named in the report");

  /* The second run is the /compact path: it compacts as it starts, like the composer's command. */
  assert.equal(report.secondState, "completed", "a run that compacts on start completes too");
  assert.ok(report.events.filter(kind => kind === "run/status").length >= 2, "both runs reported status to the view");
  assert.ok(report.events.includes("tool/start") && report.events.includes("tool/result"), "the tool loop reached the view");
  assert.equal(report.messages.filter(turn => turn.role === "assistant").length, 2, "both runs left their answer in the history");
  /*
   * The editor's own webview: it must have booted, and it must do what a click would do. This is the
   * one direction the host suite cannot reach on its own — the host posts a command, the view acts, and
   * the breadcrumbs prove the round trip.
   */
  const ready = await logUntil(entry => entry === "ui-ready", 45000);
  assert.ok(ready, "the webview booted inside the real editor");
  await vscode.commands.executeCommand("galaxy-code.__e2e", { kind: "webview-submit", text: WEBVIEW_GOAL });
  assert.ok(await logUntil(entry => entry.startsWith("run/start:"), 45000), "submitting from the view started a run");
  const created = await logUntil(entry => entry.startsWith("session-created:"), 60000);
  assert.ok(created, "and the run opened a session");
  const sessionId = created.find(entry => entry.startsWith("session-created:")).slice("session-created:".length);
  /* Now ask the view to open that session, i.e. what clicking it in the panel does. */
  await vscode.commands.executeCommand("galaxy-code.__e2e", { kind: "webview-open-session", id: sessionId });
  assert.ok(await logUntil(entry => entry === "session/open:" + sessionId, 30000), "the view asked the host to open that session");
  assert.ok(await logUntil(entry => entry === "session-loaded:" + sessionId, 30000), "and the host handed the transcript back");

  const driven = JSON.parse(await fs.readFile(path.join(report.storageRoot, "sessions", sessionId + ".json"), "utf8"));
  assert.ok(driven.messages.some(turn => turn.role === "user" && turn.content === WEBVIEW_GOAL), "the prompt typed in the view reached the model");
  assert.ok(driven.messages.some(turn => turn.role === "assistant" && turn.content.includes("đếm được")), "and its answer came back to the view");

  console.log("[galaxy] view flow ok: ui-ready, submit, session opened and reloaded");
  console.log("[galaxy] UI events seen: " + [...new Set(report.events)].sort().join(", "));
  console.log("[galaxy] flow ok: 2 runs, " + String(document.messages.length) + " turns stored, session " + report.sessionId);
  console.log("[galaxy] extension host flows passed");
}

module.exports = { run };
