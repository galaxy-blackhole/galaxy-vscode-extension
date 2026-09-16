export type PermissionMode = "ask" | "smart" | "auto";

export const PERMISSION_MODES: readonly PermissionMode[] = ["ask", "smart", "auto"];

export function getPermissionMode(): PermissionMode {
  const stored = (globalThis as { __galaxyPermissionMode?: PermissionMode }).__galaxyPermissionMode;
  return stored ?? "smart";
}

export function setPermissionMode(next: PermissionMode): void {
  (globalThis as { __galaxyPermissionMode?: PermissionMode }).__galaxyPermissionMode = next;
  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

export function subscribePermissionMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
