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

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeApprovals(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listPendingApprovals(): readonly ApprovalRequest[] {
  return [...pending.values()].map((entry) => entry.request);
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
  return new Promise((resolvePromise) => {
    const entry: PendingEntry = {
      request: Object.freeze({ toolCallId, toolName, args, reason }),
      resolve: (approved) => {
        pending.delete(toolCallId);
        notify();
        resolvePromise(approved);
      },
    };
    pending.set(toolCallId, entry);
    notify();
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
