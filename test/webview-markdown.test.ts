/**
 * The model answers in markdown. A pipe table used to arrive as raw text because the renderer had no GFM.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview } from "./helpers/webview-harness.ts";

const TABLE = "| Thư mục | Vai trò |\n|---|---|\n| packages/ | Monorepo chính |\n| docs-orbit/ | Tài liệu |\n";

async function boot() {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "host-info", workspaceName: "ws", workspacePath: "/tmp/ws", platform: "darwin", shell: "zsh", model: "m", baseUrl: "https://ollama.com", credentialSource: "manual-config", modelSettings: { active: "galaxy", configPath: "/tmp/c.json", providers: [] } } }));
  await new Promise(resolve => setTimeout(resolve, 150));
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "ui-event", event: { kind: "message/text-delta", text: TABLE } } }));
  await new Promise(resolve => setTimeout(resolve, 200));
  return booted;
}

test("a markdown table arrives as a table, not as raw pipes", async () => {
  const booted = await boot();
  const table = booted.document.querySelector(".md-body table");
  assert.ok(table, "the table was parsed: " + (booted.document.body.textContent ?? "").slice(0, 200));
  const headers = Array.from(booted.document.querySelectorAll(".md-body thead th")).map(cell => cell.textContent ?? "");
  assert.deepEqual(headers, ["Thư mục", "Vai trò"], "with its header row: " + JSON.stringify(headers));
  assert.equal(booted.document.querySelectorAll(".md-body tbody tr").length, 2, "and its body rows");
  assert.ok(!(booted.document.body.textContent ?? "").includes("|---|"), "no raw separator line survives");
});