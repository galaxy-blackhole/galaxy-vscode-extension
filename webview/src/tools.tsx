import { useAssistantTool } from "@assistant-ui/react";
import { execTool } from "./host-bridge";
import { requestApproval } from "./approvals";

const READ_ONLY_NOTE =
  "The result is returned as text. Keep the answer concise and only use the relevant parts.";

function makeExecute(toolName: string, mutating: boolean, approvalReason: (args: Record<string, unknown>) => string) {
  return async (args: Record<string, unknown>, context: { toolCallId: string; abortSignal?: AbortSignal }) => {
    if (mutating) {
      const approved = await requestApproval(
        context.toolCallId,
        toolName,
        args,
        approvalReason(args),
        context.abortSignal,
      );
      if (!approved) {
        return { ok: false, result: `The user denied ${toolName}. Do not retry the same action without asking.` };
      }
    }
    return await execTool(toolName, args);
  };
}

// Tool objects must be referentially stable: assistant-ui re-registers every
// time the object identity changes, and fresh objects per render cause an
// infinite register/update loop (React error #185).
const listFilesTool = {
  toolName: "list_files",
  type: "frontend" as const,
  description: `List files and folders under a workspace directory. ${READ_ONLY_NOTE}`,
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Directory path relative to the workspace root. Default '.'" },
      depth: { type: "integer", description: "Recursion depth (0-3). Default 1." },
    },
  },
  execute: makeExecute("list_files", false, () => ""),
};

const readFileTool = {
  toolName: "read_file",
  type: "frontend" as const,
  description: `Read a UTF-8 text file from the workspace. ${READ_ONLY_NOTE}`,
  parameters: {
    type: "object" as const,
    properties: { path: { type: "string", description: "File path relative to the workspace root." } },
    required: ["path"],
  },
  execute: makeExecute("read_file", false, () => ""),
};

const grepTool = {
  toolName: "grep",
  type: "frontend" as const,
  description: `Search for a regular expression in workspace source files. ${READ_ONLY_NOTE}`,
  parameters: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Regular expression to search for." },
      path: { type: "string", description: "Directory to search in, relative to workspace root. Default '.'" },
    },
    required: ["pattern"],
  },
  execute: makeExecute("grep", false, () => ""),
};

const writeFileTool = {
  toolName: "write_file",
  type: "frontend" as const,
  description: "Create or overwrite a workspace file with the given content. The user must approve the exact path and content.",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path relative to the workspace root." },
      content: { type: "string", description: "Complete UTF-8 file content to write." },
    },
    required: ["path", "content"],
  },
  execute: makeExecute(
    "write_file",
    true,
    (args) => `Create/overwrite ${String(args.path ?? "?")} (${String(args.content ?? "").length} chars)`,
  ),
};

const runCommandTool = {
  toolName: "run_command",
  type: "frontend" as const,
  description: "Run a shell command in the workspace root. The user must approve the exact command.",
  parameters: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "Shell command line to execute." },
      timeoutMs: { type: "integer", description: "Timeout in milliseconds. Default 30000." },
    },
    required: ["command"],
  },
  execute: makeExecute("run_command", true, (args) => `Run: ${String(args.command ?? "?")}`),
};

function ListFiles() { useAssistantTool(listFilesTool as never); return null; }
function ReadFile() { useAssistantTool(readFileTool as never); return null; }
function Grep() { useAssistantTool(grepTool as never); return null; }
function WriteFile() { useAssistantTool(writeFileTool as never); return null; }
function RunCommand() { useAssistantTool(runCommandTool as never); return null; }

/** Register all workspace tools with the assistant-ui model context. */
export function GalaxyTools() {
  return (
    <>
      <ListFiles />
      <ReadFile />
      <Grep />
      <WriteFile />
      <RunCommand />
    </>
  );
}
