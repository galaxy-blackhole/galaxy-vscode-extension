/**
 * Pure helpers for launching the Galaxy Blackhole web GUI from VS Code.
 *
 * Kept free of the `vscode` module so the argument builder and the URL scrape
 * can be unit tested with plain node:test.
 */

/** The CLI prints its URL as `dsh web: <url>` once the server is listening. */
export const WEB_URL_PATTERN = /dsh web:\s*(\S+)/;

export interface WebLaunchOptions {
  /** Extra args forwarded to `blackhole web`. */
  readonly extraArgs?: readonly string[];
  /** Listen port; omitted lets the CLI use its default. */
  readonly port?: number;
  /** Run the CLI as a child process without a shell where possible. */
  readonly platform?: NodeJS.Platform;
}

/** Resolve the CLI executable: an explicit setting wins over PATH. */
export function resolveCliCommand(configured?: string): string {
  const value = typeof configured === "string" ? configured.trim() : "";
  return value.length > 0 ? value : "blackhole";
}

/** Build the argv for `blackhole web`, always asking it not to open a browser. */
export function buildWebArgs(options: WebLaunchOptions = {}): string[] {
  const args = ["web", "--no-open"];
  if (typeof options.port === "number" && Number.isInteger(options.port) && options.port >= 0 && options.port <= 65535) {
    args.push("--port", String(options.port));
  }
  for (const extra of options.extraArgs ?? []) args.push(extra);
  return args;
}

/** Extract the GUI URL from one stdout chunk, if it already arrived. */
export function parseWebUrl(chunk: string): string | undefined {
  const match = WEB_URL_PATTERN.exec(chunk);
  const url = match?.[1];
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Message shown when the CLI cannot be spawned at all. */
export function missingCliMessage(command: string): string {
  return `Không chạy được "${command}". Cài CLI (npm i -g @galaxy-stack/blackhole-cli) hoặc đặt galaxy-code.cliPath tới binary blackhole.`;
}
