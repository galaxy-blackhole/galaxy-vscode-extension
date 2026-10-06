/**
 * Layer 4: the extension inside a real VS Code.
 *
 * Runs the extension host with a throwaway user-data directory and a throwaway HOME that points the
 * extension at a scripted local model, so a whole flow can run without touching the developer's
 * editor state, credentials or workspace.
 *
 * Run it with: yarn test:vscode
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const GOAL = "Đếm các tệp ở gốc workspace giúp tôi";
const line = payload => JSON.stringify(payload) + String.fromCharCode(10);

/* Each run gets two rounds: the model lists the workspace for evidence, then reports. */
const toolRound = index => line({ done: true, done_reason: "tool_calls", message: { content: "", role: "assistant", tool_calls: [{ function: { arguments: { path: "." }, name: "list_files" }, id: "call-" + String(index), type: "function" }] } });
const reportRound = text => line({ done: true, done_reason: "stop", message: { content: text, role: "assistant", tool_calls: [] } });
const rounds = [
  toolRound(1), reportRound("Đã xong: kể ra các mục ở gốc workspace."),
  toolRound(2), reportRound("Tóm tắt: workspace chỉ có .vscode/mcp.json."),
];
const bodies = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  bodies.push(body);
  if ((request.url ?? "").includes("api/show")) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ capabilities: ["completion", "tools"], model_info: { "test.context_length": 65536 } }));
    return;
  }
  response.setHeader("content-type", "application/x-ndjson");
  response.end(rounds.shift() ?? reportRound("Hết kịch bản."));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const home = await mkdtemp(join(tmpdir(), "galaxy-e2e-home-"));
await mkdir(join(home, ".galaxy"), { recursive: true });
await writeFile(join(home, ".galaxy", "config.json"), JSON.stringify({ agent: [{ apiKey: "sk-e2e", baseUrl: "http://127.0.0.1:" + String(port), model: "test", type: "manual" }] }), "utf8");

/* The workspace the editor opens: a temp folder whose .vscode/mcp.json names one server that cannot start. */
const workspace = await mkdtemp(join(tmpdir(), "galaxy-e2e-ws-"));
await mkdir(join(workspace, ".vscode"), { recursive: true });
await writeFile(join(workspace, ".vscode", "mcp.json"), JSON.stringify({ servers: { "broken-docs": { args: [], command: "galaxy-missing-binary" } } }), "utf8");

const userData = await mkdtemp(join(tmpdir(), "galaxy-vscode-"));
const previousHome = process.env.HOME;
process.env.HOME = home;
let failures = 1;
try {
  failures = await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, "test", "vscode", "suite.cjs"),
    launchArgs: [
      workspace,
      "--user-data-dir", userData,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
} finally {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  await new Promise(resolve => server.close(resolve));
}

/* The suite asserts what happened inside the editor; this asserts the extension really called the model. */
const asked = bodies.some(body => body.includes(GOAL));
console.log("[galaxy] the scripted model endpoint saw the goal: " + String(asked) + " (of " + String(bodies.length) + " request(s))");
console.log("[galaxy] VS Code extension host finished with " + String(failures) + " failure(s)");
if (failures !== 0 || !asked) process.exitCode = 1;
