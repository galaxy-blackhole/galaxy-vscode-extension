/**
 * The document the host hands a webview. Getting the view flag wrong once opened a second chat tab instead
 * of the settings, because the flag had been put on the script URL while location.hash is the page's.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { webviewHtml } from "../src/host/webview-html.ts";

const BASE = { cspSource: "vscode-resource:", nonce: "n0nce", scriptUri: "chat.js", styleUri: "chat.css" } as const;

test("the settings tab is told to render the settings UI", () => {
  const html = webviewHtml({ ...BASE, view: "settings" });
  assert.match(html, /window\.__GALAXY_VIEW__ = "settings";/, "the flag is what decides the UI");
  assert.match(html, /<title>Galaxy Blackhole<\/title>/);
  assert.ok(!html.includes("#settings"), "and it is not smuggled onto the script URL");
});

test("the sidebar renders the chat UI", () => {
  assert.match(webviewHtml({ ...BASE, view: "chat" }), /window\.__GALAXY_VIEW__ = "chat";/);
});

test("both views lock the document down with a nonce", () => {
  for (const view of ["chat", "settings"] as const) {
    const html = webviewHtml({ ...BASE, view });
    assert.match(html, /script-src 'nonce-n0nce'/);
    assert.equal(html.match(/nonce="n0nce"/g)?.length, 2, "both scripts carry the nonce in " + view);
  }
});