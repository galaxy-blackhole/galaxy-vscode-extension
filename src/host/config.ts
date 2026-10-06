import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseThinkingChoice, resolveThinkingPolicy, toOllamaThinking } from "@galaxy-stack/ai-coder-core";
import { galaxyRefName, readGalaxyCredential } from "@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials";

export interface OllamaConnection {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly credentialSource: "manual-config" | "environment" | "none";
  /** Giá trị `think` gửi kèm mỗi lượt gọi model; undefined nghĩa là bật như trước giờ. */
  readonly thinking?: boolean | "low" | "medium" | "high" | "max";
}

/**
 * Where the shared Galaxy documents live (config.json, credentials.yaml).
 *
 * `GALAXY_HOME` lets CI and the extension-host tests point at a throwaway directory without moving the
 * editor's own HOME — on macOS a moved HOME hides the login keychain, and VS Code answers with a
 * "Keychain Not Found" dialog on every launch.
 */
export function galaxyHome(): string {
  const override = process.env.GALAXY_HOME?.trim();
  return override !== undefined && override.length > 0 ? override : path.join(os.homedir(), ".galaxy");
}

const DEFAULT_BASE_URL = "https://ollama.com";
const DEFAULT_MODEL = "kimi-k2.7-code:cloud";

/**
 * Read the manual provider entry from ~/.galaxy/config.json:
 * `{ agent: [{ type: "manual", apiKey, baseUrl?, model?, enabled? }, ...] }`.
 */
export function resolveOllamaConnection(): OllamaConnection {
  const configPath = path.join(galaxyHome(), "config.json");
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
  /* The shared document is the source of truth; config.json is the legacy mirror. */
  const canonical = canonicalKeyFor(providerIdFrom(configPath));
  const apiKey = canonical ?? pick("apiKey") ?? envKey;
  /* The thinking choice is stored per provider; the shared policy turns it into the value the wire takes. */
  const model = pick("model") ?? DEFAULT_MODEL;
  const thinkingChoice = pick("thinking");
  const thinkingPolicy = resolveThinkingPolicy({ model, ...(thinkingChoice === undefined ? {} : { preferred: thinkingChoice }) });
  const thinking = toOllamaThinking(thinkingPolicy, parseThinkingChoice(thinkingChoice) ?? thinkingPolicy.default);
  return Object.freeze({
    ...(apiKey ? { apiKey } : {}),
    baseUrl: (pick("baseUrl") ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model,
    ...(thinking === undefined ? {} : { thinking }),
    credentialSource: (canonical ?? pick("apiKey")) !== undefined ? "manual-config" : envKey !== undefined ? "environment" : "none",
  });
}

/** The provider the single `manual` entry stands for. */
function providerIdFrom(configPath: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { providers?: { active?: unknown } };
    const active = parsed.providers?.active;
    return typeof active === "string" && active.trim().length > 0 ? active.trim() : "galaxy";
  } catch {
    return "galaxy";
  }
}

/** Key from the shared credential document, when one is stored. */
function canonicalKeyFor(providerId: string): string | undefined {
  return readGalaxyCredential(galaxyRefName(providerId));
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
