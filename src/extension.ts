import * as vscode from "vscode";
import { GalaxyChatViewProvider } from "./host/chat-view-provider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GalaxyChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GalaxyChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    provider,
    vscode.commands.registerCommand("galaxy-code.openChat", () => {
      void vscode.commands.executeCommand("workbench.view.extension.galaxy-code-sidebar");
    }),
    vscode.commands.registerCommand("galaxy-code.newThread", () => provider.newThread()),
  );
}

export function deactivate(): void {}
