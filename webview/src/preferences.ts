/**
 * Webview preferences: language, font size, what happens to a message sent while the agent is running, and
 * how much tool detail the transcript shows. They live in the webview's storage for now; the shared document
 * is the eventual home, next to the permission mode.
 */
export type Locale = "vi" | "en";
export type NextMessage = "queue" | "steer";
export type WorkDetail = "standard" | "compact";

export interface Preferences {
  readonly fontSize: number;
  readonly locale: Locale;
  readonly nextMessage: NextMessage;
  readonly workDetail: WorkDetail;
}

const STORAGE_KEY = "galaxy.preferences.v1";
const DEFAULTS: Preferences = Object.freeze({ fontSize: 14, locale: "vi", nextMessage: "queue", workDetail: "standard" });

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Preferences = read();

function read(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const fontSize = typeof parsed.fontSize === "number" && parsed.fontSize >= 10 && parsed.fontSize <= 20 ? parsed.fontSize : DEFAULTS.fontSize;
    const locale = parsed.locale === "en" ? "en" : DEFAULTS.locale;
    const nextMessage = parsed.nextMessage === "steer" ? "steer" : DEFAULTS.nextMessage;
    const workDetail = parsed.workDetail === "compact" ? "compact" : DEFAULTS.workDetail;
    return Object.freeze({ fontSize, locale, nextMessage, workDetail });
  } catch {
    return DEFAULTS;
  }
}

export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPreferences(): Preferences {
  return current;
}

export function setPreferences(patch: Partial<Preferences>): void {
  current = Object.freeze({ ...current, ...patch });
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage is optional */ }
  for (const listener of listeners) listener();
}