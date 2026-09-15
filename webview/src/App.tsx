import { useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  AuiIf,
  useLocalRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { createGalaxyChatModelAdapter } from "./galaxy-model-adapter";
import { GalaxyTools } from "./tools";
import { ApprovalBar } from "./components/ApprovalBar";
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

function Composer() {
  return (
    <ComposerPrimitive.Root className="composer">
      <ComposerPrimitive.Input
        submitOnEnter
        placeholder="Hỏi về code, tạo/sửa file, chạy lệnh…"
        className="composer-input"
        aria-label="Message Galaxy Code"
      />
      <div className="composer-actions">
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel className="btn btn-danger">■ Dừng</ComposerPrimitive.Cancel>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send className="btn btn-primary">Gửi ⏎</ComposerPrimitive.Send>
        </AuiIf>
      </div>
    </ComposerPrimitive.Root>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">✦</div>
      <div className="empty-title">Galaxy Code</div>
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
  const adapter = useMemo(() => createGalaxyChatModelAdapter(), []);
  const runtime = useLocalRuntime(adapter);

  useEffect(() => {
    announceReady();
    return subscribeHostInfo(setInfo);
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <GalaxyTools />
      <div className="app-shell">
        <header className="app-header">
          <span className="app-title">Galaxy Code</span>
          <span className="app-subtitle">
            {info ? `${info.model} — ${info.workspaceName}` : "đang kết nối…"}
          </span>
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
        <Composer />
      </div>
    </AssistantRuntimeProvider>
  );
}
