/*
 * The kernel's Remote API, spoken directly from the extension host.
 *
 * Shapes below were read off the running host (26/10/2026) rather than guessed:
 *   GET  <ready-url>            -> 303 + set-cookie: dsh-auth-<id>=v1.<payload>.<sig>
 *   POST <origin>/api/session/list
 *        body {type:"client-request", rpcId, method:"session.list", payload:{args:{_request:{}}}}
 *   ->   {type:"server-response", rpcId, result:{ok:true, value:{items:[…]}}}
 * The endpoint segment is the dotted method with dots turned into slashes, and the payload carries
 * exactly one key, "args" — the gateway rejects anything else.
 */
import type { GbhHost } from "./host.ts";
import type { GbhSessionSummary } from "./types.ts";

/** Envelope the gateway accepts. */
export interface ClientRequest {
  readonly type: "client-request";
  readonly rpcId: string;
  readonly method: string;
  readonly payload: { readonly args: Record<string, unknown> };
}

/** The slice of a session row this extension uses. */
interface SessionItem {
  readonly sessionId?: unknown;
  readonly cwd?: unknown;
  readonly updatedAt?: unknown;
  readonly projections?: { readonly values?: Record<string, unknown>; readonly asOfSeq?: unknown };
}

/** Injectable fetch so tests never need a server. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One authenticated kernel connection. */
export interface KernelSession {
  readonly host: GbhHost;
  readonly cookie: string;
}

/**
 * Read the session cookie out of a Set-Cookie header.
 * @param header - raw header value, or null when the host did not set one.
 * @returns the "name=value" pair without attributes, or undefined.
 */
export function parseSessionCookie(header: string | null): string | undefined {
  if (header === null) return undefined;
  const pair = header.split(";", 1)[0]?.trim() ?? "";
  if (pair.length === 0 || !pair.includes("=")) return undefined;
  return pair;
}

/**
 * Turn a dotted method id into the endpoint path the gateway expects.
 * @param method - for example "session.list".
 * @returns the path segment, for example "session/list".
 */
export function endpointOf(method: string): string {
  return method.split(".").join("/");
}

/**
 * Build the request envelope for one call.
 * @param method - dotted method id.
 * @param args - the arguments object placed under payload.args.
 * @param rpcId - correlation id.
 * @returns the envelope to post as JSON.
 */
export function buildRequest(method: string, args: Record<string, unknown>, rpcId: string): ClientRequest {
  return { type: "client-request", rpcId, method, payload: { args } };
}

/**
 * Exchange the printed token for a session cookie.
 * @param host - parsed ready URL.
 * @param fetchImpl - injectable for tests.
 * @returns the cookie, or undefined when the host refused it.
 */
export async function authenticate(host: GbhHost, fetchImpl: FetchLike = fetch): Promise<string | undefined> {
  const response = await fetchImpl(host.url, { method: "GET", redirect: "manual" });
  const header = typeof response.headers?.get === "function" ? response.headers.get("set-cookie") : null;
  return parseSessionCookie(header);
}

/**
 * Map one Remote session row to the summary the view paints.
 * @param item - one entry of session.list's items.
 * @returns the summary used by the tree and by the mapping functions.
 */
export function mapSessionItem(item: unknown): GbhSessionSummary | undefined {
  const row = item as SessionItem | undefined;
  if (row === undefined || row === null || typeof row.sessionId !== "string") return undefined;
  const values = row.projections?.values ?? {};
  const title = values.title;
  const workingDirectory = values.workingDirectory;
  const stats = values.tokenUsage as { uncachedInputTokens?: unknown; outputTokens?: unknown } | undefined;
  const updatedAt = row.updatedAt;
  return {
    id: row.sessionId,
    ...(typeof title === "string" && title.length > 0 ? { title } : {}),
    ...(typeof row.cwd === "string" ? { cwd: row.cwd } : {}),
    ...(typeof workingDirectory === "string" ? { workingDirectory } : {}),
    ...(typeof updatedAt === "number" ? { createdAt: updatedAt } : {}),
    ...(typeof stats?.uncachedInputTokens === "number" ? { uncachedInputTokens: stats.uncachedInputTokens } : {}),
    ...(typeof stats?.outputTokens === "number" ? { outputTokens: stats.outputTokens } : {}),
    ...(typeof row.projections?.asOfSeq === "number" ? { asOfSeq: row.projections.asOfSeq } : {}),
  };
}

/**
 * Call one Remote method.
 * @param session - authenticated connection.
 * @param method - dotted method id, for example "session.list".
 * @param args - arguments object.
 * @param fetchImpl - injectable for tests.
 * @returns the unwrapped value.
 * @throws Error carrying the gateway code when the host answers ok:false.
 */
export async function callRemote(
  session: KernelSession,
  method: string,
  args: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const rpcId = "gbh-" + Math.random().toString(16).slice(2);
  const response = await fetchImpl(session.host.baseUrl + "/api/" + endpointOf(method), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.cookie },
    body: JSON.stringify(buildRequest(method, args, rpcId)),
  });
  if (!response.ok) throw new Error("kernel " + method + ": HTTP " + String(response.status) + " " + (await response.text()));
  const envelope = (await response.json()) as { type?: unknown; result?: { ok?: unknown; value?: unknown; error?: { code?: string; message?: string } } };
  if (envelope.type !== "server-response") throw new Error("kernel " + method + ": unexpected envelope");
  const result = envelope.result;
  if (result?.ok !== true) throw new Error("kernel " + method + ": " + String(result?.error?.code ?? "failed") + " " + String(result?.error?.message ?? ""));
  return result.value;
}

/**
 * List every session the kernel knows, with titles and working directories.
 * @param session - authenticated connection.
 * @param fetchImpl - injectable for tests.
 * @returns session summaries, newest first.
 */
export async function listSessions(session: KernelSession, fetchImpl: FetchLike = fetch): Promise<GbhSessionSummary[]> {
  const value = (await callRemote(session, "session.list", { _request: {} }, fetchImpl)) as { items?: unknown } | undefined;
  const items = Array.isArray(value?.items) ? value.items : [];
  const summaries = items.map((item) => mapSessionItem(item)).filter((item): item is GbhSessionSummary => item !== undefined);
  return summaries.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
}

/** What sending a prompt needs from the caller. */
export interface PromptRequest {
  readonly sessionId: string;
  readonly text: string;
  /** queue appends after the running turn; steer interrupts it. */
  readonly mode?: "queue" | "steer";
  /** IANA zone stamped on the message; defaults to the host's own zone. */
  readonly clientTimeZone?: string;
  readonly requestId?: string;
}

/**
 * Admit one prompt into a session (the kernel resumes it on demand).
 * @param kernel - authenticated connection.
 * @param request - session, text and delivery mode.
 * @param fetchImpl - injectable for tests.
 * @returns true when the kernel accepted the prompt.
 */
export async function sendPrompt(kernel: KernelSession, request: PromptRequest, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const value = (await callRemote(
    kernel,
    "session.prompt",
    {
      request: {
        requestId: request.requestId ?? "gbh-" + Math.random().toString(16).slice(2),
        sessionId: request.sessionId,
        mode: request.mode ?? "queue",
        content: [{ type: "text", text: request.text }],
        clientTimeZone: request.clientTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      },
    },
    fetchImpl,
  )) as { accepted?: unknown } | undefined;
  return value?.accepted === true;
}

