/**
 * Preferences shared by both webviews. They live in the host, not in the webview: the chat panel and the
 * settings tab are separate documents, so their local storage is separate too — a font size changed in one
 * never reached the other until this moved here.
 */
export type Locale = "vi" | "en";
export type NextMessage = "queue" | "steer";
export type WorkDetail = "standard" | "compact";

import type { ToolPresentationMode } from "@galaxy-stack/ai-coder-core";

export interface UiPreferences {
  /** native (default), ptc (run_code plus a generated SDK), or both. Fixed for the life of a session. */
  readonly toolsMode: ToolPresentationMode;
  readonly fontSize: number;
  readonly locale: Locale;
  readonly nextMessage: NextMessage;
  readonly workDetail: WorkDetail;
}

/** 15px reads comfortably in the sidebar; the slider goes from 12 to 22. */
export const DEFAULT_PREFERENCES: UiPreferences = Object.freeze({
  fontSize: 15,
  locale: "vi",
  toolsMode: "native",
  nextMessage: "queue",
  workDetail: "standard",
});

/** Keep a patch inside the allowed ranges, whatever the caller sends. */
export function normalizePreferences(raw: Partial<UiPreferences> | undefined): UiPreferences {
  const fontSize = typeof raw?.fontSize === "number" && Number.isFinite(raw.fontSize) ? Math.min(22, Math.max(12, Math.round(raw.fontSize))) : DEFAULT_PREFERENCES.fontSize;
  const locale = raw?.locale === "en" ? "en" as const : DEFAULT_PREFERENCES.locale;
  const nextMessage = raw?.nextMessage === "steer" ? "steer" as const : DEFAULT_PREFERENCES.nextMessage;
  const workDetail = raw?.workDetail === "compact" ? "compact" as const : DEFAULT_PREFERENCES.workDetail;
  const toolsMode = raw?.toolsMode === "ptc" || raw?.toolsMode === "both" ? raw.toolsMode : DEFAULT_PREFERENCES.toolsMode;
  return Object.freeze({ fontSize, locale, nextMessage, toolsMode, workDetail });
}