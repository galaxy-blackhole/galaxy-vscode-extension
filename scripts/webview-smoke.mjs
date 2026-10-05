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
  // Interaction: model setup appears when the active provider has no key, and the
  // custom-provider form submits the draft to the host.
  window.dispatchEvent(new window.MessageEvent('message', { data: {
    type: 'host-info',
    workspaceName: 'galaxy',
    workspacePath: '/tmp/galaxy',
    platform: 'darwin',
    shell: '/bin/sh',
    model: 'deepseek-v4.1-flash:cloud',
    baseUrl: 'https://ollama.com',
    credentialSource: 'none',
    modelSettings: {
      activeProviderId: 'galaxy',
      model: 'deepseek-v4.1-flash:cloud',
      providers: [{ active: true, api: 'ollama', baseUrl: 'https://ollama.com', displayName: 'Galaxy Blackhole', id: 'galaxy', keyConfigured: false, models: [{ id: 'deepseek-v4.1-flash:cloud' }] }],
    },
  } }));
  await new Promise((r) => setTimeout(r, 300));
  const panel = document.querySelector('.ms-panel');
  console.log('--- model setup visible:', Boolean(panel));
  const dashed = [...document.querySelectorAll('.ms-dashed')].map((b) => b.textContent.trim());
  console.log('--- setup buttons:', JSON.stringify(dashed));
  const custom = [...document.querySelectorAll('.ms-dashed')].find((b) => b.textContent.includes('tuỳ chỉnh'));
  custom?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const form = document.querySelector('.ms-form');
  console.log('--- custom form visible:', Boolean(form));
  if (form) {
    const setValue = (selector, value) => {
      const field = document.querySelector(selector);
      if (!field) return;
      const proto = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, value);
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    setValue('#ms-custom-id', 'my-gateway');
    setValue('#ms-custom-url', 'https://gateway.example/v1');
    setValue('#ms-custom-models', 'gpt-x');
    await new Promise((r) => setTimeout(r, 100));
    [...document.querySelectorAll('.ms-form .ms-btn-primary')].pop()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    console.log('--- custom form submitted');
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
