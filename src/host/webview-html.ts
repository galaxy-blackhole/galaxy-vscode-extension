/**
 * The webview document. Kept free of the vscode API on purpose: the flag that decides between the chat UI
 * and the settings UI ships inside the HTML, and getting it wrong silently opened a second chat tab.
 */
export type WebviewView = "chat" | "settings";

export function webviewHtml(input: Readonly<{
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
  view: WebviewView;
}>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource} 'unsafe-inline'; script-src 'nonce-${input.nonce}'; font-src ${input.cspSource}; img-src ${input.cspSource} https: data:;" />
  <link href="${input.styleUri}" rel="stylesheet" />
  <title>Galaxy Blackhole</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${input.nonce}">window.__GALAXY_VIEW__ = "${input.view}";</script>
  <script nonce="${input.nonce}" src="${input.scriptUri}"></script>
</body>
</html>`;
}