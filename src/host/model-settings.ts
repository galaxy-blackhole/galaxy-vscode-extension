import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  galaxyCredentialsPath,
  galaxyRefName,
  readGalaxyCredential,
  upsertGalaxyCredential,
} from "@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials";
import { galaxyHome } from "./config";
import type { ModelSettings, ModelSettingsSummary, ProviderApi, ProviderEntry, ProviderModel, ProviderSummary } from "../model-settings-types";

export type { ModelSettings, ModelSettingsSummary, ProviderApi, ProviderEntry, ProviderModel, ProviderSummary } from "../model-settings-types";

/**
 * The Galaxy model/credential document shared by the CLI and this extension.
 *
 * `~/.galaxy/config.json` keeps the provider list this UI edits plus the single
 * `agent[type=manual]` entry the core's own resolver reads, so the CLI, the
 * extension, and the core adapter always agree on the active provider. Keys are
 * written once, inside the provider entry; the `agent` mirror is regenerated on
 * every write and never edited by hand.
 *
 * The web GUI (DSH) keeps its own `settings.yaml` + `.credentials.yaml` today;
 * unifying those stores is a separate, planned change, and this module is the
 * single seam it will touch.
 */

const DEFAULT_PROVIDER: ProviderEntry = Object.freeze({
  api: "ollama",
  baseUrl: "https://ollama.com",
  displayName: "Galaxy Blackhole",
  id: "galaxy",
  models: Object.freeze([{ id: "deepseek-v4.1-flash:cloud", name: "Auto" }]),
});

const DEFAULT_MODEL = "deepseek-v4.1-flash:cloud";

/** `~/.galaxy/config.json`, or an explicit path for tests. */
export function configPath(home?: string): string {
  /* A harness can move the whole directory with GALAXY_HOME; an explicit home still wins for tests. */
  if (home !== undefined) return join(home, ".galaxy", "config.json");
  return join(galaxyHome(), "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeModels(value: unknown): readonly ProviderModel[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const models: ProviderModel[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) models.push(Object.freeze({ id: item.trim() }));
    else if (isRecord(item)) {
      const id = readString(item["id"]);
      if (id === undefined) continue;
      const name = readString(item["name"]);
      models.push(Object.freeze(name === undefined ? { id } : { id, name }));
    }
  }
  return Object.freeze(models);
}

function normalizeProvider(value: unknown): ProviderEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value["id"]) ?? readString(value["providerId"]);
  const baseUrl = readString(value["baseUrl"]) ?? readString(value["baseURL"]);
  if (id === undefined || baseUrl === undefined) return undefined;
  const api = value["api"] === "openai-completions" ? "openai-completions" : "ollama";
  const apiKey = readString(value["apiKey"]);
  return Object.freeze({
    api,
    ...(apiKey === undefined ? {} : { apiKey }),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    displayName: readString(value["displayName"]) ?? id,
    id,
    models: normalizeModels(value["models"]),
  });
}

/** Read the document, falling back to the bundled Galaxy default. */
export function readModelSettings(path: string = configPath()): ModelSettings {
  let parsed: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(raw)) parsed = raw;
  } catch {
    parsed = undefined;
  }
  const providers: ProviderEntry[] = [];
  const stored = parsed?.["providers"];
  const items = isRecord(stored) && Array.isArray(stored["items"]) ? stored["items"] : [];
  for (const item of items) {
    const provider = normalizeProvider(item);
    if (provider !== undefined) providers.push(provider);
  }
  /* The `agent[type=manual]` mirror keeps working for documents written before this UI existed. */
  if (providers.length === 0) {
    const agents = parsed?.["agent"];
    const manual = Array.isArray(agents) ? agents.find(entry => isRecord(entry) && entry["type"] === "manual") : undefined;
    if (isRecord(manual)) {
      providers.push(Object.freeze({
        api: "ollama" as const,
        ...(readString(manual["apiKey"]) === undefined ? {} : { apiKey: readString(manual["apiKey"]) as string }),
        baseUrl: (readString(manual["baseUrl"]) ?? DEFAULT_PROVIDER.baseUrl).replace(/\/+$/, ""),
        displayName: DEFAULT_PROVIDER.displayName,
        id: DEFAULT_PROVIDER.id,
        models: Object.freeze([{ id: readString(manual["model"]) ?? DEFAULT_MODEL }]),
      }));
    }
  }
  if (providers.length === 0) providers.push(DEFAULT_PROVIDER);
  const activeStored = isRecord(stored) ? readString(stored["active"]) : undefined;
  const active = providers.some(provider => provider.id === activeStored) ? (activeStored as string) : (providers[0] as ProviderEntry).id;
  return Object.freeze({ active, providers: Object.freeze(providers) });
}

