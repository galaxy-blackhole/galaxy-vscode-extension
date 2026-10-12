/**
 * Bundle the two DSH primitives this webview uses into webview/src/dsh-primitives.js (+ .css).
 *
 * The package resolves its dependencies from the installed DSH tree, read-only, so the output here is the only
 * thing written: nothing in that tree is touched. esbuild's `local-css` loader gives the CSS modules their scoped
 * names and the JS object the components read.
 */
import { build } from "esbuild";
function installedNodeModules() {
  if (process.env.GBH_DSH_NODE_MODULES) return [process.env.GBH_DSH_NODE_MODULES];
  return ["/Users/buitronghieu/.nvm/versions/node/v26.9.0/lib/node_modules/@galaxy-stack/blackhole-cli/node_modules"];
}
await build({
  entryPoints: ["vendor/dsh-primitives-entry.js"],
  bundle: true,
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  format: "esm",
  loader: { ".module.css": "local-css" },
  nodePaths: installedNodeModules(),
  outfile: "webview/src/dsh-primitives.js",
  logLevel: "warning",
});
console.log("đã bundle primitives của DSH");
