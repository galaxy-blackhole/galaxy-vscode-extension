import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const window = new Window({ url: 'https://localhost/' });
const { document } = window;
for (const key of ['window','document','location','navigator','history','location','HTMLElement','HTMLTextAreaElement','Node','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','CustomEvent','KeyboardEvent','MessageChannel','MessagePort','queueMicrotask','getComputedStyle']) {
  try { globalThis[key] = window[key]; } catch { /* noop */ }
}
globalThis.window = window;
globalThis.document = document;
window.matchMedia = window.matchMedia ?? ((q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange: null, dispatchEvent: () => false }));
globalThis.matchMedia = window.matchMedia;
globalThis.MessageEvent = window.MessageEvent;
globalThis.acquireVsCodeApi = () => ({
  postMessage: (m) => console.log('[host<-] ' + (m?.type ?? typeof m)),
  getState: () => undefined,
  setState: () => {},
});
window.acquireVsCodeApi = globalThis.acquireVsCodeApi;

const errors = [];
window.addEventListener('error', (e) => { errors.push(String(e.error || e.message)); });
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + String(e)));

document.body.innerHTML = '<div id="app"></div>';
try {
  const code = readFileSync(new URL('../dist/webview/chat.js', import.meta.url), 'utf8');
  new Function(code)();
  await new Promise((r) => setTimeout(r, 500));
  // Interaction: open the permission menu, switch to auto mode.
  const chip = document.querySelector('.composer-chip[aria-haspopup=\'menu\']');
  if (chip) {
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const menu = document.querySelector('.permission-menu');
    console.log('--- menu open:', Boolean(menu), 'options:', document.querySelectorAll('.permission-option').length);
    const autoOption = [...document.querySelectorAll('.permission-option')].find((b) => b.textContent.includes('Toàn quyền truy cập'));
    autoOption?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const chipAfter = document.querySelector('.composer-chip[aria-haspopup=\'menu\']');
    console.log('--- chip label after select:', chipAfter?.textContent.trim());
    console.log('--- chip is gold:', chipAfter?.classList.contains('chip-auto'));
  }
  const html = document.getElementById('app')?.innerHTML ?? '';
  console.log('--- rendered length:', html.length);
  console.log(html.slice(0, 3000));
  if (errors.length) { console.log('ERRORS:'); for (const e of errors) console.log(e); process.exitCode = 1; }
  else console.log('NO ERRORS');
} catch (e) {
  console.log('CRASH:', e.stack?.slice(0, 2000) ?? String(e));
  process.exitCode = 1;
}
setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
