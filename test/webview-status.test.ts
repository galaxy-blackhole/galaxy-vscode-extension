/**
 * The line above the input that the CLI has always had: what the run is ddoing, and why it stopped.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

const SUMMARY = {
  active: "galaxy",
  configPath: "/tmp/galaxy/config.json",
  providers: [{ active: true, api: "ollama" as const, baseUrl: "https://ollama.com", displayName: "Galaxy", id: "galaxy", keyConfigured: true, models: [] }],
};

async function boot() {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "zsh", model: "m", baseUrl: "https://ollama.com", credentialSource: "manual-config", modelSettings: SUMMARY } }));
  await new Promise(resolve => setTimeout(resolve, 150));
  return booted;
}

function send(booted: Awaited<ReturnType<typeof bootWebview>>, event: unknown): Promise<void> {
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "ui-event", event } }));
  return new Promise(resolve => setTimeout(resolve, 150));
}

test("the composer says what the run is doing, and why it stopped", async () => {
  const booted = await boot();
  assert.equal(booted.document.querySelector(".composer-status"), null, "an idle composer says nothing");

  await send(booted, { kind: "run/status", status: "running" });
  assert.match(booted.document.querySelector(".composer-status")?.textContent ?? "", /Đang suy nghĩ/);
  assert.ok(booted.document.querySelector(".composer-orbit"), "a live run shows the spinning ring");
  assert.ok(booted.document.querySelector(".composer-dots"), "and the stepping dots");

  await send(booted, { kind: "tool/start", name: "list_files", toolCallId: "c1", args: {} });
  assert.match(booted.document.querySelector(".composer-status")?.textContent ?? "", /Đang gọi/, "a tool in flight is named: " + (booted.document.querySelector(".composer-status")?.textContent ?? ""));

  await send(booted, { kind: "run/status", reason: "stream im lặng 180s", status: "failed" });
  assert.match(booted.document.querySelector(".composer-status")?.textContent ?? "", /Đã dừng: stream im lặng 180s/, "the reason is shown, not swallowed");
  assert.equal(booted.document.querySelector(".composer-orbit"), null, "a finished run stops moving");
  assert.equal(booted.document.querySelector(".composer-dots"), null, "and drops the dots");
  assert.ok(booted.document.querySelector(".composer-status-still"), "the still style marks it as finished");
});