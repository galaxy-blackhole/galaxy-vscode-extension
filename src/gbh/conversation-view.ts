/*
 * The conversation panel: a native VS Code WebviewView that paints a kernel session's transcript.
 *
 * The shell is VS Code's (activity bar, view, theme variables), the data is the kernel's Remote API, and
 * message bodies are rendered from markdown here — no GBH web app shell is pulled in. While a turn runs
 * the panel polls the kernel, so the transcript keeps up without the user pressing refresh.
 */
import * as vscode from "vscode";
import { authenticate, cancelSession, sendPrompt, type KernelSession } from "./remote";
import { parseReadyUrl, type GbhHost } from "./host";
import { readTranscript, type Transcript } from "./transcript";
import { escapeHtml, renderMarkdown } from "./markdown";

/** Messages the view sends up. */
type ViewMessage =
  | { readonly type: "refresh" }
  | { readonly type: "openWeb" }
  | { readonly type: "send"; readonly text?: string }
  | { readonly type: "cancel" }
  | { readonly type: "copy"; readonly text?: string };

/** What the panel currently shows, for the tests and for the status bar. */
export interface ConversationState {
  readonly sessionId?: string;
  readonly title?: string;
  readonly messages: number;
  readonly error?: string;
  /** True while the kernel reports the session's turn as running. */
  readonly running?: boolean;
}

/** How often the panel re-reads a running session. */
const POLL_MS = 1500;
/** Give up polling after this many consecutive failures, so a dead host cannot spin forever. */
const MAX_POLL_FAILURES = 4;

