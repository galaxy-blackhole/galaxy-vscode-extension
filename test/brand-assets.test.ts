/**
 * The brand-asset script is what keeps the extension's icon in step with the shared Galaxy Blackhole art.
 * This drives it for real (child process, throwaway tree) so the sync and the staleness gate both have to
 * work, not just look plausible.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const script = join(repo, "scripts", "sync-brand-assets.mjs");

/** Copy the script into a throwaway repo so it syncs there instead of the real tree. */
async function fixture<T>(body: (root: string, brand: string) => Promise<T>): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), "galaxy-brand-"));
  const root = join(base, "extension");
  const brand = join(base, "brand");
  try {
    await mkdir(join(root, "scripts"), { recursive: true });
    await cp(script, join(root, "scripts", "sync-brand-assets.mjs"));
    await mkdir(brand, { recursive: true });
    await writeFile(join(brand, "app-icon-512.png"), "brand-icon-v1", "utf8");
    await writeFile(join(brand, "logo.svg"), "<svg>v1</svg>", "utf8");
    return await body(root, brand);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

async function scriptRun(root: string, args: readonly string[]): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [join(root, "scripts", "sync-brand-assets.mjs"), ...args]);
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : 1, output: (failure.stdout ?? "") + (failure.stderr ?? "") };
  }
}

test("the script copies the brand art, records it, and refuses to pass when the source moves on", async () => {
  await fixture(async (root, brand) => {
    const before = await scriptRun(root, ["--check", "--brand", brand, "--check"]);
    assert.equal(before.code, 1, "without a manifest the check fails: " + before.output);
    const sync = await scriptRun(root, ["--brand", brand]);
    assert.equal(sync.code, 0, sync.output);
    assert.equal(await readFile(join(root, "resources", "icon.png"), "utf8"), "brand-icon-v1", "the icon is copied");
    assert.equal(await readFile(join(root, "resources", "icon.svg"), "utf8"), "<svg>v1</svg>");
    const manifest = JSON.parse(await readFile(join(root, "resources", "brand-assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 2, "both assets are recorded");
    assert.match(String(manifest.assets[0].sha256), /^[0-9a-f]{64}$/);
    assert.equal((await scriptRun(root, ["--check", "--brand", brand])).code, 0, "a fresh sync passes the check");

    await writeFile(join(brand, "logo.svg"), "<svg>v2</svg>", "utf8");
    const stale = await scriptRun(root, ["--check", "--brand", brand]);
    assert.equal(stale.code, 1, "brand art that moved on must fail the check");
    assert.match(stale.output, /brand art moved on/);

    await writeFile(join(root, "resources", "icon.png"), "hand edited", "utf8");
    const tampered = await scriptRun(root, ["--check", "--brand", brand]);
    assert.equal(tampered.code, 1);
    assert.match(tampered.output, /changed by hand/);

    assert.equal((await scriptRun(root, ["--brand", brand])).code, 0, "syncing again repairs everything");
    const after = await scriptRun(root, ["--check", "--brand", brand]);
    assert.equal(after.code, 0, after.output);

    const noSource = await scriptRun(root, ["--check", "--brand", join(root, "nope")]);
    assert.equal(noSource.code, 0, "without a brand checkout the manifest is still verified");
    assert.match(noSource.output, /manifest/);
  });
});