import { getPermissionMode } from "./permission-mode";

export type ApprovalRequest = Readonly<{
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}>;

type PendingEntry = Readonly<{
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}>;

const pending = new Map<string, PendingEntry>();
const listeners = new Set<() => void>();
// Stable snapshot for useSyncExternalStore: a fresh array per call makes React
// think the store changed every render (infinite update loop).
let snapshot: readonly ApprovalRequest[] = Object.freeze([]);

function recompute(): void {
  snapshot = Object.freeze([...pending.values()].map((entry) => entry.request));
  for (const listener of listeners) listener();
}

export function subscribeApprovals(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listPendingApprovals(): readonly ApprovalRequest[] {
  return snapshot;
}

/**
 * Gate a mutating tool behind an explicit user decision rendered by the UI.
 * Resolves false when the run is cancelled while waiting.
 */
export function requestApproval(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  reason: string,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  // "auto" skips review entirely; "smart" auto-approves file edits but still
  // asks before running shell commands (external side effects).
  const currentMode = getPermissionMode();
  if (currentMode === "auto") return Promise.resolve(true);
  if (currentMode === "smart" && toolName !== "run_command") return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const entry: PendingEntry = {
      request: Object.freeze({ toolCallId, toolName, args, reason }),
      resolve: (approved) => {
        pending.delete(toolCallId);
        recompute();
        resolvePromise(approved);
      },
    };
    pending.set(toolCallId, entry);
    recompute();
    if (abortSignal) {
      const onAbort = () => entry.resolve(false);
      if (abortSignal.aborted) onAbort();
      else abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export function resolveApproval(toolCallId: string, approved: boolean): void {
  pending.get(toolCallId)?.resolve(approved);
}
