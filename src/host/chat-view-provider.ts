import * as vscode from "vscode";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../protocol";
import { resolveModelLibraryUrl, resolveOllamaConnection } from "./config";
import { streamOllamaChat } from "./ollama-client";
import { executeWorkspaceTool } from "./workspace-tools";

export class GalaxyChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "galaxy-code.chatView";
  private view?: vscode.WebviewView;
  private readonly controllers = new Map<string, AbortController>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [distUri],
    };
    view.webview.html = this.renderHtml(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        void this.handleMessage(message);
      }),
    );
  }

  newThread(): void {
    this.post({ type: "new-thread" });
  }

  private post(message: HostToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case "ui-ready": {
        const connection = resolveOllamaConnection();
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const modelLibraryUrl = resolveModelLibraryUrl(connection);
        this.post({
          type: "host-info",
          workspaceName: workspace?.name ?? "no workspace",
          workspacePath: workspace?.uri.fsPath ?? "",
          platform: process.platform,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
          model: connection.model,
          baseUrl: connection.baseUrl,
          credentialSource: connection.credentialSource,
          ...(modelLibraryUrl ? { modelLibraryUrl } : {}),
        });
        return;
      }
      case "chat-start": {
        const controller = new AbortController();
        this.controllers.set(message.runId, controller);
        try {
          const stats = await streamOllamaChat(
            resolveOllamaConnection(),
            message.request,
            (delta) => this.post({ type: "chat-delta", runId: message.runId, delta }),
            controller.signal,
          );
          this.post({ type: "chat-done", runId: message.runId, stats });
        } catch (error) {
          const isAbort = controller.signal.aborted;
          this.post({
            type: "chat-error",
            runId: message.runId,
            message: isAbort ? "cancelled" : error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.controllers.delete(message.runId);
        }
        return;
      }
      case "chat-cancel": {
        this.controllers.get(message.runId)?.abort(new Error("cancelled"));
        return;
      }
      case "tool-exec": {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
          this.post({ type: "tool-result", requestId: message.requestId, ok: false, result: "No workspace folder is open." });
          return;
        }
        const outcome = await executeWorkspaceTool(root, message.name, message.args);
        this.post({ type: "tool-result", requestId: message.requestId, ok: outcome.ok, result: outcome.result });
        return;
      }
      case "open-external": {
        try {
          const uri = vscode.Uri.parse(message.url, true);
          if (uri.scheme === "http" || uri.scheme === "https") void vscode.env.openExternal(uri);
        } catch { /* ignore invalid url */ }
        return;
      }
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "chat.css"));
    const nonce = String(Math.random()).slice(2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Galaxy Code</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort(new Error("disposed"));
    for (const disposable of this.disposables) disposable.dispose();
  }
}
