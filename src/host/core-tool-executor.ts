import * as crypto from "node:crypto";
import { execFile } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  AiCoderToolRegistry,
  createAiCoderCoreToolEffectMetadata,
  createAiCoderToolRegistrySnapshot,
  type AiCoderRuntimeToolExecutor,
  type AiCoderRuntimeToolResult,
  type AiCoderRuntimeToolSet,
  type CodingToolCall,
  type ModelCapabilities,
  type RunExecutionContext,
} from "@galaxy/ai-coder-core";

const ACTIVE_TOOL_IDS = Object.freeze([
  "workspace.list",
  "workspace.read",
  "workspace.grep",
  "workspace.write",
  "command.run",
]);

const GRANTED_PERMISSIONS = new Set(["core.storage", "fs.workspace", "process.execute"]);
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|json|md|py|rs|java|css|html|vue|go|yml|yaml|toml)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out"]);
const MAX_LIST_ENTRIES = 400;
const MAX_GREP_MATCHES = 100;

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resolveInside(root: string, userPath: string): string {
  const resolved = path.resolve(root, userPath || ".");
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path '${userPath}' escapes the workspace root.`);
  }
  return resolved;
}

async function fileHashOrNone(fullPath: string): Promise<string | null> {
  try {
    const stat = await fsp.stat(fullPath);
    if (!stat.isFile()) return null;
    return sha256(await fsp.readFile(fullPath));
  } catch {
    return null;
  }
}

export interface PendingApproval {
  readonly args: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly requestId: string;
  readonly tool: string;
  readonly toolCallId: string;
  resolve: (approved: boolean) => void;
}

export type ApprovalEmitter = (pending: PendingApproval) => void;
export type PermissionMode = "ask" | "smart" | "auto";

/** Prototype executor over a canonical core-catalog subset. */
export class WorkspaceToolExecutor implements AiCoderRuntimeToolExecutor {
  private readonly registry: AiCoderToolRegistry;
  private readonly metadata;

  constructor(
    private readonly workspaceRoot: string,
    capabilities: ModelCapabilities,
    private readonly emitApproval: ApprovalEmitter,
    private readonly permissionMode: () => PermissionMode,
  ) {
    this.registry = new AiCoderToolRegistry(createAiCoderToolRegistrySnapshot({
      availableToolIds: new Set(ACTIVE_TOOL_IDS),
      capabilities,
      grantedPermissions: GRANTED_PERMISSIONS,
    }));
    this.metadata = createAiCoderCoreToolEffectMetadata(this.registry.activeDescriptors);
  }

  async getToolSet(context: RunExecutionContext): Promise<AiCoderRuntimeToolSet> {
    void context;
    return Object.freeze({
      canonicalToolIds: this.metadata.canonicalToolIds,
      definitions: this.registry.definitions,
      effectCapabilities: this.metadata.effectCapabilities,
      snapshotHash: this.registry.activeHash,
    });
  }

  async restoreToolSet(
    input: Readonly<{ names: readonly string[]; snapshotHash: string }>,
    context: RunExecutionContext,
  ): Promise<void> {
    void context;
    for (const name of input.names) {
      const descriptor = this.registry.snapshot.descriptors.find((tool) => tool.modelName === name);
      if (descriptor === undefined || !this.registry.activate(descriptor.id)) {
        throw new Error(`Checkpoint references unavailable tool '${name}'.`);
      }
    }
    if (this.registry.activeHash !== input.snapshotHash) {
      throw new Error(`Checkpoint tool snapshot mismatch: expected ${input.snapshotHash}, received ${this.registry.activeHash}.`);
    }
  }

  async execute(call: CodingToolCall, context: RunExecutionContext & { idempotencyKey: string; toolCallId: string }): Promise<AiCoderRuntimeToolResult> {
    const descriptor = this.registry.resolveModelName(call.name);
    if (descriptor === null) {
      return this.failure(call, "UNKNOWN_TOOL", `Tool '${call.name}' is not active in this run.`);
    }
    const args = call.arguments as Record<string, unknown>;
    if (descriptor.mutability !== "read") {
      const mode = this.permissionMode();
      if (mode === "ask" || (mode === "smart" && descriptor.id === "command.run")) {
        const requestId = `${context.runId}:${call.toolCallId}`;
        const approved = await new Promise<boolean>((resolvePromise) => {
          this.emitApproval(Object.freeze({
            args,
            reason: descriptor.id === "command.run"
              ? `Chạy lệnh: ${String(args.command ?? "?")}`
              : `Ghi tệp: ${String(args.path ?? "?")}`,
            requestId,
            tool: descriptor.id,
            toolCallId: call.toolCallId,
            resolve: resolvePromise,
          }));
        });
        if (!approved) {
          return this.failure(call, "DENIED_BY_HOST",
            `Người dùng từ chối ${descriptor.id}. Không thử lại cùng thao tác nếu không được yêu cầu.`,
            { approval: "denied", approvalRequestId: requestId });
        }
      }
    }
    try {
      switch (descriptor.id) {
        case "workspace.list":
          return await this.list(call, descriptor.id, args);
        case "workspace.read":
          return await this.read(call, descriptor.id, args);
        case "workspace.grep":
          return await this.grep(call, descriptor.id, args);
        case "workspace.write":
          return await this.write(call, descriptor.id, args);
        case "command.run":
          return await this.runCommand(call, descriptor.id, args, context.signal);
        default:
          return this.failure(call, "UNKNOWN_TOOL", `Tool '${descriptor.id}' is not implemented in the prototype executor.`);
      }
    } catch (error) {
      return this.failure(call, "TOOL_EXECUTION", error instanceof Error ? error.message : String(error));
    }
  }

  private async list(call: CodingToolCall, canonicalToolId: string, args: Record<string, unknown>): Promise<AiCoderRuntimeToolResult> {
    const root = resolveInside(this.workspaceRoot, String(args.path ?? "."));
    const depth = typeof args.depth === "number" ? Math.min(4, Math.max(1, args.depth)) : 1;
    const entries: { kind: "directory" | "file"; path: string }[] = [];
    const walk = async (dir: string, level: number): Promise<void> => {
      if (entries.length >= MAX_LIST_ENTRIES) return;
      for (const item of await fsp.readdir(dir, { withFileTypes: true })) {
        if (entries.length >= MAX_LIST_ENTRIES) return;
        if (SKIP_DIRS.has(item.name)) continue;
        const full = path.join(dir, item.name);
        entries.push({ kind: item.isDirectory() ? "directory" : "file", path: path.relative(this.workspaceRoot, full) });
        if (item.isDirectory() && level > 0) await walk(full, level - 1);
      }
    };
    await walk(root, depth - 1);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return this.success(call, canonicalToolId,
      `Listed ${entries.length} entries under ${path.relative(this.workspaceRoot, root) || "."}.`,
      Object.freeze({ entries: entries.slice(0, MAX_LIST_ENTRIES), truncated: entries.length >= MAX_LIST_ENTRIES }),
      { inspectedPaths: Object.freeze([path.relative(this.workspaceRoot, root) || "."]) });
  }

  private async read(call: CodingToolCall, canonicalToolId: string, args: Record<string, unknown>): Promise<AiCoderRuntimeToolResult> {
    const rel = String(args.path ?? "");
    const full = resolveInside(this.workspaceRoot, rel);
    const stat = await fsp.stat(full);
    const maxBytes = typeof args.maxBytes === "number" ? Math.min(128_000, Math.max(256, args.maxBytes)) : 48_000;
    if (stat.size > maxBytes) {
      const handle = await fsp.open(full, "r");
      try {
        const buffer = Buffer.alloc(maxBytes);
        await handle.read(buffer, 0, maxBytes, 0);
        const content = buffer.toString("utf8");
        return this.success(call, canonicalToolId,
          `Read first ${maxBytes} of ${stat.size} bytes (truncated).`,
          Object.freeze({ content, contentHash: sha256(content), path: rel, truncated: true }),
          { inspectedPaths: Object.freeze([rel]) });
      } finally {
        await handle.close();
      }
    }
    const raw = await fsp.readFile(full);
    const content = raw.toString("utf8");
    return this.success(call, canonicalToolId,
      `Read ${content.length} chars.`,
      Object.freeze({ content, contentHash: sha256(raw), path: rel, truncated: false }),
      { inspectedPaths: Object.freeze([rel]) });
  }

  private async grep(call: CodingToolCall, canonicalToolId: string, args: Record<string, unknown>): Promise<AiCoderRuntimeToolResult> {
    const pattern = String(args.query ?? "");
    const useRegex = args.regex === true;
    let regex: RegExp | null = null;
    if (useRegex) regex = new RegExp(pattern);
    const base = resolveInside(this.workspaceRoot, String(args.path ?? "."));
    const hits: { line: number; path: string; preview: string }[] = [];
    const searchDir = async (dir: string): Promise<void> => {
      if (hits.length >= MAX_GREP_MATCHES) return;
      for (const item of await fsp.readdir(dir, { withFileTypes: true })) {
        if (hits.length >= MAX_GREP_MATCHES) return;
        if (SKIP_DIRS.has(item.name)) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) { await searchDir(full); continue; }
        if (!SOURCE_EXTENSIONS.test(item.name)) continue;
        const stat = await fsp.stat(full);
        if (stat.size > 256 * 1024) continue;
        const text = await fsp.readFile(full, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const matched = regex ? regex.test(lines[i]) : lines[i].includes(pattern);
          if (matched) {
            hits.push({ line: i + 1, path: path.relative(this.workspaceRoot, full), preview: lines[i].slice(0, 300) });
            if (hits.length >= MAX_GREP_MATCHES) return;
          }
        }
      }
    };
    await searchDir(base);
    return this.success(call, canonicalToolId,
      hits.length ? `${hits.length} matches.` : "No matches.",
      Object.freeze({ matches: hits.slice(0, MAX_GREP_MATCHES), truncated: hits.length >= MAX_GREP_MATCHES }),
      { inspectedPaths: Object.freeze([path.relative(this.workspaceRoot, base) || "."]) });
  }

  private async write(call: CodingToolCall, canonicalToolId: string, args: Record<string, unknown>): Promise<AiCoderRuntimeToolResult> {
    const rel = String(args.path ?? "");
    const full = resolveInside(this.workspaceRoot, rel);
    const beforeHash = await fileHashOrNone(full);
    const precondition = args.precondition as { kind?: string; contentSha256?: string } | undefined;
    if (precondition?.kind === "must_not_exist" && beforeHash !== null) {
      return this.failure(call, "PRECONDITION_FAILED", `File '${rel}' already exists.`);
    }
    if (precondition?.kind === "matches_sha256" && beforeHash !== precondition.contentSha256) {
      return this.failure(call, "PRECONDITION_FAILED", `File '${rel}' changed before write (hash mismatch). Re-read the file.`);
    }
    const content = String(args.content ?? "");
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content, "utf8");
    const raw = await fsp.readFile(full);
    const afterHash = sha256(raw);
    return this.success(call, canonicalToolId,
      `Wrote ${Buffer.byteLength(content, "utf8")} bytes to ${rel}.`,
      Object.freeze({ afterContentSha256: afterHash, beforeContentSha256: beforeHash, length: Buffer.byteLength(content, "utf8"), path: rel, resolvedPath: full }),
      { stateVersion: afterHash, writes: Object.freeze([Object.freeze({ afterHash, beforeHash, path: rel })]) });
  }

  private async runCommand(
    call: CodingToolCall,
    canonicalToolId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AiCoderRuntimeToolResult> {
    const started = Date.now();
    const command = String(args.command ?? "");
    const timeoutMs = typeof args.timeoutMs === "number" ? Math.min(600_000, Math.max(100, args.timeoutMs)) : 30_000;
    const result = await new Promise<{ exitCode: number; stderr: string; stdout: string; timedOut: boolean }>((resolvePromise) => {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const flag = process.platform === "win32" ? "/c" : "-c";
      const child = execFile(
        shell, [flag, command],
        { cwd: this.workspaceRoot, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolvePromise({
            exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            timedOut: Boolean(error?.killed),
          });
        },
      );
      const onAbort = () => child.kill("SIGTERM");
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    return this.success(call, canonicalToolId,
      `Command exited ${result.exitCode} in ${Date.now() - started}ms.`,
      Object.freeze({
        command,
        cwd: ".",
        exitCode: result.exitCode,
        stderr: result.stderr.slice(0, 8_000),
        stdout: result.stdout.slice(0, 8_000),
        timedOut: result.timedOut,
        truncated: false,
        cancelled: false,
      }),
      { stateVersion: `cmd:${Date.now()}` });
  }

  private success(
    call: CodingToolCall,
    canonicalToolId: string,
    summary: string,
    output: Record<string, unknown>,
    effects: Record<string, unknown>,
  ): AiCoderRuntimeToolResult {
    return Object.freeze({
      canonicalToolId,
      content: JSON.stringify(output),
      ok: true,
      summary,
      trust: "workspace",
      effectsAuthority: "host",
      effects: Object.freeze(effects),
    } as never);
  }

  private failure(
    call: CodingToolCall,
    code: string,
    message: string,
    effects?: Record<string, unknown>,
  ): AiCoderRuntimeToolResult {
    return Object.freeze({
      canonicalToolId: call.name,
      content: message,
      error: Object.freeze({ code, message, retryable: false }),
      ok: false,
      summary: `${code}: ${message}`,
      trust: "workspace",
      effectsAuthority: "host",
      ...(effects ? { effects: Object.freeze(effects) } : {}),
    } as never);
  }
}
