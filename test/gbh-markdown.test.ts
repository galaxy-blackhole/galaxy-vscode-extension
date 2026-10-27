import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, renderInline, renderMarkdown } from "../src/gbh/markdown.ts";

/**
 * The panel paints what this module returns, so two properties matter: rich blocks look right, and
 * nothing the model writes can inject markup.
 */
test("fenced code becomes a copyable block with its language label", () => {
  const html = renderMarkdown("Trước\n\n```ts\nconst a = 1 < 2;\n```\n\nSau");
  assert.match(html, /<div class="code">/u);
  assert.match(html, /<span>ts<\/span>/u);
  assert.match(html, /const a = 1 &lt; 2;/u, "code is escaped");
  assert.match(html, /data-code="const a = 1 &lt; 2;"/u);
  assert.match(html, /<p>Trước<\/p>/u);
  assert.match(html, /<p>Sau<\/p>/u);
});

test("inline code, bold, italic and links render, and everything else is escaped", () => {
  const html = renderInline("dùng `ctx.web` và **đậm**, *nghiêng*, [tài liệu](https://example.com/a) <script>x</script>");
  assert.match(html, /<code>ctx\.web<\/code>/u);
  assert.match(html, /<strong>đậm<\/strong>/u);
  assert.match(html, /<em>nghiêng<\/em>/u);
  assert.match(html, /<a href="https:\/\/example\.com\/a">tài liệu<\/a>/u);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/u, "raw HTML can never come back as markup");
});

test("headings, lists, quotes and rules render as their own blocks", () => {
  const html = renderMarkdown("# Tiêu đề\n\n- một\n- hai\n\n1. đầu\n2. sau\n\n> trích\n\n---");
  assert.match(html, /<h1>Tiêu đề<\/h1>/u);
  assert.match(html, /<ul><li>một<\/li><li>hai<\/li><\/ul>/u);
  assert.match(html, /<ol><li>đầu<\/li><li>sau<\/li><\/ol>/u);
  assert.match(html, /<blockquote>trích<\/blockquote>/u);
  assert.match(html, /<hr>/u);
});

test("an empty message and a plain paragraph stay safe", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown("một dòng"), "<p>một dòng</p>");
  assert.equal(escapeHtml("<b>&'\""), "&lt;b&gt;&amp;&#39;&quot;");
});
