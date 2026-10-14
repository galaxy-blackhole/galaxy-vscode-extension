import { useSyncExternalStore } from "react";
import { getUiState, openSession, refreshSessions, startNewSession, subscribeUiState } from "./ui-store";

/**
 * The sessions of this workspace, newest first as the host lists them.
 *
 * A conversation is not the product: the header should say what this session is about, and the way back to every other
 * session belongs next to it, the way every editor with a session list does it.
 */
export function SessionsPage({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const { activeSessionId, sessions } = useSyncExternalStore(subscribeUiState, getUiState);
  return (
    <div className="sessions-page">
      <div className="sessions-head">
        <span>Phiên trong workspace này</span>
        <button type="button" className="sessions-new" onClick={() => { startNewSession(); onOpen(); }}>
          Phiên mới
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="sessions-empty">Chưa có phiên nào được lưu.</p>
      ) : (
        <ul className="sessions-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className={"sessions-row" + (session.id === activeSessionId ? " is-active" : "")}
                onClick={() => { openSession(session.id); onOpen(); }}
              >
                <span className="sessions-title">{session.title}</span>
                <span className="sessions-meta">{session.messageCount} tin nhắn</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Refreshes the list whenever the page is opened, so it is never a stale snapshot. */
export function loadSessions(): void {
  refreshSessions();
}
