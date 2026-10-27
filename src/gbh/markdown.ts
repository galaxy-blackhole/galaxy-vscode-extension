/*
 * Markdown to HTML for the conversation panel.
 *
 * The webview only gets HTML: raw HTML from the model is escaped first, so nothing in a transcript can
 * inject markup or script. Blocks the panel renders today: fenced code (with a language label), inline
 * code, bold/italic, links, headings, lists, blockquote, rules and paragraphs. Math stays plain text —
 * KaTeX needs fonts and a stylesheet the webview does not ship yet (recorded as a known gap).
 */

/** Escape text for HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/**
 * Render inline spans inside one line.
 * @param text - raw inline text (already split out of a block).
 * @returns HTML with code, bold, italic and links, everything else escaped.
 */
export function renderInline(text: string): string {
  const codes: string[] = [];
  const withPlaceholders = text.replace(/`([^`]+)`/gu, (_match, code: string) => {
    codes.push("<code>" + escapeHtml(code) + "</code>");
    return "\u0000" + String(codes.length - 1) + "\u0000";
  });
  let html = escapeHtml(withPlaceholders);
  html = html.replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/gu, "$1<em>$2</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, (_m, label: string, url: string) => '<a href="' + escapeHtml(url) + '">' + label + "</a>");
  html = html.replace(/\u0000(\d+)\u0000/gu, (_m, index: string) => codes[Number(index)] ?? "");
  return html;
}

/**
 * Render one message body as HTML.
 * @param markdown - the message text from the kernel.
 * @returns HTML fragment; fenced code becomes a copyable block, everything else is escaped.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const out: string[] = [];
  let index = 0;
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push("<p>" + renderInline(paragraph.join(" ")) + "</p>");
    paragraph = [];
  };
  const flushList = (): void => {
    if (list === undefined) return;
    const tag = list.ordered ? "ol" : "ul";
    out.push("<" + tag + ">" + list.items.map((item) => "<li>" + renderInline(item) + "</li>").join("") + "</" + tag + ">");
    list = undefined;
  };
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fence = /^\s*```([A-Za-z0-9_+-]*)\s*$/u.exec(line);
    if (fence !== null) {
      flushParagraph();
      flushList();
      const language = fence[1] ?? "";
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/u.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      out.push(
        '<div class="code"><div class="code-head"><span>' + escapeHtml(language.length === 0 ? "code" : language) + '</span><button class="copy" data-code="' +
          escapeHtml(body.join("\n")) + '">Copy</button></div><pre><code>' + escapeHtml(body.join("\n")) + "</code></pre></div>",
      );
      continue;
    }
    if (/^\s*$/u.test(line)) {
      flushParagraph();
      flushList();
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const level = String(heading[1]?.length ?? 1);
      out.push("<h" + level + ">" + renderInline(heading[2] ?? "") + "</h" + level + ">");
      index += 1;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/u.test(line)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      index += 1;
      continue;
    }
    const quote = /^\s*>\s?(.*)$/u.exec(line);
    if (quote !== null) {
      flushParagraph();
      flushList();
      out.push("<blockquote>" + renderInline(quote[1] ?? "") + "</blockquote>");
      index += 1;
      continue;
    }
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/u.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/u.exec(line);
    if (ordered !== null || bullet !== null) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (list === undefined || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((ordered?.[2] ?? bullet?.[1]) ?? "");
      index += 1;
      continue;
    }
    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph();
  flushList();
  return out.join("");
}
