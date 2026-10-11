import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildWorkspaceMap } from "../src/host/workspace-map";

test("the workspace map names the root, the directories and the manifest, and stays small", () => {
  const root = mkdtempSync(join(tmpdir(), "gbh-map-"));
  mkdirSync(join(root, "src", "host"), { recursive: true });
  mkdirSync(join(root, "node_modules", "left-pad"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo", version: "1.2.3", scripts: { build: "tsc" } }));
  writeFileSync(join(root, "README.md"), "# demo");
  const map = buildWorkspaceMap(root);
  assert.ok(map !== null, "a real workspace produces a map");
  assert.equal(map.source, "workspace_map");
  assert.match(map.content, /package\.json: demo@1\.2\.3/, "the manifest is summarised");
  assert.match(map.content, /src\//, "directories appear");
  assert.doesNotMatch(map.content, /node_modules/, "noise directories are left out");
  assert.ok(map.content.length <= 2600, "the map stays small: " + map.content.length);
});

test("an unreadable workspace is not an error", () => {
  assert.equal(buildWorkspaceMap(join(tmpdir(), "gbh-does-not-exist-9f2")), null);
});