/** Provider for the "Hội thoại" webview view. */
export class GbhConversationView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: ConversationState = { messages: 0 };
  /** Set when the last send or cancel failed, so the panel can say why. */
  private pending: string | undefined;
  private transcript: Transcript | undefined;
  private timer: NodeJS.Timeout | undefined;
  /** Last HTML painted, so the VS Code-level test can prove the markdown renderer ran. */
  private lastHtml = "";
  private failures = 0;

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
      if (message.type === "send") await this.send(message.text ?? "");
      if (message.type === "cancel") await this.cancel();
      if (message.type === "copy") await vscode.env.clipboard.writeText(message.text ?? "");
    });
    webviewView.onDidDispose(() => this.stopPolling());
    this.lastHtml = this.render();
    webviewView.webview.html = this.lastHtml;
  }

  /** The HTML the panel last painted (test seam: proves markdown rendering). */
  htmlForTest(): string {
    return this.lastHtml;
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
    this.stopPolling();
    this.state = { sessionId, messages: 0 };
    this.transcript = undefined;
    this.pending = undefined;
    await this.reload();
  }

  /** Re-read the transcript of the session on screen, then keep polling while it runs. */
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
      this.failures = 0;
      this.paint(transcript);
      if (transcript.running === true) this.startPolling();
      else this.stopPolling();
    } catch (error) {
      this.failures += 1;
      if (this.failures >= MAX_POLL_FAILURES) this.stopPolling();
      this.paint(undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Admit one prompt into the session on screen, then repaint from the kernel.
   * @param text - the prompt text typed in the panel.
   */
  async send(text: string): Promise<void> {
    const sessionId = this.state.sessionId;
    const host = this.resolveHost();
    const body = text.trim();
    if (sessionId === undefined || host === undefined || body.length === 0) return;
    try {
      const cookie = await authenticate(host);
      if (cookie === undefined) throw new Error("Kernel từ chối token (không lấy được cookie).");
      const accepted = await sendPrompt({ host, cookie }, { sessionId, text: body });
      if (!accepted) throw new Error("Kernel không nhận prompt.");
      this.pending = undefined;
    } catch (error) {
      this.pending = error instanceof Error ? error.message : String(error);
    }
    await this.reload();
  }

  /** Stop the running turn of the session on screen. */
  async cancel(): Promise<void> {
    const sessionId = this.state.sessionId;
    const host = this.resolveHost();
    if (sessionId === undefined || host === undefined) return;
    try {
      const cookie = await authenticate(host);
      if (cookie === undefined) throw new Error("Kernel từ chối token (không lấy được cookie).");
      await cancelSession({ host, cookie }, sessionId);
      this.pending = undefined;
    } catch (error) {
      this.pending = error instanceof Error ? error.message : String(error);
    }
    await this.reload();
  }

  /** Poll while the kernel says the turn is running. */
  private startPolling(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      void this.reload();
    }, POLL_MS);
  }

  /** Stop polling; safe to call any number of times. */
  private stopPolling(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
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
      ...(transcript?.running === undefined ? {} : { running: transcript.running }),
      ...(error === undefined ? {} : { error }),
    };
    this.lastHtml = this.render();
    if (this.view !== undefined) this.view.webview.html = this.lastHtml;
  }

  /** The panel's HTML: VS Code theme variables only, no external assets. */
  private render(): string {
    const transcript = this.transcript;
    const error = this.state.error;
    const running = this.state.running === true;
    const rows =
      transcript === undefined
        ? ""
        : transcript.messages
            .map((message) => {
              const role = message.role === "user" ? "Bạn" : message.role === "assistant" ? "GBH" : "Thông báo";
              return '<div class="row ' + message.role + '"><div class="who">' + role + '</div><div class="text">' + renderMarkdown(message.text) + "</div></div>";
            })
            .join("");
    const body =
      error !== undefined
        ? '<p class="error">' + escapeHtml(error) + "</p>"
        : transcript === undefined
          ? '<p class="hint">Chưa chọn phiên. Bấm một phiên trong danh sách "GBH Kernel".</p>'
          : rows.length === 0
            ? '<p class="hint">Phiên này chưa có tin nhắn văn bản.</p>'
            : rows;
    const head =
      transcript === undefined
        ? ""
        : "<header><strong>" + escapeHtml(transcript.title ?? transcript.sessionId) + "</strong><span>" + escapeHtml(transcript.sessionId) + (running ? " · đang chạy" : "") + "</span></header>";
    const notice = this.pending === undefined ? "" : '<p class="error">' + escapeHtml(this.pending) + "</p>";
    const actions = running ? '<button id="cancel">Dừng</button>' : '<button id="send">Gửi</button>';
    return [
      '<!doctype html><html lang="vi"><head><meta charset="utf-8">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';">',
      "<style>",
      "body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:8px 10px;font-size:12px}",
      "header{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}",
      "header span{opacity:.6;font-size:11px}",
      ".row{border-left:2px solid var(--vscode-panel-border);padding:4px 8px;margin:0 0 8px}",
      ".row.user{border-color:var(--vscode-focusBorder)}",
      ".who{font-size:10px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;margin-bottom:2px}",
      ".text p{margin:0 0 6px;line-height:1.5}",
      ".text code{font-family:var(--vscode-editor-font-family);background:var(--vscode-textCodeBlock-background);padding:0 3px;border-radius:3px}",
      ".code{margin:6px 0;border:1px solid var(--vscode-panel-border);border-radius:4px;overflow:hidden}",
      ".code-head{display:flex;justify-content:space-between;align-items:center;padding:2px 6px;background:var(--vscode-textCodeBlock-background);font-size:10px;opacity:.85}",
      ".code pre{margin:0;padding:6px;overflow-x:auto}",
      ".code code{font-family:var(--vscode-editor-font-family);font-size:11px;white-space:pre}",
      "blockquote{margin:0 0 6px;padding-left:8px;border-left:2px solid var(--vscode-panel-border);opacity:.85}",
      "a{color:var(--vscode-textLink-foreground)}",
      ".composer textarea{width:100%;box-sizing:border-box;font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));padding:4px 6px;resize:vertical}",
      ".hint,.error{opacity:.8}",
      ".error{color:var(--vscode-errorForeground)}",
      "button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:4px 8px;cursor:pointer;margin-top:6px}",
      "</style></head><body>",
      head,
      body,
      notice,
      '<div class="composer"><textarea id="prompt" rows="3" placeholder="Nhập tin nhắn cho phiên này…"></textarea>' + actions + "</div>",
      '<button id="refresh">Làm mới</button> <button id="web">Mở trong GBH Web</button>',
      "<script>",
      "const api=acquireVsCodeApi();",
      "const send=document.getElementById('send');if(send)send.onclick=()=>{const el=document.getElementById('prompt');const text=el.value;if(text.trim().length===0)return;el.value='';api.postMessage({type:'send',text});};",
      "const cancel=document.getElementById('cancel');if(cancel)cancel.onclick=()=>api.postMessage({type:'cancel'});",
      "document.getElementById('refresh').onclick=()=>api.postMessage({type:'refresh'});",
      "document.getElementById('web').onclick=()=>api.postMessage({type:'openWeb'});",
      "document.addEventListener('click',(event)=>{const button=event.target.closest&&event.target.closest('button.copy');if(!button)return;api.postMessage({type:'copy',text:button.getAttribute('data-code')||''});button.textContent='Đã copy';});",
      "</script>",
      "</body></html>",
    ].join("");
  }
}
