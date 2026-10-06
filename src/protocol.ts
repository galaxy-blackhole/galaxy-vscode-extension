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
import type { ModelSettingsSummary } from "./model-settings-types";

/** One provider draft the model-setup panel submits. */
export type ProviderDraft = Readonly<{
  api: "ollama" | "openai-completions";
  apiKey?: string;
  baseUrl: string;
  displayName: string;
  id: string;
  models: readonly string[];
}>;

export type WebviewToHostMessage =
  | Readonly<{ type: "chat-start"; runId: string; request: Readonly<{ messages: readonly OllamaChatMessage[]; tools: readonly OllamaToolSchema[]; system?: string }> }>
  | Readonly<{ type: "chat-cancel"; runId: string }>
  | Readonly<{ type: "tool-exec"; requestId: string; name: string; args: Readonly<Record<string, unknown>> }>
  | Readonly<{ type: "ui-ready" }>
  | Readonly<{ type: "settings/open" }>
  | Readonly<{ type: "open-external"; url: string }>
  | Readonly<{ type: "ui-action"; action: import("./ui-protocol").GalaxyUiAction }>
  | Readonly<{ type: "model-settings/save-key"; providerId: string; apiKey: string }>
  | Readonly<{ type: "model-settings/save-provider"; provider: ProviderDraft }>
  | Readonly<{ type: "model-settings/set-active"; providerId: string }>
  | Readonly<{ type: "model-settings/set-model"; model: string }>
  | Readonly<{ type: "model-settings/set-thinking"; choice: string }>
  | Readonly<{ type: "model-settings/remove"; providerId: string }>
  | Readonly<{ type: "session/action"; action: Readonly<{ type: "delete" | "list" | "new" | "open"; id?: string }> }>;

export type OllamaStreamDelta = Readonly<{
  content?: string;
  thinking?: string;
  toolCalls?: readonly Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>[];
}>;

/** Bump when the shape of host↔webview messages changes. */
export const HOST_WEBVIEW_PROTOCOL_VERSION = 6;

export type HostToWebviewMessage =
  | Readonly<{ type: "chat-delta"; runId: string; delta: OllamaStreamDelta }>
  | Readonly<{ type: "chat-done"; runId: string; stats: Readonly<{ promptTokens?: number; completionTokens?: number; durationMs?: number }> }>
  | Readonly<{ type: "chat-error"; runId: string; message: string }>
  | Readonly<{ type: "ui-event"; event: GalaxyUiEvent }>
  | Readonly<{ type: "pending-approval"; requestId: string; tool: string; args: Readonly<Record<string, unknown>>; reason: string }>
  | Readonly<{ type: "tool-result"; requestId: string; ok: boolean; result: string }>
  | Readonly<{ type: "host-info"; workspaceName: string; workspacePath: string; platform: string; shell: string; model: string; baseUrl: string; credentialSource: string; modelLibraryUrl?: string; modelSettings: ModelSettingsSummary }>
  | Readonly<{ type: "model-settings"; settings: ModelSettingsSummary }>
  | Readonly<{ type: "new-thread" }>
  /* Test-only: the extension-host suite drives the webview the way a click would (see test/vscode). */
  | Readonly<{ type: "test/command"; command: Readonly<{ kind: "submit"; text: string } | { kind: "open-session"; id: string }> }>
  | Readonly<{ type: "session-list"; sessions: readonly Readonly<{ id: string; messageCount: number; title: string; updatedAt: string }>[] }>
  | Readonly<{ type: "thinking"; choice: string; options: readonly Readonly<{ label: string; value: string }>[] }>
  | Readonly<{ type: "session-loaded"; id: string | null; messages: readonly Readonly<{ content: string; role: "assistant" | "user" }>[]; title: string }>;
