import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as vscode from "vscode";
import { buildWebArgs, missingCliMessage, parseWebUrl, resolveCliCommand } from "./web-launcher-core";

/** How long to wait for the CLI to print its URL before reporting progress instead. */
const URL_TIMEOUT_MS = 30_000;

/**
 * Opens the Galaxy Blackhole web GUI — the DeepSeek Harness surface with the
 * Galaxy overlay — next to VS Code.
 *
 * The GUI is deliberately not embedded: its session cookie is `SameSite=Strict`
 * and its API refuses cross-site requests, so a webview iframe could never
 * authenticate. Launching the CLI and handing the token-bearing URL to the real
 * browser is the integration that actually works.
 */
export class WebGuiLauncher implements vscode.Disposable {
  private child: ChildProcessWithoutNullStreams | undefined;
  private url: string | undefined;
  private readonly output = vscode.window.createOutputChannel("Galaxy Blackhole Web");

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Start the GUI once; a second call focuses the running instance instead. */
  async open(): Promise<void> {
    if (this.child !== undefined) {
      if (this.url !== undefined) {
        await vscode.env.openExternal(vscode.Uri.parse(this.url));
      } else {
        void vscode.window.showInformationMessage("Galaxy Blackhole web đang khởi động…");
      }
      return;
    }

    const config = vscode.workspace.getConfiguration("galaxy-code");
    const command = resolveCliCommand(config.get<string>("cliPath"));
    const port = config.get<number>("webPort");
    const args = buildWebArgs(port === undefined ? {} : { port });
    this.output.show(true);
    this.output.appendLine(`> ${command} ${args.join(" ")}`);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Đang mở Galaxy Blackhole web…" },
      async (progress) => {
        await new Promise<void>((resolve) => {
          let finished = false;
          const settle = (): void => { if (!finished) { finished = true; resolve(); } };
          let child: ChildProcessWithoutNullStreams;
          try {
            child = spawn(command, args, { env: process.env, windowsHide: true });
          } catch (error) {
            void vscode.window.showErrorMessage(missingCliMessage(command));
            this.output.appendLine(String(error));
            settle();
            return;
          }
          this.child = child;
          let buffered = "";
          const timer = setTimeout(() => {
            if (this.url === undefined) {
              progress.report({ message: "vẫn đang khởi động; xem output 'Galaxy Blackhole Web'" });
              settle();
            }
          }, URL_TIMEOUT_MS);

          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => {
            this.output.append(chunk);
            buffered += chunk;
            const url = parseWebUrl(buffered);
            if (url !== undefined && this.url === undefined) {
              this.url = url;
              void vscode.env.openExternal(vscode.Uri.parse(url));
              clearTimeout(timer);
              settle();
            }
          });
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk: string) => this.output.append(chunk));
          child.on("error", (error: Error) => {
            this.output.appendLine(String(error));
            void vscode.window.showErrorMessage(missingCliMessage(command));
            clearTimeout(timer);
            settle();
          });
          child.on("exit", (code: number | null) => {
            this.output.appendLine(`\n[blackhole web exited with code ${String(code)}]`);
            this.child = undefined;
            this.url = undefined;
            clearTimeout(timer);
            if (!finished) void vscode.window.showWarningMessage(`Galaxy Blackhole web đã thoát (code ${String(code)}). Xem output "Galaxy Blackhole Web".`);
            settle();
          });
        });
      },
    );
  }

  dispose(): void {
    this.child?.kill();
    this.child = undefined;
    this.url = undefined;
    this.output.dispose();
  }
}
