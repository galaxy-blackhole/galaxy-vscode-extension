import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ModelCapabilities } from "@galaxy-stack/ai-coder-core";
import { createCoreToolExecutor, detectGitWorkTree } from "../src/host/core-tool-executor.ts";
import { FileToolOutputSpill } from "../src/host/core-host.ts";

const run = promisify(execFile);

const CAPABILITIES = {
  contextWindow: 131_072,
  evidence: [{ observedAt: new Date(0).toISOString(), source: "static_fallback", verified: false }],
  identity: { baseUrl: "http://127.0.0.1:11434", model: "test-model", provider: "ollama" },
  input: { audio: "unsupported", image: "unsupported", text: "supported", video: "unsupported" },
  maxOutputTokens: 8_192,
  output: { image: "unsupported", text: "supported" },
  parallelToolCalling: "unsupported",
  preserveThinking: "unknown",
  streaming: "supported",
  structuredOutput: "supported",
  systemPromptUpdate: "in-place",
  thinking: "optional",
  tokenCounting: "unknown",
  toolCalling: "supported",
} satisfies ModelCapabilities;

const CONTEXT = Object.freeze({
  deadline: Date.now() + 60_000,
  mode: "auto" as const,
  runId: "vscode-tools-run",
  signal: new AbortController().signal,
  taskId: "task-tools",
  workspaceRoot: "/tmp",
});

test("the composed executor serves the core's canonical catalog plus the artifact reader", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-tools-"));
  try {
    const executor = await createCoreToolExecutor({
      capabilities: CAPABILITIES,
      context: { ...CONTEXT, workspaceRoot: root },
      hasGit: true,
      onPendingApproval: () => undefined,
      permissionMode: () => "smart",
      spill: new FileToolOutputSpill(join(root, "storage")),
      workspaceRoot: root,
    });
    const toolSet = await executor.getToolSet({ ...CONTEXT, workspaceRoot: root });
    const names = toolSet.definitions.map(definition => definition.function.name);
    /* Canonical model-facing names the runtime preflights calls against. */
    for (const expected of ["list_files", "glob_files", "search_text", "read_file", "edit_file", "write_file", "run_command", "detect_project", "validate_project"]) {
      assert.ok(names.includes(expected), "missing canonical tool " + expected);
    }
    /* The canonical id is `tool_output.read`; the model-facing name normalizes dots to underscores. */
    assert.ok(names.includes("tool_output_read"), "the spilled-output reader must be registered");
    assert.ok(names.length >= 10, "expected a catalog, got " + names.length);
    assert.equal(new Set(names).size, names.length, "tool names must be unique across executors");
    assert.ok(Object.keys(toolSet.canonicalToolIds).length >= 10);
    assert.match(toolSet.snapshotHash, /^sha256:[a-f0-9]{16,}$/);
    assert.ok(Object.keys(toolSet.effectCapabilities).length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the Git probe distinguishes a work tree from a plain directory", async () => {
  const plain = await mkdtemp(join(tmpdir(), "galaxy-plain-"));
  const repo = await mkdtemp(join(tmpdir(), "galaxy-repo-"));
  try {
    assert.equal(await detectGitWorkTree(plain), false);
    await run("git", ["init", "--quiet"], { cwd: repo });
    assert.equal(await detectGitWorkTree(repo), true);
  } finally {
    await rm(plain, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});
