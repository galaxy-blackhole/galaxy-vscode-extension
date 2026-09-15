import { useSyncExternalStore } from "react";
import { listPendingApprovals, resolveApproval, subscribeApprovals } from "../approvals";

export function ApprovalBar() {
  useSyncExternalStore(subscribeApprovals, listPendingApprovals);
  const pending = listPendingApprovals()[0] ?? null;
  if (!pending) return null;
  const preview = pending.toolName === "write_file"
    ? String(pending.args.content ?? "").slice(0, 600)
    : JSON.stringify(pending.args).slice(0, 600);
  return (
    <div className="approval-bar">
      <div className="approval-title">
        <span className="approval-badge">{pending.toolName}</span>
        {pending.reason}
      </div>
      <pre className="approval-preview">{preview}</pre>
      <div className="approval-actions">
        <button className="btn btn-approve" onClick={() => resolveApproval(pending.toolCallId, true)}>Allow</button>
        <button className="btn btn-deny" onClick={() => resolveApproval(pending.toolCallId, false)}>Deny</button>
      </div>
    </div>
  );
}
