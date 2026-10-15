import { useEffect, useState } from "react";
import { answerCredential, subscribeCredentialRequests } from "../host-bridge";
import { DshButton } from "./DshButton";
import type { HostToWebviewMessage } from "../../../src/protocol";

type Pending = Extract<HostToWebviewMessage, { type: "credential-request" }>;

/**
 * The masked prompt a run gets when it needs a credential configuration cannot supply.
 *
 * The value lives in this field and then in the host's key store, nowhere else: it is never sent to the model, and the
 * host masks it again on the way out. Cancelling says no credential was supplied rather than sending an empty one.
 */
export function CredentialPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => subscribeCredentialRequests((request) => { setValue(""); setPending(request); }), []);
  if (pending === null) return null;
  const answer = (answer: string | null) => {
    const requestId = pending.requestId;
    setPending(null);
    setValue("");
    answerCredential(requestId, answer);
  };
  return (
    <form className="credential-prompt" onSubmit={(event) => { event.preventDefault(); answer(value); }}>
      <div className="approval-title">
        <span className="approval-badge">{pending.credential}</span>
        <span className="approval-reason">{pending.message}</span>
      </div>
      <input
        autoFocus
        type="password"
        value={value}
        placeholder={pending.placeholder ?? ""}
        aria-label={pending.message}
        onChange={(event) => setValue(event.target.value)}
      />
      <DshButton type="submit">Lưu</DshButton>
      <DshButton type="button" onClick={() => answer(null)}>Huỷ</DshButton>
    </form>
  );
}
