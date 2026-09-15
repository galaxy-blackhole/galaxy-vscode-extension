import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_LIST_ENTRIES = 400;
const MAX_COMMAND_OUTPUT = 32 * 1024;

function resolveInside(root: string, userPath: string): string {
  const resolved = path.resolve(root, userPath || ".");
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path '${userPath}' escapes the workspace root.`);
  }
  return resolved;
}

async function listFiles(root: string, dirPath: string, depth = 1): Promise<string> {
  const entries: string[] = [];
  const walk = async (dir: string, level: number): Promise<void> => {
    if (entries.length >= MAX_LIST_ENTRIES) return;
    const items = await fsp.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (entries.length >= MAX_LIST_ENTRIES) return;
      if (item.name === "node_modules" || item.name === ".git" || item.name === "dist" || item.name === "out") continue;
      const full = path.join(dir, item.name);
      entries.push(path.relative(root, full) + (item.isDirectory() ? "/" : ""));
      if (item.isDirectory() && level > 0) await walk(full, level - 1);
    }
  };
  await walk(resolveInside(root, dirPath), depth);
  if (entries.length === 0) return "(empty)";
  const truncated = entries.length >= MAX_LIST_ENTRIES ? "\n…(truncated)" : "";
  return entries.sort().join("\n") + truncated;
}

async function readFileTool(root: string, filePath: string): Promise<string> {
  const full = resolveInside(root, filePath);
  const stat = await fsp.stat(full);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes (${stat.size}).`);
  }
  return await fsp.readFile(full, "utf8");
}

async function grepText(root: string, pattern: string, subdir = "."): Promise<string> {
  const base = resolveInside(root, subdir);
  const hits: string[] = [];
  const regex = new RegExp(pattern);
  const walk = async (dir: string): Promise<void> => {
    if (hits.length >= 100) return;
    for (const item of await fsp.readdir(dir, { withFileTypes: true })) {
      if (hits.length >= 100) return;
      if (["node_modules", ".git", "dist", "out"].includes(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) { await walk(full); continue; }
      if (!/\.(ts|tsx|js|jsx|json|md|py|rs|java|css|html|vue|go|yml|yaml|toml)$/i.test(item.name)) continue;
      const stat = await fsp.stat(full);
      if (stat.size > MAX_FILE_BYTES) continue;
      const text = await fsp.readFile(full, "utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          hits.push(`${path.relative(root, full)}:${i + 1}: ${lines[i].slice(0, 300)}`);
          if (hits.length >= 100) return;
        }
      }
    }
  };
  await walk(base);
  return hits.length ? hits.join("\n") : "(no matches)";
}

function runShellCommand(root: string, command: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolvePromise) => {
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const flag = process.platform === "win32" ? "/c" : "-c";
    execFile(
      shell, [flag, command],
      { cwd: root, timeout: timeoutMs, maxBuffer: MAX_COMMAND_OUTPUT },
      (error, stdout, stderr) => {
        const trimmedOut = stdout.slice(0, MAX_COMMAND_OUTPUT);
        const trimmedErr = stderr.slice(0, MAX_COMMAND_OUTPUT);
        if (error) {
          const code = typeof error.code === "number" ? error.code : "non-zero";
          resolvePromise(`exit ${code}\nstdout:\n${trimmedOut || "(empty)"}\nstderr:\n${trimmedErr || "(empty)"}`);
        } else {
          resolvePromise(trimmedErr ? `${trimmedOut}\nstderr:\n${trimmedErr}` : trimmedOut || "(no output)");
        }
      },
    );
  });
}

/**
 * Execute a model-requested workspace tool. Mutations have already been
 * approved by the webview before reaching the host.
 */
export async function executeWorkspaceTool(
  root: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<{ ok: boolean; result: string }> {
  const str = (key: string, fallback = ""): string => {
    const value = args[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  try {
    switch (name) {
      case "list_files":
        return { ok: true, result: await listFiles(root, str("path", "."), typeof args.depth === "number" ? args.depth : 1) };
      case "read_file":
        return { ok: true, result: await readFileTool(root, str("path")) };
      case "grep":
        return { ok: true, result: await grepText(root, str("pattern"), str("path", ".")) };
      case "write_file": {
        const full = resolveInside(root, str("path"));
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, str("content"), "utf8");
        return { ok: true, result: `Wrote ${Buffer.byteLength(str("content"), "utf8")} bytes to ${path.relative(root, full)}.` };
      }
      case "run_command":
        return { ok: true, result: await runShellCommand(root, str("command"), typeof args.timeoutMs === "number" ? args.timeoutMs : 30_000) };
      default:
        return { ok: false, result: `Unknown tool '${name}'.` };
    }
  } catch (error) {
    return { ok: false, result: error instanceof Error ? error.message : String(error) };
  }
}
