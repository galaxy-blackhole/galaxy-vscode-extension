import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  AiCoderRunController,
  portFailure,
  portSuccess,
  type AiCoderCheckpointFile,
  type AiCoderRunCheckpoint,
  type AiCoderRunHandle,
  type AiCoderRunResult,
  type AiCoderRunStore,
  type AiCoderRuntimeEvent,
  type AiCoderResumeWorkspaceVerifier,
  type AiCoderWorkspaceCheckpointSnapshot,
  type PortResult,
  type RunExecutionContext,
} from "@galaxy/ai-coder-core";
import type { OllamaConnection } from "./config";
import { createOllamaCoreModel } from "./core-model";
import { WorkspaceToolExecutor, type PendingApproval, type PermissionMode } from "./core-tool-executor";

export type GalaxyUiEventSink = (event: import("../ui-protocol").GalaxyUiEvent) => void;

/** In-memory store for the prototype; FileRunStore-style durability lands later. */
class MemoryRunStore implements AiCoderRunStore {
  readonly checkpointTrust = "trusted_host" as const;
  private readonly checkpoints = new Map<string, AiCoderRunCheckpoint>();

  async loadLatestCheckpoint(runId: string): Promise<AiCoderRunCheckpoint | null> {
    return this.checkpoints.get(runId) ?? null;
  }

  async saveCheckpoint(checkpoint: AiCoderRunCheckpoint): Promise<Readonly<{ artifactRef?: string }>> {
    this.checkpoints.set(checkpoint.runId, checkpoint);
    return Object.freeze({});
  }

  async saveFinalReport(): Promise<void> {}
}

/** Deterministic active-file fingerprint; prototype counterpart of NodeWorkspaceEvidenceVerifier. */
class WorkspaceVerifier implements AiCoderResumeWorkspaceVerifier {
  readonly consistency = "serialized_workspace" as const;

  constructor(private readonly workspaceRoot: string) {}

  async capture(input: Readonly<{ activeFiles: readonly AiCoderCheckpointFile[]; dirtyStateSummary: string | null }>): Promise<PortResult<AiCoderWorkspaceCheckpointSnapshot>> {
    const files: AiCoderCheckpointFile[] = [];
    for (const file of input.activeFiles) {
      const full = path.resolve(this.workspaceRoot, file.path);
      if (!full.startsWith(this.workspaceRoot + path.sep) && full !== this.workspaceRoot) {
        return portFailure({ code: "IO_ERROR", message: `Checkpoint file escapes workspace: ${file.path}`, retryable: false });
      }
      try {
        const stat = await fsp.stat(full);
        if (stat.isFile()) {
          files.push(Object.freeze({ ...file, contentHash: crypto.createHash("sha256").update(await fsp.readFile(full)).digest("hex"), kind: "file" }));
        } else if (stat.isDirectory()) {
          files.push(Object.freeze({ ...file, contentHash: null, kind: "directory" }));
        } else {
          files.push(Object.freeze({ ...file, contentHash: null, kind: "other" }));
        }
      } catch {
        files.push(Object.freeze({ ...file, contentHash: null, kind: "missing" }));
      }
    }
    const canonical = files
      .map((file) => `${file.kind ?? "file"}:${file.path}:${file.contentHash ?? ""}`)
      .sort()
      .join("\n");
    return portSuccess(Object.freeze({
      activeFiles: Object.freeze(files),
      dirtyStateSummary: input.dirtyStateSummary,
      stateFingerprint: crypto.createHash("sha256").update(canonical).digest("hex"),
    }));
  }

  async verify(snapshot: AiCoderWorkspaceCheckpointSnapshot): Promise<PortResult<Readonly<{ currentFingerprint: string; matches: boolean }>>> {
    const recaptured = await this.capture({ activeFiles: snapshot.activeFiles, dirtyStateSummary: snapshot.dirtyStateSummary });
    if (!recaptured.ok) return recaptured;
    return portSuccess(Object.freeze({
      currentFingerprint: recaptured.data.stateFingerprint,
      matches: recaptured.data.stateFingerprint === snapshot.stateFingerprint,
    }));
  }
}

export interface CoreRunSession {
  handle: AiCoderRunHandle;
  setPermissionMode(mode: PermissionMode): void;
}

export interface StartCoreRunOptions {
  connection: OllamaConnection;
  goal: string;
  onEvent: GalaxyUiEventSink;
  onPendingApproval: (pending: PendingApproval) => void;
  permissionMode: PermissionMode;
  taskId: string;
  workspaceRoot: string;
}

