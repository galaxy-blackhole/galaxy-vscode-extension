import { useAssistantTool } from "@assistant-ui/react";
import { execTool } from "./host-bridge";
import { requestApproval } from "./approvals";

const READ_ONLY_NOTE =
  "The result is returned as text. Keep the answer concise and only use the relevant parts.";

type ToolDef = Readonly<{
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  mutating: boolean;
  approvalReason: (args: Record<string, unknown>) => string;
}>;

const TOOL_DEFINITIONS: readonly ToolDef[] = [
  {
    toolName: "list_files",
    description: `List files and folders under a workspace directory. ${READ_ONLY_NOTE}`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to the workspace root. Default '.'" },
        depth: { type: "integer", description: "Recursion depth (0-3). Default 1." },
      },
    },
    mutating: false,
    approvalReason: () => "",
  },
  {
    toolName: "read_file",
    description: `Read a UTF-8 text file from the workspace. ${READ_ONLY_NOTE}`,
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path relative to the workspace root." } },
      required: ["path"],
    },
    mutating: false,
    approvalReason: () => "",
  },
  {
    toolName: "grep",
    description: `Search for a regular expression in workspace source files. ${READ_ONLY_NOTE}`,
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for." },
        path: { type: "string", description: "Directory to search in, relative to workspace root. Default '.'" },
      },
      required: ["pattern"],
    },
    mutating: false,
    approvalReason: () => "",
  },
  {
    toolName: "write_file",
    description: "Create or overwrite a workspace file with the given content. The user must approve the exact path and content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the workspace root." },
        content: { type: "string", description: "Complete UTF-8 file content to write." },
      },
      required: ["path", "content"],
    },
    mutating: true,
    approvalReason: (args) => `Create/overwrite ${String(args.path ?? "?")} (${String(args.content ?? "").length} chars)`,
  },
  {
    toolName: "run_command",
    description: "Run a shell command in the workspace root. The user must approve the exact command.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command line to execute." },
        timeoutMs: { type: "integer", description: "Timeout in milliseconds. Default 30000." },
      },
      required: ["command"],
    },
    mutating: true,
    approvalReason: (args) => `Run: ${String(args.command ?? "?")}`,
  },
];

/** Register all workspace tools with the assistant-ui model context. */
export function GalaxyTools() {
  for (const def of TOOL_DEFINITIONS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAssistantTool({
      toolName: def.toolName,
      type: "frontend",
      description: def.description,
      parameters: def.parameters as never,
      execute: async (args, context) => {
        const record = args as Record<string, unknown>;
        if (def.mutating) {
          const approved = await requestApproval(
            context.toolCallId,
            def.toolName,
            record,
            def.approvalReason(record),
            context.abortSignal,
          );
          if (!approved) {
            return { ok: false, result: `The user denied ${def.toolName}. Do not retry the same action without asking.` };
          }
        }
        const outcome = await execTool(def.toolName, record);
        return outcome;
      },
    });
  }
  return null;
}

export { TOOL_DEFINITIONS };
