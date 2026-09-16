import { useEffect, useState } from "react";
import { resolveApproval, subscribePendingApprovals } from "../host-bridge";

type Pending = { requestId: string; tool: string; args: Record<string, unknown>; reason: string };

export function ApprovalBar() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => subscribePendingApprovals(setPending), []);
  if (!pending) return null;
  const preview = pending.tool === "workspace.write" || pending.tool === "write_file"
    ? String(pending.args.content ?? "").slice(0, 600)
    : JSON.stringify(pending.args).slice(0, 600);
  return (
    <div className="approval-bar">
      <div className="approval-title">
        <span className="approval-badge">{pending.tool}</span>
        {pending.reason}
      </div>
      <pre className="approval-preview">{preview}</pre>
      <div className="approval-actions">
        <button className="btn btn-approve" onClick={() => resolveApproval(pending.requestId, true)}>Allow</button>
        <button className="btn btn-deny" onClick={() => resolveApproval(pending.requestId, false)}>Deny</button>
      </div>
    </div>
  );
}
