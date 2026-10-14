import type { GalaxyUiEvent, GalaxyUiRunStatus } from "../../src/ui-protocol";
import { subscribeNewThread, subscribeSessionMessages, subscribeThinking, subscribeUiEvents } from "./host-events";

export interface UiToolPart {
  readonly type: "tool-call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly argsText: string;
  readonly result?: string;
  readonly isError?: boolean;
  /** The run_code call this one belongs to, when a program made it: it renders nested inside that card. */
  readonly parent?: string;
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
  /** Boot progress before the first run: `index` holds the panel, `mcp` only annotates it. */
  readonly boot: Readonly<{ phase: "index" | "mcp" | null; message: string; done: boolean }>;
  /** What the run changed, as Git reports it: the card the owner scans before reading the answer. */
  readonly changes: readonly Readonly<{ path: string; added: number; removed: number }>[];
  /** Steps waiting for the owner's approval before any of them may be worked on; null when nothing waits. */
  readonly planReview: readonly string[] | null;
  /** The composition this session runs as, shown so the choice is visible rather than implied. */
  readonly preset: Readonly<{ id: string; label: string }> | null;
  /** What the session is for. */
  readonly goal: string | null;
  /** The children this session started, as the book keeps them. */
  readonly agents: readonly Readonly<{ depth: number; description: string; id: string; status: string }>[];
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
let changes: UiState["changes"] = [];
let planReview: UiState["planReview"] = null;
let preset: UiState["preset"] = null;
let goal: UiState["goal"] = null;
let agents: UiState["agents"] = [];
let bootPhase: "index" | "mcp" | null = "index";
let bootMessage = "";
let bootDone = false;
let bootGrace: ReturnType<typeof setTimeout> | null = null;
/*
 * The index phase holds the panel from the very first paint, and the same grace runs from boot: a host that
 * never reports in must not leave the owner staring at a spinner.
 */
bootGrace = setTimeout(() => { bootGrace = null; bootDone = true; commit(); }, 2500);
/**
 * The panel is never held hostage by a host that cannot finish booting. The grace covers the index phase, which
 * is the only one that holds the screen; after it the transcript opens and a late event merely annotates it.
 */
const BOOT_GRACE_MS = 20000;

/** Open the panel now instead of waiting for the workspace's servers. */
export function skipBoot(): void {
  if (bootGrace !== null) { clearTimeout(bootGrace); bootGrace = null; }
  bootDone = true;
  commit();
}
const listeners = new Set<Listener>();
let pendingAssistant: { content: UiMessage["content"] } | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function snapshot(): UiState {
  return { activeSessionId, boot: { phase: bootPhase, message: bootMessage, done: bootDone }, agents, changes, goal, planReview, preset, messages, plan, planMode, sessions, status, statusReason, thinking };
}

let cachedSnapshot: UiState = snapshot();

function commit(): void {
  cachedSnapshot = snapshot();
  notify();
}

/**
 * Tool-call ids are only unique inside the program that produced them: a second round names its inner calls
 * `read_file#0` again, and the transcript keys tool parts by that id — a repeat is a duplicate React key, and the
 * whole view goes blank. A repeat is renamed here, and the result still finds it through the alias.
 */
const seenToolCallIds = new Set<string>();
const toolCallIdAlias = new Map<string, string>();
function uniqueToolCallId(id: string): string {
  if (!seenToolCallIds.has(id)) {
    seenToolCallIds.add(id);
    toolCallIdAlias.set(id, id);
    return id;
  }
  let suffix = 2;
  while (seenToolCallIds.has(id + "#" + suffix)) suffix += 1;
  const next = id + "#" + suffix;
  seenToolCallIds.add(next);
  toolCallIdAlias.set(id, next);
  return next;
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
    case "boot/progress": {
      bootPhase = event.phase;
      bootMessage = event.message;
      bootDone = false;
      if (bootGrace === null) {
        bootGrace = setTimeout(() => { bootGrace = null; bootDone = true; commit(); }, BOOT_GRACE_MS);
      }
      commit();
      return;
    }
    case "boot/ready": {
      if (bootGrace !== null) { clearTimeout(bootGrace); bootGrace = null; }
      bootPhase = null;
      bootMessage = event.message;
      bootDone = true;
      commit();
      return;
    }
    case "message/text-delta": {
      statusReason = null;
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
      statusReason = null;
      const current = lastAssistant();
      const parts = [...current.content];
      /*
       * Reasoning is a part of the stream, not a header on it: it appends to the reasoning block that is
       * currently open and starts a new one once the model has moved on. Collecting every round into the first
       * block (or unshifting it to the top) put a whole run's thinking in front of the answer it belongs to.
       */
      const previous = parts[parts.length - 1];
      if (previous !== undefined && previous.type === "reasoning") {
        parts[parts.length - 1] = { type: "reasoning", text: previous.text + event.text };
      } else {
        parts.push({ type: "reasoning", text: event.text });
      }
      updateLastAssistant(() => parts);
      commit();
      return;
    }
    case "agents/current": {
      agents = [...event.agents];
      commit();
      return;
    }
    case "goal/current": {
      goal = event.objective;
      commit();
      return;
    }
    case "preset/current": {
      preset = { id: event.id, label: event.label };
      commit();
      return;
    }
    case "plan/review": {
      planReview = [...event.steps];
      commit();
      return;
    }
    case "changes/summary": {
      changes = [...event.files];
      commit();
      return;
    }
    case "tool/start": {
      /*
       * The core reports a program's inner call and the host sink reports it again for nesting: the same call twice.
       * The copies disagree on exactly one field — only the sink knows the parent — so a later copy fills that in
       * instead of adding a row. Dropping it outright left the call fatherless, and a fatherless child is drawn
       * outside the program that asked for it, which is why a program with a single inner call showed none.
       */
      const parts = getUiState().messages.at(-1)?.content ?? [];
      const existing = parts.find((part) => part.type === "tool-call" && part.toolCallId === event.toolCallId);
      const existingParent = existing !== undefined && existing.type === "tool-call" ? existing.parent : undefined;
      if (existing !== undefined) {
        if (event.parent === undefined || existingParent !== undefined) return;
        const parent = event.parent;
        updateLastAssistant((content) => content.map((part) => (
          part.type === "tool-call" && part.toolCallId === event.toolCallId ? { ...part, parent } : part
        )));
        commit();
        return;
      }
      updateLastAssistant((content) => [...content, {
        args: event.args,
        argsText: JSON.stringify(event.args),
        toolCallId: uniqueToolCallId(event.toolCallId),
        toolName: event.name,
        ...(event.parent === undefined ? {} : { parent: event.parent }),
        type: "tool-call" as const,
      }]);
      commit();
      return;
    }
    case "tool/result": {
      updateLastAssistant((content) => content.map((part) => (
        part.type === "tool-call" && part.toolCallId === (toolCallIdAlias.get(event.toolCallId) ?? event.toolCallId)
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
        /* A run that ended without confirming a step must not leave it reading as work still in flight. */
        if (plan !== null && plan.steps.some(step => step.status === "in_progress")) {
          plan = Object.freeze({ steps: Object.freeze(plan.steps.map(step => (step.status === "in_progress" ? { ...step, status: "pending" as const } : step))) });
        }
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
