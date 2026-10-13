import type { CodeRunEvent, CodeRuntimePort } from "@galaxy-stack/ai-coder-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  portSuccess,
  requiresAiCoderApproval,
  type AiCoderRuntimeToolExecutor,
  type ApprovalPort,
  type ModelCapabilities,
  type RunExecutionContext,
} from "@galaxy-stack/ai-coder-core";
import { AgentToolExecutor, CompositeToolExecutor, agentFunction, type AgentTool } from "@galaxy-stack/ai-coder-core/agent";
import { NodeCommandPort } from "@galaxy-stack/ai-coder-core/adapters/node/host/node-command-port";
import { NodeWorkspacePort } from "@galaxy-stack/ai-coder-core/adapters/node/host/node-workspace-port";
import { NodeToolExecutor } from "@galaxy-stack/ai-coder-core/adapters/node/tools/tool-executor";
import { NodeWorkspaceReviewExecutor } from "@galaxy-stack/ai-coder-core/adapters/node/tools/workspace-review";
import type { FileToolOutputSpill } from "./core-host";
import { DEFAULT_AGENT_PRESET_ID, resolveAgentPreset } from "@galaxy-stack/ai-coder-core/runtime/agent-presets";
import type { SubagentRegistry } from "@galaxy-stack/ai-coder-core/runtime/subagent-registry";

/** One approval the webview must answer before the run continues. */
export interface PendingApproval {
  readonly args: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly requestId: string;
  readonly tool: string;
  readonly toolCallId: string;
  resolve: (approved: boolean) => void;
}

export type ApprovalEmitter = (pending: PendingApproval) => void;
/** Webview permission modes: ask before every action, ask where policy requires, or never ask. */
export type PermissionMode = "ask" | "smart" | "auto";

export interface CoreToolExecutorOptions {
  readonly capabilities: ModelCapabilities;
  readonly context: RunExecutionContext;
  readonly hasGit: boolean;
  /** Tools the workspace's own MCP servers expose; the host connects them before the run. */
  readonly mcpTools?: readonly AgentTool[];
  readonly onPendingApproval: ApprovalEmitter;
  readonly permissionMode: () => PermissionMode;
  /**
   * Which composition this session runs as, by name. Absent means the product's default preset, and an unknown
   * name resolves to nothing so the core's own defaults stand — never to a value this file invented.
   */
  readonly presetId?: string;
  /** The child-agent seam; absent means the delegation tools refuse, which is honest and visible. */
  readonly subagents?: SubagentRegistry;
  /**
   * How long a permission card waits before deciding on its own. The reference has no timer on that wait, so the
   * product passes a bound long enough that the person is always the one who answers.
   */
  readonly approvalTimeoutMs?: number;
  /** Composed by the host so a session may run in tools mode ptc; absent means run_code is unavailable. */
  readonly codeRuntime?: CodeRuntimePort;
  /** The round's tool mode, so the executor can hold the entry tool open for a ptc round. */
  readonly toolPresentation?: "native" | "ptc" | "both";
  /** A reviewer already built during boot; the run must not pay its index again. */
  readonly review?: import("@galaxy-stack/ai-coder-core/adapters/node/tools/workspace-review").NodeWorkspaceReviewExecutor | null;
  /** Where a program's inner calls are reported, so they reach the transcript as their own rows. */
  readonly onCodeEvent?: (event: CodeRunEvent) => void;
  readonly spill: FileToolOutputSpill;
  readonly workspaceRoot: string;
}

/**
 * Compose the core's canonical tool executor for this host.
 *
 * The host contributes what the platform-neutral core cannot own: the Node
 * workspace/command adapters, the Git probe that selects the completion-evidence
 * path, and the approval bridge into the webview. Schemas, effect profile,
 * policy, and idempotency come from the core, which is what a conformance host
 * is required to do.
 */
