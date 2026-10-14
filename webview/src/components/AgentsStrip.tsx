import { useSyncExternalStore } from "react";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * The children this session started.
 *
 * Delegation is only trustworthy if it is visible: a parent that quietly hands work to a child, and a child that
 * quietly fails, read the same as work that never happened. One chip per child, with the status the book keeps.
 */
export function AgentsStrip() {
  const { agents } = useSyncExternalStore(subscribeUiState, getUiState);
  if (agents.length === 0) return null;
  return (
    <div className="agents-strip">
      {agents.map((agent) => (
        <span className={"agent-chip agent-" + agent.status} key={agent.id} title={agent.description}>
          {`${agent.id} · ${agent.description.slice(0, 24)}`}
          <span className="agent-status">{agent.status}</span>
        </span>
      ))}
    </div>
  );
}
