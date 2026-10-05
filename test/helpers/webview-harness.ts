/**
 * Harness for webview UI tests: boots the built bundle in happy-dom with the host bridge
 * stubbed, the way scripts/webview-smoke.mjs does, and drives the real assistant-ui composer.
 *
 * Build first with `yarn compile` (writes dist/webview/chat.js). One boot per process: the
 * bundle keeps module-level state, so a second boot in the same process would render into a
 * stale React root — that is why each test file covers one scenario.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

export type PostedMessage = {
  action?: { input?: string; type?: string };
  type?: string;
};

export interface BootedWebview {
  document: Document;
  posted: PostedMessage[];
  window: Window;
}

const GLOBALS = [
  "document", "location", "navigator", "history", "HTMLElement", "HTMLTextAreaElement", "Node",
  "MutationObserver", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame",
  "CustomEvent", "KeyboardEvent", "MouseEvent", "MessageChannel", "MessagePort", "queueMicrotask",
  "getComputedStyle", "Event", "HTMLInputElement",
] as const;

const COMPOSER = ".composer-card-input";

/** happy-dom owns its own DOM types; the tests only need the global ones. */
function asDom<T>(value: unknown): T {
  return value as T;
}

/** Boot one webview instance and return it with everything the host was told. */
export async function bootWebview(): Promise<BootedWebview> {
  const window = new Window({ url: "https://localhost/" });
  const posted: PostedMessage[] = [];
  const global = globalThis as unknown as Record<string, unknown>;
  for (const key of GLOBALS) {
    try { global[key] = (window as unknown as Record<string, unknown>)[key]; } catch { /* not every global exists */ }
  }
  global.window = window;
  global.document = window.document;
  window.matchMedia = window.matchMedia ?? (asDom((query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })));
  global.matchMedia = window.matchMedia;
  global.MessageEvent = window.MessageEvent;
  const bridge = { getState: () => undefined, postMessage: (message: PostedMessage) => { posted.push(message); }, setState: () => {} };
  global.acquireVsCodeApi = () => bridge;
  (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => bridge;
  const document = asDom<Document>(window.document);
  document.body.innerHTML = '<div id="app"></div>';
  /* The runner always starts at the package root, which is also where `yarn compile` writes. */
  new Function(readFileSync(join(process.cwd(), "dist", "webview", "chat.js"), "utf8"))();
  await new Promise(resolve => setTimeout(resolve, 400));
  return { document, posted, window };
}

function composer(booted: BootedWebview): HTMLTextAreaElement {
  const field = booted.document.querySelector(COMPOSER);
  assert.ok(field, "the composer input must render");
  return field as HTMLTextAreaElement;
}

/** Type into the composer the way a human does: native value setter plus an input event. */
export function typeComposer(booted: BootedWebview, text: string): void {
  const field = composer(booted);
  const setter = Object.getOwnPropertyDescriptor(booted.window.HTMLTextAreaElement.prototype, "value")?.set;
  assert.ok(setter, "the textarea prototype must expose a value setter");
  setter.call(field, text);
  field.dispatchEvent(asDom<Event>(new booted.window.Event("input", { bubbles: true })));
}

/** Submit the way the composer does: Enter, which the primitive turns into a runtime append. */
export async function submitComposer(booted: BootedWebview): Promise<void> {
  composer(booted).dispatchEvent(asDom<Event>(new booted.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" })));
  await new Promise(resolve => setTimeout(resolve, 200));
}
