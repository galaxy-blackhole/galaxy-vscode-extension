import { codeWorkerUrl } from "./code-runtime";
import { WorkerCodeRuntime, type CodeRunEvent, type ToolPresentationMode } from "@galaxy-stack/ai-coder-core";
import * as crypto from "node:crypto";
import {
  AiCoderRunController,
  type AiCoderRunHandle,
  type AiCoderRuntimeEvent,
  type RunExecutionContext,
} from "@galaxy-stack/ai-coder-core";
import type { OllamaConnection } from "./config";
import { createOllamaCoreModel } from "./core-model";
import { createEvidenceVerifier, createDurableRunStore, FileToolOutputSpill, NdjsonTracePort } from "./core-host";
import type { AgentTool } from "@galaxy-stack/ai-coder-core/agent";
import { createCoreToolExecutor, detectGitWorkTree, type PendingApproval, type PermissionMode } from "./core-tool-executor";

export type GalaxyUiEventSink = (event: import("../ui-protocol").GalaxyUiEvent) => void;

export interface CoreRunSession {
  handle: AiCoderRunHandle;
  /**
   * Compact this run's context because the composer asked (`/compact`).
   *
   * The runtime owns the context manager, so the pass runs inside the live run and
   * reports through the `compaction` event; the numbers come back here as well so
   * the host can answer even when the event is missed.
   */
  compact(): Promise<Readonly<{ itemsShadowed: number; tokensAfter: number; tokensBefore: number }> | null>;
  /** Enter or leave plan mode on this run; null means the run already settled. */
  setPlanMode(on: boolean): Promise<boolean | null>;
  /** Answer a webview approval; falls back to the runtime's own pending-approval path. */
  resolveApproval(requestId: string, approved: boolean): void;
  setPermissionMode(mode: PermissionMode): void;
}

export interface StartCoreRunOptions {
  /** The composer asked for a compaction while nothing was running; do it first. */
  compactOnStart?: boolean;
  connection: OllamaConnection;
  goal: string;
  onEvent: GalaxyUiEventSink;
  onPendingApproval: (pending: PendingApproval) => void;
  /** A phase before the first model delta: connecting tools, probing the model, indexing the workspace. */
  onProgress?: (reason: string) => void;
  /** A program's inner calls, reported as they happen. */
  onCodeEvent?: (event: CodeRunEvent) => void;
  /** How the round presents its tools. Fixed for the session: native (default), ptc, or both. */
  toolPresentation?: ToolPresentationMode;
  mcpTools?: readonly AgentTool[];
  permissionMode: PermissionMode;
  /** Extension global storage: checkpoints, traces, and spilled output live here, never in the workspace. */
  storageRoot: string;
  taskId: string;
  workspaceRoot: string;
}

/**
 * Start one core run against a durable host.
 *
 * Everything the core can persist is persisted: the run store keeps checkpoints
 * and the final report, the trace port keeps a redacted NDJSON journal, and the
 * spill port keeps oversized tool output outside the model-writable workspace.
 * The approval bridge answers through the webview so a permission prompt is a
 * real host decision rather than an auto-grant.
 */
