/**
 * Host E2E: a real run against a scripted model endpoint.
 *
 * No VS Code is involved on purpose — the extension is a thin host over ai-coder-core, so this drives
 * the same seam the extension uses (startCoreRun) against a local Ollama-shaped double: prompts, the
 * tool loop, the durable run store, and the UI events the webview receives.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCoreRun } from "../src/host/core-run-session.ts";

/** One Ollama NDJSON round: a tool call first, then the report. */
function round(payload: unknown): string {
  return JSON.stringify(payload) + String.fromCharCode(10);
}

test("a run streams to the UI, calls a workspace tool and lands in the run store", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "galaxy-e2e-ws-"));
  const storage = await mkdtemp(join(tmpdir(), "galaxy-e2e-store-"));
  await mkdir(join(workspace, "src"), { recursive: true });
  const rounds: string[] = [
    round({ done: true, done_reason: "tool_calls", message: { content: "", role: "assistant", tool_calls: [{ function: { arguments: { path: "." }, name: "list_files" }, id: "call-1", type: "function" }] } }),
    round({ done: true, done_reason: "stop", message: { content: "Đã xong.", role: "assistant", tool_calls: [] } }),
  ];
  const kinds: string[] = [];
  const bodies: string[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    bodies.push(body);
    if (req.url === "/api/show") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ capabilities: ["completion", "tools"], model_info: { "test.context_length": 65536 } }));
      return;
    }
    res.setHeader("content-type", "application/x-ndjson");
    res.end(rounds.shift() ?? round({ done: true, done_reason: "stop", message: { content: "hết.", role: "assistant", tool_calls: [] } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  try {
    const session = await startCoreRun({
      connection: { baseUrl: "http://127.0.0.1:" + port, credentialSource: "none", model: "test" },
      goal: "Liệt kê workspace",
      onEvent: event => kinds.push(event.kind),
      onPendingApproval: () => undefined,
      permissionMode: "auto",
      storageRoot: storage,
      taskId: "e2e-task",
      workspaceRoot: workspace,
    });
    const result = await session.handle.result;
    assert.equal(result.state, "completed", JSON.stringify(result.error ?? null));
    assert.ok(kinds.includes("run/status"), "the webview sees the run status: " + kinds.join(","));
    assert.ok(kinds.includes("tool/start"), "the tool call reaches the webview");
    assert.ok(kinds.includes("tool/result"), "and its result does too");
    assert.ok(bodies.some(body => body.includes("Liệt kê workspace")), "the goal reaches the model");
    const stored = await readdir(storage, { recursive: true });
    assert.ok(stored.length > 0, "the run store wrote under storageRoot");
  } finally {
    server.close();
    await rm(workspace, { recursive: true, force: true });
    await rm(storage, { recursive: true, force: true });
  }
});
