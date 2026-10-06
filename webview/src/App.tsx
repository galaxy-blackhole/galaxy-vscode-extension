import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { openSettings, setSettingsOpen, settingsOpen, subscribeSettings } from "./settings-store";
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
import { SessionPanel } from "./components/SessionPanel";
import { ModelSetup } from "./components/ModelSetup";
import { GearIcon } from "./components/icons";
import { ReasoningPart, TextPart, ToolFallback } from "./components/parts";
import { announceReady, currentHostInfo, subscribeHostInfo, type HostInfo } from "./host-bridge";

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

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">✦</div>
      <div className="empty-title">Galaxy Blackhole</div>
      <div className="empty-sub">v2 prototype · assistant-ui · Ollama</div>
      <div className="empty-hints">
        <span>“Liệt kê file trong workspace”</span>
        <span>“Đọc package.json và tóm tắt”</span>
        <span>“Tạo hello.py in ra xin chào”</span>
      </div>
    </div>
  );
}

export function App() {
  const [info, setInfo] = useState<HostInfo | null>(currentHostInfo());
  const setupOpen = useSyncExternalStore(subscribeSettings, settingsOpen);
  const runtime = useGalaxyUiRuntime(info?.workspacePath ?? "");
  const settings = info?.modelSettings ?? null;
  /* No key on the active provider means the first run cannot start: open the panel. */
  const needsKey = settings !== null && info?.credentialSource !== "environment"
    && settings.providers.some(provider => provider.active && !provider.keyConfigured);

  useEffect(() => {
    announceReady();
    return subscribeHostInfo(setInfo);
  }, []);

  useEffect(() => {
    if (needsKey) openSettings();
  }, [needsKey]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-title">Galaxy Blackhole</span>
          <span className="app-subtitle">
            {info ? `${info.model} — ${info.workspaceName}` : "đang kết nối…"}
          </span>
          {settings !== null ? (
            <button type="button" className="app-icon-btn" aria-label="Cài đặt" title="Cài đặt: model và quyền" onClick={() => setSettingsOpen(!setupOpen)}>
              <GearIcon />
            </button>
          ) : null}
        </header>
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
        {setupOpen && settings !== null ? <ModelSetup settings={settings} onClose={() => setSettingsOpen(false)} /> : null}
        <SessionPanel />
        <PlanStrip />
        <Composer info={info} />
      </div>
    </AssistantRuntimeProvider>
  );
}
