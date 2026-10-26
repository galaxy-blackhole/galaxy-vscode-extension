import assert from "node:assert/strict";
import test from "node:test";
import { matchFolder, normalizeFolderPath, readWorkspaces, sessionFolder, sessionSummary, workspaceForFolder } from "../src/gbh/mapping.ts";

/**
 * The spike's proof: the same shapes the kernel writes on disk must map an open folder to its sessions.
 * Fixtures below are cut down from a real ~/.galaxy/blackhole write (registry v2, projection cache v7).
 */
const REGISTRY = {
  unit: { name: "workspace", version: 2 },
  global: { initialized: true, defaultWorkspaceId: "w-default", workspaceIds: ["w-galaxy", "w-default"] },
  tables: {
    workspaces: {
      "w-galaxy": {
        path: "/Users/dev/Desktop/Project/galaxy",
        title: "galaxy",
        sessionIds: ["session-a", "session-b"],
        createdAt: "2026-10-17T04:59:27.916Z",
        updatedAt: "2026-10-26T02:50:04.382Z",
      },
      "w-default": {
        path: "/Users/dev/Documents/default-workspace/",
        title: "default-workspace",
        sessionIds: ["session-c"],
      },
    },
  },
};

/** One projection-cache file, cut to the rows the spike reads. */
function cacheOf(cwd: string, title: string, createdAt: number, workingDirectory?: string) {
  return {
    version: 7,
    record: {
      identity: { formatVersion: 4, createdAt, cwd, isSeeded: false, inheritedEventCount: 0 },
      rows: {
        title: { ver: 1, seq: 22, val: title },
        ...(workingDirectory === undefined ? {} : { workingDirectory: { ver: 1, seq: 22, val: workingDirectory } }),
        tokenUsage: { ver: 2, seq: 22, val: { totals: { uncachedInputTokens: 179, outputTokens: 61 } } },
      },
    },
  };
}

test("the registry file becomes a read model, and a broken file yields no workspaces", () => {
  const workspaces = readWorkspaces(REGISTRY);
  assert.equal(workspaces.length, 2);
  assert.deepEqual(workspaces[0]?.sessionIds, ["session-a", "session-b"]);
  assert.equal(workspaces[1]?.title, "default-workspace");
  assert.deepEqual(readWorkspaces(undefined), []);
  assert.deepEqual(readWorkspaces({ tables: {} }), []);
});

test("folder paths compare without trailing separators or backslashes", () => {
  assert.equal(normalizeFolderPath("/Users/dev/repo/"), "/Users/dev/repo");
  assert.equal(normalizeFolderPath("C:\\Users\\dev\\repo\\"), "C:/Users/dev/repo");
  assert.equal(normalizeFolderPath("/"), "/");
});

test("the open folder resolves to its kernel workspace, trailing slash included", () => {
  const workspaces = readWorkspaces(REGISTRY);
  assert.equal(workspaceForFolder(workspaces, "/Users/dev/Desktop/Project/galaxy")?.id, "w-galaxy");
  assert.equal(workspaceForFolder(workspaces, "/Users/dev/Documents/default-workspace")?.id, "w-default");
  assert.equal(workspaceForFolder(workspaces, "/Users/dev/elsewhere"), undefined);
});

test("a session summary keeps the title, cwd and token totals the panel shows", () => {
  const summary = sessionSummary("session-a", cacheOf("/Users/dev/Desktop/Project/galaxy", "chạy lệnh ls -la", 1792650925891));
  assert.equal(summary.title, "chạy lệnh ls -la");
  assert.equal(summary.cwd, "/Users/dev/Desktop/Project/galaxy");
  assert.equal(summary.createdAt, 1792650925891);
  assert.equal(summary.uncachedInputTokens, 179);
  assert.equal(sessionFolder(summary), "/Users/dev/Desktop/Project/galaxy");
});

test("the live working directory wins over the creation cwd when they differ", () => {
  const summary = sessionSummary(
    "session-b",
    cacheOf("/Users/dev/Desktop/Project/galaxy", "worktree run", 1, "/Users/dev/Desktop/Project/galaxy-worktree"),
  );
  assert.equal(sessionFolder(summary), "/Users/dev/Desktop/Project/galaxy-worktree");
});

test("registry ids and cwd both feed the match, newest first, and the empty folder says so", () => {
  const workspaces = readWorkspaces(REGISTRY);
  const sessions = [
    sessionSummary("session-a", cacheOf("/Users/dev/Desktop/Project/galaxy", "cũ", 10)),
    sessionSummary("session-b", cacheOf("/Users/dev/Desktop/Project/galaxy", "mới", 20)),
    sessionSummary("session-c", cacheOf("/Users/dev/Documents/default-workspace", "khác", 30)),
  ];
  const match = matchFolder(workspaces, sessions, "/Users/dev/Desktop/Project/galaxy");
  assert.equal(match.workspace?.id, "w-galaxy");
  assert.deepEqual(match.sessions.map((session) => session.id), ["session-b", "session-a"]);
  assert.equal(match.matchedByCwdOnly, false);

  const untouched = matchFolder(workspaces, sessions, "/Users/dev/nowhere");
  assert.equal(untouched.workspace, undefined);
  assert.deepEqual(untouched.sessions, []);
  assert.equal(untouched.matchedByCwdOnly, false);
});

test("a folder the registry has never seen still gets its sessions by cwd", () => {
  const workspaces = readWorkspaces(REGISTRY);
  const sessions = [sessionSummary("session-z", cacheOf("/Users/dev/fresh-folder", "phiên đầu", 1))];
  const match = matchFolder(workspaces, sessions, "/Users/dev/fresh-folder/");
  assert.equal(match.workspace, undefined);
  assert.equal(match.sessions.length, 1);
  assert.equal(match.matchedByCwdOnly, true);
});
