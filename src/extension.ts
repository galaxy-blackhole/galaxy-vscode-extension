import * as vscode from "vscode";
import { GalaxyChatViewProvider } from "./host/chat-view-provider";
import { WebGuiLauncher } from "./host/web-launcher";
import { GbhKernelTreeProvider } from "./gbh/tree";
import { GbhConversationView } from "./gbh/conversation-view";
import { parseReadyUrl as parseGbhReadyUrl } from "./gbh/host";
import { parseReadyUrl, probeHost } from "./gbh/host";
import { gbhHome, readReadyUrl } from "./gbh/paths";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GalaxyChatViewProvider(context);
  const webLauncher = new WebGuiLauncher(context);
  /*
   * SPIKE (branch spike/gbh-kernel-map): prove the kernel mapping — the open folder becomes a GBH
   * workspace and its sessions show up in a native tree view. Read-only: no host is started here.
   */
  const gbhTree = new GbhKernelTreeProvider(() => vscode.workspace.getConfiguration("galaxy-code").get<string>("gbhHome", ""));
  /*
   * The tree loads the kernel itself now (Remote first, files second), so a refresh is a plain fire.
   * The probe moved into the provider; the extension only has to redraw.
   */
  /*
   * The conversation panel: a native WebviewView that paints the selected session's transcript from the
   * kernel's Remote API. Clicking a session row shows it here; writing still happens in GBH web.
   */
  const conversation = new GbhConversationView(
    () => {
      const ready = readReadyUrl(gbhHome(vscode.workspace.getConfiguration("galaxy-code").get<string>("gbhHome", "")));
      return ready === undefined ? undefined : parseGbhReadyUrl(ready);
    },
    async (url) => {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    },
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("galaxy-code.gbhConversation", conversation, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("galaxy-code.showGbhTranscript", async (node?: { session?: { id: string } }) => {
      const sessionId = node?.session?.id;
      if (sessionId === undefined) {
        await vscode.window.showWarningMessage("Chọn một phiên trong danh sách GBH Kernel trước.");
        return;
      }
      await conversation.show(sessionId);
      await vscode.commands.executeCommand("galaxy-code.gbhConversation.focus");
    }),
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("galaxy-code.gbhSessions", gbhTree),
    vscode.commands.registerCommand("galaxy-code.refreshGbhSessions", async () => {
      gbhTree.refresh();
    }),
    vscode.commands.registerCommand("galaxy-code.openGbhSession", async (node?: { session?: { id: string } }) => {
      const home = gbhHome(vscode.workspace.getConfiguration("galaxy-code").get<string>("gbhHome", ""));
      const ready = readReadyUrl(home);
      if (ready === undefined) {
        await vscode.window.showWarningMessage("Chưa có kernel nào chạy: " + home + "/ready-url.txt");
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(ready));
      if (node?.session !== undefined) await vscode.env.clipboard.writeText(node.session.id);
    }),
    vscode.commands.registerCommand("galaxy-code.openGbhHome", async () => {
      const home = vscode.workspace.getConfiguration("galaxy-code").get<string>("gbhHome", "");
      await vscode.window.showInformationMessage("GBH home: " + (home.length > 0 ? home : "(GBH_HOME hoặc ~/.galaxy/blackhole)"));
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      gbhTree.refresh();
    }),
  );
  /*
   * The extension-host E2E needs one goal run through the real pieces (connection, core, executor,
   * session store). The probe exists only while VS Code runs our tests, and is not part of the product.
   */
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    /*
     * The VS Code-level test reads the spike's tree through this probe: it activates the extension for
     * real and asks what the view would paint, so the mapping is proven inside an editor, not in node.
     */
    context.subscriptions.push(
      vscode.commands.registerCommand("galaxy-code.__gbhTree", async () => await gbhTree.snapshotForTest()),
      vscode.commands.registerCommand("galaxy-code.__gbhConversation", async () => conversation.snapshot()),
    );

    context.subscriptions.push(vscode.commands.registerCommand("galaxy-code.__e2e", async (request?: Readonly<{ goal?: string; id?: string; kind?: string; text?: string }>) => {
      /*
       * The two webview kinds ask the view to do what a click would, then report the breadcrumbs the
       * provider collected, so the suite can prove the round trip happened inside a real editor.
       */
      if (request?.kind === "webview-submit" || request?.kind === "webview-open-session") {
        provider.testLog.push("test-sent:" + request.kind + (request.kind === "webview-open-session" ? ":" + String(request.id ?? "") : ""));
        if (request.kind === "webview-submit") provider.sendTestCommand({ kind: "submit", text: String(request.text ?? "") });
        else provider.sendTestCommand({ kind: "open-session", id: String(request.id ?? "") });
        return { ok: true, testLog: [...provider.testLog] };
      }
      if (request?.kind === "log") return { ok: true, testLog: [...provider.testLog] };
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
