import assert from "node:assert/strict";
import test from "node:test";
import { listChanges, openChange, parsePorcelain } from "../src/gbh/changes.ts";

/**
 * The diff tab is only as good as the porcelain parse and the HEAD lookup behind it, so both are locked
 * here — including a rename line, which is the shape people get wrong.
 */
const PORCELAIN = [
  " M src/gbh/tree.ts",
  "?? docs/SPIKE-gbh-mapping.md",
  "A  src/gbh/changes.ts",
  "R  old/name.ts -> new/name.ts",
  "D  gone.ts",
  "   ",
].join("\n");

test("porcelain lines become path + status, renames keep the new path", () => {
  assert.deepEqual(parsePorcelain(PORCELAIN), [
    { path: "src/gbh/tree.ts", status: "M" },
    { path: "docs/SPIKE-gbh-mapping.md", status: "??" },
    { path: "src/gbh/changes.ts", status: "A" },
    { path: "new/name.ts", status: "R" },
    { path: "gone.ts", status: "D" },
  ]);
  assert.deepEqual(parsePorcelain(""), []);
});

test("a folder that is not a git work tree reports no changes instead of throwing", async () => {
  const failing = async () => {
    throw new Error("fatal: not a git repository");
  };
  assert.deepEqual(await listChanges("/tmp/nowhere", failing), []);
  const working = async () => ({ stdout: " M a.ts\n" });
  assert.deepEqual(await listChanges("/repo", working), [{ path: "a.ts", status: "M" }]);
});

test("opening a change writes the committed side to a temp file and diffs it against the working copy", async () => {
  const calls: { left?: string; right?: string; title?: string; written?: string } = {};
  const title = await openChange("/repo", "src/a.ts", {
    readHead: async (cwd, path) => {
      calls.written = cwd + "|" + path;
      return "// HEAD\n";
    },
    writeTemp: async (content, name) => {
      calls.written = content;
      return "/tmp/gbh-diff/HEAD-src_a.ts";
    },
    openDiff: async (left, right, shown) => {
      calls.left = left;
      calls.right = right;
      calls.title = shown;
    },
  });
  assert.equal(title, "src/a.ts (HEAD ↔ hiện tại)");
  assert.equal(calls.written, "// HEAD\n");
  assert.equal(calls.left, "/tmp/gbh-diff/HEAD-src_a.ts");
  assert.equal(calls.right, "/repo/src/a.ts");
});

test("a file with no committed version still opens, against an empty left side", async () => {
  let written = "";
  await openChange("/repo", "new.ts", {
    readHead: async () => undefined,
    writeTemp: async (content) => {
      written = content;
      return "/tmp/left";
    },
    openDiff: async () => undefined,
  });
  assert.equal(written, "");
});
