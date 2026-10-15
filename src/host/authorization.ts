/**
 * Asking the human for a credential, in the panel.
 *
 * The core hands a host the request; the panel hands back the answer; the key goes into the same store the settings
 * tab writes, so a key typed into a conversation is the key the next run uses. The model receives the masked form and
 * never the secret.
 */
import type { AiCoderAuthorizationOutcome, AiCoderAuthorizationPort, AiCoderAuthorizationRequest } from "@galaxy-stack/ai-coder-core/ports";

/** Enough of a secret to recognise it later, never enough to use it. A short secret has no safe window at all. */
export function maskCredential(secret: string): string {
  if (secret.length <= 8) return "…";
  return secret.slice(0, 3) + "…" + secret.slice(-4);
}

export interface ExtensionAuthorizationIo {
  /** Shows the masked input in the panel. Resolves null when nobody answers, or when the panel is gone. */
  readonly ask: (request: AiCoderAuthorizationRequest) => Promise<string | null>;
  /** Stores the secret where the settings tab stores it. */
  readonly save: (input: Readonly<{ credential: string; secret: string }>) => void;
}

export class ExtensionAuthorization implements AiCoderAuthorizationPort {
  /*
   * Written as a field rather than a constructor parameter property: the panel's tests run the file through Node's
   * type stripping, which erases types but cannot rewrite a parameter property into an assignment.
   */
  private readonly io: ExtensionAuthorizationIo;

  constructor(io: ExtensionAuthorizationIo) {
    this.io = io;
  }

  async requestSecret(request: AiCoderAuthorizationRequest): Promise<AiCoderAuthorizationOutcome | null> {
    const answer = await this.io.ask(request);
    if (answer === null || answer.trim() === "") return null;
    const secret = answer.trim();
    this.io.save({ credential: request.credential, secret });
    return Object.freeze({ credential: request.credential, masked: maskCredential(secret) });
  }
}
