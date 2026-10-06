/**
 * Keep the extension's brand art in step with the shared Galaxy Blackhole assets.
 *
 * The source of truth is the brand directory of the CLI/web repo (`galaxy-code/web/brand`): the same mark
 * the web GUI and the installer use. Nobody should hand-copy it again, so this script copies the files,
 * records their hashes in resources/brand-assets.json, and can verify both later.
 *
 *   node scripts/sync-brand-assets.mjs            # copy + record
 *   node scripts/sync-brand-assets.mjs --check    # verify, exit 1 when stale
 *
 * The brand directory is found in this order: --brand <path>, GALAXY_BRAND_DIR, then the sibling checkout
 * ../galaxy-code/web/brand. Without it, --check still verifies the shipped files against the manifest.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repo, "resources", "brand-assets.json");

/** Source file in the brand directory -> file shipped inside the extension. */
export const ASSETS = [
  { source: "app-icon-512.png", target: "resources/icon.png", why: "marketplace listing icon" },
  { source: "logo.svg", target: "resources/icon.svg", why: "activity bar icon" },
];

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function brandDir(argv = [], env = process.env) {
  const flag = argv.indexOf("--brand");
  if (flag !== -1 && argv[flag + 1]) return resolve(argv[flag + 1]);
  if (env.GALAXY_BRAND_DIR) return resolve(env.GALAXY_BRAND_DIR);
  return resolve(repo, "..", "galaxy-code", "web", "brand");
}

function readManifest() {
  if (!existsSync(manifestPath)) return { assets: [] };
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    return { assets: Array.isArray(parsed.assets) ? parsed.assets : [] };
  } catch {
    return { assets: [] };
  }
}

function sync(source) {
  const manifest = [];
  for (const asset of ASSETS) {
    const from = join(source, asset.source);
    if (!existsSync(from)) {
      console.error("missing brand asset: " + from);
      return 1;
    }
    const bytes = readFileSync(from);
    const target = join(repo, asset.target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    manifest.push({ ...asset, sha256: sha256(bytes), bytes: bytes.length });
    console.log("synced " + asset.source + " -> " + asset.target + " (" + bytes.length + " bytes)");
  }
  writeFileSync(manifestPath, JSON.stringify({ assets: manifest }, null, 2) + String.fromCharCode(10));
  console.log("recorded resources/brand-assets.json from " + source);
  return 0;
}

function check(source, haveSource) {
  const manifest = readManifest();
  if (manifest.assets.length === 0) {
    console.error("resources/brand-assets.json is missing; run: yarn resources:sync");
    return 1;
  }
  let failures = 0;
  for (const recorded of manifest.assets) {
    const shipped = join(repo, recorded.target);
    if (!existsSync(shipped)) {
      console.error("shipped asset is gone: " + recorded.target);
      failures += 1;
      continue;
    }
    const shippedHash = sha256(readFileSync(shipped));
    if (shippedHash !== recorded.sha256) {
      console.error("shipped asset changed by hand: " + recorded.target + " (expected " + recorded.sha256.slice(0, 12) + ", found " + shippedHash.slice(0, 12) + ")");
      failures += 1;
      continue;
    }
    if (!haveSource) continue;
    const from = join(source, recorded.source);
    if (!existsSync(from)) {
      console.error("brand asset is gone: " + from);
      failures += 1;
      continue;
    }
    const sourceHash = sha256(readFileSync(from));
    if (sourceHash !== recorded.sha256) {
      console.error("brand art moved on: " + recorded.source + " differs from what is shipped; run: yarn resources:sync");
      failures += 1;
    }
  }
  if (failures > 0) return 1;
  console.log(haveSource
    ? "brand assets match " + source + " (" + manifest.assets.length + " files)"
    : "shipped brand assets match the manifest; brand checkout not found, so the source was not compared");
  return 0;
}

const argv = process.argv.slice(2);
const source = brandDir(argv);
const haveSource = existsSync(source);
const code = argv.includes("--check")
  ? check(source, haveSource)
  : haveSource
    ? sync(source)
    : (console.error("brand directory not found: " + source + " (pass --brand <path> or set GALAXY_BRAND_DIR)"), 1);
process.exitCode = code;