/** The active model id, defaulting when the provider declares none. */
export function activeModel(settings: ModelSettings): string {
  const provider = settings.providers.find(entry => entry.id === settings.active) ?? settings.providers[0];
  return provider?.models[0]?.id ?? DEFAULT_MODEL;
}

/**
 * Overlay the shared credential document onto the provider list.
 *
 * The canonical `~/.galaxy/credentials.yaml` is where every host writes secrets;
 * `config.json` only carries the compatibility mirror older builds still read.
 * Hydrating keeps the mirror, the summary, and the model adapter consistent even
 * when a key was written by the CLI or the web GUI.
 */
export function hydrateKeys(settings: ModelSettings, credentialsPath: string = galaxyCredentialsPath()): ModelSettings {
  const missing = settings.providers.some(provider => (provider.apiKey ?? "").length === 0);
  if (!missing) return settings;
  return Object.freeze({
    active: settings.active,
    providers: Object.freeze(settings.providers.map(provider => {
      if ((provider.apiKey ?? "").length > 0) return provider;
      const value = readGalaxyCredential(galaxyRefName(provider.id), credentialsPath);
      return value === undefined ? provider : Object.freeze({ ...provider, apiKey: value });
    })),
  });
}

/** Whether one provider has a usable key in either store. */
export function providerKeyConfigured(provider: ProviderEntry, credentialsPath: string = galaxyCredentialsPath()): boolean {
  if ((provider.apiKey ?? "").length > 0) return true;
  return readGalaxyCredential(galaxyRefName(provider.id), credentialsPath) !== undefined;
}

/**
 * Write one provider key into the shared document. An empty value clears the
 * reference; the caller still refreshes the `config.json` mirror for old builds.
 */
export function writeCanonicalKey(providerId: string, apiKey: string, credentialsPath: string = galaxyCredentialsPath()): void {
  upsertGalaxyCredential(galaxyRefName(providerId), apiKey.trim(), credentialsPath);
}

/** The active provider, never undefined for a document this module produced. */
export function activeProvider(settings: ModelSettings): ProviderEntry {
  return settings.providers.find(entry => entry.id === settings.active) ?? (settings.providers[0] as ProviderEntry);
}

/** Strip keys: what the webview may render. */
export function summarize(settings: ModelSettings, credentialsPath: string = galaxyCredentialsPath()): ModelSettingsSummary {
  return Object.freeze({
    activeProviderId: settings.active,
    model: activeModel(settings),
    providers: Object.freeze(settings.providers.map(provider => Object.freeze({
      active: provider.id === settings.active,
      api: provider.api,
      baseUrl: provider.baseUrl,
      displayName: provider.displayName,
      id: provider.id,
      keyConfigured: providerKeyConfigured(provider, credentialsPath),
      models: provider.models,
    }))),
  });
}

/**
 * Write the document: the provider list plus the single `agent` entry the core
 * resolver reads. The write is atomic (temp file + rename) and 0600.
 */
