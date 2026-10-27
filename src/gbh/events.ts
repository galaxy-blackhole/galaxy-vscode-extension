/*
 * The kernel's forwarded event stream: how the panel learns that a run needs a decision.
 *
 * Wire read off the gateway client (26/10/2026):
 *   WS  <origin>/api/remote.mux                 (cookie: dsh-auth-…)
 *   →   {type:"open", streamId, endpoint:"$events", payload:{args:{}}}
 *   ←   {type:"item", streamId, value:{type:"ready", clientId, host:{home}}}
 *   ←   {type:"item", streamId, value:{type:"emit", event, args}}
 *   ←   {type:"item", streamId, value:{type:"waterfall", event, eventId, agentId, request}}
 *   ←   {type:"item", streamId, value:{type:"cancel", eventId}}
 *   answer a waterfall: POST /api/$events/result
 *   →   {type:"client-request", rpcId, method:"$events/result",
 *        payload:{args:{clientId, eventId, outcome}}}
 *   outcome: {kind:"next"} | {kind:"result", value} | {kind:"rejected", error}
 */
import WebSocket from "ws";
import type { GbhHost } from "./host";
import { type FetchLike } from "./remote";

/** One decision the host asks the client for. */
export interface WaterfallRequest {
  readonly event: string;
  readonly eventId: string;
  readonly agentId: string;
  readonly request: Record<string, unknown>;
}

/** What the client may answer. */
export type WaterfallOutcome =
  | { readonly kind: "next" }
  | { readonly kind: "result"; readonly value?: unknown }
  | { readonly kind: "rejected"; readonly error: { readonly name: string; readonly message: string } };

/** Handlers the bridge installs. */
export interface EventStreamHandlers {
  readonly onFrame?: (value: unknown) => void;
  readonly onReady?: (clientId: string) => void;
  readonly onEmit?: (event: string, args: unknown[]) => void;
  readonly onWaterfall?: (request: WaterfallRequest) => void;
  readonly onCancel?: (eventId: string) => void;
  readonly onClose?: (reason: string) => void;
}

/** A live forwarded-event stream. */
export interface EventStream {
  /** Correlation id the host handed out with the ready frame. */
  readonly clientId: () => string | undefined;
  /** Answer one waterfall request. */
  readonly answer: (eventId: string, outcome: WaterfallOutcome) => Promise<void>;
  /** Stop the stream. */
  readonly close: () => void;
}

/**
 * Turn the ready-token origin into the mux URL.
 * @param host - parsed ready URL.
 * @returns ws://127.0.0.1:PORT/api/remote.mux
 */
export function muxUrl(host: GbhHost): string {
  const url = new URL("/api/remote.mux", host.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Read one frame's inner value from a mux item frame.
 * @param raw - the text frame received.
 * @returns the inner value, or undefined when the frame is not an item.
 */
export function itemValueOf(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const frame = parsed as { type?: unknown; value?: unknown } | undefined;
  if (frame?.type !== "item") return undefined;
  return frame.value;
}

/**
 * Open the forwarded-event stream and route its frames.
 * @param host - parsed ready URL.
 * @param cookie - the session cookie from the token exchange.
 * @param handlers - what to do with each frame kind.
 * @returns the stream handle; the caller closes it on dispose.
 */
export function openEventStream(host: GbhHost, cookie: string, handlers: EventStreamHandlers = {}): EventStream {
  const socket = new WebSocket(muxUrl(host), { headers: { cookie } });
  let clientId: string | undefined;
  let closed = false;
  const streamId = "gbh-events";

  socket.on("open", () => {
    socket.send(JSON.stringify({ type: "open", streamId, endpoint: "$events", payload: { args: {} } }));
  });
  socket.on("message", (data) => {
    const value = itemValueOf(String(data)) as
      | { type?: string; clientId?: string; event?: string; args?: unknown[]; eventId?: string; agentId?: string; request?: Record<string, unknown> }
      | undefined;
    if (value === undefined) return;
    handlers.onFrame?.(value);
    if (value.type === "ready" && typeof value.clientId === "string") {
      clientId = value.clientId;
      handlers.onReady?.(clientId);
      return;
    }
    if (value.type === "emit" && typeof value.event === "string") {
      handlers.onEmit?.(value.event, Array.isArray(value.args) ? value.args : []);
      return;
    }
    if (value.type === "waterfall" && typeof value.event === "string" && typeof value.eventId === "string") {
      handlers.onWaterfall?.({
        event: value.event,
        eventId: value.eventId,
        agentId: typeof value.agentId === "string" ? value.agentId : "",
        request: value.request ?? {},
      });
      return;
    }
    if (value.type === "cancel" && typeof value.eventId === "string") handlers.onCancel?.(value.eventId);
  });
  socket.on("close", () => {
    if (!closed) handlers.onClose?.("socket đóng");
  });
  socket.on("error", (error) => {
    if (!closed) handlers.onClose?.(error instanceof Error ? error.message : String(error));
  });

  return {
    clientId: () => clientId,
    close: () => {
      closed = true;
      try {
        socket.close();
      } catch {
        // A socket that never opened throws here; nothing to clean up.
      }
    },
    answer: async (eventId, outcome) => {
      const current = clientId;
      if (current === undefined) throw new Error("stream $events chưa sẵn sàng (chưa có clientId)");
      await postEventResult(host, cookie, { clientId: current, eventId, outcome });
    },
  };
}

/**
 * Post one waterfall outcome back to the host.
 * @param host - parsed ready URL.
 * @param cookie - the session cookie.
 * @param body - clientId, eventId and the outcome.
 * @param fetchImpl - injectable for tests.
 * @returns the host's answer value, when it sent one.
 */
export async function postEventResult(
  host: GbhHost,
  cookie: string,
  body: { clientId: string; eventId: string; outcome: WaterfallOutcome },
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const rpcId = "gbh-" + Math.random().toString(16).slice(2);
  const response = await fetchImpl(host.baseUrl + "/api/$events/result", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "client-request", rpcId, method: "$events/result", payload: { args: body } }),
  });
  if (!response.ok) throw new Error("$events/result: HTTP " + String(response.status));
  const envelope = (await response.json()) as { type?: unknown; result?: { ok?: unknown; value?: unknown; error?: { code?: string; message?: string } } };
  if (envelope.type !== "server-response") throw new Error("$events/result: phong bì lạ");
  const result = envelope.result;
  if (result?.ok !== true) throw new Error("$events/result: " + String(result?.error?.code ?? "failed") + " " + String(result?.error?.message ?? ""));
  return result.value;
}
