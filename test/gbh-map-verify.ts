import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gbhHome, sessionCacheDir, workspaceRegistryPath } from "../src/gbh/paths.ts";
import { matchFolder, readWorkspaces, sessionSummary } from "../src/gbh/mapping.ts";

/** Verify the mapping against the REAL kernel state on this machine. */
const home = gbhHome();
const registry = JSON.parse(readFileSync(workspaceRegistryPath(home), "utf8"));
const workspaces = readWorkspaces(registry);
const dir = sessionCacheDir(home);
const sessions = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => sessionSummary(name.slice(0, -5), JSON.parse(readFileSync(join(dir, name), "utf8"))));
console.log("home:", home);
console.log("workspaces:", workspaces.length, "| sessions:", sessions.length);
for (const workspace of workspaces) {
  const match = matchFolder(workspaces, sessions, workspace.path);
  const titles = match.sessions.slice(0, 3).map((session) => (session.title ?? session.id.slice(0, 8)).slice(0, 40));
  console.log(" -", workspace.path, "| id:", workspace.id.slice(0, 8), "| phiên:", match.sessions.length, "| vd:", JSON.stringify(titles));
}
// thư mục KHÔNG có trong registry: mô phỏng "mở folder mới từ VS Code"
const fresh = "/Users/buitronghieu/Desktop/Project/galaxy/galaxy-blackhole";
const freshMatch = matchFolder(workspaces, sessions, fresh);
console.log(" -", fresh, "| workspace:", freshMatch.workspace === undefined ? "(chưa có)" : freshMatch.workspace.id, "| phiên:", freshMatch.sessions.length, "| khớp cwd:", freshMatch.matchedByCwdOnly);
