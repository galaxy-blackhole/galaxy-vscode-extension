import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl, probeHost } from "../src/gbh/host.ts";
import { authenticate, listSessions } from "../src/gbh/remote.ts";
import { matchFolder, readWorkspaces } from "../src/gbh/mapping.ts";
import { readFileSync } from "node:fs";
import { workspaceRegistryPath } from "../src/gbh/paths.ts";

/** Live check against whatever kernel this machine is running (skips cleanly when none). */
const home = gbhHome();
const ready = readReadyUrl(home);
if (ready === undefined) {
  console.log("KHÔNG có ready-url.txt — bỏ qua");
  process.exit(0);
}
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url không phải URL: " + ready);
const probe = await probeHost(host);
console.log("host:", host.baseUrl, "| probe:", JSON.stringify(probe));
const cookie = await authenticate(host);
console.log("cookie:", cookie === undefined ? "(không lấy được)" : cookie.slice(0, 24) + "…");
if (cookie === undefined) process.exit(1);
const sessions = await listSessions({ host, cookie });
console.log("session.list trả về:", sessions.length, "phiên");
const workspaces = readWorkspaces(JSON.parse(readFileSync(workspaceRegistryPath(home), "utf8")));
const folder = "/Users/buitronghieu/Desktop/Project/galaxy";
const match = matchFolder(workspaces, sessions, folder);
console.log("map", folder, "→", match.sessions.length, "phiên qua Remote | vd:", JSON.stringify(match.sessions.slice(0, 2).map((s) => s.title)));
