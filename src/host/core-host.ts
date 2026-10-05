import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { portSuccess, type AiCoderRunStore, type AiCoderResumeWorkspaceVerifier, type PortResult, type RunExecutionContext, type TraceEvent, type TracePort } from "@galaxy-stack/ai-coder-core";
import type { AiCoderToolOutputArtifact, AiCoderToolOutputSpill } from "@galaxy-stack/ai-coder-core/context";
import { FileRunStore } from "@galaxy-stack/ai-coder-core/adapters/node/host/file-run-store";
import { NodeWorkspaceEvidenceVerifier } from "@galaxy-stack/ai-coder-core/adapters/node/host/node-workspace-evidence-verifier";

/**
 * Durable host adapters the extension shares with the CLI laboratory.
 *
 * Every path below lives under the extension's global storage, never inside the
 * workspace: checkpoints, traces and spilled tool output stay out of reach of the
 * model-writable tree, which is what the core's checkpoint trust contract needs.
 */

/** Durable, redacted JSON-lines trace sink: <storage>/logs/host-YYYY-MM-DD.ndjson. */
export class NdjsonTracePort implements TracePort {
  private queue: Promise<void> = Promise.resolve();
  private readonly dir: string;
  private readonly file: string;

  /* Written without TypeScript parameter properties: the host tests run this
     file directly through node's type stripping, which rejects that syntax. */
  private constructor(dir: string) {
    this.dir = dir;
    this.file = join(dir, `host-${new Date().toISOString().slice(0, 10)}.ndjson`);
  }

  static async create(storageRoot: string): Promise<NdjsonTracePort> {
    const dir = join(storageRoot, "logs");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return new NdjsonTracePort(dir);
  }

  /** Appends one event; a write failure is reported to the runtime, never thrown at it. */
  async emit(event: TraceEvent, _context: RunExecutionContext): Promise<PortResult<void>> {
    const line = `${redactSecrets(JSON.stringify(event))}\n`;
    this.queue = this.queue.then(() => appendFile(this.file, line, { mode: 0o600 })).catch(() => undefined);
    await this.queue;
    return portSuccess(undefined);
  }

  /** Resolves once every queued line is on disk. */
  async flush(_context: RunExecutionContext): Promise<PortResult<void>> {
    await this.queue;
    return portSuccess(undefined);
  }

  /** Newest lines last; used by the extension's diagnostics command. */
  async recent(count = 40): Promise<readonly string[]> {
    await this.queue;
    const content = await readFile(this.file, "utf8").catch(() => "");
    return content.split("\n").filter(Boolean).slice(-count);
  }

  /** Directory holding this port's daily NDJSON files. */
  get path(): string {
    return this.dir;
  }
}

/* The optional closing quote lets one pattern redact both JSON keys ("apiKey":"…") and plain text. */
const REDACT = /((?:api[_-]?key|password|secret|token|authorization)"?\s*[:=]\s*)("[^"]*"|[^\s,;"}]+)/gi;

/** Replace credential-looking values while keeping the surrounding JSON quoting valid. */
function redactSecrets(text: string): string {
  return text.replace(REDACT, (_match: string, prefix: string, value: string) => {
    const quote = value.startsWith('"') ? '"' : "";
    return `${prefix}${quote}[REDACTED]${quote}`;
  });
}
const MAX_SPILL_BYTES = 8 * 1024 * 1024;
const MAX_SPILL_READ = 16_000;

/**
 * Persists oversized tool output outside the workspace so the bounded context can
 * reference `artifact://<id>` and the agent reads it back through `artifact.read`.
 */
export class FileToolOutputSpill implements AiCoderToolOutputSpill {
  private sequence = 0;
  private readonly storageRoot: string;

  constructor(storageRoot: string) {
    this.storageRoot = storageRoot;
  }

  private runDir(runId: string): string {
    return join(this.storageRoot, "spill", safeSegment(runId, 96));
  }

  async write(input: Readonly<{ content: string; contentType: string; runId: string; toolCallId: string; toolName: string }>): Promise<AiCoderToolOutputArtifact> {
    const dir = this.runDir(input.runId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const id = `${safeSegment(input.toolCallId, 64)}-${(this.sequence += 1)}`;
    const bounded = input.content.length > MAX_SPILL_BYTES ? input.content.slice(0, MAX_SPILL_BYTES) : input.content;
    await writeFile(join(dir, `${id}.log`), bounded, { encoding: "utf8", mode: 0o600 });
    return Object.freeze({ id, mimeType: input.contentType });
  }

  /** Reads a spill artifact back; the id is sanitized so traversal cannot escape the spill dir. */
  async read(runId: string, id: string, offset = 0, length = MAX_SPILL_READ): Promise<Readonly<{ content: string; truncated: boolean }>> {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new Error("Invalid artifact id.");
    const content = await readFile(join(this.runDir(runId), `${id}.log`), "utf8");
    return Object.freeze({ content: content.slice(offset, offset + length), truncated: offset + length < content.length });
  }

  /** Total bytes kept by the spill directory, for the storage diagnostic. */
  async totalBytes(): Promise<number> {
    const root = join(this.storageRoot, "spill");
    let total = 0;
    for (const entry of await readdir(root, { recursive: true }).catch(() => [] as string[])) {
      const info = await stat(join(root, entry)).catch(() => undefined);
      if (info?.isFile() === true) total += info.size;
    }
    return total;
  }
}

/** Durable run store: checkpoints and final reports survive a window reload. */
export async function createDurableRunStore(storageRoot: string): Promise<AiCoderRunStore> {
  const root = join(storageRoot, "runs");
  await mkdir(root, { recursive: true, mode: 0o700 });
  return FileRunStore.create(root);
}

/** Resume workspace verifier that matches the CLI host's fingerprint policy. */
export async function createEvidenceVerifier(workspaceRoot: string): Promise<AiCoderResumeWorkspaceVerifier> {
  return NodeWorkspaceEvidenceVerifier.create(workspaceRoot);
}

function safeSegment(value: string, max: number): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, max);
}
