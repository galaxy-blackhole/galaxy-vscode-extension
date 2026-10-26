/**
 * Runs INSIDE a real VS Code extension host (see gbh-run.mjs).
 *
 * It proves the spike's claim where it matters: the extension activates, the contributed commands are
 * there, the kernel probe ran against a real HTTP server, and the tree paints the fixture workspace with
 * its two sessions — read from the same files the kernel writes.
 */
const assert = require("node:assert/strict");
const vscode = require("vscode");
console.log("[gbh-spike] GBH SUITE LOADED");

const EXTENSION_ID = "kevinbui.galaxy-code-vscode";
const COMMANDS = [
  "galaxy-code.refreshGbhSessions",
  "galaxy-code.openGbhHome",
  "galaxy-code.openGbhSession",
];

const step = (name) => console.log("[gbh-spike] step: " + name);

async function run() {
  step("getExtension");
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, "the extension is installed in the host");
  step("activate");
  await extension.activate();
  step("activated");
  assert.equal(extension.isActive, true, "it activates without an error");

  step("getCommands");
  const commands = await vscode.commands.getCommands(true);
  step("commands:" + String(commands.length));
  for (const id of COMMANDS) assert.ok(commands.includes(id), "the command is contributed: " + id);

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(workspace, "the editor opened our fixture workspace");

  step("refresh");
  await vscode.commands.executeCommand("galaxy-code.refreshGbhSessions");
  step("refreshed");
  step("tree");
  const snapshot = await vscode.commands.executeCommand("galaxy-code.__gbhTree");
  step("tree:" + JSON.stringify(snapshot));
  assert.ok(snapshot, "the tree probe answered");

  const host = snapshot.roots.find((node) => node.kind === "host");
  assert.ok(host, "the tree shows a kernel row");
  assert.equal(host.alive, true, "the kernel probe saw the local server: " + JSON.stringify(host));
  assert.match(String(host.detail), /127\.0\.0\.1:\d+/u, "the row carries the origin");

  const folder = snapshot.roots.find((node) => node.kind === "workspace");
  assert.ok(folder, "the open folder became a workspace row");
  assert.equal(folder.label, require("node:path").basename(workspace), "the row is labelled by the folder");
  assert.match(String(folder.detail), /2 phiên/u, "the row counts the fixture sessions: " + String(folder.detail));

  assert.equal(snapshot.source, "remote", "the rows came from the kernel API, not the files: " + String(snapshot.source));
  assert.deepEqual(
    snapshot.sessions.map((session) => session.title),
    ["phiên Remote mới", "phiên Remote cũ"],
    "sessions come from /api/session/list (the scripted kernel), newest first",
  );

  /*
   * openGbhHome shows an information message; awaiting it would block the host until a human clicks OK,
   * so the suite fires it and moves on.
   */
  void vscode.commands.executeCommand("galaxy-code.openGbhHome");
  console.log("[gbh-spike] activation, contributions, live probe and the mapped tree are green");
}

module.exports = { run };
