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
  readonly names: readonly string[];
  /** Re-list every run so a server that gained tools is picked up instead of cached forever. */
  tools(signal?: AbortSignal): Promise<readonly AgentTool[]>;
  close(): Promise<void>;
}

export interface WorkspaceMcpAttempt {
  /** A human-readable list of the servers that did not come up, or null when all of them did. */
  readonly error: string | null;
  readonly handle: WorkspaceMcpHandle | null;
  readonly names: readonly string[];
}

/**
 * Connect what can be connected.
 *
 * One broken server must not cost the whole run: the servers that came up stay usable and the ones that
 * did not are reported so the view can say so instead of silently running without those tools.
 */
export async function tryConnectWorkspaceMcp(input: Readonly<{ servers: readonly McpConnection[]; stateDir: string }>): Promise<WorkspaceMcpAttempt> {
  const clients = new Map<string, McpAgentClient>();
  const broken: string[] = [];
  for (const server of input.servers) {
    if (clients.has(server.name)) continue;
    try {
      clients.set(server.name, await McpAgentClient.connect(server, undefined, { stateDir: input.stateDir }));
    } catch (error) {
      broken.push(server.name + " (" + (error instanceof Error ? error.message : String(error)) + ")");
    }
  }
  const names = Object.freeze([...clients.keys()]);
  const handle: WorkspaceMcpHandle | null = clients.size === 0 ? null : {
    names,
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
  return Object.freeze({ error: broken.length === 0 ? null : broken.join("; "), handle, names });
}
