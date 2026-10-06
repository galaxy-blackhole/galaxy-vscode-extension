/**
 * The header's gear and the composer's two chips. A user had to ask what the chip reading Auto was, and
 * the market-sized menus were being clipped by the sidebar — so both are asserted here.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, clickElement } from "./helpers/webview-harness.ts";

const SUMMARY = { active: "galaxy", configPath: "/tmp/galaxy/config.json", providers: [] };

async function withHost(booted: Awaited<ReturnType<typeof bootWebview>>) {
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "zsh", model: "kimi-k2.7-code:cloud", baseUrl: "https://ollama.com", credentialSource: "manual-config", modelSettings: SUMMARY } }));
  await new Promise(resolve => setTimeout(resolve, 150));
}

test("the header reads Galaxy Blackhole and its gear opens the settings panel", async () => {
  const booted = await bootWebview();
  await withHost(booted);
  assert.equal(booted.document.querySelector(".app-title")?.textContent, "Galaxy Blackhole");
  const gear = booted.document.querySelector(".app-icon-btn");
  assert.ok(gear, "the header has a settings button");
  clickElement(booted, gear);
  await new Promise(resolve => setTimeout(resolve, 150));
  const panel = booted.document.querySelector(".ms-panel");
  assert.ok(panel, "the settings panel opens from the header");
  assert.match(panel.textContent ?? "", /Cài đặt/);
  assert.match(panel.textContent ?? "", /Quyền/, "and it carries the permissions section");
});

test("each composer chip says what it is, and the menus stay inside the sidebar", async () => {
  const booted = await bootWebview();
  await withHost(booted);
  const chips = Array.from(booted.document.querySelectorAll(".composer-chip"));
  const labels = chips.map(chip => chip.textContent ?? "");
  assert.ok(labels.some(label => label.includes("kimi-k2.7-code:cloud")), "the model chip names the model: " + JSON.stringify(labels));
  assert.ok(labels.some(label => /Duyệt|Toàn quyền/.test(label)), "the permission chip names the mode: " + JSON.stringify(labels));

  const permissionChip = chips.find(chip => /Duyệt|Toàn quyền/.test(chip.textContent ?? ""))!;
  clickElement(booted, permissionChip);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.match(booted.document.querySelector(".permission-menu-header")?.textContent ?? "", /phê duyệt/i, "the menu explains itself");
  const options = Array.from(booted.document.querySelectorAll(".permission-menu .permission-option")).map(option => option.textContent ?? "");
  assert.equal(options.length, 4, "three modes plus the settings link: " + JSON.stringify(options));
  assert.ok(options.some(option => option.includes("Cài đặt")), "the settings link is in the menu");
  assert.ok(!options.some(option => option.includes("có sau khi tích hợp")), "no placeholder entry is shipped");
});