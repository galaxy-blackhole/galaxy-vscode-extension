/**
 * Layer 4: the extension inside a real VS Code.
 *
 * The host tests drive the seam directly and the webview tests run the real bundle in a DOM, but
 * neither can tell whether VS Code will activate the extension, contribute its commands, open the
 * chat panel and keep the webview talking. This does — with a throwaway user-data directory so it
 * never touches the developer's editor state.
 *
 * Run it with: yarn test:vscode
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

const userData = await mkdtemp(join(tmpdir(), "galaxy-vscode-"));
const failures = await runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: join(root, "test", "vscode", "suite.cjs"),
  launchArgs: [
    "--user-data-dir", userData,
    "--disable-extensions",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
  ],
});
console.log("[galaxy] VS Code extension host finished with " + String(failures) + " failure(s)");
if (failures !== 0) process.exitCode = 1;
