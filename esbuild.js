const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const options = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node20",
    outdir: "dist",
    external: ["vscode"],
    logLevel: "info",
  };
  /*
   * The sandbox worker is a second entry point: it runs on its own thread with its own module graph, so it
   * cannot be part of the extension bundle. The runtime finds it at dist/code-worker-entry.mjs.
   */
  const worker = {
    entryPoints: ["node_modules/@galaxy-stack/ai-coder-core/dist/adapters/node/code-runtime/code-worker-entry.js"],
    bundle: true,
    format: "esm",
    outfile: "dist/code-worker-entry.mjs",
    platform: "node",
    target: "node20",
    logLevel: "info",
  };
  if (watch) {
    const workerContext = await esbuild.context(worker);
    await workerContext.watch();
  } else {
    await esbuild.build(worker);
  }
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("[watch] esbuild is watching...");
  } else {
    await esbuild.build(options);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
