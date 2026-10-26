/*
 * The conversation panel: a native VS Code WebviewView that paints a kernel session's transcript.
 *
 * This is the first slice of the architecture the ADR settled on — the shell is VS Code's (activity bar,
 * view, theme variables), the data is the kernel's own Remote API, and nothing of the GBH web app shell
 * is pulled in. Sending a message is deliberately out of scope here: the panel reads, and hands off to
 * GBH web for anything that writes.
 */
import * as vscode from "vscode";
import { authenticate, type KernelSession } from "./remote";
import { parseReadyUrl, type GbhHost } from "./host";
import { readTranscript, type Transcript } from "./transcript";

/** Messages the view sends up. */
type ViewMessage = { readonly type: "refresh" } | { readonly type: "openWeb" };

/** What the panel currently shows, for the tests and for the status bar. */
export interface ConversationState {
  readonly sessionId?: string;
  readonly title?: string;
  readonly messages: number;
  readonly error?: string;
}

/** Provider for the "Hội thoại" webview view. */
export class GbhConversationView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: ConversationState = { messages: 0 };
  private transcript: Transcript | undefined;

  constructor(
    private readonly resolveHost: () => GbhHost | undefined,
    private readonly openWeb: (url: string) => Promise<void>,
  ) {}

  /** VS Code shows the panel when the view is revealed. */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(async (message: ViewMessage) => {
      if (message.type === "refresh") await this.reload();
      if (message.type === "openWeb") await this.handOff();
    });
    webviewView.webview.html = this.render();
  }

  /** The panel's last painted state. */
  snapshot(): ConversationState {
    return this.state;
  }

  /**
   * Show one session, revealing the view first when needed.
   * @param sessionId - the session to read from the kernel.
   */
  async show(sessionId: string): Promise<void> {
    this.state = { sessionId, messages: 0 };
    this.transcript = undefined;
    await this.reload();
  }

  /** Re-read the transcript of the session on screen. */
  async reload(): Promise<void> {
    const sessionId = this.state.sessionId;
    if (sessionId === undefined) {
      this.paint(undefined, "Chọn một phiên ở danh sách bên trên.");
      return;
    }
    const host = this.resolveHost();
    if (host === undefined) {
      this.paint(undefined, "Chưa có kernel nào chạy.");
      return;
    }
    try {
      const cookie = await authenticate(host);
      if (cookie === undefined) {
        this.paint(undefined, "Kernel từ chối token (không lấy được cookie).");
        return;
      }
      const kernel: KernelSession = { host, cookie };
      const transcript = await readTranscript(kernel, sessionId, 40);
      this.paint(transcript);
    } catch (error) {
      this.paint(undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /** Hand this session over to the GBH web app. */
  private async handOff(): Promise<void> {
    const host = this.resolveHost();
    if (host === undefined) return;
    await this.openWeb(host.url);
  }

  /**
   * Keep the state and repaint the HTML.
   * @param transcript - what the kernel returned, when it did.
   * @param error - the message to show instead of a transcript.
   */
  private paint(transcript: Transcript | undefined, error?: string): void {
    this.transcript = transcript;
    this.state = {
      ...(this.state.sessionId === undefined ? {} : { sessionId: this.state.sessionId }),
      ...(transcript?.title === undefined ? {} : { title: transcript.title }),
      messages: transcript?.messages.length ?? 0,
      ...(error === undefined ? {} : { error }),
    };
    if (this.view !== undefined) this.view.webview.html = this.render();
  }

  /** The panel's HTML: VS Code theme variables only, no external assets. */
  private render(): string {
    const transcript = this.transcript;
    const error = this.state.error;
    const lines =
      transcript === undefined
        ? ''
        : transcript.messages
            .map((message) => {
              const role = message.role === "user" ? "Bạn" : message.role === "assistant" ? "GBH" : "Thông báo";
              return (
                '<div class="row ' + message.role + '"><div class="who">' + role + '</div><div class="text">' + escapeHtml(message.text) + "</div></div>"
              );
            })
            .join("");
    const body =
      error !== undefined
        ? '<p class="error">' + escapeHtml(error) + "</p>"
        : transcript === undefined
          ? '<p class="hint">Chưa chọn phiên. Bấm một phiên trong danh sách "GBH Kernel".</p>'
          : lines.length === 0
            ? '<p class="hint">Phiên này chưa có tin nhắn văn bản.</p>'
            : lines;
    const head = transcript?.title === undefined ? "" : '<header><strong>' + escapeHtml(transcript.title) + "</strong><span>" + escapeHtml(transcript.sessionId) + "</span></header>";
    return [
      "<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\">",
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';">',
      "<style>",
      "body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:8px 10px;font-size:12px}",
      "header{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}",
      "header span{opacity:.6;font-size:11px}",
      ".row{border-left:2px solid var(--vscode-panel-border);padding:4px 8px;margin:0 0 6px}",
      ".row.user{border-color:var(--vscode-focusBorder)}",
      ".who{font-size:10px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;margin-bottom:2px}",
      ".text{white-space:pre-wrap;word-break:break-word;line-height:1.45}",
      ".hint,.error{opacity:.75}",
      ".error{color:var(--vscode-errorForeground)}",
      "button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:4px 8px;cursor:pointer;margin-top:6px}",
      "</style></head><body>",
      head,
      body,
      '<button id="refresh">Làm mới</button> <button id="web">Mở trong GBH Web</button>',
      "<script>const api=acquireVsCodeApi();document.getElementById('refresh').onclick=()=>api.postMessage({type:'refresh'});document.getElementById('web').onclick=()=>api.postMessage({type:'openWeb'});</script>",
      "</body></html>",
    ].join("");
  }
}

/**
 * Escape text for HTML.
 * @param text - raw text from the kernel.
 * @returns the same text with the five HTML-significant characters replaced.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
