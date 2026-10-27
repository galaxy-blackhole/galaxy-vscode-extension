/*
 * What the session's workspace has changed, and how to show one file as a diff.
 *
 * Git is the source of truth here: the kernel writes files, git already knows what moved since HEAD, and
 * VS Code's own diff editor renders it. Nothing in this file touches the GBH web app.
 */
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

/** One changed path in the workspace. */
export interface ChangedFile {
  /** Path relative to the workspace root, git's own spelling. */
  readonly path: string;
  /** Two-letter porcelain status, trimmed of spaces: "M", "??", "D", "R". */
  readonly status: string;
}

/** Injectable git, so tests never spawn a real repository. */
export type GitRunner = (args: readonly string[], cwd: string) => Promise<{ stdout: string }>;

/** What {@link openDiff} needs, injectable for the same reason. */
export interface DiffDeps {
  readonly readHead: (cwd: string, relativePath: string) => Promise<string | undefined>;
  readonly writeTemp: (content: string, name: string) => Promise<string>;
  readonly openDiff: (left: string, right: string, title: string) => Promise<void>;
}

/**
 * Parse `git status --porcelain` output.
 * @param text - the command's stdout.
 * @returns one entry per changed path; renames keep the new path.
 */
export function parsePorcelain(text: string): ChangedFile[] {
  const out: ChangedFile[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length < 4) continue;
    const status = line.slice(0, 2).trim();
    const rest = line.slice(3);
    const path = rest.includes(" -> ") ? rest.split(" -> ").pop() ?? rest : rest;
    out.push({ path: path.replace(/^"|"$/gu, ""), status: status.length === 0 ? "?" : status });
  }
  return out;
}

/**
 * List the changed files of a workspace.
 * @param cwd - absolute workspace path.
 * @param git - git runner (defaults to the real one).
 * @returns changed files; a folder that is not a git work tree yields an empty list.
 */
export async function listChanges(cwd: string, git: GitRunner = defaultGit): Promise<ChangedFile[]> {
  try {
    const { stdout } = await git(["status", "--porcelain"], cwd);
    return parsePorcelain(stdout);
  } catch {
    return [];
  }
}

/**
 * Default git runner: spawn git with the workspace as -C.
 * @param args - git arguments.
 * @param cwd - workspace path.
 * @returns the command's stdout.
 */
async function defaultGit(args: readonly string[], cwd: string): Promise<{ stdout: string }> {
  const { stdout } = await run("git", ["-C", cwd, ...args], { maxBuffer: 8 * 1024 * 1024 });
  return { stdout };
}

/**
 * Read one file's committed version.
 * @param cwd - workspace path.
 * @param relativePath - path as git spells it.
 * @returns the blob text, or undefined when the file has no committed version.
 */
export async function readHead(cwd: string, relativePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["-C", cwd, "show", "HEAD:" + relativePath], { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * Write content to a throwaway file inside the OS temp folder.
 * @param content - text to write.
 * @param name - file name to use.
 * @returns the absolute path.
 */
export async function writeTempFile(content: string, name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gbh-diff-"));
  const target = join(dir, name);
  await writeFile(target, content, "utf8");
  return target;
}

/**
 * Open VS Code's diff editor for one changed file: committed version on the left, working tree on the right.
 * @param cwd - workspace path.
 * @param relativePath - the file, relative to cwd.
 * @param deps - injectable collaborators.
 * @returns the title shown on the diff tab.
 */
export async function openChange(cwd: string, relativePath: string, deps: Partial<DiffDeps> = {}): Promise<string> {
  const read = deps.readHead ?? readHead;
  const writeTemp = deps.writeTemp ?? writeTempFile;
  const show = deps.openDiff;
  const head = await read(cwd, relativePath);
  const title = relativePath + " (HEAD ↔ hiện tại)";
  if (show === undefined) return title;
  const left = await writeTemp(head ?? "", "HEAD-" + relativePath.replace(/[\\/]/gu, "_"));
  await show(left, join(cwd, relativePath), title);
  return title;
}
