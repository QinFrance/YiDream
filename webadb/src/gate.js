// Verrou d'origine + conditions d'utilisation (bloquent l'accès tant qu'elles ne sont pas acceptées).
import { CONFIG } from './config.js';
import { UI_STRINGS } from './i18n.js';
import { DISCLAIMER_TEXT, CONFIRMATION_PHRASE, DISCLAIMER_STORAGE_KEY } from './legal.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function isAllowedSite() {
  if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname)) return true;
  return CONFIG.allowedSites.some((s) => s.origin === location.origin && s.paths.some((p) => location.pathname.startsWith(p)));
}

function overlay(html) {
  let el = document.getElementById('yd-gate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'yd-gate';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:var(--bg);color:var(--text);overflow:auto';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div style="max-width:640px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:var(--shadow)">${html}</div>`;
  return el;
}

export function runGate() {
  if (!isAllowedSite()) {
    const s = UI_STRINGS.fr;
    const url = CONFIG.allowedSites[0].origin + CONFIG.allowedSites[0].paths[0];
    overlay(`<div style="text-align:center"><h2>🚫 ${esc(s.origin_title)}</h2><p style="color:var(--muted)">${esc(s.origin_body)}<br><b>${esc(url)}</b></p></div>`);
    return;
  }
  let accepted = false;
  try { accepted = localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true'; } catch { /* stockage indisponible */ }
  if (accepted) return;

  const el = overlay(`
    <h2>⚠️ Terms of Use — YiDream</h2>
    <div style="white-space:pre-line;font-size:12px;line-height:1.6;color:var(--muted);max-height:45vh;overflow:auto;margin:12px 0">${esc(DISCLAIMER_TEXT)}</div>
    <p style="font-size:12px">Type the following phrase exactly to confirm you have read and understood these terms:</p>
    <p style="font-weight:700;font-size:13px;user-select:all">${esc(CONFIRMATION_PHRASE)}</p>
    <div class="field"><input id="yd-phrase" type="text" placeholder="Type the phrase here"></div>
    <br><button class="primary" id="yd-accept" disabled>I Accept</button>`);
  const input = el.querySelector('#yd-phrase');
  const btn = el.querySelector('#yd-accept');
  input.addEventListener('input', () => { btn.disabled = input.value.trim().toUpperCase() !== CONFIRMATION_PHRASE; });
  btn.addEventListener('click', () => {
    try { localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true'); } catch { /* ignoré */ }
    el.remove();
  });
}
