import { useEffect, useState } from "react";
import { resolveApproval, subscribePendingApprovals } from "../host-bridge";
import { DshButton } from "./DshButton";
import { useT } from "../i18n";

type Pending = { requestId: string; tool: string; args: Record<string, unknown>; reason: string };

export function ApprovalBar() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => subscribePendingApprovals(setPending), []);
  if (!pending) return null;
  /*
   * Answer, then clear. The host asks again for the next high-risk command, and a bar that looks identical either way
   * reads as a dead button: clearing it makes the decision visible, and the next prompt visibly a new one.
   */
  const answer = (approved: boolean) => {
    const requestId = pending.requestId;
    setPending(null);
    resolveApproval(requestId, approved);
  };
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
        <DshButton variant="primary" onClick={() => { answer(true); }}>{t("Cho phép")}</DshButton>
        <DshButton variant="ghost" onClick={() => { answer(false); }}>{t("Từ chối")}</DshButton>
      </div>
    </div>
  );
}
