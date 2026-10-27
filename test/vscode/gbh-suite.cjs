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
  "galaxy-code.showGbhTranscript",
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
  step("transcript");
  await vscode.commands.executeCommand("galaxy-code.showGbhTranscript", { session: { id: "session-moi" } });
  const conversation = await vscode.commands.executeCommand("galaxy-code.__gbhConversation");
  assert.equal(conversation.messages, 2, "the panel painted the two messages from session.page: " + JSON.stringify(conversation));
  assert.equal(conversation.title, "phiên Remote mới", "and it kept the session title");
  step("transcript:ok");

  step("send");
  const afterSend = await vscode.commands.executeCommand("galaxy-code.__gbhSend", { sessionId: "session-moi", text: "chào từ panel VS Code" });
  assert.equal(afterSend.messages, 2, "the panel repainted from the kernel after sending: " + JSON.stringify(afterSend));
  assert.equal(afterSend.error, undefined, "and the send raised nothing");
  step("send:ok");

  /* The kernel asked for an approval over the mux; the extension must have answered it. */
  step("approval-wait");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const events = await vscode.commands.executeCommand("galaxy-code.__gbhEvents");
  assert.equal(events.clientId, "fixture-client", "the extension opened the forwarded-event stream: " + JSON.stringify(events));
  step("approval:stream-ready");

  /* The workspace is a real git tree with one modified file; the tree must offer it and open a diff. */
  step("changes");
  const files = await vscode.commands.executeCommand("galaxy-code.__gbhChanges");
  assert.ok(Array.isArray(files) && files.some((file) => file.path === "README.md"), "the tree listed the changed file: " + JSON.stringify(files));
  await vscode.commands.executeCommand("galaxy-code.showGbhDiff", { folder: workspace, file: { path: "README.md" } });
  const groups = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  /*
   * tab.input's class name differs between VS Code versions, so the check accepts either signal: a
   * TabInputTextDiff instance, or the title openChange() gives the tab.
   */
  const diff = groups.find((tab) => (tab.input && tab.input.constructor && tab.input.constructor.name.includes("Diff")) || String(tab.label).includes("(HEAD"));
  assert.ok(diff, "a diff editor opened: " + JSON.stringify(groups.map((tab) => tab.label)));
  step("changes:ok");




  void vscode.commands.executeCommand("galaxy-code.openGbhHome");
  console.log("[gbh-spike] activation, contributions, live probe and the mapped tree are green");
}

module.exports = { run };
