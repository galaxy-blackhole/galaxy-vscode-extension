import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import {
  ArrowUpIcon, CheckIcon, ChevronDownIcon, ClockIcon, GearIcon,
  HandIcon, PlusIcon, ShieldIcon, StopIcon,
} from "./icons";
import {
  getPermissionMode, setPermissionMode, subscribePermissionMode,
  type PermissionMode,
} from "../permission-mode";
import { setModel, setPermissionMode as sendPermissionMode, setThinking } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { openSettings } from "../settings-store";
import { openExternal, type HostInfo } from "../host-bridge";

interface ModeOption {
  readonly mode: PermissionMode;
  readonly icon: () => React.ReactNode;
  readonly title: string;
  readonly description: string;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  { mode: "ask", icon: () => <HandIcon />, title: "Yêu cầu phê duyệt", description: "Luôn hỏi khi chỉnh sửa tệp và chạy lệnh" },
  { mode: "smart", icon: () => <ClockIcon />, title: "Phê duyệt giúp tôi", description: "Chỉ hỏi khi chạy lệnh trong terminal" },
  { mode: "auto", icon: () => <ShieldIcon />, title: "Toàn quyền truy cập", description: "Truy cập không giới hạn vào mọi tệp trên máy tính của bạn" },
];

function PermissionMenu() {
  const mode = useSyncExternalStore(subscribePermissionMode, getPermissionMode);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = MODE_OPTIONS.find((option) => option.mode === mode);
  const label = mode === "auto" ? "Toàn quyền"
    : mode === "ask" ? "Yêu cầu duyệt"
    : "Duyệt giúp tôi";

  return (
    <div ref={rootRef} className="permission-root">
      <button
        type="button"
        className={`composer-chip ${mode === "auto" ? "chip-auto" : ""} ${open ? "chip-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Chọn chế độ cấp quyền cho các thao tác ghi tệp và chạy lệnh"
        onClick={() => setOpen((v) => !v)}
      >
        <ShieldIcon />
        <span className="chip-label">{label}</span>
      </button>
      {open && (
        <div className="permission-menu" role="menu">
          <div className="permission-menu-header">
            <span>Nên phê duyệt các hành động của Galaxy thế nào?</span>
          </div>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="menuitem"
              className={`permission-option ${option.mode === mode ? "option-active" : ""}`}
              onClick={() => { setPermissionMode(option.mode); sendPermissionMode(option.mode); setOpen(false); }}
            >
              <span className="option-icon">{option.icon()}</span>
              <span className="option-texts">
                <span className={`option-title ${option.mode === "auto" ? "title-gold" : ""}`}>{option.title}</span>
                <span className="option-desc">{option.description}</span>
              </span>
              {option.mode === mode && <span className="option-check"><CheckIcon /></span>}
            </button>
          ))}
        </div>
      )}
      <span hidden>{active?.title ?? ""}</span>
    </div>
  );
}

/** Close a popup when the pointer goes elsewhere or Escape is pressed — the same behaviour both menus need. */
function useDismiss(open: boolean, close: () => void, rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, rootRef]);
}

/**
 * The reasoning slider: drawn by hand because a native range input cannot show the level names, and because
 * its value came from the host, so a drag snapped back until the round-trip finished.
 */
/**
 * One tone per reasoning level: the Codex slider shifts colour as it climbs, so the level reads at a glance
 * without any labels under the track.
 */
const THINKING_TONES: Readonly<Record<string, Readonly<{ from: string; text: string; to: string }>>> = Object.freeze({
  minimal: { from: "#0ea5e9", text: "#38bdf8", to: "#22d3ee" },
  low: { from: "#3b82f6", text: "#60a5fa", to: "#22d3ee" },
  medium: { from: "#6366f1", text: "#818cf8", to: "#3b82f6" },
  high: { from: "#8b5cf6", text: "#a78bfa", to: "#6366f1" },
  xhigh: { from: "#a855f7", text: "#c084fc", to: "#8b5cf6" },
  max: { from: "#c026d3", text: "#e879f9", to: "#a855f7" },
  on: { from: "#8b5cf6", text: "#a78bfa", to: "#6366f1" },
  off: { from: "#52525b", text: "#a1a1aa", to: "#71717a" },
});
const NEUTRAL_TONE = Object.freeze({ from: "#52525b", text: "inherit", to: "#71717a" });

function thinkingTone(choice: string) {
  return THINKING_TONES[choice] ?? NEUTRAL_TONE;
}

/**
 * The reasoning slider, drawn by hand: a rounded track whose gradient is the current level's tone, stop dots
 * inside it, a white thumb, and drag from anywhere (a native range snapped back and showed no levels).
 */
function ThinkingSlider({
  options,
  index,
  onPick,
  tone,
}: {
  options: readonly Readonly<{ label: string; value: string }>[];
  index: number;
  onPick: (value: string) => void;
  tone: Readonly<{ from: string; text: string; to: string }>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const last = Math.max(0, options.length - 1);
  const ratio = last === 0 ? 1 : index / last;
  const gradient = "linear-gradient(90deg, " + tone.from + ", " + tone.to + ")";
  const pickAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || last === 0) return;
    const stop = Math.min(last, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * last)));
    const value = options[stop]?.value;
    if (value !== undefined && value !== options[index]?.value) onPick(value);
  };
  const step = (delta: number) => {
    const stop = Math.min(last, Math.max(0, index + delta));
    if (stop !== index) onPick(options[stop]!.value);
  };
  return (
    <div className="thinking-slider-wrap">
      <div
        ref={trackRef}
        className="thinking-track"
        role="slider"
        tabIndex={0}
        aria-label="Mức suy luận"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={options[index]?.label ?? ""}
        onPointerDown={event => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event.clientX);
        }}
        onPointerMove={event => { if (draggingRef.current) pickAt(event.clientX); }}
        onPointerUp={event => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); step(-1); }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); step(1); }
        }}
      >
        <span className="thinking-track-base" />
        <span className="thinking-track-fill" style={{ backgroundImage: gradient, width: (ratio * 100).toFixed(1) + "%" }} />
        {options.map((option, stop) => (
          <button
            key={option.value}
            type="button"
            tabIndex={-1}
            className={"thinking-stop" + (stop <= index ? " stop-passed" : "") + (stop === index ? " stop-current" : "")}
            style={{ left: (last === 0 ? 0 : (stop / last) * 100).toFixed(1) + "%" }}
            aria-label={option.label}
            title={option.label}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onPick(option.value)}
          />
        ))}
        <span className="thinking-thumb" style={{ left: (ratio * 100).toFixed(1) + "%" }} aria-hidden="true" />
      </div>
    </div>
  );
}

function ModelChip({ info }: { info: HostInfo | null }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"main" | "models">("main");
  const [draft, setDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { thinking } = useSyncExternalStore(subscribeUiState, getUiState);
  const activeProvider = info?.modelSettings?.providers.find(provider => provider.active);
  const models = activeProvider?.models ?? [];
  const resolvedModel = info?.model ?? models[0]?.id ?? "";
  /* The built-in provider stands for "auto": the seam picks the usable provider, the way the CLI and the web GUI read it. */
  const activeModel = activeProvider?.id === "galaxy" ? "auto" : resolvedModel;
  const options = thinking?.options ?? [];
  const stored = thinking?.choice ?? "default";
  const choice = draft ?? stored;
  const index = Math.max(0, options.findIndex(option => option.value === choice));
  const current = options[index];
  const tone = thinkingTone(choice);
  /* The host confirms a level by posting it back; until then the draft keeps the thumb where the user put it. */
  useEffect(() => { setDraft(current => (current === stored ? null : current)); }, [stored]);
  useDismiss(open, () => { setOpen(false); setPanel("main"); }, rootRef);
  const apply = (value: string) => {
    setDraft(value);
    setThinking(value);
  };
  return (
    <div ref={rootRef} className="permission-root">
      <button
        type="button"
        className="composer-chip chip-model"
        title={"Model: " + (activeModel.length > 0 ? activeModel : "chưa rõ") + (activeModel === "auto" ? " (ngầm hiểu " + resolvedModel + ")" : "")}
        onClick={() => setOpen(v => !v)}
      >
        <span className="chip-label">{activeModel.length > 0 ? activeModel : "Model"}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="permission-menu model-menu" role="menu">
          <div className="thinking-head">
            <span className="thinking-value" style={{ color: tone.text }}>{current?.label ?? "Mặc định"}</span>
          </div>
          <button type="button" className="thinking-model" aria-label="Đổi model" onClick={() => setPanel(panel === "models" ? "main" : "models")}>
            <span className="chip-label">{activeModel.length > 0 ? activeModel : "Model"}</span>
            <ChevronDownIcon />
          </button>
          {panel === "models" ? (
            <div className="thinking-models">
              {models.map(model => (
                <button
                  key={model.id}
                  type="button"
                  role="menuitem"
                  className={"permission-option" + (model.id === activeModel ? " option-active" : "")}
                  onClick={() => { setModel(model.id); setPanel("main"); }}
                >
                  <span className="option-icon">{model.id === activeModel ? <CheckIcon /> : null}</span>
                  <span className="option-texts">
                    <span className={"option-title" + (model.id === activeModel ? " title-gold" : "")}>{model.name ?? model.id}</span>
                    <span className="option-desc">{model.id}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : options.length > 0 ? (
            <ThinkingSlider options={options} index={index} onPick={apply} tone={tone} />
          ) : <p className="thinking-empty">Model này không cho chọn mức suy luận.</p>}
        </div>
      )}
    </div>
  );
}

export function Composer({ info }: { info: HostInfo | null }) {
  return (
    <ComposerPrimitive.Root className="composer-card">
      <ComposerPrimitive.Input
        submitOnEnter
        placeholder="Thử bất cứ điều gì"
        className="composer-card-input"
        aria-label="Message Galaxy Code"
        autoFocus
      />
      <div className="composer-card-footer">
        <div className="composer-footer-left">
          <button
            type="button"
            className="composer-icon-btn"
            title="Đính kèm file (chưa hỗ trợ trong prototype)"
          >
            <PlusIcon />
          </button>
          <PermissionMenu />
        </div>
        <div className="composer-footer-right">
          <ModelChip info={info} />
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel className="composer-send composer-stop" aria-label="Dừng">
              <StopIcon />
            </ComposerPrimitive.Cancel>
          </AuiIf>
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send className="composer-send" aria-label="Gửi">
              <ArrowUpIcon />
            </ComposerPrimitive.Send>
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
