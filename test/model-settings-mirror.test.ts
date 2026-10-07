/**
 * The mirror in config.json no longer carries credentials: keys live in the shared store, and one that only the
 * mirror knows is copied across before the write so nothing written by an older version is lost.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { galaxyRefName, readGalaxyCredential } from "@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials";
import { readModelSettings, writeModelSettings } from "../src/host/model-settings.ts";

test("the mirror carries no credentials, and a key only it knows reaches the shared store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "galaxy-mirror-"));
  try {
    const configPath = join(dir, "config.json");
    const credentialsPath = join(dir, "credentials.yaml");
    await writeFile(configPath, JSON.stringify({
      providers: { version: 1, active: "galaxy", items: [{ id: "galaxy", displayName: "Galaxy Blackhole", api: "ollama", baseUrl: "https://ollama.com", apiKey: "sk-legacy", models: [{ id: "deepseek-v4.1-flash:cloud" }] }] },
    }), "utf8");

    writeModelSettings(readModelSettings(configPath), configPath, credentialsPath);

    const mirror = JSON.parse(await readFile(configPath, "utf8")) as { agent: Record<string, unknown>[]; providers: { items: Record<string, unknown>[] } };
    assert.equal("apiKey" in mirror.agent[0]!, false, "the manual entry keeps no key: " + JSON.stringify(mirror.agent[0]));
    assert.equal("apiKey" in mirror.providers.items[0]!, false, "and neither does the provider list");
    assert.equal(mirror.agent[0]!["model"], "deepseek-v4.1-flash:cloud", "the rest of the entry is untouched");
    assert.equal(readGalaxyCredential(galaxyRefName("galaxy"), credentialsPath), "sk-legacy", "the legacy key moved to the shared store");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a key already in the shared store is left alone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "galaxy-mirror-"));
  try {
    const configPath = join(dir, "config.json");
    const credentialsPath = join(dir, "credentials.yaml");
    await writeFile(credentialsPath, "version: 1\nrefs:\n  " + galaxyRefName("galaxy") + ": sk-shared\n", "utf8");
    await writeFile(configPath, JSON.stringify({
      providers: { version: 1, active: "galaxy", items: [{ id: "galaxy", displayName: "Galaxy Blackhole", api: "ollama", baseUrl: "https://ollama.com", apiKey: "sk-stale", models: [{ id: "m" }] }] },
    }), "utf8");
    writeModelSettings(readModelSettings(configPath), configPath, credentialsPath);
    assert.equal(readGalaxyCredential(galaxyRefName("galaxy"), credentialsPath), "sk-shared", "the shared store wins over a stale mirror");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});