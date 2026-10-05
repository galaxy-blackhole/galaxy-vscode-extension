import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDurableRunStore, createEvidenceVerifier, FileToolOutputSpill, NdjsonTracePort } from "../src/host/core-host.ts";

const CONTEXT = Object.freeze({
  deadline: Date.now() + 60_000,
  mode: "auto" as const,
  runId: "vscode-test-run",
  signal: new AbortController().signal,
  taskId: "task-1",
  workspaceRoot: "/tmp",
});

test("spilled tool output round-trips outside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-host-"));
  try {
    const spill = new FileToolOutputSpill(root);
    const artifact = await spill.write({
      content: "line one\nline two\n",
      contentType: "text/plain",
      runId: "vscode-test-run",
      toolCallId: "call-1",
      toolName: "run_command",
    });
    assert.match(artifact.id, /^call-1-\d+$/);
    assert.equal(artifact.mimeType, "text/plain");
    const back = await spill.read("vscode-test-run", artifact.id);
    assert.equal(back.content, "line one\nline two\n");
    assert.equal(back.truncated, false);
    const partial = await spill.read("vscode-test-run", artifact.id, 0, 8);
    assert.equal(partial.content, "line one");
    assert.equal(partial.truncated, true);
    assert.ok((await spill.totalBytes()) > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a crafted artifact id cannot escape the spill directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-host-"));
  try {
    const spill = new FileToolOutputSpill(root);
    await assert.rejects(() => spill.read("run", "../../etc/passwd"), /Invalid artifact id/);
    await assert.rejects(() => spill.read("run", "a/b"), /Invalid artifact id/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the trace port writes redacted NDJSON lines and flushes them", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-host-"));
  try {
    const trace = await NdjsonTracePort.create(root);
    const accepted = await trace.emit({
      eventId: "e1",
      executionId: "x1",
      kind: "tool_call",
      payload: { runId: "vscode-test-run", apiKey: "sk-live-secret", note: "ok" },
      runId: "vscode-test-run",
      sequence: 1,
      taskId: "task-1",
      timestamp: new Date().toISOString(),
    }, CONTEXT);
    assert.equal(accepted.ok, true);
    const flushed = await trace.flush(CONTEXT);
    assert.equal(flushed.ok, true);
    const lines = await trace.recent(10);
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0] ?? "", /sk-live-secret/);
    assert.match(lines[0] ?? "", /\[REDACTED\]/);
    const parsed = JSON.parse(lines[0] ?? "{}") as { kind?: string; payload?: { note?: string } };
    assert.equal(parsed.kind, "tool_call");
    assert.equal(parsed.payload?.note, "ok");
    const files = await readFile(join(trace.path, `host-${new Date().toISOString().slice(0, 10)}.ndjson`), "utf8");
    assert.equal(files.trim().split("\n").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the durable run store and the resume verifier are created for a host", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-host-"));
  try {
    const store = await createDurableRunStore(root);
    assert.equal(store.checkpointTrust, "trusted_host");
    assert.equal(await store.loadLatestCheckpoint("vscode-missing", CONTEXT), null);
    const verifier = await createEvidenceVerifier(root);
    assert.equal(verifier.consistency, "serialized_workspace");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
