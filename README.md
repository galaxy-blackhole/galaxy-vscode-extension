# Galaxy Blackhole for VS Code

VS Code host for the Galaxy AI Coder runtime
([`@galaxy-stack/ai-coder-core`](https://www.npmjs.com/package/@galaxy-stack/ai-coder-core)).
The agent loop, context assembly, tool registry, approvals, checkpoints and the
completion gate live in that package; this extension owns the VS Code surface
(sidebar chat, workspace/command adapters, approvals, storage) and nothing else.

Marketplace identity is frozen: item ID `kevinbui.galaxy-code-vscode`,
displayName "Galaxy Blackhole".
## What it does

- **Chat that keeps its history.** Every workspace has a session list: the host stores one document per
  session outside the workspace, and the panel can open, delete or start one. Opening a session puts its
  transcript back on screen.
- **The MCP servers a project declares.** `.vscode/mcp.json` is read through the same core module the CLI
  uses, so a server works in both. A server that will not start is named in an error event instead of
  silently dropping its tools.
- **A plan you can see.** The checklist the agent maintains renders as a strip above the composer, and
  `/compact` compacts the live run the way the web GUI does.
- **Approvals and model setup in the view.** Risky tools ask through the webview (ask / smart / auto), and
  the model panel edits the same `~/.galaxy` document the CLI reads.
- **The agent loop is not here.** Context assembly, tools, checkpoints and the completion gate live in
  `@galaxy-stack/ai-coder-core` — the engine the CLI runs — so the two cannot drift apart.

## Layout

| Path | Role |
| --- | --- |
| `src/extension.ts` | Activation: sidebar view, commands (`openChat`, `newThread`, `openWeb`). |
| `src/host/chat-view-provider.ts` | Webview provider, CSP, host↔webview routing, run lifecycle. |
| `src/host/core-run-session.ts` | Composes one core run: model adapter, tools, durable store, trace, spill; maps core events to the UI wire. |
| `src/host/core-host.ts` | Durable host adapters shared with the CLI: `FileRunStore`, NDJSON trace port (redacted), tool-output spill, resume evidence verifier. |
| `src/host/core-tool-executor.ts` | Composes `NodeToolExecutor` + snapshot reviewer + artifact reader, and bridges approvals to the webview. |
| `src/host/core-model.ts` | `CodingModelAdapter` over the Ollama chat API. |
| `src/host/web-launcher-core.ts` / `web-launcher.ts` | `blackhole web` launcher: argv builder + URL scrape (pure), process handling and `openExternal` (VS Code). |
| `src/ui-protocol.ts` | The only contract the webview sees; core event shapes never cross it. |
| `webview/src/` | React 19 + assistant-ui app rendered inside the sidebar. |
| `resources/` | Brand art synced from the brand repo (see below), never hand-drawn. |


## Brand assets

The icon the marketplace shows (`resources/icon.png`) and the activity bar art (`resources/icon.svg`) come
from the brand directory of the CLI repo — the same mark the web GUI uses — so they are copied, never drawn:

```bash
yarn resources:sync     # copy from ../galaxy-code/web/brand and record what was copied
yarn resources:check    # fail when the brand art moved on, or when a shipped file was edited by hand
```

`resources/brand-assets.json` records the source and hash of each file. CI clones the brand repo and runs
the check, so a brand update that never reaches this extension fails the build instead of shipping a stale icon.
## Commands and settings

| Command | Behaviour |
| --- | --- |
| `Galaxy Blackhole: Open Chat` | Focus the sidebar view. |
| `Galaxy Blackhole: New Thread` | Clear the webview transcript. |
| `Galaxy Blackhole: Open Web GUI` | Runs `blackhole web --no-open`, scrapes the token URL from its stdout, and opens it in the real browser. |

| Setting | Default | Meaning |
| --- | --- | --- |
| `galaxy-code.cliPath` | `blackhole` | Path to the CLI used by the web command. |
| `galaxy-code.webPort` | `3090` | Port handed to `blackhole web`. |

The web GUI is deliberately **not** embedded in a webview: its session cookie is
`SameSite=Strict` and its `/api` fence rejects cross-site requests, so an iframe
inside `vscode-webview://` can never authenticate. Launching the CLI and handing
the URL to the browser is the integration that works.

## Model setup

When the active provider has no key, the sidebar opens a **Thiết lập model** panel
that mirrors the Galaxy Blackhole web surface (same wording, trimmed): the active
provider card with its API key field, a small catalog of known routes, and the
custom-provider form (provider id, display name, API protocol, base URL, models,
optional key). It is also reachable any time from the **Model** button in the
header.

Everything it edits lives in the document the CLI already reads —
`~/.galaxy/config.json`:

```jsonc
{
  "agent": [{ "type": "manual", "apiKey": "…", "baseUrl": "…", "model": "…" }],
  "providers": { "version": 1, "active": "galaxy", "items": [ /* what the panel edits */ ] }
}
```

`providers.items` is the list this UI owns; `agent[0]` is a mirror of the active
provider that the core's own resolver reads, regenerated on every write so the
CLI, this extension, and the core adapter always agree. Keys never reach the
webview — the panel only learns whether one exists.

## Storage

Provider secrets live in the **shared** `~/.galaxy/credentials.yaml` (see
`documents/GALAXY_CREDENTIALS_SETTINGS_SYNC_PLAN.md`): the panel writes there and
keeps the `config.json` mirror for older builds, so a key entered here is also
seen by the CLI, the desktop app, and the web GUI.

Everything else durable lives under `context.globalStorageUri` — never inside the
workspace, which is what the core's checkpoint-trust contract requires:

```
<globalStorage>/runs/<runId>/      checkpoints + final report
<globalStorage>/logs/host-<day>.ndjson   redacted trace journal
<globalStorage>/spill/<runId>/<id>.log   oversized tool output
```

## Development

```sh
npm install          # the core is linked as file:../galaxy-ai-coder-core
npm run check-types  # host, webview, and host-test projects
npm run test:host    # node:test over the pure host helpers
npm run test:webview # rendered-webview smoke test
npm run compile      # esbuild host bundle + vite webview bundle
```

Press F5 for an Extension Development Host and open the "Galaxy Chat" view.

## Host conformance status

Done: canonical tool set and effect profile come from the core, durable run
store, trace port, output spill, resume evidence verifier, live approval bridge,
Git probe with the snapshot-review fallback.

Not done yet: the deterministic fixture matrix in
[`docs/HOST_CONFORMANCE.md`](../galaxy-ai-coder-core/docs/HOST_CONFORMANCE.md)
has not been run against this host, command containment is still the adapter
default, and only one run at a time is supported.
