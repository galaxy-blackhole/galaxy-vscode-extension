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

  console.log("[galaxy] flow ok: run completed with " + String(document.messages.length) + " turns in session " + report.sessionId);
  console.log("[galaxy] extension host flows passed");
}

module.exports = { run };
