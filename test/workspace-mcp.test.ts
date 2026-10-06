/**
 * The extension reads a project's MCP servers from the same file the CLI does, through the core's reader.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceMcpServers } from "../src/host/workspace-mcp.ts";

test("the workspace's .vscode/mcp.json reaches the extension, stdio servers only", async () => {
  const root = await mkdtemp(join(tmpdir(), "galaxy-ext-mcp-"));
  try {
    assert.deepEqual(workspaceMcpServers(root), [], "a workspace without the file asks for nothing");
    await mkdir(join(root, ".vscode"), { recursive: true });
    await writeFile(join(root, ".vscode", "mcp.json"), JSON.stringify({ servers: {
      docs: { command: "node", args: ["docs.js"] },
      remote: { type: "http", url: "https://example.com/mcp" },
    } }), "utf8");
    assert.deepEqual(workspaceMcpServers(root).map(server => server.name), ["docs"], "http servers stay the editor's business");
    const agentConfig = [{ command: "npx", name: "docs", transport: "stdio" as const }];
    assert.deepEqual(workspaceMcpServers(root, agentConfig)[0], agentConfig[0], "an explicit agent config wins on a name clash");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
