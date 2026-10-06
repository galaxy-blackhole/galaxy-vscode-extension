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

function ModelChip({ info }: { info: HostInfo | null }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"main" | "models">("main");
  const rootRef = useRef<HTMLDivElement>(null);
  const { thinking } = useSyncExternalStore(subscribeUiState, getUiState);
  const activeProvider = info?.modelSettings?.providers.find(provider => provider.active);
  const models = activeProvider?.models ?? [];
  const activeModel = info?.model ?? models[0]?.id ?? "";
  const options = thinking?.options ?? [];
  const choice = thinking?.choice ?? "default";
  const index = Math.max(0, options.findIndex(option => option.value === choice));
  const current = options[index];
  useDismiss(open, () => { setOpen(false); setPanel("main"); }, rootRef);
  return (
    <div ref={rootRef} className="permission-root">
      <button
        type="button"
        className="composer-chip chip-model"
        title={"Model: " + (activeModel.length > 0 ? activeModel : "chưa rõ")}
        onClick={() => setOpen(v => !v)}
      >
        <span className="chip-label">{activeModel.length > 0 ? activeModel : "Model"}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="permission-menu model-menu" role="menu">
          <div className="thinking-head">
            <span className="thinking-mark" aria-hidden="true">⚡</span>
            <span className={"thinking-value" + (choice === "default" ? "" : " title-gold")}>{current?.label ?? "Mặc định"}</span>
            <button type="button" className="thinking-reset" aria-label="Về mặc định" title="Về mặc định" disabled={choice === "default"} onClick={() => setThinking("default")}>↺</button>
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
          ) : (
            <div className="thinking-slider-wrap">
              <input
                type="range"
                className="thinking-slider"
                min={0}
                max={Math.max(0, options.length - 1)}
                step={1}
                value={index}
                aria-label="Mức suy luận"
                onChange={event => setThinking(options[Number(event.target.value)]?.value ?? "default")}
              />
              <div className="thinking-stops" aria-hidden="true">
                {options.map((option, stop) => (
                  <span key={option.value} className={"stop" + (stop === index ? " stop-active" : "")} title={option.label} />
                ))}
              </div>
              <div className="thinking-labels" aria-hidden="true">
                <span>{options[0]?.label ?? ""}</span>
                <span>{options[options.length - 1]?.label ?? ""}</span>
              </div>
            </div>
          )}
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
