/**
 * Layer 4 for the GBH spike: run the extension in a REAL VS Code against a scripted kernel home.
 *
 * The fixture is what the kernel writes: storages/workspace.json naming the opened folder and two
 * sessionIds, plus one projection-cache file per session. ready-url.txt points at an HTTP server this
 * runner starts, so probeHost() is exercised for real (it must accept the 401 a bare request gets).
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";
import { existsSync } from "node:fs";

/** Prefer the VS Code already installed on this machine: downloading a second copy hangs offline. */
const LOCAL_CODE = "/Applications/Visual Studio Code.app/Contents/MacOS/Electron";
const executable = existsSync(LOCAL_CODE) ? LOCAL_CODE : undefined;

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const workspace = await mkdtemp(join(tmpdir(), "gbh-spike-ws-"));
await writeFile(join(workspace, "README.md"), "fixture workspace\n", "utf8");

const home = await mkdtemp(join(tmpdir(), "gbh-spike-home-"));
const cacheDir = join(home, "storages", "session_projcache", "sessions");
await mkdir(cacheDir, { recursive: true });

const workspaceId = "w-fixture";
await writeFile(
  join(home, "storages", "workspace.json"),
  JSON.stringify({
    unit: { name: "workspace", version: 2 },
    global: { initialized: true, defaultWorkspaceId: workspaceId, workspaceIds: [workspaceId] },
    tables: {
      workspaces: {
        [workspaceId]: {
          path: workspace,
          title: basename(workspace),
          sessionIds: ["session-cu", "session-moi"],
          createdAt: "2026-10-20T00:00:00.000Z",
          updatedAt: "2026-10-26T00:00:00.000Z",
        },
      },
    },
  }),
  "utf8",
);

/** One projection cache file, cut to the rows the spike reads. */
const cacheOf = (title, createdAt) =>
  JSON.stringify({
    version: 7,
    record: {
      identity: { formatVersion: 4, createdAt, cwd: workspace, isSeeded: false, inheritedEventCount: 0 },
      rows: { title: { ver: 1, seq: 3, val: title }, tokenUsage: { ver: 2, seq: 3, val: { totals: { uncachedInputTokens: 10, outputTokens: 5 } } } },
    },
  });
await writeFile(join(cacheDir, "session-cu.json"), cacheOf("phiên cũ hơn", 1_700_000_000_000), "utf8");
await writeFile(join(cacheDir, "session-moi.json"), cacheOf("phiên mới hơn", 1_800_000_000_000), "utf8");

/* A server that answers 401 to everything: exactly what a running kernel does to a bare request. */
const server = createServer((_request, response) => {
  response.statusCode = 401;
  response.end("unauthorized");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await writeFile(join(home, "ready-url.txt"), "http://127.0.0.1:" + String(port) + "/?token=fixture-token", "utf8");

const userData = await mkdtemp(join(tmpdir(), "gbh-spike-vscode-"));
const previousHome = process.env.GBH_HOME;
process.env.GBH_HOME = home;
let failures = 1;
try {
  failures = await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, "test", "vscode", "gbh-suite.cjs"),
    launchArgs: [
      workspace,
      "--user-data-dir", userData,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
    ],
  });
} finally {
  if (previousHome === undefined) delete process.env.GBH_HOME;
  else process.env.GBH_HOME = previousHome;
  await new Promise((resolve) => server.close(resolve));
}
console.log("[gbh-spike] VS Code extension host finished with " + String(failures) + " failure(s)");
if (failures !== 0) process.exitCode = 1;
