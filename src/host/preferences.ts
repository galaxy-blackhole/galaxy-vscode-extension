/**
 * Read and write the shared preferences as one small JSON document in global storage, so both webviews and
 * every window agree.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PREFERENCES, normalizePreferences, type UiPreferences } from "../preferences-types";

export function preferencesPath(storageRoot: string): string {
  return join(storageRoot, "preferences.json");
}

export function readPreferences(storageRoot: string): UiPreferences {
  try {
    return normalizePreferences(JSON.parse(readFileSync(preferencesPath(storageRoot), "utf8")) as Partial<UiPreferences>);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(storageRoot: string, patch: Partial<UiPreferences>): UiPreferences {
  const next = normalizePreferences({ ...readPreferences(storageRoot), ...patch });
  writeFileSync(preferencesPath(storageRoot), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}