export function writeModelSettings(settings: ModelSettings, path: string = configPath()): void {
  const provider = activeProvider(settings);
  const document = {
    agent: [
      {
        type: "manual",
        ...(provider.apiKey === undefined ? {} : { apiKey: provider.apiKey }),
        baseUrl: provider.baseUrl.replace(/\/+$/, ""),
        model: activeModel(settings),
        ...(provider.thinking === undefined ? {} : { thinking: provider.thinking }),
      },
    ],
    providers: {
      version: 1,
      active: provider.id,
      items: settings.providers.map(entry => ({
        id: entry.id,
        displayName: entry.displayName,
        api: entry.api,
        baseUrl: entry.baseUrl.replace(/\/+$/, ""),
        ...(entry.apiKey === undefined ? {} : { apiKey: entry.apiKey }),
        models: entry.models.map(model => (model.name === undefined ? { id: model.id } : { id: model.id, name: model.name })),
      })),
    },
  };
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".tmp";
  writeFileSync(temporary, JSON.stringify(document, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

/** Insert or replace one provider, preserving the active selection when it still exists. */
export function upsertProvider(settings: ModelSettings, entry: ProviderEntry): ModelSettings {
  const providers = settings.providers.filter(provider => provider.id !== entry.id);
  providers.push(entry);
  return Object.freeze({ active: settings.active, providers: Object.freeze(providers) });
}

/** Set the active provider, ignoring an unknown id. */
export function setActiveProvider(settings: ModelSettings, id: string): ModelSettings {
  if (!settings.providers.some(provider => provider.id === id)) return settings;
  return Object.freeze({ active: id, providers: settings.providers });
}

/**
 * Choose which of a provider's models is active. The first entry is the one the host runs, and the
 * `agent[manual]` mirror is regenerated from it on every write.
 */
export function setProviderModel(settings: ModelSettings, id: string, modelId: string): ModelSettings {
  let found = false;
  const providers = settings.providers.map(provider => {
    if (provider.id !== id) return provider;
    const chosen = provider.models.find(model => model.id === modelId);
    if (chosen === undefined) return provider;
    found = true;
    return Object.freeze({ ...provider, models: Object.freeze([chosen, ...provider.models.filter(model => model.id !== modelId)]) });
  });
  return found ? Object.freeze({ active: settings.active, providers: Object.freeze(providers) }) : settings;
}

/** Choose the reasoning effort for a provider; the shared policy maps it to the wire value. */
export function setProviderThinking(settings: ModelSettings, id: string, choice: string): ModelSettings {
  let found = false;
  const providers = settings.providers.map(provider => {
    if (provider.id !== id) return provider;
    found = true;
    const { thinking: _previous, ...rest } = provider;
    return Object.freeze(choice.trim().length === 0 ? { ...rest } : { ...rest, thinking: choice.trim() });
  });
  return found ? Object.freeze({ active: settings.active, providers: Object.freeze(providers) }) : settings;
}

/** Store a key for one provider; an empty value clears it. */
export function setApiKey(settings: ModelSettings, id: string, apiKey: string): ModelSettings {
  const trimmed = apiKey.trim();
  const providers = settings.providers.map(provider => {
    if (provider.id !== id) return provider;
    const { apiKey: _previous, ...rest } = provider;
    return Object.freeze(trimmed.length === 0 ? { ...rest } : { ...rest, apiKey: trimmed });
  });
  return Object.freeze({ active: settings.active, providers: Object.freeze(providers) });
}

/** Remove one provider; the last one cannot be removed. */
export function removeProvider(settings: ModelSettings, id: string): ModelSettings {
  if (settings.providers.length <= 1) return settings;
  const providers = settings.providers.filter(provider => provider.id !== id);
  const active = providers.some(provider => provider.id === settings.active) ? settings.active : (providers[0] as ProviderEntry).id;
  return Object.freeze({ active, providers: Object.freeze(providers) });
}

/** Validate one custom-provider draft the way the web GUI validates its own form. */
export function validateProviderId(value: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) return "Bắt đầu bằng chữ thường; sau đó là chữ thường, chữ số và dấu gạch ngang.";
  return undefined;
}

export function validateBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "Nhập URL HTTP hoặc HTTPS hợp lệ.";
    return undefined;
  } catch {
    return "Nhập URL HTTP hoặc HTTPS hợp lệ.";
  }
}
