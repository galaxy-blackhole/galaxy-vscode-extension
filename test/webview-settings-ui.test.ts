/**
 * The header's gear and the composer's two chips. A user had to ask what the chip reading Auto was, and
 * the market-sized menus were being clipped by the sidebar — so both are asserted here.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, clickElement } from "./helpers/webview-harness.ts";

const SUMMARY = {
  active: "galaxy",
  configPath: "/tmp/galaxy/config.json",
  providers: [
    { active: true, api: "ollama" as const, baseUrl: "https://ollama.com", displayName: "Galaxy", id: "galaxy", keyConfigured: true, models: [{ id: "kimi-k2.7-code:cloud", name: "Kimi K2.7 Code" }, { id: "deepseek-v4.1-flash:cloud", name: "DeepSeek Flash" }] },
  ],
};

async function withHost(booted: Awaited<ReturnType<typeof bootWebview>>) {
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "zsh", model: "kimi-k2.7-code:cloud", baseUrl: "https://ollama.com", credentialSource: "manual-config", modelSettings: SUMMARY } }));
  await new Promise(resolve => setTimeout(resolve, 150));
}

test("the header reads Galaxy Blackhole and its gear opens the settings panel", async () => {
  const booted = await bootWebview();
  await withHost(booted);
  assert.equal(booted.document.querySelector(".app-title")?.textContent, "Galaxy Blackhole");
  const gear = booted.document.querySelector('[aria-label="Cài đặt"]');
  assert.ok(gear, "the header has a settings button");
  clickElement(booted, gear);
  await new Promise(resolve => setTimeout(resolve, 150));
  const panel = booted.document.querySelector(".ms-panel");
  assert.ok(panel, "the settings panel opens from the header");
  assert.match(panel.textContent ?? "", /Cài đặt/);
  assert.match(panel.textContent ?? "", /Quyền/, "and it carries the permissions section");

  /* The header also offers a new conversation, which asks the host to clear the session. */
  const newThread = booted.document.querySelector('[aria-label="Trò chuyện mới"]');
  assert.ok(newThread, "the header has a new-conversation button");
  clickElement(booted, newThread);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(booted.posted.some(message => message.type === "session/action" && (message.action as { type?: string } | undefined)?.type === "new"), "and it asks for a fresh session: " + JSON.stringify(booted.posted.slice(-2)));
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
  assert.equal(options.length, 3, "the three modes, nothing else: " + JSON.stringify(options));
  assert.ok(!options.some(option => option.includes("Cài đặt")), "settings live behind the gear, not in this menu");
  assert.ok(!options.some(option => option.includes("có sau khi tích hợp")), "no placeholder entry is shipped");

  /* The model chip is a Codex-style popover: a thinking slider on top, the model list under it. */
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "thinking", choice: "default", options: [{ label: "Mặc định", value: "default" }, { label: "Vừa", value: "medium" }, { label: "Cao", value: "high" }] } }));
  await new Promise(resolve => setTimeout(resolve, 150));
  const modelChip = chips.find(chip => chip.textContent?.includes("kimi-k2.7-code:cloud"))!;
  clickElement(booted, modelChip);
  await new Promise(resolve => setTimeout(resolve, 150));
  const slider = booted.document.querySelector(".thinking-slider");
  assert.ok(slider, "the popover shows a thinking slider");
  assert.equal(slider.getAttribute("max"), "2", "one stop per level the policy allows");
  assert.equal(booted.document.querySelector(".thinking-value")?.textContent, "Mặc định");

  /* Dragging it to the last stop stores that level. */
  /* React only sees a change through the native value setter, not a plain assignment. */
  const nativeSetter = Object.getOwnPropertyDescriptor(booted.window.HTMLInputElement.prototype, "value")!.set!;
  nativeSetter.call(slider, "2");
  slider.dispatchEvent(new booted.window.Event("input", { bubbles: true }) as unknown as Event);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(booted.posted.some(message => message.type === "model-settings/set-thinking" && (message as { choice?: string }).choice === "high"), "the slider writes the level: " + JSON.stringify(booted.posted.slice(-2)));

  /* The model row opens the list of the provider's models. */
  clickElement(booted, booted.document.querySelector(".thinking-model")!);
  await new Promise(resolve => setTimeout(resolve, 150));
  const modelOptions = Array.from(booted.document.querySelectorAll(".thinking-models .permission-option")).map(option => option.textContent ?? "");
  assert.ok(modelOptions.some(entry => entry.includes("DeepSeek Flash")), "the model list is behind its own row: " + JSON.stringify(modelOptions));
  const other = Array.from(booted.document.querySelectorAll(".thinking-models .permission-option")).find(option => option.textContent?.includes("DeepSeek Flash"))!;
  clickElement(booted, other);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(booted.posted.some(message => message.type === "model-settings/set-model" && (message as { model?: string }).model === "deepseek-v4.1-flash:cloud"), "picking a model tells the host");
});