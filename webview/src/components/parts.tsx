import { useState, useSyncExternalStore } from "react";
import { getPreferences, subscribePreferenceChanges } from "../preferences";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

/* The label table is shared with the TUI, so a tool reads the same in both hosts. */
import { toolLabel } from "@galaxy-stack/ai-coder-core/tools";

export function TextPart() {
  return <MarkdownTextPrimitive className="md-body" />;
}

export function ReasoningPart(props: { text?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reasoning">
      <button className="reasoning-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} Reasoning
      </button>
      {open && <pre className="reasoning-body">{props.text ?? ""}</pre>}
    </div>
  );
}

function preview(value: unknown, max = 800): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  return text.length > max ? text.slice(0, max) + "\n…(truncated)" : text;
}

export const ToolFallback: ToolCallMessagePartComponent = function ToolFallback(props) {
  /* "Gọn" hides the args/result detail so a long run reads as a list of tool names. */
  const compact = useSyncExternalStore(subscribePreferenceChanges, getPreferences).workDetail === "compact";
  const [open, setOpen] = useState(false);
  const part = props;
  const running = part.status?.type === "running";
  const failed = part.isError === true;
  const done = part.result !== undefined && !failed;
  const status = running ? "running" : failed ? "error" : done ? "done" : "pending";
  return (
    <div className={`tool-card tool-${status}`}>
      <button className="tool-header" onClick={() => { if (!compact) setOpen((v) => !v); }}>
        <span className="tool-icon">{status === "running" ? "⏳" : status === "error" ? "✗" : status === "done" ? "✓" : "◔"}</span>
        <span className="tool-name" title={part.toolName}>{toolLabel(part.toolName, part.args)}</span>
        <span className="tool-status">{status}</span>
        {compact ? null : <span className="tool-caret">{open ? "▾" : "▸"}</span>}
      </button>
      {open && !compact && (
        <div className="tool-detail">
          <div className="tool-section-label">args</div>
          <pre className="tool-pre">{preview(part.argsText || part.args)}</pre>
          {part.result !== undefined && (
            <>
              <div className="tool-section-label">result</div>
              <pre className="tool-pre">{preview(part.result)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};
