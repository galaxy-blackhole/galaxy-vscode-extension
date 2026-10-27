/*
 * The sidebar view: one kernel workspace per open VS Code folder, its sessions underneath.
 *
 * Data source order: the kernel's Remote API when a host answers (session.list), then the read model
 * on disk. The Remote path is the real one; the files are the fallback when no host is running, which
 * is the normal case for someone who has not started the app.
 */
import * as vscode from "vscode";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { matchFolder, readWorkspaces, sessionSummary } from "./mapping";
import { gbhHome, readReadyUrl, sessionCacheDir, workspaceRegistryPath } from "./paths";
import { parseReadyUrl, probeHost, type GbhHost } from "./host";
import { authenticate, listSessions, type KernelSession } from "./remote";
import { listChanges, type ChangedFile } from "./changes";
import type { GbhSessionSummary, GbhWorkspace } from "./types";

/** Where the rows came from. */
export type KernelSource = "remote" | "files";

/** One row in the tree. */
export type GbhNode = WorkspaceNode | SessionNode | NoteNode | HostNode | ChangesNode | ChangedFileNode;

/** The "changed files" bucket of one workspace. */
export interface ChangesNode {
  readonly kind: "changes";
  readonly folder: string;
  readonly files: readonly ChangedFile[];
}

/** One changed file row. */
export interface ChangedFileNode {
  readonly kind: "changedFile";
  readonly folder: string;
  readonly file: ChangedFile;
}

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

/** Everything one refresh learned. */
export interface KernelData {
  readonly host?: GbhHost;
  readonly alive: boolean;
  readonly detail: string;
  readonly workspaces: readonly GbhWorkspace[];
  readonly sessions: readonly GbhSessionSummary[];
  readonly source: KernelSource;
}

/**
 * Read every session summary the kernel has cached on disk.
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
export function readRegistry(home: string): GbhWorkspace[] {
  const path = workspaceRegistryPath(home);
  if (!existsSync(path)) return [];
  try {
    return readWorkspaces(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return [];
  }
}

/**
 * Authenticate against the announced host and list its sessions.
 * @param host - parsed ready URL.
 * @returns the sessions and the detail line, or undefined when the host would not authenticate.
 */
async function readFromRemote(host: GbhHost): Promise<{ sessions: GbhSessionSummary[]; detail: string } | undefined> {
  const probe = await probeHost(host);
  if (!probe.alive) return undefined;
  const cookie = await authenticate(host);
  if (cookie === undefined) return { sessions: [], detail: host.baseUrl + " · không lấy được cookie" };
  const session: KernelSession = { host, cookie };
  try {
    const sessions = await listSessions(session);
    return { sessions, detail: host.baseUrl + " · Remote" };
  } catch (error) {
    return { sessions: [], detail: host.baseUrl + " · " + (error instanceof Error ? error.message : String(error)) };
  }
}

/** Tree provider for the "GBH Kernel" view. */
export class GbhKernelTreeProvider implements vscode.TreeDataProvider<GbhNode> {
  private readonly changed = new vscode.EventEmitter<GbhNode | undefined>();

