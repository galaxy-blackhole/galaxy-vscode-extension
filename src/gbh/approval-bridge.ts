/*
 * The approval bridge: turns a host waterfall into one question in the editor and one answer back.
 *
 * The host asks through the forwarded event stream ("approval/request"); the client answers with an
 * ApprovalOutcome string — allowed-once, rejected, cancelled, unavailable — wrapped as a waterfall
 * result. Anything the bridge does not own answers {kind:"next"} so the host fallback still runs.
 */
import type { WaterfallOutcome, WaterfallRequest } from "./events";

/** What the editor shows for one approval request. */
export interface ApprovalPrompt {
  readonly toolName: string;
  readonly reason?: string;
  readonly displayReason?: string;
  readonly callId?: string;
}

/** The answer the user picked. */
export type ApprovalChoice = "allow" | "reject" | undefined;

/** The event name the host uses for approvals. */
export const APPROVAL_EVENT = "approval/request";

/**
 * Read the request the host sent into the small shape the editor needs.
 * @param request - the waterfall request body.
 * @returns tool name (or a placeholder) plus the optional reasons.
 */
export function describeApproval(request: Record<string, unknown>): ApprovalPrompt {
  const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
  return {
    toolName: text(request.toolName) ?? "công cụ không tên",
    ...(text(request.reason) === undefined ? {} : { reason: text(request.reason) }),
    ...(text(request.displayReason) === undefined ? {} : { displayReason: text(request.displayReason) }),
    ...(text(request.callId) === undefined ? {} : { callId: text(request.callId) }),
  };
}

/**
 * Map what the user picked to the host's ApprovalOutcome.
 * @param choice - allow, reject, or undefined when the question was dismissed.
 * @returns the waterfall outcome to send.
 */
export function outcomeForChoice(choice: ApprovalChoice): WaterfallOutcome {
  if (choice === "allow") return { kind: "result", value: "allowed-once" };
  if (choice === "reject") return { kind: "result", value: "rejected" };
  // Dismissed: let the host's own fallback decide, so the run never hangs on a closed panel.
  return { kind: "next" };
}

/** What the bridge needs from the editor and from the stream. */
export interface ApprovalBridgeDeps {
  readonly ask: (prompt: ApprovalPrompt) => Promise<ApprovalChoice>;
  readonly answer: (eventId: string, outcome: WaterfallOutcome) => Promise<void>;
  readonly log?: (message: string) => void;
}

/** Routes host waterfalls to the editor. */
export class ApprovalBridge {
  private readonly deps: ApprovalBridgeDeps;

  /**
   * @param deps - the editor question and the stream answer.
   */
  constructor(deps: ApprovalBridgeDeps) {
    this.deps = deps;
  }

  /**
   * Handle one waterfall frame.
   * @param request - the frame as the stream parsed it.
   */
  async handle(request: WaterfallRequest): Promise<void> {
    if (request.event !== APPROVAL_EVENT) {
      await this.deps.answer(request.eventId, { kind: "next" });
      return;
    }
    const prompt = describeApproval(request.request);
    let choice: ApprovalChoice;
    try {
      choice = await this.deps.ask(prompt);
    } catch (error) {
      this.deps.log?.("hỏi duyệt lỗi: " + (error instanceof Error ? error.message : String(error)));
      choice = undefined;
    }
    await this.deps.answer(request.eventId, outcomeForChoice(choice));
  }
}
