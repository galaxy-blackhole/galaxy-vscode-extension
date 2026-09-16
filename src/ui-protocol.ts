/**
 * Galaxy UI Protocol — the stable, UI-facing semantic contract.
 *
 * The webview depends ONLY on this schema, never on @galaxy/ai-coder-core
 * types or provider wire formats. When ai-coder-core evolves, only the host
 * mapper (core event → GalaxyUiEvent) changes; the webview stays frozen.
 *
 * Versioning: bump GALAXY_UI_PROTOCOL_VERSION when the shape changes and
 * gate the host↔webview handshake on it.
 */

export const GALAXY_UI_PROTOCOL_VERSION = 1;

export type GalaxyUiRunStatus = "running" | "paused" | "completed" | "failed" | "cancelled";

/** Host → webview semantic events. Ordered, append-only per run. */
export type GalaxyUiEvent =
  | Readonly<{ kind: "run/status"; status: GalaxyUiRunStatus; reason?: string }>
  | Readonly<{ kind: "message/text-delta"; text: string }>
  | Readonly<{ kind: "message/thinking-delta"; text: string }>
  | Readonly<{ kind: "tool/start"; toolCallId: string; name: string; args: Record<string, unknown> }>
  | Readonly<{ kind: "tool/result"; toolCallId: string; ok: boolean; summary: string; outputTail?: string }>
  | Readonly<{ kind: "context/pressure"; usedTokens: number; contextWindow: number | null }>
  | Readonly<{ kind: "context/compacted"; reason: string }>
  | Readonly<{ kind: "model/retry"; attempt: number; delayMs: number; reason: string }>
  | Readonly<{ kind: "approval/request"; requestId: string; tool: string; risk: string; args: Record<string, unknown> }>
  | Readonly<{ kind: "completion/rejected"; issues: readonly string[] }>
  | Readonly<{ kind: "error"; code: string; message: string; retryable: boolean }>;

/** Webview → host intents. One run at a time in this prototype. */
export type GalaxyUiAction =
  | Readonly<{ type: "run/start"; taskId: string; workspace: string; input: string }>
  | Readonly<{ type: "run/cancel" }>
  | Readonly<{ type: "run/pause" }>
  | Readonly<{ type: "approval/resolve"; requestId: string; approved: boolean }>
  | Readonly<{ type: "permission/mode"; mode: "ask" | "smart" | "auto" }>;

/**
 * Mapping from @galaxy/ai-coder-core runtime events (see
 * packages/ai-coder-core/src/runtime/runtime-types.ts) to GalaxyUiEvent.
 * This table is the ONLY file that must change when core internals change.
 *
 * | AiCoderRuntimeEvent            | GalaxyUiEvent              |
 * |--------------------------------|----------------------------|
 * | model (content delta)          | message/text-delta         |
 * | model (thinking delta)         | message/thinking-delta     |
 * | tool_start                     | tool/start                 |
 * | tool_result                    | tool/result                |
 * | model_retry                    | model/retry                |
 * | checkpoint                     | context/compacted          |
 * | context_pressure               | context/pressure           |
 * | completion_rejected            | completion/rejected        |
 * | state                          | run/status                 |
 * | (approval via ApprovalPort)    | approval/request           |
 */
