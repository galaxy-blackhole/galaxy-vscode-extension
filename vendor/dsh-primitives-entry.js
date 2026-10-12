/**
 * The DSH primitives this webview uses, and nothing else. The package's own entry re-exports every component, so
 * importing one of them drags in the code-block stack (shiki, katex, two more @deepseek-ai packages); naming the
 * two here lets the bundler drop the rest.
 */
export { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export { DisclosureRow } from "@deepseek-ai/dsh-client-ui-primitives";
