/*
 * Where the kernel keeps its state on this machine.
 *
 * The app home is GBH_HOME when set (the CLI passes it to its child), otherwise <home>/.galaxy/blackhole.
 * The spike only READS; it never writes under the app home.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** App home of the running kernel: GBH_HOME, else ~/.galaxy/blackhole. */
export function gbhHome(configured?: string): string {
  const explicit = configured?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const fromEnv = process.env.GBH_HOME?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return join(homedir(), ".galaxy", "blackhole");
}

/** Path of the workspace registry file. */
export function workspaceRegistryPath(home: string): string {
  return join(home, "storages", "workspace.json");
}

/** Directory holding one projection-cache JSON file per session. */
export function sessionCacheDir(home: string): string {
  return join(home, "storages", "session_projcache", "sessions");
}

/**
 * Ready-URL files the CLI writes after a host boot, newest first.
 * @param home - app home of the kernel.
 * @returns candidate paths; the caller tests which ones exist.
 */
export function readyUrlCandidates(home: string): string[] {
  const base = join(home, "ready-url.txt");
  const numbered = [0, 1, 2, 3].map((n) => join(home, "ready-url-" + String(n) + ".txt"));
  return [base, ...numbered];
}

/**
 * Read and parse the first ready-URL file that exists.
 * @param home - app home of the kernel.
 * @returns the URL the host printed, or undefined when no host has ever booted there.
 */
export function readReadyUrl(home: string): string | undefined {
  for (const candidate of readyUrlCandidates(home)) {
    if (!existsSync(candidate)) continue;
    const text = readFileSync(candidate, "utf8").trim();
    if (text.length > 0) return text;
  }
  return undefined;
}
