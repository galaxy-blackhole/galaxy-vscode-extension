import { useEffect, useState, useSyncExternalStore } from "react";
import { sessionAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * The sessions this workspace already has.
 *
 * The host keeps one document per session under its storage root, so closing the panel, reloading the
 * window or restarting the editor still shows the conversation. Opening one replaces the transcript.
 */
export function SessionPanel() {
  const { activeSessionId, sessions } = useSyncExternalStore(subscribeUiState, getUiState);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) sessionAction({ type: "list" }); }, [open]);
  return (
    <>
      <button
        type="button"
        className="session-chip"
        title="Phiên đã lưu của workspace này"
        onClick={() => setOpen(value => !value)}
      >
        {sessions.length > 0 ? "Phiên · " + String(sessions.length) : "Phiên"}
      </button>
      {open && (
        <div className="session-panel" aria-label="Danh sách phiên">
          <div className="session-head">
            <span>Phiên của workspace</span>
            <button type="button" className="session-new" onClick={() => { sessionAction({ type: "new" }); setOpen(false); }}>Phiên mới</button>
          </div>
          {sessions.length === 0
            ? <p className="session-empty">Chưa có phiên nào được lưu.</p>
            : (
              <ul className="session-list">
                {sessions.map(item => (
                  <li key={item.id} className={item.id === activeSessionId ? "session-item session-item-active" : "session-item"}>
                    <button type="button" className="session-open" onClick={() => { sessionAction({ type: "open", id: item.id }); setOpen(false); }}>
                      <span className="session-title">{item.title}</span>
                      <span className="session-meta">{String(item.messageCount)} tin · {item.updatedAt.slice(0, 16).replace("T", " ")}</span>
                    </button>
                    <button type="button" className="session-delete" aria-label={"Xoá phiên " + item.title} onClick={() => sessionAction({ type: "delete", id: item.id })}>✕</button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </>
  );
}
