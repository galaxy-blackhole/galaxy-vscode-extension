/**
 * A probe for the extension-host E2E (layer 4), registered only while VS Code runs our tests.
 *
 * It walks the same pieces the chat view walks — resolve the connection, open a session, run the core
 * with a real tool executor, append the turns — so the suite can assert a whole flow from inside a real
 * editor instead of trusting a mock.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OllamaConnection } from "./config";
import { startCoreRun } from "./core-run-session";
import { appendSessionTurn, createSession, listSessions } from "./session-store";

export interface E2eRunReport {
  readonly error: string | null;
  readonly sessionId: string | null;
  readonly sessions: readonly Readonly<{ id: string; messageCount: number; title: string }>[];
  readonly state: string;
  readonly storageRoot: string;
}

export async function runGoalForTest(input: Readonly<{ connection: OllamaConnection; goal: string; storageRoot: string; workspaceRoot: string }>): Promise<E2eRunReport> {
  await mkdir(join(input.storageRoot, "sessions"), { recursive: true });
  const session = await createSession(input.storageRoot, input.goal);
  await appendSessionTurn(input.storageRoot, session.id, "user", input.goal);
  const started = await startCoreRun({
    connection: input.connection,
    goal: input.goal,
    onEvent: () => undefined,
    onPendingApproval: pending => pending.resolve(true),
    permissionMode: "auto",
    storageRoot: input.storageRoot,
    taskId: "e2e-" + session.id,
    workspaceRoot: input.workspaceRoot,
  });
  const result = await started.handle.result;
  /* The runtime hands the final assistant text back as content; a failed run explains itself instead. */
  const text = result.content.trim().length > 0 ? result.content.trim() : (result.error?.message ?? "");
  if (text.length > 0) await appendSessionTurn(input.storageRoot, session.id, "assistant", text);
  return Object.freeze({
    error: result.error == null ? null : result.error.message,
    sessionId: session.id,
    sessions: (await listSessions(input.storageRoot)).map(item => Object.freeze({ id: item.id, messageCount: item.messageCount, title: item.title })),
    state: String(result.state),
    storageRoot: input.storageRoot,
  });
}