  /** VS Code re-renders the view when this fires. */
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly configuredHome: () => string) {}

  /** Ask VS Code to re-read the kernel state. */
  refresh(): void {
    this.changed.fire(undefined);
  }

  /** Load the kernel state, Remote first and files second. */
  async load(): Promise<KernelData> {
    const home = gbhHome(this.configuredHome());
    const ready = readReadyUrl(home);
    const workspaces = readRegistry(home);
    if (ready !== undefined) {
      const host = parseReadyUrl(ready);
      if (host !== undefined) {
        const remote = await readFromRemote(host);
        if (remote !== undefined && remote.sessions.length > 0) {
          return { host, alive: true, detail: remote.detail, workspaces, sessions: remote.sessions, source: "remote" };
        }
        if (remote !== undefined) {
          return { host, alive: true, detail: remote.detail, workspaces, sessions: readSessionSummaries(home), source: "files" };
        }
        if (host !== undefined) return { host, alive: false, detail: "không phản hồi", workspaces, sessions: readSessionSummaries(home), source: "files" };
      }
    }
    return { alive: false, detail: "chưa có ready-url.txt", workspaces, sessions: readSessionSummaries(home), source: "files" };
  }

  /** Rows to show: one workspace per open folder, or a note explaining what is missing. */
  private async roots(): Promise<GbhNode[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return [{ kind: "note", label: "Mở một thư mục để khớp với workspace của kernel" }];
    const data = await this.load();
    const nodes: GbhNode[] = folders.map((folder) => {
      const match = matchFolder(data.workspaces, data.sessions, folder.uri.fsPath);
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
    if (data.host === undefined) nodes.push({ kind: "note", label: "Chưa thấy host nào chạy (" + gbhHome(this.configuredHome()) + "/ready-url.txt)" });
    else nodes.unshift({ kind: "host", host: data.host, alive: data.alive, detail: data.detail });
    return nodes;
  }

  /** Children: the sessions of a workspace node. */
  async getChildren(element?: GbhNode): Promise<GbhNode[]> {
    if (element === undefined) return await this.roots();
    if (element.kind === "changes") return element.files.map((file) => ({ kind: "changedFile" as const, folder: element.folder, file }));
    if (element.kind !== "workspace") return [];
    const rows: GbhNode[] = element.sessions.map((session) => ({ kind: "session" as const, session }));
    const files = await listChanges(element.folder);
    if (files.length > 0) rows.unshift({ kind: "changes" as const, folder: element.folder, files });
    if (rows.length === 0) return [{ kind: "note", label: "Chưa có phiên nào cho thư mục này" }];
    return rows;
  }

  /**
   * Plain snapshot for the VS Code-level test: what the view would paint, without any vscode types.
   * @returns the root rows, the source of the data and the sessions of the first workspace row.
   */
  async snapshotForTest(): Promise<{
    source: KernelSource;
    roots: { kind: string; label?: string; detail?: string; alive?: boolean }[];
    sessions: { id: string; title?: string }[];
  }> {
    const roots = await this.roots();
    const data = await this.load();
    const first = roots.find((node): node is WorkspaceNode => node.kind === "workspace");
    return {
      source: data.source,
      roots: roots.map((node) => {
        if (node.kind === "host") return { kind: node.kind, detail: node.detail, alive: node.alive };
        if (node.kind === "workspace") return { kind: node.kind, label: node.label, detail: node.detail };
        if (node.kind === "note") return { kind: node.kind, label: node.label };
        if (node.kind === "session") return { kind: node.kind, label: node.session.title ?? node.session.id };
        if (node.kind === "changes") return { kind: node.kind, label: String(node.files.length) + " tệp" };
        return { kind: node.kind, label: node.file.path };
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
    if (element.kind === "changes") {
      const item = new vscode.TreeItem("Thay đổi trong workspace", vscode.TreeItemCollapsibleState.Collapsed);
      item.description = String(element.files.length) + " tệp";
      item.iconPath = new vscode.ThemeIcon("diff-modified");
      item.contextValue = "gbhChanges";
      return item;
    }
    if (element.kind === "changedFile") {
      const item = new vscode.TreeItem(element.file.path, vscode.TreeItemCollapsibleState.None);
      item.description = element.file.status;
      item.iconPath = new vscode.ThemeIcon(element.file.status === "??" ? "diff-added" : "diff-modified");
      item.contextValue = "gbhChangedFile";
      item.command = { command: "galaxy-code.showGbhDiff", title: "Xem diff", arguments: [element] };
      return item;
    }
    if (element.kind === "note") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (element.kind === "session") {
      const running = element.session.running === true;
      const title = (running ? "● " : "") + (element.session.title ?? element.session.id.slice(0, 12));
      const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
      item.description = running ? "đang chạy" : element.session.id.slice(0, 12);
      item.tooltip = [
        element.session.id,
        element.session.workingDirectory ?? element.session.cwd,
        element.session.createdAt === undefined ? undefined : new Date(element.session.createdAt).toISOString(),
      ]
        .filter((part): part is string => part !== undefined)
        .join("\n");
      item.iconPath = new vscode.ThemeIcon(running ? "sync~spin" : "comment-discussion");
      item.contextValue = "gbhSession";
      item.command = { command: "galaxy-code.showGbhTranscript", title: "Xem hội thoại", arguments: [element] };
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
