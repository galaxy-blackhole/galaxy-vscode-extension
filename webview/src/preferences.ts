/**
 * Preferences as the webview sees them: a mirror of the host's document. Both webviews are separate
 * documents, so writing here asks the host and waits for the broadcast that reaches every panel.
 */
import { DEFAULT_PREFERENCES, type UiPreferences } from "../../src/preferences-types";
import { subscribePreferences } from "./host-events";
import { postToHost } from "./vscode";

export type { Locale, NextMessage, UiPreferences, WorkDetail } from "../../src/preferences-types";

type Listener = () => void;
const listeners = new Set<Listener>();
let current: UiPreferences = DEFAULT_PREFERENCES;

subscribePreferences(next => { current = next; commit(); });

function commit(): void {
  for (const listener of listeners) listener();
}

export function subscribePreferenceChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPreferences(): UiPreferences {
  return current;
}

/** Optimistic locally, authoritative on the host: it answers with the stored document. */
export function setPreferences(patch: Partial<UiPreferences>): void {
  current = Object.freeze({ ...current, ...patch });
  postToHost({ type: "preferences/set", patch });
  commit();
}