# Galaxy Blackhole for VS Code — v2 prototype branch

This branch is a **UI/evaluation prototype** for the next-generation Galaxy Blackhole
chat experience. It deliberately does **not** use `ai-coder-core`, subagents,
RAG, or any persistence — the goal is to evaluate display quality and
interaction of **assistant-ui primitives** with a plain Ollama (manual
provider) backend before the vetted core is integrated.

## What this branch contains

- React 19 + assistant-ui 0.15 (`useLocalRuntime`, `ThreadPrimitive`,
  `ComposerPrimitive`, `MessagePrimitive.Parts`) inside the sidebar webview.
- A thin extension host that:
  - reads the manual provider entry from `~/.galaxy/config.json`
    (`agent[type=manual]`: `apiKey`, optional `baseUrl`/`model`);
  - streams Ollama `/api/chat` NDJSON to the webview;
  - executes five workspace tools (`list_files`, `read_file`, `grep`,
    `write_file`, `run_command`) scoped to the current workspace folder.
- Mutating tools (`write_file`, `run_command`) are gated by an in-webview
  approval bar showing the exact path/content/command before execution.

## Layout

- `src/protocol.ts` — host ↔ webview message contract.
- `src/host/config.ts` — manual config resolution.
- `src/host/ollama-client.ts` — NDJSON streaming client.
- `src/host/workspace-tools.ts` — workspace-scoped tool execution.
- `src/host/chat-view-provider.ts` — webview provider, CSP, message routing.
- `webview/src/` — assistant-ui app (runtime adapter, tools, components).

## Run

```sh
yarn install
yarn run compile
```

Then press F5 in VS Code (Extension Development Host) and open the
"Galaxy Code" view container in the activity bar.

## Known prototype limits

- No conversation persistence, no checkpoints, no compaction, no tool
  registry hardening, no diff/validation gates — those belong to
  `@galaxy/ai-coder-core` and will be wired in after the UI is validated.
- `run_command` uses the host shell without containment (prototype-only; do
  not ship).
- Reasoning text renders via a custom collapsed part; assistant-ui's richer
  components (ChainOfThought, proper approval seam) are deliberately held back.
