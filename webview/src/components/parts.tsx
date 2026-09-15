import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

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
  const [open, setOpen] = useState(false);
  const part = props;
  const running = part.status?.type === "running";
  const failed = part.isError === true;
  const done = part.result !== undefined && !failed;
  const status = running ? "running" : failed ? "error" : done ? "done" : "pending";
  return (
    <div className={`tool-card tool-${status}`}>
      <button className="tool-header" onClick={() => setOpen((v) => !v)}>
        <span className="tool-icon">{status === "running" ? "⏳" : status === "error" ? "✗" : status === "done" ? "✓" : "◔"}</span>
        <span className="tool-name">{part.toolName}</span>
        <span className="tool-status">{status}</span>
        <span className="tool-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
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
