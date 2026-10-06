/**
 * Session history for the Galaxy chat view.
 *
 * The webview owns the conversation; the host keeps it on disk so a window reload, a new panel or a
 * restarted editor still shows what was said. One JSON document per session, under the extension's
 * storage root — never inside the workspace, which the model is allowed to write to.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface GalaxySessionTurn {
  readonly at: string;
  readonly content: string;
  readonly role: "assistant" | "user";
}

export interface GalaxySession {
  readonly createdAt: string;
  readonly id: string;
  readonly messages: readonly GalaxySessionTurn[];
  readonly title: string;
  readonly updatedAt: string;
}

export interface GalaxySessionSummary {
  readonly id: string;
  readonly messageCount: number;
  readonly title: string;
  readonly updatedAt: string;
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_MESSAGES = 400;
const MAX_TITLE = 80;

/** Session ids come from the webview, so they are validated before they ever touch a path. */
export function validSessionId(id: unknown): id is string {
  return typeof id === "string" && SESSION_ID.test(id);
}

function sessionsRoot(storageRoot: string): string {
  return join(storageRoot, "sessions");
}

function sessionPath(storageRoot: string, id: string): string {
  if (!validSessionId(id)) throw new Error("Invalid session id.");
  return join(sessionsRoot(storageRoot), id + ".json");
}

function titleFrom(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "Phiên mới";
  return trimmed.length > MAX_TITLE ? trimmed.slice(0, MAX_TITLE - 1) + "…" : trimmed;
}

async function writeSession(storageRoot: string, session: GalaxySession): Promise<void> {
  await mkdir(sessionsRoot(storageRoot), { recursive: true });
  const target = sessionPath(storageRoot, session.id);
  const temporary = target + ".tmp";
  await writeFile(temporary, JSON.stringify(session), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

export async function createSession(storageRoot: string, firstMessage: string): Promise<GalaxySession> {
  const now = new Date().toISOString();
  const session: GalaxySession = Object.freeze({
    createdAt: now,
    id: randomUUID(),
    messages: Object.freeze([]),
    title: titleFrom(firstMessage),
    updatedAt: now,
  });
  await writeSession(storageRoot, session);
  return session;
}

export async function readSession(storageRoot: string, id: string): Promise<GalaxySession | null> {
  if (!validSessionId(id)) return null;
  try {
    const raw = JSON.parse(await readFile(sessionPath(storageRoot, id), "utf8")) as GalaxySession;
    return Object.freeze({
      createdAt: String(raw.createdAt ?? ""),
      id,
      messages: Object.freeze((raw.messages ?? []).slice(-MAX_MESSAGES).map(turn => Object.freeze({ at: String(turn.at ?? ""), content: String(turn.content ?? ""), role: turn.role === "user" ? "user" as const : "assistant" as const }))),
      title: String(raw.title ?? "Phiên mới"),
      updatedAt: String(raw.updatedAt ?? ""),
    });
  } catch {
    return null;
  }
}

export async function appendSessionTurn(storageRoot: string, id: string, role: "assistant" | "user", content: string): Promise<GalaxySession | null> {
  const session = await readSession(storageRoot, id);
  if (session === null) return null;
  const updated: GalaxySession = Object.freeze({
    ...session,
    messages: Object.freeze([...session.messages, Object.freeze({ at: new Date().toISOString(), content, role })].slice(-MAX_MESSAGES)),
    title: session.messages.length === 0 && role === "user" ? titleFrom(content) : session.title,
    updatedAt: new Date().toISOString(),
  });
  await writeSession(storageRoot, updated);
  return updated;
}

export async function listSessions(storageRoot: string): Promise<readonly GalaxySessionSummary[]> {
  let names: string[];
  try {
    names = await readdir(sessionsRoot(storageRoot));
  } catch {
    return Object.freeze([]);
  }
  const summaries: GalaxySessionSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const session = await readSession(storageRoot, name.slice(0, -5));
    if (session === null) continue;
    summaries.push(Object.freeze({ id: session.id, messageCount: session.messages.length, title: session.title, updatedAt: session.updatedAt }));
  }
  return Object.freeze(summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
}

export async function deleteSession(storageRoot: string, id: string): Promise<boolean> {
  if (!validSessionId(id)) return false;
  try {
    await rm(sessionPath(storageRoot, id));
    return true;
  } catch {
    return false;
  }
}
