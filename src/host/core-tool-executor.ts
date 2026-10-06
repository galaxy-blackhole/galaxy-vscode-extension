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

  const hostTools = new NodeToolExecutor({
    approval,
    approvalProfile: "strict",
    approvalTimeoutMs: 5 * 60_000,
    capabilities: options.capabilities,
    command,
    enableGit: options.hasGit,
    workspace,
  });

  const executors: AiCoderRuntimeToolExecutor[] = [hostTools];
  /* Outside a Git repository the snapshot reviewer is what attests inspect/diff evidence. */
  if (!options.hasGit) executors.push(await NodeWorkspaceReviewExecutor.create(workspace, options.context));
  executors.push(new AgentToolExecutor([...toolOutputReader(options.spill), ...(options.mcpTools ?? [])], async () => true));

  return new CompositeToolExecutor(executors);
}

/** Probe for a Git work tree the same way the CLI host does. */
export async function detectGitWorkTree(workspaceRoot: string): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "--is-inside-work-tree"], { cwd: workspaceRoot });
    return stdout.trim() === "true";
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
