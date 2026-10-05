import * as vscode from "vscode";
import { GalaxyChatViewProvider } from "./host/chat-view-provider";
import { WebGuiLauncher } from "./host/web-launcher";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GalaxyChatViewProvider(context);
  const webLauncher = new WebGuiLauncher(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GalaxyChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    provider,
    webLauncher,
    vscode.commands.registerCommand("galaxy-code.openChat", () => {
      void vscode.commands.executeCommand("workbench.view.extension.galaxy-code-sidebar");
    }),
    vscode.commands.registerCommand("galaxy-code.newThread", () => provider.newThread()),
    vscode.commands.registerCommand("galaxy-code.openWeb", () => webLauncher.open()),
  );
}

export function deactivate(): void {}
