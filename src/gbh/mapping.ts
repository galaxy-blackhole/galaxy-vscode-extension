/*
 * The mapping this spike has to prove: an open VS Code folder becomes a kernel workspace, and that
 * workspace's sessions become rows in the sidebar.
 *
 * Everything here is pure so the proof runs in node --test without VS Code and without a live host.
 */
import type { GbhFolderMatch, GbhSessionSummary, GbhWorkspace } from "./types";

/** Trim a folder path for comparison: no trailing separators, NFC-normalised. */
export function normalizeFolderPath(path: string): string {
  const unified = path.replace(/\\/gu, "/").normalize("NFC");
  const trimmed = unified.replace(/\/+$/u, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

/**
 * Read the workspace registry file's tables into the spike's read model.
 * @param registry - parsed json of storages/workspace.json.
 * @returns workspaces in registry order; an unknown shape yields an empty list instead of throwing.
 */
export function readWorkspaces(registry: unknown): GbhWorkspace[] {
  const tables = (registry as { tables?: { workspaces?: Record<string, unknown> } } | undefined)?.tables;
  const raw = tables?.workspaces;
  if (raw === undefined || raw === null || typeof raw !== "object") return [];
  const out: GbhWorkspace[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { path?: unknown; title?: unknown; sessionIds?: unknown; createdAt?: unknown; updatedAt?: unknown };
    if (typeof entry.path !== "string" || entry.path.length === 0) continue;
    out.push({
      id,
      path: entry.path,
      title: typeof entry.title === "string" && entry.title.length > 0 ? entry.title : entry.path,
      sessionIds: Array.isArray(entry.sessionIds) ? entry.sessionIds.filter((x): x is string => typeof x === "string") : [],
      ...(typeof entry.createdAt === "string" ? { createdAt: entry.createdAt } : {}),
      ...(typeof entry.updatedAt === "string" ? { updatedAt: entry.updatedAt } : {}),
    });
  }
  return out;
}

/**
 * Find the workspace the open folder belongs to.
 * @param workspaces - registry read model.
 * @param folder - absolute folder path from vscode.workspace.workspaceFolders.
 * @returns the workspace, or undefined when the folder was never opened in the kernel.
 */
export function workspaceForFolder(workspaces: readonly GbhWorkspace[], folder: string): GbhWorkspace | undefined {
  const target = normalizeFolderPath(folder);
  const exact = workspaces.find((workspace) => normalizeFolderPath(workspace.path) === target);
  if (exact !== undefined) return exact;
  const lower = target.toLowerCase();
  return workspaces.find((workspace) => normalizeFolderPath(workspace.path).toLowerCase() === lower);
}

/**
 * Turn one projection-cache file into a session summary.
 * @param id - session id (the file name without .json).
 * @param cache - parsed json of the projection cache file.
 * @returns the summary; fields the record does not carry stay undefined.
 */
export function sessionSummary(id: string, cache: unknown): GbhSessionSummary {
  const record = (cache as { record?: unknown } | undefined)?.record as
    | {
        identity?: { cwd?: unknown; createdAt?: unknown };
        rows?: Record<string, { val?: unknown } | undefined>;
      }
    | undefined;
  const rows = record?.rows ?? {};
  const title = rows.title?.val;
  const workingDirectory = rows.workingDirectory?.val;
  const tokenUsage = rows.tokenUsage?.val as { totals?: { uncachedInputTokens?: unknown; outputTokens?: unknown } } | undefined;
  const totals = tokenUsage?.totals;
  return {
    id,
    ...(typeof title === "string" && title.length > 0 ? { title } : {}),
    ...(typeof record?.identity?.cwd === "string" ? { cwd: record.identity.cwd } : {}),
    ...(typeof workingDirectory === "string" ? { workingDirectory } : {}),
    ...(typeof record?.identity?.createdAt === "number" ? { createdAt: record.identity.createdAt } : {}),
    ...(typeof totals?.uncachedInputTokens === "number" ? { uncachedInputTokens: totals.uncachedInputTokens } : {}),
    ...(typeof totals?.outputTokens === "number" ? { outputTokens: totals.outputTokens } : {}),
  };
}

/** The folder a session belongs to: its live working directory when known, else its creation cwd. */
export function sessionFolder(session: GbhSessionSummary): string | undefined {
  return session.workingDirectory ?? session.cwd;
}

/**
 * Sessions of one VS Code folder.
 *
 * Two sources are accepted on purpose: the registry's `sessionIds` (authoritative once the kernel has
 * seen the folder) and the session's own cwd (works even when the registry has no entry yet, which is
 * what happens the first time a folder is opened from VS Code).
 * @param workspaces - registry read model.
 * @param sessions - all known session summaries.
 * @param folder - absolute folder path.
 * @returns match with sessions sorted newest first.
 */
export function matchFolder(
  workspaces: readonly GbhWorkspace[],
  sessions: readonly GbhSessionSummary[],
  folder: string,
): GbhFolderMatch {
  const workspace = workspaceForFolder(workspaces, folder);
  const target = normalizeFolderPath(folder);
  const registered = workspace === undefined ? new Set<string>() : new Set(workspace.sessionIds);
  const byId = sessions.filter((session) => registered.has(session.id));
  const byCwd = sessions.filter((session) => {
    const home = sessionFolder(session);
    return home === undefined ? false : normalizeFolderPath(home) === target;
  });
  const merged = new Map<string, GbhSessionSummary>();
  for (const session of [...byId, ...byCwd]) merged.set(session.id, session);
  const sorted = [...merged.values()].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  return {
    folder: target,
    ...(workspace === undefined ? {} : { workspace }),
    sessions: sorted,
    matchedByCwdOnly: workspace === undefined && sorted.length > 0,
  };
}
