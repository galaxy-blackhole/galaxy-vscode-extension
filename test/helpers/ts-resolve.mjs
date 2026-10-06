/**
 * Node runs the host tests straight from TypeScript sources. The host sources import each other the
 * way the bundler wants ("./config", no extension), which the ESM resolver refuses, so this hook
 * retries a failed relative specifier with ".ts", ".tsx" and "/index.ts" before giving up.
 *
 * Load it with: node --import ./test/helpers/ts-resolve.mjs --test test/*.test.ts
 */
import { register } from "node:module";
register(new URL("./ts-resolve-hooks.mjs", import.meta.url));