export async function startCoreRun(options: StartCoreRunOptions): Promise<CoreRunSession> {
  let permissionMode: PermissionMode = options.permissionMode;
  const runId = `vscode-${crypto.randomUUID().slice(0, 8)}`;
  const taskId = options.taskId;
  const context: RunExecutionContext = Object.freeze({
    deadline: Date.now() + 30 * 60_000,
    mode: "auto",
    runId: `vscode-${taskId}`,
    signal: new AbortController().signal,
    taskId,
    workspaceRoot: options.workspaceRoot,
  });

  const model = createOllamaCoreModel(options.connection);
  const capabilitiesResult = await model.capabilities(context);
  if (!capabilitiesResult.ok) throw new Error(`Model probe failed: ${capabilitiesResult.error.message}`);
  const capabilities = capabilitiesResult.data;

  const executor = new WorkspaceToolExecutor(
    options.workspaceRoot,
    capabilities,
    (pending) => options.onPendingApproval(pending),
    () => permissionMode,
  );
  const verifier = new WorkspaceVerifier(options.workspaceRoot);
  await executor.getToolSet(context);

  const controller = new AiCoderRunController({
    model,
    onEvent: (event) => {
      mapCoreEventToUi(event, options.onEvent);
    },
    resumeWorkspaceVerifier: verifier,
    toolExecutor: executor,
  });

  const handle = controller.start(Object.freeze({
    budget: { deadlineMs: 30 * 60_000 },
    goal: options.goal,
    mode: "auto",
    prompt: {
      approvalProfile: "balanced" as const,
      complexity: "standard" as const,
      hostEnvironment: Object.freeze({
        architecture: process.arch,
        command: Object.freeze({
          argumentsPrefix: Object.freeze([process.platform === "win32" ? "/d /s /c" : "-c"]),
          commandMode: "shell_string",
          executable: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
          interactive: false,
          pathStyle: process.platform === "win32" ? "windows" : "posix",
          shell: process.platform === "win32" ? "cmd" : "sh",
          stdin: "closed",
          tty: false,
        }),
        operatingSystem: (process.platform === "darwin" || process.platform === "linux" || process.platform === "win32"
          ? process.platform
          : "unknown") as "darwin" | "linux" | "win32" | "unknown",
      }),
      networkAccess: "denied" as const,
      writeAccess: "allowed" as const,
    },
    taskId,
    tokenProfile: "balanced",
    workspaceRoot: options.workspaceRoot,
  }));

  return {
    handle,
    setPermissionMode(mode: PermissionMode) { permissionMode = mode; },
  };
}

/**
 * The only place where @galaxy/ai-coder-core event shapes touch the UI wire.
 * When core internals change, this mapper is the single file to update.
 */
function mapCoreEventToUi(event: AiCoderRuntimeEvent, sink: GalaxyUiEventSink): void {
  switch (event.type) {
    case "model": {
      const modelEvent = event.event;
      if (modelEvent.type === "thinking") sink({ kind: "message/thinking-delta", text: modelEvent.delta });
      else if (modelEvent.type === "content") sink({ kind: "message/text-delta", text: modelEvent.delta });
      else if (modelEvent.type === "error") sink({ code: modelEvent.error.code, kind: "error", message: modelEvent.error.message, retryable: modelEvent.error.retryable });
      return;
    }
    case "tool_start":
      sink({ args: event.call.arguments as Record<string, unknown>, kind: "tool/start", name: event.call.name, toolCallId: event.call.toolCallId });
      return;
    case "tool_result":
      sink({
        kind: "tool/result",
        ok: event.result.ok,
        outputTail: event.result.content.slice(0, 4_000),
        summary: event.result.summary,
        toolCallId: event.call.toolCallId,
      });
      return;
    case "model_retry":
      sink({ attempt: event.attempt, delayMs: event.delayMs, kind: "model/retry", reason: event.message });
      return;
    case "checkpoint":
      sink({ kind: "context/compacted", reason: event.reason });
      return;
    case "context_pressure":
      sink({ contextWindow: null, kind: "context/pressure", usedTokens: event.tokens });
      return;
    case "completion_rejected":
      sink({ issues: event.issues, kind: "completion/rejected" });
      return;
    case "state": {
      const to = event.transition.to;
      const status = to === "completed" ? "completed"
        : to === "failed" ? "failed"
        : to === "paused" ? "paused"
        : to === "cancelled" ? "cancelled"
        : "running";
      sink({ kind: "run/status", reason: event.transition.reason, status });
      return;
    }
  }
}
