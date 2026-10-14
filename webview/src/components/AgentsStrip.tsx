import { useState, useSyncExternalStore } from "react";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * The children this session started — and what each of them said.
 *
 * Delegation is only trustworthy if it is visible, and a status word is not visibility: a child that ran for two
 * minutes and produced nothing looks exactly like one that produced the answer you needed. So a chip opens onto the
 * task it was given and the words it answered with, both kept by the host that watched them happen.
 */
export function AgentsStrip() {
  const { agents } = useSyncExternalStore(subscribeUiState, getUiState);
  const [openId, setOpenId] = useState<string | null>(null);
  if (agents.length === 0) return null;
  const open = agents.find((agent) => agent.id === openId) ?? null;
  return (
    <div className="agents">
      <div className="agents-strip">
        {agents.map((agent) => (
          <button
            className={"agent-chip agent-" + agent.status + (agent.id === openId ? " agent-open" : "")}
            key={agent.id}
            onClick={() => { setOpenId(agent.id === openId ? null : agent.id); }}
            title="Bấm để xem việc đã giao và câu trả lời"
            type="button"
          >
            {`${agent.id} · ${agent.description.slice(0, 24)}`}
            <span className="agent-status">{agent.status}</span>
          </button>
        ))}
      </div>
      {open === null ? null : (
        <div className="agent-detail">
          <div className="agent-detail-row">
            <span className="agent-detail-label">Việc đã giao</span>
            <span className="agent-detail-text">{open.task ?? open.description}</span>
          </div>
          <div className="agent-detail-row">
            <span className="agent-detail-label">Con trả lời</span>
            <pre className="agent-detail-answer">
              {open.result === undefined || open.result.length === 0
                ? "(" + open.status + " — chưa có câu trả lời)"
                : open.result.slice(0, 4000)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
