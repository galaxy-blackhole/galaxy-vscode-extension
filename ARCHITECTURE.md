# Galaxy VS Code Extension Architecture

## Layers

```
extension.ts                  activation, commands, view registration
  └─ chat-view-provider.ts    webview provider, CSP, message routing, run lifecycle
       ├─ core-run-session.ts one run: composition + core-event→UI mapping
       │    ├─ core-model.ts          CodingModelAdapter over Ollama
       │    ├─ core-tool-executor.ts  NodeToolExecutor + reviewer + artifacts + approvals
       │    └─ core-host.ts           FileRunStore, NDJSON trace, spill, evidence verifier
       └─ web-launcher.ts      blackhole web launcher (CLI child process → browser)
webview/src/                  React 19 + assistant-ui UI (no vscode import, no core import)
ui-protocol.ts                the only contract crossing the webview boundary
```

The core package is a runtime dependency, not a code source: this repository must
not copy agent-loop, context, registry, or completion logic. The core's README
states the rule the other way round — hosts implement ports and pass the
conformance fixtures instead of duplicating the runtime.

## One run, end to end

1. The webview sends `ui-action: run/start` with the task text.
2. `core-run-session` probes model capabilities, then builds the host in parallel:
   durable run store, NDJSON trace port, resume evidence verifier, Git probe.
3. `core-tool-executor` composes the executor the runtime sees:
   - `NodeWorkspacePort` / `NodeCommandPort` — workspace-scoped Node adapters;
   - `NodeToolExecutor` — the core's canonical 21-tool catalog and effect profile;
   - `NodeWorkspaceReviewExecutor` — **only** when the workspace is not a Git work
     tree, because outside Git it is what attests `inspect`/`diff_review` evidence;
   - `AgentToolExecutor` — the read-only `tool_output.read` artifact reader;
   - `CompositeToolExecutor` — routes each call to the child that owns it.
4. `AiCoderRunController.start` runs the core loop; every runtime event crosses
   `mapCoreEventToUi` — the single file that knows core event shapes.
5. The run handle exposes `cancel`, `pause`, and `resolveApproval`; the terminal
   state is reported back to the webview.

## Approvals

The executor is constructed with the `strict` approval profile so the approval
port sees every call the strictest policy would question. The port then applies
the live webview mode, which can relax or bypass that threshold:

| Webview mode | Behaviour |
| --- | --- |
| `ask` | Prompt on every call the strict profile questions. |
| `smart` | Prompt only when `requiresAiCoderApproval("balanced", tool)` is true. |
| `auto` | Approve without prompting. |

A prompt travels to the webview as `pending-approval`; the answer arrives as
`approval/resolve`, which resolves the host-side promise through
`CoreRunSession.resolveApproval` and falls back to the runtime's own
pending-approval path when the request did not originate from the port.

## Storage and trust

```
<globalStorage>/runs/    checkpoints, final report   (trusted host storage)
<globalStorage>/logs/    redacted NDJSON trace       (diagnostics, replay)
<globalStorage>/spill/   bounded tool output         (artifact://<id>)
```

None of these paths is inside the workspace, so a model-writable tree can never
reach a checkpoint. Credential-looking values are redacted before a trace line is
written, and the redaction preserves JSON quoting so a journal line stays
parseable.

## Web GUI launcher

`blackhole web` is spawned with `--no-open`; the launcher scrapes
`dsh web: <url>` from its stdout and calls `vscode.env.openExternal`. The URL
carries the single-use token, so the browser completes the cookie exchange
top-level — the configuration DSH's authentication is built for. A missing CLI
surfaces as a message naming `galaxy-code.cliPath`.

## Conformance gap

Still open before this host can claim conformance: the deterministic fixture
matrix in the core's `docs/HOST_CONFORMANCE.md`, command containment, resume
driven through the webview, and multiple concurrent runs.
