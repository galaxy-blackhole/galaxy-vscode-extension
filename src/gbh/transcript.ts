/*
 * The transcript: what a session said, read from the kernel's own page endpoint.
 *
 * Shape read off the running host (26/10/2026):
 *   POST /api/session/page  {request:{address:{kind:"session",sessionId},throughSeq,<maxMessages>}}
 *   -> {records:[{type:"event", event:{type:"user/message"|"assistant/message", seq, time, data:{role, content:[{type:"text",text}]}}}], hasMore}
 * throughSeq is mandatory and is the session's current log cut — session.list carries it as projections.asOfSeq.
 */
import type { KernelSession } from "./remote";
import { callRemote, listSessions, type FetchLike } from "./remote";

/** One line of the conversation, as the view paints it. */
export interface TranscriptMessage {
  readonly role: "user" | "assistant" | "notice";
  readonly text: string;
  readonly seq: number;
  readonly time?: number;
}

/** A transcript plus the address it came from. */
export interface Transcript {
  readonly sessionId: string;
  readonly title?: string;
  readonly messages: readonly TranscriptMessage[];
  readonly hasMore: boolean;
  /** True while the kernel reports the turn as running (drives the panel polling). */
  readonly running?: boolean;
  /** Turn counters the kernel reports for this session. */
  readonly stats?: { readonly turns: number; readonly steps: number };
  /** Model the kernel selected for this session. */
  readonly model?: { readonly provider: string; readonly model: string };
  /** Sequence of the oldest message in this page, for loading older pages. */
  readonly firstSeq?: number;
}

/** The event types that carry a message this view shows. */
const MESSAGE_EVENTS = new Set(["user/message", "assistant/message"]);

/**
 * Pull the text out of a message's content array.
 * @param content - the event's content blocks.
 * @returns joined text of the text blocks; other block kinds are skipped.
 */
export function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    const item = block as { type?: unknown; text?: unknown } | undefined;
    if (item?.type === "text" && typeof item.text === "string") parts.push(item.text);
  }
  return parts.join("\n").trim();
}

/**
 * Turn page records into transcript messages.
 * @param records - the records array of a session.page result.
 * @returns messages in log order; non-message events and empty texts are dropped.
 */
export function messagesOfRecords(records: unknown): TranscriptMessage[] {
  if (!Array.isArray(records)) return [];
  const out: TranscriptMessage[] = [];
  for (const record of records) {
    const entry = record as { type?: unknown; event?: { type?: unknown; seq?: unknown; time?: unknown; data?: { content?: unknown; role?: unknown; source?: unknown } } } | undefined;
    if (entry?.type !== "event") continue;
    const event = entry.event;
    if (event === undefined || typeof event.type !== "string" || !MESSAGE_EVENTS.has(event.type)) continue;
    const text = textOfContent(event.data?.content);
    if (text.length === 0) continue;
    const notice = (event.data?.source as { kind?: unknown } | undefined)?.kind !== undefined && event.type === "user/message" && event.data?.role !== "user";
    out.push({
      role: notice ? "notice" : event.type === "user/message" ? "user" : "assistant",
      text,
      seq: typeof event.seq === "number" ? event.seq : 0,
      ...(typeof event.time === "number" ? { time: event.time } : {}),
    });
  }
  return out;
}

/**
 * Read one session's transcript.
 * @param kernel - authenticated connection.
 * @param sessionId - the session to read.
 * @param maxMessages - page budget; defaults to 40.
 * @param fetchImpl - injectable for tests.
 * @returns the transcript; an unknown session yields empty messages rather than throwing.
 */
export async function readTranscript(
  kernel: KernelSession,
  sessionId: string,
  maxMessages = 40,
  fetchImpl: FetchLike = fetch,
  beforeSeq?: number,
): Promise<Transcript> {
  const sessions = await listSessions(kernel, fetchImpl);
  const summary = sessions.find((item) => item.id === sessionId);
  const request: Record<string, unknown> = {
    address: { kind: "session", sessionId },
    throughSeq: throughSeqHint(summary),
    maxMessages,
    ...(beforeSeq === undefined ? {} : { beforeSeq }),
  };
  const value = (await callRemote(kernel, "session.page", { request }, fetchImpl)) as
    | { records?: unknown; hasMore?: unknown }
    | undefined;
  const messages = messagesOfRecords(value?.records);
  const firstSeq = messages.length === 0 ? undefined : messages[0]?.seq;
  return {
    sessionId,
    ...(summary?.title === undefined ? {} : { title: summary.title }),
    ...(summary?.model === undefined ? {} : { model: summary.model }),
    ...(summary?.stats === undefined ? {} : { stats: summary.stats }),
    messages,
    hasMore: value?.hasMore === true,
    ...(summary?.running === true ? { running: true } : {}),
    ...(firstSeq === undefined ? {} : { firstSeq }),
  };
}

/**
 * The log cut to page up to: session.list reports it as projections.asOfSeq.
 * @param summary - the session summary, when the kernel listed it.
 * @returns that cut, or the largest safe sequence when the kernel did not say.
 */
export function throughSeqHint(summary: { readonly asOfSeq?: number } | undefined): number {
  return typeof summary?.asOfSeq === "number" && summary.asOfSeq > 0 ? summary.asOfSeq : Number.MAX_SAFE_INTEGER;
}

/**
 * Decide whether the last prompt looks unanswered, so the panel can say so instead of staying silent.
 * A user message newer than every assistant message, on a session that is not running, means the turn
 * ended without a reply (a model or credential failure, or a cancelled turn).
 * @param messages - the transcript page, oldest first.
 * @param running - what the kernel says about the session right now.
 * @returns true when the panel should warn that the last message has no answer.
 */
export function looksUnanswered(messages: readonly TranscriptMessage[], running: boolean): boolean {
  if (running) return false;
  const last = messages[messages.length - 1];
  if (last === undefined || last.role !== "user") return false;
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return lastAssistant === undefined || last.seq > lastAssistant.seq;
}
