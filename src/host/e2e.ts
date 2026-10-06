/**
 * A probe for the extension-host E2E (layer 4), registered only while VS Code runs our tests.
 *
 * It walks the same pieces the chat view walks — resolve the connection, connect the workspace's MCP
 * servers, open a session, run the core with a real tool executor, append the turns, read the history
 * back — so the suite can assert whole flows inside a real editor instead of trusting a mock.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OllamaConnection } from "./config";
import { startCoreRun } from "./core-run-session";
import { appendSessionTurn, createSession, listSessions, readSession } from "./session-store";
import { tryConnectWorkspaceMcp, workspaceMcpServers } from "./workspace-mcp";

export interface E2eRunReport {
  readonly error: string | null;
  /** The UI events the two runs emitted, i.e. what the view would render (run/status, tool/result, …). */
  readonly events: readonly string[];
  readonly mcp: Readonly<{ error: string | null; names: readonly string[] }>;
  readonly messages: readonly Readonly<{ content: string; role: "assistant" | "user" }>[];
  readonly secondState: string;
  readonly sessionId: string | null;
  readonly sessions: readonly Readonly<{ id: string; messageCount: number; title: string }>[];
  readonly state: string;
  readonly storageRoot: string;
}

/** The runtime hands the final assistant text back as content; a failed run explains itself. */
function spoken(result: Readonly<{ content: string; error: Readonly<{ message: string }> | null }>): string {
  return result.content.trim().length > 0 ? result.content.trim() : (result.error?.message ?? "");
}

export async function runGoalForTest(input: Readonly<{
  compactSecondRun?: boolean;
  connection: OllamaConnection;
  goal: string;
  secondGoal?: string;
  storageRoot: string;
  workspaceRoot: string;
}>): Promise<E2eRunReport> {
  await mkdir(join(input.storageRoot, "sessions"), { recursive: true });

  const attempt = await tryConnectWorkspaceMcp({ servers: workspaceMcpServers(input.workspaceRoot), stateDir: input.storageRoot });
  const mcpTools = attempt.handle === null ? [] : await attempt.handle.tools().catch(() => []);

  const events: string[] = [];
  const session = await createSession(input.storageRoot, input.goal);
  await appendSessionTurn(input.storageRoot, session.id, "user", input.goal);
  const started = await startCoreRun({
    connection: input.connection,
    goal: input.goal,
    mcpTools,
    onEvent: event => events.push(event.kind),
    onPendingApproval: pending => pending.resolve(true),
    permissionMode: "auto",
    storageRoot: input.storageRoot,
    taskId: "e2e-" + session.id,
    workspaceRoot: input.workspaceRoot,
  });
  const result = await started.handle.result;
  await appendSessionTurn(input.storageRoot, session.id, "assistant", spoken(result));

  /* The second run is the /compact path: it compacts as it starts, exactly like the composer's command. */
  const secondGoal = input.secondGoal ?? "Cảm ơn, tóm tắt lại giúp tôi";
  await appendSessionTurn(input.storageRoot, session.id, "user", secondGoal);
  const second = await startCoreRun({
    compactOnStart: input.compactSecondRun !== false,
    connection: input.connection,
    goal: secondGoal,
    mcpTools,
    onEvent: event => events.push(event.kind),
    onPendingApproval: pending => pending.resolve(true),
    permissionMode: "auto",
    storageRoot: input.storageRoot,
    taskId: "e2e-" + session.id + "-2",
    workspaceRoot: input.workspaceRoot,
  });
  const secondResult = await second.handle.result;
  await appendSessionTurn(input.storageRoot, session.id, "assistant", spoken(secondResult));

  const loaded = await readSession(input.storageRoot, session.id);
  if (attempt.handle !== null) await attempt.handle.close();
  return Object.freeze({
    error: result.error == null ? null : result.error.message,
    events: Object.freeze(events),
    mcp: Object.freeze({ error: attempt.error, names: attempt.names }),
    messages: Object.freeze((loaded?.messages ?? []).map(turn => Object.freeze({ content: turn.content, role: turn.role }))),
    secondState: String(secondResult.state),
    sessionId: session.id,
    sessions: Object.freeze((await listSessions(input.storageRoot)).map(item => Object.freeze({ id: item.id, messageCount: item.messageCount, title: item.title }))),
    state: String(result.state),
    storageRoot: input.storageRoot,
  });
}
