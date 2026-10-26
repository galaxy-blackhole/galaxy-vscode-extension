/*
 * The read model of a running Galaxy Blackhole kernel, as far as the spike needs it.
 *
 * The shapes below are copied from what the kernel actually writes today:
 *   - <GBH_HOME>/storages/workspace.json          (workspace registry, version 2)
 *   - <GBH_HOME>/storages/session_projcache/sessions/<id>.json (projection cache, version 7)
 * They are read models, not an API: the follow-up step replaces them with sessionController /
 * workspaceController Remote calls, and these types stay as the mapping boundary.
 */

/** One workspace entity, exactly as the registry stores it. */
export interface GbhWorkspace {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly sessionIds: readonly string[];
  readonly updatedAt?: string;
  readonly createdAt?: string;
}

/** What the panel needs to show for one session. */
export interface GbhSessionSummary {
  readonly id: string;
  readonly title?: string;
  /** Working directory recorded at session creation — the folder the user opened. */
  readonly cwd?: string;
  /** Working directory the session is in right now (can differ after a cd / worktree change). */
  readonly workingDirectory?: string;
  readonly createdAt?: number;
  readonly uncachedInputTokens?: number;
  readonly outputTokens?: number;
  /** Log cut the kernel reported for this session (session.list's projections.asOfSeq). */
  readonly asOfSeq?: number;
}

/** Result of matching the open VS Code folder against the kernel state. */
export interface GbhFolderMatch {
  readonly folder: string;
  readonly workspace?: GbhWorkspace;
  readonly sessions: readonly GbhSessionSummary[];
  /** True when sessions were found by cwd because the registry has no workspace for the folder yet. */
  readonly matchedByCwdOnly: boolean;
}