export async function startCoreRun(options: StartCoreRunOptions): Promise<CoreRunSession> {
  let permissionMode: PermissionMode = options.permissionMode;
  const taskId = options.taskId;
  const runId = `vscode-${taskId}`;
  const context: RunExecutionContext = Object.freeze({
    deadline: Date.now() + 30 * 60_000,
    mode: "auto",
    runId,
    signal: new AbortController().signal,
    taskId,
    workspaceRoot: options.workspaceRoot,
  });

  options.onProgress?.("Đang đọc khả năng của model…");
  const model = createOllamaCoreModel(options.connection);
  const capabilitiesResult = await model.capabilities(context);
  if (!capabilitiesResult.ok) throw new Error(`Model probe failed: ${capabilitiesResult.error.message}`);
  const capabilities = capabilitiesResult.data;

  const pendingApprovals = new Map<string, (approved: boolean) => void>();
  const spill = new FileToolOutputSpill(options.storageRoot);
  const [store, trace, resumeWorkspaceVerifier, hasGit] = await Promise.all([
    createDurableRunStore(options.storageRoot),
    NdjsonTracePort.create(options.storageRoot),
    createEvidenceVerifier(options.workspaceRoot),
    detectGitWorkTree(options.workspaceRoot),
  ]);

  options.onProgress?.("Đang lập chỉ mục workspace…");
  /*
   * The sandbox is composed here rather than inside the core: a worker thread is a host-plane service, and the
   * extension is the host that knows where its own bundle put the worker file.
   */
  /* A native round never runs a program, so it composes no sandbox: nothing to start, nothing to leak. */
  /*
   * A program's calls join the transcript as their own rows, under the `run_code` that asked for them: the same
   * events a direct call produces, with the parent remembered so the UI can nest them.
   */
  let codeParent: string | null = null;
  const sink: GalaxyUiEventSink = (event) => {
    if (event.kind === "tool/start" && event.name === "run_code") codeParent = event.toolCallId;
    options.onEvent(event);
  };
  const codeRuntime = (options.toolPresentation ?? "native") === "native"
    ? undefined
    : new WorkerCodeRuntime({ workerUrl: codeWorkerUrl() });
  const toolExecutor = await createCoreToolExecutor({
    ...(codeRuntime === undefined ? {} : { codeRuntime }),
    onCodeEvent: (event) => {
      if (event.type === "code/tool-start") {
        sink({ args: {}, kind: "tool/start", name: event.name, toolCallId: event.callId, ...(codeParent === null ? {} : { parent: codeParent }) });
      }
      if (event.type === "code/tool-result") sink({ kind: "tool/result", ok: event.ok, summary: event.summary, toolCallId: event.callId });
    },
    ...(options.onCodeEvent === undefined ? {} : { onCodeEvent: options.onCodeEvent }),
    capabilities,
    context,
    hasGit,
    ...(options.mcpTools === undefined ? {} : { mcpTools: options.mcpTools }),
    onPendingApproval: (pending) => {
      pendingApprovals.set(pending.requestId, pending.resolve);
      options.onPendingApproval(pending);
    },
    permissionMode: () => permissionMode,
    spill,
    workspaceRoot: options.workspaceRoot,
  });

  const controller = new AiCoderRunController({
    ...(codeRuntime === undefined ? {} : { codeRuntime }),
    model,
    onEvent: (event) => {
      mapCoreEventToUi(event, sink);
    },
    resumeWorkspaceVerifier,
    store,
    toolExecutor,
    toolOutputSpill: spill,
    trace,
  });

  const handle = controller.start(Object.freeze({
    budget: { deadlineMs: 30 * 60_000 },
    compactOnStart: options.compactOnStart === true,
    toolPresentation: options.toolPresentation ?? "native",
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
    compact: async () => await controller.compact(runId),
    setPlanMode: async (on) => await controller.setPlanMode(runId, on),
    handle,
    resolveApproval(requestId, approved) {
      const resolver = pendingApprovals.get(requestId);
      if (resolver !== undefined) {
        pendingApprovals.delete(requestId);
        resolver(approved);
        return;
      }
      void handle.resolveApproval(requestId, approved ? "granted" : "denied");
    },
    setPermissionMode(mode: PermissionMode) { permissionMode = mode; },
  };
}

/**
 * The only place where @galaxy-stack/ai-coder-core event shapes touch the UI wire.
 * When core internals change, this mapper is the single file to update.
 */
export function mapCoreEventToUi(event: AiCoderRuntimeEvent, sink: GalaxyUiEventSink): void {
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
    case "plan":
      sink({ kind: "plan/updated", mode: event.planMode, steps: event.plan.steps });
      return;
    case "compaction":
      sink({
        itemsShadowed: event.itemsShadowed,
        kind: "context/compacted",
        reason: event.reason,
        tokensAfter: event.tokensAfter,
        tokensBefore: event.tokensBefore,
      });
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