export async function createCoreToolExecutor(options: CoreToolExecutorOptions): Promise<AiCoderRuntimeToolExecutor> {
  const workspace = await NodeWorkspacePort.create(options.workspaceRoot);
  const command = await NodeCommandPort.create(options.workspaceRoot);

  /*
   * The executor is built with the most prompting profile so the port sees every
   * call the strictest policy would question; the port then applies the live
   * webview mode, which can relax (smart) or bypass (auto) that threshold.
   */
  const approval: ApprovalPort = async (request) => {
    /*
     * The preset is read once, here, so every setting it names comes from one decision the caller can see — and
     * an unknown name leaves the core's defaults alone instead of being papered over with an invented one.
     */
    const mode = options.permissionMode();
    const decidedAt = new Date().toISOString();
    if (mode === "auto") return portSuccess({ approved: true, decidedAt, scope: "once" as const });
    if (mode === "smart" && !requiresAiCoderApproval("balanced", request.tool)) {
      return portSuccess({ approved: true, decidedAt, scope: "once" as const });
    }
    const approved = await new Promise<boolean>((resolve) => {
      options.onPendingApproval({
        args: request.argumentsValue,
        reason: request.reason,
        requestId: request.requestId,
        tool: request.tool.id,
        toolCallId: request.requestId,
        resolve,
      });
    });
    return portSuccess({ approved, decidedAt, scope: "once" as const });
  };

  /* One decision, read once: how much to ask, and whether work goes through tools or a program. */
  const preset = resolveAgentPreset(options.presetId ?? DEFAULT_AGENT_PRESET_ID);
  const hostTools = new NodeToolExecutor({
    ...(options.codeRuntime === undefined ? {} : { codeRuntime: options.codeRuntime }),
    ...(options.toolPresentation === undefined ? {} : { toolPresentation: options.toolPresentation }),
    ...(options.onCodeEvent === undefined ? {} : { onCodeEvent: options.onCodeEvent }),
    approval,
    /* The reference asks about anything that changes the workspace; a stricter profile asked about reads too. */
    ...(preset === null
      ? {}
      : {
        approvalProfile: preset.approvalProfile,
        presetPermissions: preset.permissions,
        ...(options.subagents === undefined ? {} : { subagents: options.subagents }),
        toolPresentation: preset.toolPresentation,
      }),
    approvalTimeoutMs: 5 * 60_000,
    ...(options.approvalTimeoutMs === undefined ? {} : { approvalTimeoutMs: options.approvalTimeoutMs }),
    capabilities: options.capabilities,
    command,
    enableGit: options.hasGit,
    workspace,
  });

  const executors: AiCoderRuntimeToolExecutor[] = [hostTools];
  /* Outside a Git repository the snapshot reviewer is what attests inspect/diff evidence. */
  /*
   * Built at boot when the host managed it: creating it here indexed the whole workspace on every run's critical
   * path, which is where the owner's 37-second wait lived.
   */
  const review = options.review ?? null;
  if (review !== null) executors.push(review);
  executors.push(new AgentToolExecutor([...toolOutputReader(options.spill), ...(options.mcpTools ?? [])], async () => true));

  return new CompositeToolExecutor(executors);
}

/**
 * A Git work tree, here or one level down. Owners open the folder that holds their repositories, and that folder is
 * not itself a repository: without this probe the run takes the evidence path instead of Git's own.
 */
export async function detectGitWorkTree(workspaceRoot: string): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "--is-inside-work-tree"], { cwd: workspaceRoot });
    if (stdout.trim() === "true") return true;
  } catch { /* not a work tree here: look one level down */ }
  try {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readdirSync(workspaceRoot, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && entry.name.startsWith(".") === false
        && (() => { try { return readdirSync(join(workspaceRoot, entry.name), { withFileTypes: true }).some((child) => child.name === ".git"); } catch { return false; } })());
  } catch {
    return false;
  }
}

/**
 * Read-only access to output the runtime spilled outside the context window
 * (canonical id `tool_output.read`, model-facing name `tool_output_read`).
 *
 * Without it a model that received `artifact://<id>` could never read the bytes
 * back. The tool is workspace-trusted, has no side effects, and every argument is
 * validated by the core before it reaches this function.
 */
function toolOutputReader(spill: FileToolOutputSpill): readonly AgentTool[] {
  return [
    agentFunction(
      "tool_output.read",
      "Read a spooled tool-output artifact by id when a previous result was summarized as artifact://<id>.",
      {
        runId: { type: "string", description: "Run id owning the artifact." },
        id: { type: "string", description: "Artifact id from artifact://<id>." },
        offset: { type: "number", description: "Byte offset to start reading from." },
        length: { type: "number", description: "Maximum bytes to return." },
      },
      ["runId", "id"],
      "read",
      async (args) => spill.read(String(args["runId"] ?? ""), String(args["id"] ?? ""), Number(args["offset"] ?? 0), Number(args["length"] ?? 16_000)),
      "workspace",
    ),
  ];
}
