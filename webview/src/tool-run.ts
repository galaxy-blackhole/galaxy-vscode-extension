import type { UiMessage, UiToolPart } from "./ui-store";

/**
 * The run of tool calls this one belongs to. A host that shows every call as its own card floods the
 * transcript with one row per file read, so consecutive calls are rendered once — by the first of them.
 * Pure on purpose: the caller passes the message list, so the grouping is testable without a document.
 */
/**
 * Tools that only record progress. The plan UI is the user-facing record of them, so a transcript row saying
 * "Cập nhật kế hoạch" is noise — the model still sees every call in its own history.
 */
export const PLAN_TOOLS: ReadonlySet<string> = new Set(["task_checkpoint", "update_checkpoint"]);

export function toolRunFor(messages: readonly UiMessage[], toolCallId: string | undefined): readonly UiToolPart[] | undefined {
  if (toolCallId === undefined) return undefined;
  for (const message of messages) {
    const parts = message.content;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (part?.type !== "tool-call" || part.toolCallId !== toolCallId) continue;
      let start = index;
      while (start > 0 && parts[start - 1]?.type === "tool-call") start -= 1;
      let end = index;
      while (end + 1 < parts.length && parts[end + 1]?.type === "tool-call") end += 1;
      return parts
        .slice(start, end + 1)
        .filter((part): part is UiToolPart => part.type === "tool-call" && !PLAN_TOOLS.has(part.toolName));
    }
  }
  return undefined;
}