/**
 * Whether the settings panel is open. The header's gear opens it, and the composer's menus link to it,
 * so the state has to live outside either of them — same shape as the permission-mode store.
 */
type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

function commit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function settingsOpen(): boolean {
  return open;
}

export function setSettingsOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  commit();
}

export function openSettings(): void {
  setSettingsOpen(true);
}