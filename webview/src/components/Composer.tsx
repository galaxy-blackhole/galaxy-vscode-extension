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
import { setPermissionMode as sendPermissionMode } from "../host-bridge";
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
          <button type="button" role="menuitem" className="permission-option" onClick={() => { openSettings(); setOpen(false); }}>
            <span className="option-icon"><GearIcon /></span>
            <span className="option-texts">
              <span className="option-title">Cài đặt</span>
              <span className="option-desc">Model, nhà cung cấp và chế độ phê duyệt</span>
            </span>
          </button>
        </div>
      )}
      <span hidden>{active?.title ?? ""}</span>
    </div>
  );
}

function ModelChip({ info }: { info: HostInfo | null }) {
  const [open, setOpen] = useState(false);
  const url = info?.modelLibraryUrl;
  return (
    <div className="permission-root">
      <button
        type="button"
        className="composer-chip chip-model"
        title={url ? `Auto = entry 'manual' trong ~/.galaxy/config.json → ${info?.model ?? ""}` : `${info?.model ?? ""} — ${info?.baseUrl ?? ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chip-label">{info?.model ?? "Model"}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="permission-menu model-menu" role="menu">
          <button type="button" role="menuitem" className="permission-option option-active" onClick={() => setOpen(false)}>
            <span className="option-icon"><CheckIcon /></span>
            <span className="option-texts">
              <span className="option-title title-gold">{info?.model ?? "Model"}</span>
              <span className="option-desc">
                {info ? `Entry 'manual' trong ~/.galaxy/config.json → ${info.model} (thinking: max)` : "Đang đọc ~/.galaxy/config.json…"}
              </span>
            </span>
          </button>
          {url && (
            <button type="button" role="menuitem" className="permission-option" onClick={() => { openExternal(url); setOpen(false); }}>
              <span className="option-icon"><ChevronDownIcon /></span>
              <span className="option-texts">
                <span className="option-title">Mở thư viện model</span>
                <span className="option-desc">{url}</span>
              </span>
            </button>
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
