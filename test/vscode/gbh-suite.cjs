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

  step("panel-html");
  const html = await vscode.commands.executeCommand("galaxy-code.__gbhPanelHtml");
  assert.match(String(html), /<strong>đậm<\/strong>/u, "markdown bold is rendered: " + String(html).slice(0, 200));
  assert.match(String(html), /<div class="code">/u, "a fenced block became a copyable code block");
  assert.match(String(html), /<code>code<\/code>/u, "inline code is rendered");
  step("panel-html:ok");

  step("session-actions");
  await vscode.commands.executeCommand("galaxy-code.newGbhSession");
  await vscode.commands.executeCommand("galaxy-code.cancelGbhRun", { session: { id: "session-moi" } });
  await vscode.commands.executeCommand("galaxy-code.renameGbhSession", { session: { id: "session-moi", title: "cũ" } });
  await vscode.commands.executeCommand("galaxy-code.pinGbhSession", { session: { id: "session-moi" } });
  step("session-actions:ok");

  /* A1: flip the fixture to "busy", then let the panel poll — no refresh command is issued here. */
  step("polling");
  await fetch(new URL("/__test/running?on=1", "http://127.0.0.1:" + String(process.env.GBH_FIXTURE_PORT)));
  await fetch(new URL("/__test/extra?on=0", "http://127.0.0.1:" + String(process.env.GBH_FIXTURE_PORT)));
  await vscode.commands.executeCommand("galaxy-code.showGbhTranscript", { session: { id: "session-moi" } });
  const busy = await vscode.commands.executeCommand("galaxy-code.__gbhConversation");
  assert.equal(busy.running, true, "the panel saw the turn running: " + JSON.stringify(busy));
  assert.equal(busy.messages, 2, "two messages before the poll: " + JSON.stringify(busy));
  /* Only now does the kernel gain a message, so the growth below can only come from the panel polling. */
  await fetch(new URL("/__test/extra?on=1", "http://127.0.0.1:" + String(process.env.GBH_FIXTURE_PORT)));
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const afterPoll = await vscode.commands.executeCommand("galaxy-code.__gbhConversation");
  assert.equal(afterPoll.messages, 3, "the panel refreshed itself while the turn ran: " + JSON.stringify(afterPoll));
  await fetch(new URL("/__test/running?on=0", "http://127.0.0.1:" + String(process.env.GBH_FIXTURE_PORT)));
  step("polling:ok");

  step("model-picker");
  await vscode.commands.executeCommand("galaxy-code.selectGbhModel", { session: { id: "session-moi" } });
  const withModel = await vscode.commands.executeCommand("galaxy-code.__gbhConversation");
  assert.equal(withModel.model, "auto/deepseek-v4.1-flash", "the header carries the selected model: " + JSON.stringify(withModel));
  step("model-picker:ok");

  step("older-page");
  const afterOlder = await vscode.commands.executeCommand("galaxy-code.__gbhLoadOlder");
  assert.equal(afterOlder.messages, 4, "the older page was prepended: " + JSON.stringify(afterOlder));
  assert.equal(afterOlder.hasMore, false, "and the kernel now reports no more history");
  step("older-page:ok");

  step("stalled-hint");
  const panelHtml = await vscode.commands.executeCommand("galaxy-code.__gbhPanelHtml");
  assert.match(String(panelHtml), /turn/, "the header carries the turn counter");
  step("stalled-hint:ok");

  /* C3-a: the legacy ai-coder-core panel ships hidden behind a setting that defaults to false. */
  step("legacy-hidden");
  const legacy = vscode.workspace.getConfiguration("galaxy-code").get("showLegacyChat");
  assert.equal(legacy, false, "the legacy chat panel is hidden by default: " + String(legacy));
  void vscode.commands.executeCommand("galaxy-code.openChat");
  step("legacy-hidden:ok");

  /* The composer sends on Cmd/Ctrl+Enter; the panel HTML carries that handler. */
  step("composer-keys");
  const composerHtml = String(await vscode.commands.executeCommand("galaxy-code.__gbhPanelHtml"));
  assert.match(composerHtml, /metaKey/u, "the composer listens for the platform modifier");
  assert.match(composerHtml, /Ctrl\+Enter/u, "and the placeholder says so");
  step("composer-keys:ok");




  void vscode.commands.executeCommand("galaxy-code.openGbhHome");
  console.log("[gbh-spike] activation, contributions, live probe and the mapped tree are green");
}

module.exports = { run };
