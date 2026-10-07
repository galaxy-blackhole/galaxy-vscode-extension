import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { galaxyCredentialsPath, galaxyRefName, readGalaxyCredential, upsertGalaxyCredential } from "@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials";
import {
  activeModel,
  activeProvider,
  configPath,
  hydrateKeys,
  providerKeyConfigured,
  writeCanonicalKey,
  readModelSettings,
  removeProvider,
  setActiveProvider,
  setApiKey,
  summarize,
  upsertProvider,
  validateBaseUrl,
  validateProviderId,
  writeModelSettings,
} from "../src/host/model-settings.ts";

/* The document path alone is not enough: summarize() defaults to the credentials document in the
   real home, so every assertion about keys must be handed the temp one or it reads the developer's. */
async function withTempHome<T>(run: (path: string, home: string) => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "galaxy-settings-"));
  try {
    return await run(configPath(home), home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("a missing document reads as the bundled Galaxy provider", async () => {
  await withTempHome(async (path, home) => {
    const settings = readModelSettings(path);
    assert.equal(settings.active, "galaxy");
    assert.equal(activeProvider(settings).baseUrl, "https://ollama.com");
    assert.equal(activeModel(settings).length > 0, true);
    const summary = summarize(settings);
    assert.equal(summary.providers.length, 1);
    assert.equal(summarize(settings, galaxyCredentialsPath(home)).providers[0]?.keyConfigured, false, "a temp home has no key");
  });
});

test("a legacy agent-only document is still understood", async () => {
  await withTempHome(async path => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ agent: [{ type: "manual", apiKey: "sk-legacy", baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b" }] }), "utf8");
    const settings = readModelSettings(path);
    assert.equal(activeProvider(settings).apiKey, "sk-legacy");
    assert.equal(activeProvider(settings).baseUrl, "http://127.0.0.1:11434");
    assert.equal(activeModel(settings), "qwen3:8b");
  });
});

test("writing mirrors the active provider into the agent entry the core reads", async () => {
  await withTempHome(async path => {
    let settings = readModelSettings(path);
    settings = setApiKey(settings, "galaxy", "  sk-live  ");
    settings = upsertProvider(settings, Object.freeze({
      api: "ollama",
      baseUrl: "http://127.0.0.1:11434/",
      displayName: "Ollama local",
      id: "ollama-local",
      models: Object.freeze([{ id: "qwen3:8b" }]),
    }));
    settings = setActiveProvider(settings, "ollama-local");
    const credentialsPath = join(dirname(path), "credentials.yaml");
    writeModelSettings(settings, path, credentialsPath);

    const document = JSON.parse(await readFile(path, "utf8")) as {
      agent: { type: string; apiKey?: string; baseUrl: string; model: string }[];
      providers: { active: string; version: number; items: { id: string; apiKey?: string }[] };
    };
    assert.equal(document.agent.length, 1);
    assert.equal(document.agent[0]?.type, "manual");
    assert.equal(document.agent[0]?.baseUrl, "http://127.0.0.1:11434");
    assert.equal(document.agent[0]?.model, "qwen3:8b");
    assert.equal(document.agent[0]?.apiKey, undefined, "the local provider carries no key");
    assert.equal(document.providers.active, "ollama-local");
    assert.equal(document.providers.version, 1);
    const galaxy = document.providers.items.find(item => item.id === "galaxy");
    assert.equal(galaxy?.apiKey, undefined, "credentials no longer live in the mirror");
    assert.equal(readGalaxyCredential(galaxyRefName("galaxy"), credentialsPath), "sk-live", "the trimmed key lives in the shared store");

    const reread = readModelSettings(path);
    assert.equal(reread.providers.length, 2);
    assert.equal(activeModel(reread), "qwen3:8b");
    /* Round-tripping must not leak a key into the webview payload. */
    const summary = summarize(reread);
    assert.equal(JSON.stringify(summary).includes("sk-live"), false);
    assert.equal(summary.providers.find(provider => provider.id === "galaxy")?.keyConfigured, true);
  });
});

test("an empty key clears the stored value", async () => {
  await withTempHome(async (path, home) => {
    let settings = setApiKey(readModelSettings(path), "galaxy", "sk-first");
    settings = setApiKey(settings, "galaxy", "   ");
    writeModelSettings(settings, path);
    assert.equal(activeProvider(readModelSettings(path)).apiKey, undefined);
    assert.equal(summarize(readModelSettings(path), galaxyCredentialsPath(home)).providers[0]?.keyConfigured, false, "cleared keys are not configured");
  });
});

test("the active provider falls back when the selected one is removed, never to nothing", async () => {
  await withTempHome(async path => {
    let settings = readModelSettings(path);
    settings = upsertProvider(settings, Object.freeze({
      api: "openai-completions",
      baseUrl: "https://gateway.example/v1",
      displayName: "Gateway",
      id: "gateway",
      models: Object.freeze([{ id: "gpt-x" }]),
    }));
    settings = setActiveProvider(settings, "gateway");
    assert.equal(removeProvider(settings, "galaxy").active, "gateway");
    const onlyGalaxy = removeProvider(settings, "gateway");
    assert.equal(onlyGalaxy.active, "galaxy");
    assert.equal(removeProvider(onlyGalaxy, "galaxy").providers.length, 1, "the last provider cannot be removed");
    assert.equal(setActiveProvider(settings, "missing").active, "gateway");
  });
});

test("the custom-provider fields validate like the web GUI's own form", () => {
  assert.equal(validateProviderId("galaxy-cloud"), undefined);
  assert.match(validateProviderId("Galaxy") ?? "", /chữ thường/);
  assert.match(validateProviderId("9lives") ?? "", /chữ thường/);
  assert.equal(validateBaseUrl("https://gateway.example/v1"), undefined);
  assert.match(validateBaseUrl("ftp://x") ?? "", /HTTP/);
  assert.match(validateBaseUrl("not a url") ?? "", /HTTP/);
});
test("a key stored by another host hydrates the provider list and the summary", async () => {
  await withTempHome(async path => {
    const credentials = path + ".credentials.yaml";
    upsertGalaxyCredential(galaxyRefName("galaxy"), "sk-from-cli", credentials);
    const settings = readModelSettings(path);
    assert.equal(providerKeyConfigured(activeProvider(settings), credentials), true);
    const hydrated = hydrateKeys(settings, credentials);
    assert.equal(activeProvider(hydrated).apiKey, "sk-from-cli", "the canonical document wins over the empty mirror");
    const summary = summarize(hydrated, credentials);
    assert.equal(summary.providers[0]?.keyConfigured, true);
    assert.equal(JSON.stringify(summary).includes("sk-from-cli"), false, "the webview never receives the key");
  });
});

test("writing through the extension lands in the shared document", async () => {
  await withTempHome(async path => {
    const credentials = path + ".credentials.yaml";
    writeCanonicalKey("my-gateway", "  sk-gateway  ", credentials);
    assert.equal(readGalaxyCredential("GBH_MY_GATEWAY_API_KEY", credentials), "sk-gateway");
    writeCanonicalKey("my-gateway", "", credentials);
    assert.equal(readGalaxyCredential("GBH_MY_GATEWAY_API_KEY", credentials), undefined);
  });
});
