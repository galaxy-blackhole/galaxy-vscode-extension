/**
 * The workspace's MCP servers, for the extension.
 *
 * A project keeps them in `.vscode/mcp.json` — the file the editor already reads — and the core owns the
 * reader so the CLI and this extension cannot drift apart. The clients are connected once per window and
 * their tools join the run's executor, the same way the CLI host does it.
 */
import type { AgentTool } from "@galaxy-stack/ai-coder-core/agent";
import { mergeMcpServers, readWorkspaceMcpServers } from "@galaxy-stack/ai-coder-core/adapters/node/config/workspace-mcp";
import { McpAgentClient, type McpConnection } from "@galaxy-stack/ai-coder-core/adapters/node/mcp/mcp-client";

/** What the workspace asks for; an explicit agent config would win on a name clash, as it does in the CLI. */
export function workspaceMcpServers(workspaceRoot: string, agentConfig: readonly McpConnection[] = []): readonly McpConnection[] {
  return mergeMcpServers({ agentConfig, defaults: [], workspace: readWorkspaceMcpServers(workspaceRoot) });
}

export interface WorkspaceMcpHandle {
  /** Re-list every run so a server that gained tools is picked up instead of cached forever. */
  tools(signal?: AbortSignal): Promise<readonly AgentTool[]>;
  close(): Promise<void>;
}

export async function connectWorkspaceMcp(input: Readonly<{ servers: readonly McpConnection[]; stateDir: string }>): Promise<WorkspaceMcpHandle> {
  const clients = new Map<string, McpAgentClient>();
  for (const server of input.servers) {
    if (clients.has(server.name)) continue;
    clients.set(server.name, await McpAgentClient.connect(server, undefined, { stateDir: input.stateDir }));
  }
  return {
    async tools(signal?: AbortSignal) {
      const tools: AgentTool[] = [];
      for (const client of clients.values()) tools.push(...await client.tools(signal));
      return tools;
    },
    async close() {
      await Promise.allSettled([...clients.values()].map(client => client.close()));
      clients.clear();
    },
  };
}
