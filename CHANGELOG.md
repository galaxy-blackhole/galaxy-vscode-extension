# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# 2.0.3

## Added

- `yarn resources:sync` / `yarn resources:check`: the marketplace icon and the activity bar art are copied
  from the brand directory of the CLI repo and their hashes recorded, so a brand update can no longer
  leave a stale icon behind. CI clones the brand repo and runs the check.

## Fixed

- Command Palette entries still read "Galaxy Code"; they now read **Galaxy Blackhole**, matching the listing.
# 2.0.2

## Fixed

- The marketplace showed a placeholder instead of the Galaxy mark: the manifest had no `icon` field.
  It now ships the shared 512px app icon, and the activity bar carries the shared brand logo too.
- The activity bar container is titled **Galaxy Blackhole**, matching the listing.
# 2.0.1

First stable release of the 2.0 line. (`2.0.0` went out as a pre-release; the marketplace keeps
pre-release and release versions in separate channels, so the stable release carries the next version.)

The VS Code surface now runs the Galaxy Blackhole core (`@galaxy-stack/ai-coder-core`) — the same
engine as the CLI — instead of its own loop.

## Added

- Per-workspace session list with history: open, delete, start a session; the transcript comes back on
  screen, and the documents live outside the workspace.
- Project MCP servers from `.vscode/mcp.json`, read through the same core module the CLI uses; a server
  that will not start is reported instead of being dropped silently.
- Plan checklist from the agent checkpoints, rendered above the composer.
- `/compact` for the live run, and the compaction is reported to the view.
- Model and key setup edits the shared `~/.galaxy` document.

## Not in 2.0 yet (present in 0.1.x)

- The preview/RAG/workflow-graph/review commands and their keybindings are not part of this surface.
  They can return as the 2.0 line grows.
## [Unreleased]

### Changed

- **Runtime is now `@galaxy-stack/ai-coder-core`** (was a broken
  `@galaxy/ai-coder-core` link into the pre-restructure path). The webview keeps
  its `ui-protocol.ts` seam; only the host side changed.
- Host is durable instead of in-memory: `FileRunStore` checkpoints, a redacted
  NDJSON trace port, an 8 MiB tool-output spill, and the core's
  `NodeWorkspaceEvidenceVerifier` for resume — all under
  `context.globalStorageUri`, never inside the workspace.
- The five hand-written workspace tools were replaced by the core's canonical
  executor (`NodeToolExecutor` + `NodeWorkspaceReviewExecutor` when the workspace
  is not a Git work tree + a read-only `tool_output.read` artifact reader,
  composed through `CompositeToolExecutor`), so schemas, effect profile, policy,
  and idempotency come from the core.
- Approval prompts now flow through the core's approval port: the executor is
  built with the `strict` profile and the port applies the live webview mode
  (`ask` prompts, `smart` uses the `balanced` threshold, `auto`
  auto-approves).

### Added

- Command **Galaxy Blackhole: Open Web GUI** — runs `blackhole web --no-open`,
  scrapes the token URL from stdout, and opens it in the real browser. The web GUI
  is not embedded: its session cookie is `SameSite=Strict` and its `/api` fence
  rejects cross-site requests, so a `vscode-webview://` iframe could never
  authenticate.
- **Model setup panel** in the sidebar, mirroring the Galaxy Blackhole web
  surface: the active provider card with its API key field, a catalog of known
  routes, and the custom-provider form (provider id, display name, API protocol,
  base URL, models, optional key). It opens automatically when the active
  provider has no key and is reachable from the header's **Model** button.
- Provider list support in the shared `~/.galaxy/config.json`: the panel writes
  `providers.items` and mirrors the active provider into the single
  `agent[type=manual]` entry the core resolver reads, so the CLI, this extension,
  and the core adapter always agree. Keys are never sent to the webview.
- Provider keys are written to the **shared** `~/.galaxy/credentials.yaml`
  (`GBH_<ID>_API_KEY`, DSH's document schema) through
  `@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials`, while
  `config.json` keeps the compatibility mirror older builds read. Reading prefers
  the shared document, so a key stored by the CLI or the web GUI appears here
  without re-entry.
- Settings `galaxy-code.cliPath` and `galaxy-code.webPort`.
- `npm run test:host`: node:test coverage for the pure host helpers (web launcher
  argv and URL parsing, spill round-trip and traversal refusal, trace redaction,
  durable store creation) plus a `tsconfig.test.json` project.

## [2.0.0-prototype.0] - 2026-09-18

### Changed

- Marketplace display name: "Galaxy Code (v2 prototype)" → "Galaxy Blackhole".
- Marketplace item ID stays `kevinbui.galaxy-code-vscode` (IDs cannot be renamed;
  the old ID preserves install counts and ratings).
- Project joins the AI coding product line under the
  [galaxy-blackhole](https://github.com/galaxy-blackhole) organization.

## Historical

Prototype history lives in the git history of this repository.
