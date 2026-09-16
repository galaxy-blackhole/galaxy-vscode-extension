/**
 * Message protocol between the extension host and the chat webview.
 * The webview owns the assistant-ui runtime and chat loop; the host is a
 * thin bridge that streams Ollama responses and executes workspace tools.
 */

export type OllamaToolSchema = Readonly<{
  type: "function";
  function: Readonly<{ name: string; description: string; parameters: unknown }>;
}>;

export type OllamaChatMessage = Readonly<{
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  name?: string;
  tool_calls?: readonly Readonly<{
    function: Readonly<{ name: string; arguments: Record<string, unknown> }>;
  }>[];
}>;

import type { GalaxyUiEvent } from "./ui-protocol";

export type WebviewToHostMessage =
  | Readonly<{ type: "chat-start"; runId: string; request: Readonly<{ messages: readonly OllamaChatMessage[]; tools: readonly OllamaToolSchema[]; system?: string }> }>
  | Readonly<{ type: "chat-cancel"; runId: string }>
  | Readonly<{ type: "tool-exec"; requestId: string; name: string; args: Readonly<Record<string, unknown>> }>
  | Readonly<{ type: "ui-ready" }>
  | Readonly<{ type: "open-external"; url: string }>
  | Readonly<{ type: "ui-action"; action: import("./ui-protocol").GalaxyUiAction }>;

export type OllamaStreamDelta = Readonly<{
  content?: string;
  thinking?: string;
  toolCalls?: readonly Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>[];
}>;

/** Bump when the shape of host↔webview messages changes. */
export const HOST_WEBVIEW_PROTOCOL_VERSION = 1;

export type HostToWebviewMessage =
  | Readonly<{ type: "chat-delta"; runId: string; delta: OllamaStreamDelta }>
  | Readonly<{ type: "chat-done"; runId: string; stats: Readonly<{ promptTokens?: number; completionTokens?: number; durationMs?: number }> }>
  | Readonly<{ type: "chat-error"; runId: string; message: string }>
  | Readonly<{ type: "ui-event"; event: GalaxyUiEvent }>
  | Readonly<{ type: "pending-approval"; requestId: string; tool: string; args: Readonly<Record<string, unknown>>; reason: string }>
  | Readonly<{ type: "tool-result"; requestId: string; ok: boolean; result: string }>
  | Readonly<{ type: "host-info"; workspaceName: string; workspacePath: string; platform: string; shell: string; model: string; baseUrl: string; credentialSource: string; modelLibraryUrl?: string }>
  | Readonly<{ type: "new-thread" }>;
