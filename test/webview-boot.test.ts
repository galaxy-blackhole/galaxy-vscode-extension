/**
 * The boot gate: the workspace index holds the panel, the MCP phase only annotates it, and the owner can skip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

async function boot() {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "/bin/sh" } }));
  await new Promise(resolve => setTimeout(resolve, 150));
  return booted;
}

function send(booted: Awaited<ReturnType<typeof bootWebview>>, event: unknown): Promise<void> {
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "ui-event", event } }));
  return new Promise(resolve => setTimeout(resolve, 150));
}

test("the panel holds for the index, then opens while the MCP servers warm up", async () => {
  const booted = await boot();
  assert.ok(booted.document.querySelector(".boot-screen"), "the first paint is the loader, not an empty transcript");

  await send(booted, { kind: "boot/progress", phase: "mcp", message: "Đang nạp MCP: files" });
  assert.equal(booted.document.querySelector(".boot-screen"), null, "the MCP phase does not hold the panel");
  assert.match(booted.document.querySelector(".boot-notice")?.textContent ?? "", /Đang nạp MCP: files/);
  assert.ok(booted.document.querySelector(".boot-skip"), "and offers a way past it");

  await send(booted, { kind: "boot/ready", message: "" });
  assert.equal(booted.document.querySelector(".boot-notice"), null, "ready clears the row");
});
