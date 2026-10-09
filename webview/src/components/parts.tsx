import { useState, useSyncExternalStore } from "react";
import { getPreferences, subscribePreferenceChanges } from "../preferences";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { getUiState, subscribeUiState, type UiToolPart } from "../ui-store";
import { useT } from "../i18n";

/* The label table is shared with the TUI, so a tool reads the same in both hosts. */
import { toolLabel } from "@galaxy-stack/ai-coder-core/tools";

/*
 * One shared array: the primitive memoizes on its props, and a fresh array each render would defeat that.
 * GFM is what turns the model's pipe tables into real tables instead of raw text with dashes.
 */
const REMARK_PLUGINS = [remarkGfm];

export function TextPart() {
  return <MarkdownTextPrimitive className="md-body" remarkPlugins={REMARK_PLUGINS} />;
}

/**
 * The model's reasoning. It opens by itself while the run is going, so the thinking is visible as it arrives
 * instead of hiding behind a collapsed row; one click pins it open or shut.
 */
export function ReasoningPart(props: { text?: string }) {
  const t = useT();
  const [pinned, setPinned] = useState<boolean | undefined>(undefined);
  const streaming = useSyncExternalStore(subscribeUiState, getUiState).status === "running";
  const open = pinned ?? streaming;
  return (
    <div className="reasoning">
      <button className="reasoning-toggle" onClick={() => { setPinned(!open); }}>
        {open ? "▾" : "▸"} {t("Suy luận")}
      </button>
      {open ? <pre className="reasoning-body">{props.text ?? ""}</pre> : null}
    </div>
  );
}

function preview(value: unknown, max = 800): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  return text.length > max ? text.slice(0, max) + "\n…(truncated)" : text;
}


import { nestedToolPartsFor, PLAN_TOOLS, toolRunFor } from "../tool-run";
function statusOf(part: UiToolPart): "running" | "error" | "done" | "pending" {
  if (part.result === undefined) return part.isError === true ? "error" : "pending";
  return part.isError === true ? "error" : "done";
}

function ToolDetail({ part }: { part: UiToolPart }) {
  return (
    <div className="tool-detail">
      <div className="tool-section-label">{toolLabel(part.toolName, part.args)}</div>
      <pre className="tool-pre">{preview(part.argsText || part.args)}</pre>
      {part.result !== undefined && (
        <>
          <div className="tool-section-label">result</div>
          <pre className="tool-pre">{preview(part.result)}</pre>
        </>
      )}
    </div>
  );
}

export const ToolFallback: ToolCallMessagePartComponent = function ToolFallback(props) {
  /* "Gọn" hides the args/result detail so a long run reads as a list of tool names. */
  const compact = useSyncExternalStore(subscribePreferenceChanges, getPreferences).workDetail === "compact";
  const t = useT();
  /* Subscribed, not read once: the run grows as results arrive, and the group must follow it. */
  const run = useSyncExternalStore(subscribeUiState, getUiState);
  const group = toolRunFor(run.messages, (props as { toolCallId?: string }).toolCallId);
  const [open, setOpen] = useState(false);
  const part = props;

  /* The plan strip shows this already; a row for it would be a row about bookkeeping. */
  if (PLAN_TOOLS.has(part.toolName)) return null;

  if (group !== undefined && group.length > 1) {
    /* Only the head of the run renders it; the rest of the parts collapse into nothing. */
    if (group[0]?.toolCallId !== (props as { toolCallId?: string }).toolCallId) return null;
    const failed = group.filter(part => part.isError === true).length;
    const running = group.some(part => statusOf(part) === "running" || statusOf(part) === "pending");
    const status = failed > 0 ? "error" : running ? "running" : "done";
    /* The header stays a count: the names are what the expanded list is for, and the tooltip carries them too. */
    return (
      <div className={`tool-card tool-group tool-${status}`}>
        <button className="tool-header" onClick={() => { setOpen(value => !value); }}>
          <span className="tool-icon">{status === "running" ? "⏳" : status === "error" ? "✗" : "✓"}</span>
          <span className="tool-name" title={group.map(part => part.toolName).join("\n")}>
            {t("Đã gọi")} {group.length} {t("công cụ")}
          </span>
          <span className="tool-status">{status}</span>
          <span className="tool-caret">{open ? "▾" : "▸"}</span>
        </button>
        {open && !compact ? group.map(part => <ToolDetail key={part.toolCallId} part={part} />) : null}
      </div>
    );
  }

  /* A program's calls are its children: always visible, one indent deeper, never a group of their own. */
  const children = nestedToolPartsFor(run.messages, part.toolCallId);
  const running = part.status?.type === "running";
  const failed = part.isError === true;
  const done = part.result !== undefined && !failed;
  const status = running ? "running" : failed ? "error" : done ? "done" : "pending";
  const label = toolLabel(part.toolName, part.args);
  return (
    <div className={`tool-card tool-${status}`}>
      <button className="tool-header" onClick={() => { if (!compact) setOpen((value) => !value); }}>
        <span className="tool-icon">{status === "running" ? "⏳" : status === "error" ? "✗" : status === "done" ? "✓" : "•"}</span>
        <span className="tool-name" title={part.toolName}>{label}</span>
        <span className="tool-status">{status}</span>
        {compact ? null : <span className="tool-caret">{open ? "▾" : "▸"}</span>}
      </button>
      {children.length === 0 ? null : children.map(child => (
        <div className="tool-nested-row" key={child.toolCallId}>
          <span className="tool-icon">{child.isError === true ? "✗" : child.result === undefined ? "⏳" : "✓"}</span>
          <span className="tool-name">{toolLabel(child.toolName, child.args)}</span>
        </div>
      ))}
      {open && !compact && <ToolDetail part={{ args: part.args, argsText: part.argsText ?? "", isError: part.isError, result: part.result, toolCallId: "single", toolName: part.toolName, type: "tool-call" }} />}
    </div>
  );
};