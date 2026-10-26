/*
 * The sidebar view: one kernel workspace per open VS Code folder, its sessions underneath.
 *
 * Read-only on purpose. The spike proves the mapping; a follow-up replaces the two file reads with
 * sessionController / workspaceController Remote calls and adds "open session in the panel".
 */
import * as vscode from "vscode";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { matchFolder, readWorkspaces, sessionSummary } from "./mapping";
import { gbhHome, readReadyUrl, sessionCacheDir, workspaceRegistryPath } from "./paths";
import { parseReadyUrl, probeHost, type GbhHost } from "./host";
import type { GbhSessionSummary } from "./types";

/** One row in the tree. */
export type GbhNode = WorkspaceNode | SessionNode | NoteNode | HostNode;

/** The running kernel: the URL the CLI printed, plus what a probe learned. */
export interface HostNode {
  readonly kind: "host";
  readonly host: GbhHost;
  readonly alive: boolean;
  readonly detail: string;
}

/** The matched kernel workspace for a folder. */
export interface WorkspaceNode {
  readonly kind: "workspace";
  readonly folder: string;
  readonly label: string;
  readonly detail: string;
  readonly sessions: readonly GbhSessionSummary[];
}

/** One session of that workspace. */
export interface SessionNode {
  readonly kind: "session";
  readonly session: GbhSessionSummary;
}

/** An informational row (no host, no workspace, no sessions). */
export interface NoteNode {
  readonly kind: "note";
  readonly label: string;
}

/**
 * Read every session summary the kernel has cached.
 * @param home - app home of the kernel.
 * @returns summaries; a missing directory yields an empty list.
 */
export function readSessionSummaries(home: string): GbhSessionSummary[] {
  const dir = sessionCacheDir(home);
  if (!existsSync(dir)) return [];
  const out: GbhSessionSummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    try {
      out.push(sessionSummary(id, JSON.parse(readFileSync(join(dir, name), "utf8"))));
    } catch {
      // A half-written cache file must not blank the whole tree.
    }
  }
  return out;
}

/**
 * Read the workspace registry.
 * @param home - app home of the kernel.
 * @returns workspaces; a missing or unreadable file yields an empty list.
 */
export function readRegistry(home: string) {
  const path = workspaceRegistryPath(home);
  if (!existsSync(path)) return [];
  try {
    return readWorkspaces(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return [];
  }
}

/** Tree provider for the "GBH Kernel" view. */
export class GbhKernelTreeProvider implements vscode.TreeDataProvider<GbhNode> {
  private readonly changed = new vscode.EventEmitter<GbhNode | undefined>();

  /** VS Code re-renders the view when this fires. */
  readonly onDidChangeTreeData = this.changed.event;

  private alive = false;
  private detail = "chưa kiểm tra";

  constructor(private readonly configuredHome: () => string) {}

  /**
   * Report what the last host probe learned (the extension calls probeHost and hands the answer in).
   * @param alive - whether something answers at the host origin.
   * @param detail - one line for the row description.
   */
  setProbe(alive: boolean, detail: string): void {
    this.alive = alive;
    this.detail = detail;
    this.refresh();
  }

  /** Ask VS Code to re-read the kernel state. */
  refresh(): void {
    this.changed.fire(undefined);
  }

  /** Rows to show: one workspace per open folder, or a note explaining what is missing. */
  private roots(): GbhNode[] {
    const home = gbhHome(this.configuredHome());
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return [{ kind: "note", label: "Mở một thư mục để khớp với workspace của kernel" }];
    const workspaces = readRegistry(home);
    const sessions = readSessionSummaries(home);
    const ready = readReadyUrl(home);
    const nodes: GbhNode[] = folders.map((folder) => {
      const match = matchFolder(workspaces, sessions, folder.uri.fsPath);
      const detail = [
        match.workspace === undefined ? "chưa có workspace trong kernel" : "workspace " + match.workspace.id.slice(0, 8),
        String(match.sessions.length) + " phiên",
        match.matchedByCwdOnly ? "khớp theo cwd" : undefined,
      ]
        .filter((part): part is string => part !== undefined)
        .join(" · ");
      return {
        kind: "workspace" as const,
        folder: folder.uri.fsPath,
        label: basename(folder.uri.fsPath),
        detail,
        sessions: match.sessions,
      };
    });
    if (ready === undefined) nodes.push({ kind: "note", label: "Chưa thấy host nào chạy (" + home + "/ready-url.txt)" });
    else {
      const host = parseReadyUrl(ready);
      nodes.unshift({ kind: "host", host: host ?? { baseUrl: "", token: "", url: ready }, alive: this.alive, detail: this.detail });
    }
    return nodes;
  }

  /** Children: the sessions of a workspace node. */
  getChildren(element?: GbhNode): GbhNode[] {
    if (element === undefined) return this.roots();
    if (element.kind !== "workspace") return [];
    if (element.sessions.length === 0) return [{ kind: "note", label: "Chưa có phiên nào cho thư mục này" }];
    return element.sessions.map((session) => ({ kind: "session" as const, session }));
  }

  /**
   * Plain snapshot for the VS Code-level test: what the view would paint, without any vscode types.
   * @returns the root rows plus the sessions of the first workspace row.
   */
  snapshotForTest(): {
    roots: { kind: string; label?: string; detail?: string; alive?: boolean }[];
    sessions: { id: string; title?: string }[];
  } {
    const roots = this.roots();
    const first = roots.find((node): node is WorkspaceNode => node.kind === "workspace");
    return {
      roots: roots.map((node) => {
        if (node.kind === "host") return { kind: node.kind, detail: node.detail, alive: node.alive };
        if (node.kind === "workspace") return { kind: node.kind, label: node.label, detail: node.detail };
        if (node.kind === "note") return { kind: node.kind, label: node.label };
        return { kind: node.kind, label: node.session.title ?? node.session.id };
      }),
      sessions: (first?.sessions ?? []).map((session) => ({
        id: session.id,
        ...(session.title === undefined ? {} : { title: session.title }),
      })),
    };
  }

  /** Render one row. */
  getTreeItem(element: GbhNode): vscode.TreeItem {
    if (element.kind === "host") {
      const item = new vscode.TreeItem(element.alive ? "Kernel đang chạy" : "Kernel không phản hồi", vscode.TreeItemCollapsibleState.None);
      item.description = element.detail;
      item.tooltip = element.host.url;
      item.iconPath = new vscode.ThemeIcon(element.alive ? "vm-running" : "vm-outline");
      item.contextValue = "gbhHost";
      return item;
    }
    if (element.kind === "note") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (element.kind === "session") {
      const title = element.session.title ?? element.session.id.slice(0, 12);
      const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
      item.description = element.session.id.slice(0, 12);
      item.tooltip = [
        element.session.id,
        element.session.workingDirectory ?? element.session.cwd,
        element.session.createdAt === undefined ? undefined : new Date(element.session.createdAt).toISOString(),
      ]
        .filter((part): part is string => part !== undefined)
        .join("\n");
      item.iconPath = new vscode.ThemeIcon("comment-discussion");
      item.contextValue = "gbhSession";
      item.command = { command: "galaxy-code.openGbhSession", title: "Mở trong GBH Web", arguments: [element] };
      return item;
    }
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
    item.description = element.detail;
    item.tooltip = element.folder;
    item.iconPath = new vscode.ThemeIcon("folder-library");
    item.contextValue = "gbhWorkspace";
    return item;
  }
}
