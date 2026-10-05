/**
 * Harness for webview UI tests: boots the built bundle in happy-dom with the host bridge
 * stubbed, the way scripts/webview-smoke.mjs does, and drives the real assistant-ui composer.
 *
 * Build first with `npx vite build` (writes dist/webview/chat.js). One boot per process:
 * the bundle keeps module-level state, so a second boot in the same process would render
 * into a stale React root — that is why each test file covers one scenario.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

/** Boot one webview instance and return it with everything the host was told. */
export async function bootWebview(): Promise<BootedWebview> {
  const window = new Window({ url: "https://localhost/" });
  const posted: PostedMessage[] = [];
  for (const key of GLOBALS) {
    try { (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key]; } catch { /* not every global exists */ }
  }
  (globalThis as Record<string, unknown>).window = window;
  (globalThis as Record<string, unknown>).document = window.document;
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  (globalThis as Record<string, unknown>).matchMedia = window.matchMedia;
  (globalThis as Record<string, unknown>).MessageEvent = window.MessageEvent;
  const bridge = { getState: () => undefined, postMessage: (message: PostedMessage) => { posted.push(message); }, setState: () => {} };
  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => bridge;
  (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => bridge;
  window.document.body.innerHTML = '<div id="app"></div>';
  new Function(readFileSync(new URL("../../dist/webview/chat.js", import.meta.url), "utf8"))();
  await new Promise(resolve => setTimeout(resolve, 400));
  return { document: window.document, posted, window };
}

function composer(booted: BootedWebview): HTMLTextAreaElement {
  const field = booted.document.querySelector(COMPOSER) as HTMLTextAreaElement | null;
  assert.ok(field, "the composer input must render");
  return field;
}

/** Type into the composer the way a human does: native value setter plus an input event. */
export function typeComposer(booted: BootedWebview, text: string): void {
  const field = composer(booted);
  const setter = Object.getOwnPropertyDescriptor(booted.window.HTMLTextAreaElement.prototype, "value")?.set;
  assert.ok(setter, "the textarea prototype must expose a value setter");
  setter.call(field, text);
  field.dispatchEvent(new booted.window.Event("input", { bubbles: true }));
}

/** Submit the way the composer does: Enter, which the primitive turns into a runtime append. */
export async function submitComposer(booted: BootedWebview): Promise<void> {
  composer(booted).dispatchEvent(new booted.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
  await new Promise(resolve => setTimeout(resolve, 200));
}
