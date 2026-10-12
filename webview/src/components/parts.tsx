import { useState, useSyncExternalStore } from "react";
import { getPreferences, subscribePreferenceChanges } from "../preferences";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { getUiState, subscribeUiState, type UiToolPart } from "../ui-store";
import { useT } from "../i18n";
import { ReasoningIcon } from "./icons";
import { DshDisclosureRow } from "./DshDisclosureRow";
import { DshButton } from "./DshButton";
import { runCommand } from "../host-bridge";

/* The label table is shared with the TUI, so a tool reads the same in both hosts. */
import { toolLabel } from "@galaxy-stack/ai-coder-core/tools";

/*
 * One shared array: the primitive memoizes on its props, and a fresh array each render would defeat that.
 * GFM is what turns the model's pipe tables into real tables instead of raw text with dashes.
 */
const REMARK_PLUGINS = [remarkGfm];

/**
 * One fenced block the way a chat transcript should read: the language on the left, a copy button on the right,
 * and the code underneath. Inline code stays inline — react-markdown routes both through `code`, and a snippet
 * with no language and no newline is a word in a sentence, not a block.
 */
function CodeBlock(props: { className?: string; children?: React.ReactNode }) {
  const t = useT();
  /*
   * Every hook sits above the inline return below. react-markdown routes inline code through this component too,
   * and a hook after that return means an inline snippet renders one hook fewer than a fenced block: React throws
   * "rendered more hooks than during the previous render" and the whole panel goes blank.
   */
  const [copied, setCopied] = useState(false);
  const match = /language-([\w+#.-]+)/.exec(props.className ?? "");
  const text = String(props.children ?? "").replace(/\n$/, "");
  if (match === null && text.indexOf(String.fromCharCode(10)) === -1) return <code>{text}</code>;
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); window.setTimeout(() => { setCopied(false); }, 1400); },
      () => {},
    );
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{match?.[1] ?? "text"}</span>
        <span className="code-actions">
          {match !== null && SHELL_LANGUAGES.has(match[1].toLowerCase()) ? (
            <DshButton type="button" size="sm" variant="ghost" onClick={() => { runCommand(text); }}>{t("Chạy")}</DshButton>
          ) : null}
          <DshButton type="button" size="sm" variant="ghost" onClick={copy}>{copied ? t("Đã copy") : t("Copy")}</DshButton>
        </span>
      </div>
      <pre className="code-body"><code>{text}</code></pre>
    </div>
  );
}

/* react-markdown hands every `code` node here; only fenced blocks get the chrome. */
/** Languages whose blocks are commands, so the block offers to run them and not only to copy them. */
const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh", "fish", "console", "powershell", "ps1", "cmd"]);

const MARKDOWN_COMPONENTS = { code: CodeBlock };

export function TextPart() {
  return (
    <MarkdownTextPrimitive className="md-body" remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS} />
  );
}

/**
 * The model's reasoning, folded the way DSH folds it: the mark and the last line that arrived, so the row says
 * what the model is doing without spending the transcript on it. One click opens the whole reasoning.
 */
export function ReasoningPart(props: { text?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lines = (props.text ?? "").split(String.fromCharCode(10)).map((line) => line.trim()).filter((line) => line.length > 0);
  const last = lines.length > 0 ? lines[lines.length - 1] : "";
  /*
   * DSH's own disclosure row: a 24px process line whose mark becomes a chevron on hover, the last line while
   * collapsed, and the full reasoning once opened.
   */
  return (
    <DshDisclosureRow
      expandable
      icon={<ReasoningIcon />}
      open={open}
      previewChevron
      title={t("Suy luận")}
      onToggle={() => { setOpen(!open); }}
      {...(last.length === 0 ? {} : { collapsedContent: <span className="reasoning-peek">{last}</span> })}
    >
      <pre className="reasoning-body">{props.text ?? ""}</pre>
    </DshDisclosureRow>
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
  /*
   * A program's inner call belongs inside the card that asked for it. The transcript offers every part to this
   * component, so without this the same call is drawn twice: once nested, once as a row of its own.
   */
  const callId = (props as { toolCallId?: string }).toolCallId;
  const isNested = run.messages.some((message) => message.content.some((candidate) =>
    candidate.type === "tool-call" && candidate.toolCallId === callId && candidate.parent !== undefined));
  if (isNested) return null;

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