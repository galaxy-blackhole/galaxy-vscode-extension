import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface OllamaConnection {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly credentialSource: "manual-config" | "environment" | "none";
}

const DEFAULT_BASE_URL = "https://ollama.com";
const DEFAULT_MODEL = "kimi-k2.7-code:cloud";

/**
 * Read the manual provider entry from ~/.galaxy/config.json:
 * `{ agent: [{ type: "manual", apiKey, baseUrl?, model?, enabled? }, ...] }`.
 */
export function resolveOllamaConnection(): OllamaConnection {
  const configPath = path.join(os.homedir(), ".galaxy", "config.json");
  let manual: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { agent?: unknown };
    if (Array.isArray(parsed.agent)) {
      manual = parsed.agent.find(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null &&
          (entry as Record<string, unknown>).type === "manual",
      ) as Record<string, unknown> | undefined;
    }
  } catch {
    manual = undefined;
  }
  const pick = (key: string): string | undefined => {
    const value = manual?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const envKey = process.env.OLLAMA_API_KEY?.trim();
  const apiKey = pick("apiKey") ?? envKey;
  return Object.freeze({
    ...(apiKey ? { apiKey } : {}),
    baseUrl: (pick("baseUrl") ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: pick("model") ?? DEFAULT_MODEL,
    credentialSource: pick("apiKey") ? "manual-config" : envKey ? "environment" : "none",
  });
}

/**
 * Provider-owned knowledge: derive the model's library page from the Ollama
 * base URL and model id (e.g. "glm-5.3-flash:cloud" → ollama.com/library/glm-5.3-flash).
 * The UI never hardcodes provider URL patterns; it only renders this link.
 */
export function resolveModelLibraryUrl(connection: OllamaConnection): string | undefined {
  if (!connection.baseUrl.includes("ollama.com")) return undefined;
  const bare = connection.model.split(":")[0]?.replace(/^ollama\//, "").trim();
  if (!bare) return undefined;
  return `https://ollama.com/library/${bare}`;
}
