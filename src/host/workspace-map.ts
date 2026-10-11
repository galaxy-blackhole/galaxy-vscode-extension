import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** What the core accepts as context data: a named block of untrusted text. */
export interface ContextItem {
  readonly source: string;
  readonly content: string;
}

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"] as const;
const SKIPPED = new Set([
  ".git", ".next", ".turbo", ".venv", ".vscode-test", "build", "coverage", "dist", "node_modules", "out", "target", "vendor",
]);
const MAX_ENTRIES = 40;
const MAX_DEPTH = 2;
const MAX_DIRS = 120;
const MAX_CONTENT = 2400;

function listDirectories(root: string, depth: number, budget: { left: number }): readonly string[] {
  if (depth < 0 || budget.left <= 0) return [];
  let entries: readonly string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(".") === false && SKIPPED.has(entry.name) === false)
      .map((entry) => entry.name)
      .sort();
  } catch { return []; }
  const found: string[] = [];
  for (const name of entries) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    found.push(depth === 0 ? name : name);
    if (depth > 0) found.push(...listDirectories(join(root, name), depth - 1, budget).map((child) => name + "/" + child));
  }
  return found;
}

/**
 * A compact map of the workspace, for the model's first round. Without one the agent opens every task by listing the
 * root directory and guessing which of the entries matter; with one it starts at the files that do. Bounded on
 * purpose: a map that costs seconds or thousands of tokens would defeat the reason to send it.
 */
export function buildWorkspaceMap(workspaceRoot: string): ContextItem | null {
  try {
    const top = readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => SKIPPED.has(entry.name) === false)
      .map((entry) => (entry.isDirectory() ? entry.name + "/" : entry.name))
      .sort();
    if (top.length === 0) return null;
    const directories = listDirectories(workspaceRoot, MAX_DEPTH - 1, { left: MAX_DIRS }).slice(0, MAX_DIRS);
    const highlights: string[] = [];
    for (const manifest of MANIFESTS) {
      try {
        const raw = readFileSync(join(workspaceRoot, manifest), "utf8");
        if (manifest === "package.json") {
          const parsed = JSON.parse(raw) as { name?: string; version?: string; scripts?: Record<string, string> };
          highlights.push("package.json: " + (parsed.name ?? "?") + "@" + (parsed.version ?? "?") + " scripts=" + Object.keys(parsed.scripts ?? {}).join(","));
        } else {
          highlights.push(manifest + ": " + raw.split("\n").slice(0, 6).join(" ").slice(0, 200));
        }
      } catch { /* an absent or unreadable manifest is simply not a highlight */ }
    }
    const lines = [
      "workspace: " + workspaceRoot,
      "root: " + top.slice(0, MAX_ENTRIES).join("  "),
      ...(directories.length === 0 ? [] : ["directories: " + directories.join("  ")]),
      ...highlights,
    ];
    return Object.freeze({
      source: "workspace_map",
      content: "Bản đồ workspace (host cấp, có thể cũ). Dùng để bắt đầu ở đúng file thay vì liệt kê lại từ đầu." + "\n" + lines.join("\n").slice(0, MAX_CONTENT),
    });
  } catch {
    return null;
  }
}
