import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Where the sandbox worker lives at run time.
 *
 * The extension is bundled to a single file, so the core's own `import.meta.url` would point at this bundle. The
 * build step emits the worker next to it (`dist/code-worker-entry.mjs`) and this is how the runtime finds it.
 */
export function codeWorkerUrl(): URL {
  /* The extension is bundled to CommonJS, so __dirname is the bundle's own directory. */
  return new URL("code-worker-entry.mjs", pathToFileURL(__dirname + path.sep));
}
