import * as vscode from "vscode";
import { GalaxyChatViewProvider } from "./host/chat-view-provider";
import { WebGuiLauncher } from "./host/web-launcher";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GalaxyChatViewProvider(context);
  const webLauncher = new WebGuiLauncher(context);
  /*
   * The extension-host E2E needs one goal run through the real pieces (connection, core, executor,
   * session store). The probe exists only while VS Code runs our tests, and is not part of the product.
   */
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(vscode.commands.registerCommand("galaxy-code.__e2e", async (request?: Readonly<{ goal?: string }>) => {
      const storageRoot = context.globalStorageUri.fsPath;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? storageRoot;
      const { runGoalForTest } = await import("./host/e2e.js");
      const { resolveOllamaConnection } = await import("./host/config.js");
      const { workspaceMcpServers } = await import("./host/workspace-mcp.js");
      const report = await runGoalForTest({
        connection: resolveOllamaConnection(),
        goal: typeof request?.goal === "string" && request.goal.trim().length > 0 ? request.goal : "Liệt kê các tệp ở gốc workspace",
        storageRoot,
        workspaceRoot,
      });
      return { ...report, mcpServers: workspaceMcpServers(workspaceRoot).map((server: { name: string }) => server.name) };
    }));
  }
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
