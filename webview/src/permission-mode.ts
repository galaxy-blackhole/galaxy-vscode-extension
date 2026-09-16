export type PermissionMode = "manual" | "auto";

let mode: PermissionMode = "manual";
const listeners = new Set<() => void>();

export function getPermissionMode(): PermissionMode {
  return mode;
}

export function setPermissionMode(next: PermissionMode): void {
  if (mode === next) return;
  mode = next;
  for (const listener of listeners) listener();
}

export function subscribePermissionMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
