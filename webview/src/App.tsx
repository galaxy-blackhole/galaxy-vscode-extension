import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { openSettingsTab } from "./host-bridge";
import {
  AssistantRuntimeProvider,
  AuiIf,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { useGalaxyUiRuntime } from "./galaxy-ui-runtime";
import { ApprovalBar } from "./components/ApprovalBar";
import { Composer } from "./components/Composer";
import { PlanStrip } from "./components/PlanStrip";
import { ChangesCard } from "./components/ChangesCard";
import { PlanReviewCard } from "./components/PlanReviewCard";
import { PresetBadge } from "./components/PresetBadge";
import { GoalStrip } from "./components/GoalStrip";
import { GearIcon, NewThreadIcon } from "./components/icons";
import { startNewThread } from "./host-bridge";
import { ReasoningPart, TextPart, ToolFallback } from "./components/parts";
import { announceReady, currentHostInfo, subscribeHostInfo, type HostInfo } from "./host-bridge";
import { getPreferences, subscribePreferenceChanges } from "./preferences";
import { useT } from "./i18n";
import { getUiState, subscribeUiState, skipBoot } from "./ui-store";

/** The owner's own words: plain text, no reasoning parts and no tool rows. */
function UserMessage() {
  return (
    <div className="msg msg-user">
      <MessagePrimitive.Parts components={{ Text: TextPart }} />
    </div>
  );
}

function AssistantMessage() {
  return (
    <div className="msg msg-assistant">
      <MessagePrimitive.Parts
        components={{
          Text: TextPart,
          Reasoning: ReasoningPart,
          tools: { Fallback: ToolFallback },
        }}
      />
    </div>
  );
}

/**
 * The two boot states. The index phase holds the panel, because nothing can be read before the workspace is
 * indexed. The MCP phase does not: the transcript opens and the row only says what is still warming up.
 */
function BootScreen({ message }: { message: string }) {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <span className="boot-spinner" aria-hidden="true" />
      <span className="boot-text">{message.length > 0 ? message : "Đang chuẩn bị workspace…"}</span>
    </div>
  );
}

function BootNotice({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="boot-notice">
      <span className="boot-spinner" aria-hidden="true" />
      <span className="boot-text">{message.length > 0 ? message : t("Đang chuẩn bị workspace…")}</span>
      <button type="button" className="boot-skip" onClick={() => { skipBoot(); }}>{t("Bỏ qua")}</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">✦</div>
      <div className="empty-title">Galaxy Blackhole</div>
      <div className="empty-sub">Trợ lý lập trình trong workspace của bạn</div>
      <div className="empty-hints">
        <span>“Liệt kê file trong workspace”</span>
        <span>“Đọc package.json và tóm tắt”</span>
        <span>“Tạo hello.py in ra xin chào”</span>
      </div>
    </div>
  );
}

export function App() {
  const t = useT();
  const [info, setInfo] = useState<HostInfo | null>(currentHostInfo());
  const runtime = useGalaxyUiRuntime(info?.workspacePath ?? "");
  const settings = info?.modelSettings ?? null;
  /* Đổi cỡ chữ trong Cài đặt là đổi luôn nội dung hội thoại. */
  const fontSize = useSyncExternalStore(subscribePreferenceChanges, getPreferences).fontSize;
  const boot = useSyncExternalStore(subscribeUiState, getUiState).boot;
  useEffect(() => { document.documentElement.style.setProperty("--ui-font-size", fontSize + "px"); }, [fontSize]);
  /* No key on the active provider means the first run cannot start: open the panel. */
  const needsKey = settings !== null && info?.credentialSource !== "environment"
    && settings.providers.some(provider => provider.active && !provider.keyConfigured);

  useEffect(() => {
    announceReady();
    return subscribeHostInfo(setInfo);
  }, []);

  useEffect(() => {
    if (needsKey) openSettingsTab();
  }, [needsKey]);

  if (!boot.done && boot.phase === "index") return <BootScreen message={boot.message} />;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-title">Galaxy Blackhole</span>
          <span className="app-header-actions">
            <button type="button" className="app-icon-btn" aria-label="Trò chuyện mới" title="Trò chuyện mới (xoá nội dung, mở phiên mới)" onClick={() => startNewThread()}>
              <NewThreadIcon />
            </button>
            {settings !== null ? (
              <button type="button" className="app-icon-btn" aria-label="Cài đặt" title="Cài đặt: model và quyền" onClick={() => openSettingsTab()}>
                <GearIcon />
              </button>
            ) : null}
          </span>
        </header>
        {!boot.done && boot.phase === "mcp" ? <BootNotice message={boot.message} /> : null}
        <ThreadPrimitive.Root className="thread-root">
          <ThreadPrimitive.Viewport className="thread-viewport">
            <ThreadPrimitive.Empty>
              <EmptyState />
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ThreadPrimitive.Viewport>
          <ThreadPrimitive.ScrollToBottom className="scroll-to-bottom">↓</ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Root>
        <ApprovalBar />
        <GoalStrip />
        <PresetBadge />
        <PlanReviewCard />
        <ChangesCard />
        <PlanStrip />
        <Composer info={info} />
      </div>
    </AssistantRuntimeProvider>
  );
}
