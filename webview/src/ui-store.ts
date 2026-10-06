import type { GalaxyUiEvent, GalaxyUiRunStatus } from "../../src/ui-protocol";
import { subscribeNewThread, subscribeSessionMessages, subscribeThinking, subscribeUiEvents } from "./host-bridge";

export interface UiToolPart {
  readonly type: "tool-call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly argsText: string;
  readonly result?: string;
  readonly isError?: boolean;
}

export interface UiMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: readonly (
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | UiToolPart
  )[];
}

export interface UiSessionSummary {
  readonly id: string;
  readonly messageCount: number;
  readonly title: string;
  readonly updatedAt: string;
}

export interface UiPlan {
  readonly steps: readonly Readonly<{ id: string; status: "completed" | "in_progress" | "pending" | "skipped"; title: string }>[];
}

export interface UiState {
  readonly messages: readonly UiMessage[];
  readonly status: GalaxyUiRunStatus | "idle";
  readonly plan: UiPlan | null;
  readonly sessions: readonly UiSessionSummary[];
  readonly thinking: Readonly<{ choice: string; options: readonly Readonly<{ label: string; value: string }>[] }> | null;
  readonly activeSessionId: string | null;
  readonly planMode: boolean;
  readonly statusReason: string | null;
}

type Listener = () => void;

let messages: UiMessage[] = [];
let status: GalaxyUiRunStatus | "idle" = "idle";
let statusReason: string | null = null;
let plan: UiPlan | null = null;
let sessions: UiSessionSummary[] = [];
let thinking: UiState["thinking"] = null;
let activeSessionId: string | null = null;
let planMode = false;
const listeners = new Set<Listener>();
let pendingAssistant: { content: UiMessage["content"] } | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function snapshot(): UiState {
  return { activeSessionId, messages, plan, planMode, sessions, status, statusReason, thinking };
}

let cachedSnapshot: UiState = snapshot();

function commit(): void {
  cachedSnapshot = snapshot();
  notify();
}

export function subscribeUiState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUiState(): UiState {
  return cachedSnapshot;
}

function lastAssistant(): UiMessage {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") return last;
  const created: UiMessage = { content: [], id: `assistant-${messages.length}`, role: "assistant" };
  messages = [...messages, created];
  return created;
}

function updateLastAssistant(update: (content: UiMessage["content"]) => UiMessage["content"]): void {
  const current = lastAssistant();
  messages = [
    ...messages.slice(0, -1),
    { ...current, content: update(current.content) },
  ];
}

function handleEvent(event: GalaxyUiEvent): void {
  switch (event.kind) {
    case "message/text-delta": {
      const current = lastAssistant();
      const parts = [...current.content];
      const lastText = parts[parts.length - 1];
      if (lastText && lastText.type === "text") {
        parts[parts.length - 1] = { type: "text", text: lastText.text + event.text };
      } else {
        parts.push({ type: "text", text: event.text });
      }
      updateLastAssistant(() => parts);
      commit();
      return;
    }
    case "message/thinking-delta": {
      const current = lastAssistant();
      const parts = [...current.content];
      const firstReasoning = parts.findIndex((part) => part.type === "reasoning");
      if (firstReasoning >= 0) {
        const part = parts[firstReasoning];
        if (part.type === "reasoning") parts[firstReasoning] = { type: "reasoning", text: part.text + event.text };
      } else {
        parts.unshift({ type: "reasoning", text: event.text });
      }
      updateLastAssistant(() => parts);
      commit();
      return;
    }
    case "tool/start": {
      updateLastAssistant((content) => [...content, {
        args: event.args,
        argsText: JSON.stringify(event.args),
        toolCallId: event.toolCallId,
        toolName: event.name,
        type: "tool-call" as const,
      }]);
      commit();
      return;
    }
    case "tool/result": {
      updateLastAssistant((content) => content.map((part) => (
        part.type === "tool-call" && part.toolCallId === event.toolCallId
          ? { ...part, isError: !event.ok, result: `${event.summary}\n${event.outputTail ?? ""}`.trim() }
          : part
      )));
      commit();
      return;
    }
    case "run/status": {
      status = event.status;
      statusReason = event.reason ?? null;
      if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
        void pendingAssistant;
        pendingAssistant = null;
      }
      commit();
      return;
    }
    case "error": {
      updateLastAssistant((content) => [...content, { type: "text", text: `\n\n[error ${event.code}] ${event.message}` }]);
      status = "failed";
      commit();
      return;
    }
    case "model/retry": {
      statusReason = `retry ${event.attempt} sau ${event.delayMs}ms — ${event.reason}`;
      commit();
      return;
    }
    case "plan/updated": {
      plan = event.steps.length ? Object.freeze({ steps: event.steps }) : plan;
      planMode = event.mode;
      commit();
      return;
    }
    case "context/compacted": {
      statusReason = event.itemsShadowed === undefined
        ? `context compacted: ${event.reason}`
        : `đã nén ${event.itemsShadowed} mục (~${event.tokensBefore} → ${event.tokensAfter} token)`;
      commit();
      return;
    }
    case "context/pressure":
      return;
    case "completion/rejected": {
      statusReason = `completion rejected: ${event.issues.join("; ")}`;
      commit();
      return;
    }
    case "approval/request":
      return; // handled via pending-approval bridge message
  }
}

subscribeUiEvents(handleEvent);

/** The host's session list and the transcript it hands back when a session is opened. */
/* The New Thread command (host side) clears the conversation; so does the header's new-chat button. */
subscribeNewThread(() => { resetConversation(); });

/* The reasoning levels the active model offers, as the host resolved them from the shared policy. */
subscribeThinking(message => {
  thinking = Object.freeze({ choice: message.choice, options: Object.freeze(message.options.map(option => Object.freeze({ ...option }))) });
  commit();
});

subscribeSessionMessages(message => {
  if (message.type === "session-list") {
    sessions = message.sessions.map(item => Object.freeze({ ...item }));
    commit();
    return;
  }
  activeSessionId = message.id;
  messages = message.messages.map((turn, index) => ({
    content: [{ type: "text" as const, text: turn.content }],
    id: message.id + "-" + String(index),
    role: turn.role,
  }));
  status = "idle";
  statusReason = message.id === null ? null : "Đã mở phiên: " + message.title;
  commit();
});

/** Called when the composer submits a new user message. */
export function appendUserMessage(text: string): void {
  messages = [...messages, { content: [{ type: "text", text }], id: `user-${Date.now()}`, role: "user" }];
  status = "running";
  commit();
}

export function resetConversation(): void {
  messages = [];
  status = "idle";
  statusReason = null;
  commit();
}
