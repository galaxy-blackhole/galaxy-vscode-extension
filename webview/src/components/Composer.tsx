import { useState, useSyncExternalStore } from "react";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUpIcon, ChevronDownIcon, PlusIcon, ShieldIcon, StopIcon } from "./icons";
import { getPermissionMode, setPermissionMode, subscribePermissionMode } from "../permission-mode";
import type { HostInfo } from "../host-bridge";

function ModeChip() {
  const mode = useSyncExternalStore(subscribePermissionMode, getPermissionMode);
  const auto = mode === "auto";
  return (
    <button
      type="button"
      className={`composer-chip ${auto ? "chip-auto" : ""}`}
      title={auto
        ? "Toàn quyền tiếp cận: các thao tác ghi file/chạy lệnh không cần phê duyệt (prototype)"
        : "Chế độ thủ công: write_file và run_command luôn hỏi trước khi chạy"}
      onClick={() => setPermissionMode(auto ? "manual" : "auto")}
    >
      <ShieldIcon />
      <span>{auto ? "Toàn quyền tiếp cận" : "Cần phê duyệt"}</span>
    </button>
  );
}

function ModelChip({ info }: { info: HostInfo | null }) {
  return (
    <button type="button" className="composer-chip chip-model" title={`${info?.model ?? ""} — ${info?.baseUrl ?? ""}`}>
      <span>{info?.model ?? "…"}</span>
      <ChevronDownIcon />
    </button>
  );
}

export function Composer({ info }: { info: HostInfo | null }) {
  const [attachOpen, setAttachOpen] = useState(false);
  void attachOpen;
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
            onClick={() => setAttachOpen(false)}
          >
            <PlusIcon />
          </button>
          <ModeChip />
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
