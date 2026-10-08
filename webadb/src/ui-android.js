// YiDream v1.2 — interface de YiDream Android (configurateur Web ADB) branchée sur la vraie logique.
import { YiDreamAdb, parseExtraPackages } from './adb.js';
import { CONFIG } from './config.js';
import { UI_STRINGS } from './i18n.js';
import { sha256Hex, deriveIntermediateKey, deriveDailyCode, todayString, bytesToBase64 } from './crypto.js';

const client = new YiDreamAdb();
const state = {
  blocking: { browsers: true, ai: true, social: true, store: true, extra: '' },
  adminUnlocked: false,
  bundledApk: null,
};
const GATED = new Set(['Unlock & Apply', 'Advanced']);

const lang = () => (window.getLang ? window.getLang() : 'en');
const t = (k) => UI_STRINGS[lang()]?.[k] ?? UI_STRINGS.en[k] ?? k;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const toast = (m) => window.toast && window.toast(m);

// ---- Journal (onglet Logs + boîte de log en direct) ----
function log(step, event) {
  const entry = { time: new Date().toLocaleTimeString(), step, event };
  (window.adbLogs ||= []).push(entry);
  const box = $('logBox');
  if (box) { box.textContent += `[${entry.time}] ${event}\n`; box.scrollTop = box.scrollHeight; }
}
const errText = (e) => {
  const m = e && e.message ? e.message : String(e);
  if (m === 'UNSUPPORTED') return t('unsupported');
  if (m === 'NO_DEVICE') return t('log_no_device');
  if (m === 'NOT_CONNECTED') return t('log_connect_first');
  return m;
};
const fail = (step, e) => { console.error(e); log(step, '❌ ' + errText(e)); toast(errText(e).split('\n')[0]); };
const logBox = () => '<div class="log-box" id="logBox"></div>';

client.onDisconnect = () => { log('Connection', t('log_disconnected')); rerender(); };

let current = null;
function rerender() { if (current) renderAndroid(current.c, current.s); }

// ---- Blocs communs ----
function devicePanel() {
  const i = client.info;
  if (!i) return `<div class="device-row"><div class="phone">📱</div><div><b>${esc(t('device_none'))}</b><br><span class="small">${esc(t('device_none_sub'))}</span></div></div>`;
  return `<div class="device-row"><div class="phone">📱</div><div><b>${esc(i.manufacturer)} ${esc(i.model)}</b><br><span class="small">Android ${esc(i.android)} · SDK ${esc(i.sdk)}<br>${esc(i.serial)}</span></div></div><br><button class="ghost" id="btnDisc">${esc(t('disconnect'))}</button>`;
}
const stepper = (n) => ['1 · Connect|Connect your phone', '2 · Install|Install YiDream', '3 · Device Owner|Activate management', '4 · Configure|Apply the filter']
  .map((x, i) => { const [a, b] = x.split('|'); return `<div class="step ${i === n ? 'active' : ''}"><b>${a}</b>${b}</div>`; }).join('');
const head = (title, sub, n) => `<h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>${n != null ? `<div class="stepper">${stepper(n)}</div>` : ''}`;
const needDevice = () => { if (!client.info) { toast(t('log_connect_first')); return false; } return true; };

// ---- Sections ----
const sections = {
  Connect(c) {
    c.innerHTML = `${head(t('connect_title'), t('connect_subtitle'), 0)}
      <div class="android-config">
        <div class="panel"><h4>Web ADB</h4>
          <div class="status-pill ${client.info ? 'ok' : 'no'}">${esc(client.info ? t('connect_connected') : t('connect_disconnected'))}</div><br><br>
          <button class="primary" id="btnConnect">${esc(t('connect_button'))}</button>
          <div class="small" style="margin-top:10px">Chrome / Edge · WebUSB · USB</div></div>
        <div class="panel"><h4>${esc(t('connect_connected').replace('✅ ', ''))}</h4>${devicePanel()}</div>
      </div>
      <div class="notice"><b>${esc(t('usb_help_title'))}</b><br>${esc(t('usb_help'))}</div>${logBox()}`;
    $('btnConnect').onclick = async () => {
      if (!YiDreamAdb.supported) { toast(t('unsupported')); return; }
      try {
        await client.connect((s) => log('Connection', t({ searching: 'log_searching_device', connecting: 'log_connecting', authenticating: 'log_authenticating' }[s])));
        log('Connection', t('log_connected') + client.info.serial);
        rerender();
      } catch (e) { fail('Connection', e); }
    };
    const d = $('btnDisc'); if (d) d.onclick = async () => { await client.disconnect(); log('Connection', t('log_disconnected')); rerender(); };
  },

  'Install YiDream'(c) {
    c.innerHTML = `${head(t('install_title'), t('install_subtitle'), 1)}
      <div class="panel"><h4>YiDream Android</h4>
        <p class="small" id="releaseNote" style="margin:8px 0 12px"></p>
        <div class="status-pill no" id="apkPill">${esc(t('install_searching'))}</div><br>
        <button class="primary" id="btnInstall" disabled>${esc(t('install_button'))}</button>
        <button class="ghost" id="btnCheck">${esc(t('install_check'))}</button>
        <div class="small" id="installStatus" style="margin-top:10px"></div>
        <div class="small" style="margin-top:9px"><a href="./launcher-preview.html" target="_blank" rel="noopener">${esc(t('launcher_preview'))}</a></div>
        <div class="small" style="margin-top:14px"><a href="#" id="apkAdvancedLink" style="color:var(--muted)">${esc(t('install_advanced_toggle'))}</a></div>
        <div id="apkAdvanced" style="display:none;margin-top:10px" class="field"><label>${esc(t('install_manual_label'))}</label><input type="file" id="apkInput" accept=".apk"></div>
      </div>${logBox()}`;
    fetch('./yidream-build.json', { cache: 'no-store' }).then(r => r.json()).then(info => {
      const note = $('releaseNote');
      if (note && info.releaseSigned !== true) note.textContent = t('install_distribution_warning');
    }).catch(() => {});
    const setPill = (ok, text) => { const pill = $('apkPill'); if (pill) { pill.className = 'status-pill ' + (ok ? 'ok' : 'no'); pill.textContent = text; } };
    const refreshSource = () => {
      // Ces éléments peuvent avoir disparu si l'utilisateur a changé de section
      // pendant que la détection automatique de l'APK était encore en cours.
      const btn = $('btnInstall');
      const input = $('apkInput');
      if (!btn || !input) return;
      const manual = input.files[0];
      state.selectedApk = manual || state.bundledApk || null;
      btn.disabled = !state.selectedApk || !client.info;
      if (manual) setPill(true, `${t('log_apk_found')} · ${manual.name} (${(manual.size / 1048576).toFixed(1)} Mo)`);
      else if (state.bundledApk) setPill(true, `${t('log_apk_found')} (${(state.bundledApk.size / 1048576).toFixed(1)} Mo)`);
      else setPill(false, t('log_apk_not_found'));
    };
    (async () => {
      try {
        const r = await fetch('./yidream.apk', { cache: 'no-store' });
        if (!r.ok) throw new Error('nf');
        state.bundledApk = await r.blob();
      } catch { state.bundledApk = null; }
      refreshSource();
    })();
    $('apkAdvancedLink').onclick = (e) => {
      e.preventDefault();
      const box = $('apkAdvanced');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };
    $('apkInput').onchange = refreshSource;
    $('btnInstall').onclick = async () => {
      if (!client.info) { toast(t('log_connect_and_apk')); return; }
      const src = state.selectedApk;
      if (!src) { toast(t('log_connect_and_apk')); return; }
      try {
        log('Installation', `${t('log_installing')} (${(src.size / 1048576).toFixed(1)} Mo)`);
        await client.installApk(src);
        log('Installation', t('log_apk_installed')); toast(t('log_apk_installed'));
      } catch (e) { fail('Installation', e); }
    };
    $('btnCheck').onclick = async () => {
      if (!needDevice()) return;
      try { $('installStatus').textContent = (await client.isInstalled()) ? t('install_installed') : t('install_missing'); } catch (e) { fail('Installation', e); }
    };
  },

  'Device Owner'(c) {
    c.innerHTML = `${head(t('owner_title'), t('owner_subtitle'), 2)}
      <div class="panel"><h4>Device Owner</h4><button class="primary" id="btnOwner">${esc(t('owner_button'))}</button></div>${logBox()}`;
    $('btnOwner').onclick = async () => {
      if (!needDevice()) return;
      try {
        log('Device Owner', t('log_activating_owner'));
        const r = await client.setDeviceOwner();
        if (YiDreamAdb.ok(r)) { log('Device Owner', t('log_owner_activated')); toast(t('log_owner_activated')); }
        else { log('Device Owner', '❌ ' + r.out); log('Device Owner', t('no_owner_hint')); toast(t('no_owner_hint').split(':')[0]); }
      } catch (e) { fail('Device Owner', e); }
    };
  },

  Configuration(c) {
    const b = state.blocking;
    const row = (id, key, label) => `<label class="check"><input type="checkbox" id="${id}" ${b[key] ? 'checked' : ''}> ${esc(label)}</label>`;
    c.innerHTML = `${head(t('blocking_title'), t('blocking_subtitle'), 3)}
      <div class="android-config"><div class="panel"><h4>${esc(t('blocking_title'))}</h4><div class="check-list">
        ${row('cBrowsers', 'browsers', t('blocking_browsers'))}${row('cAi', 'ai', t('blocking_ai'))}${row('cSocial', 'social', t('blocking_social'))}${row('cStore', 'store', t('blocking_store'))}
      </div></div>
      <div class="panel"><div class="field"><label>${esc(t('blocking_extra_label'))}</label><input type="text" id="cExtra" placeholder="com.example.app1, com.example.app2" value="${esc(b.extra)}"></div>
        <br><div class="small">${esc(t('blocking_note'))}</div></div></div>`;
    [['cBrowsers', 'browsers'], ['cAi', 'ai'], ['cSocial', 'social'], ['cStore', 'store']].forEach(([id, k]) => { $(id).onchange = (e) => { b[k] = e.target.checked; }; });
    $('cExtra').oninput = (e) => { b.extra = e.target.value; };
  },

  'Unlock & Apply'(c) {
    c.innerHTML = `${head(t('admin_title'), t('admin_subtitle'))}
      <div class="panel"><div class="field"><label>${esc(t('admin_password_label'))}</label><input type="password" id="master" autocomplete="off"></div><br>
        <button class="ghost" id="btnCode">${esc(t('admin_generate_code'))}</button><div id="codeOut"></div></div>
      <div style="height:12px"></div>
      <div class="panel"><button class="primary" id="btnApply">${esc(t('admin_apply'))}</button></div>${logBox()}`;
    $('btnCode').onclick = async () => {
      const pw = $('master').value;
      if (!pw) { toast(t('password_first')); return; }
      const code = await deriveDailyCode(await deriveIntermediateKey(pw), todayString());
      $('codeOut').innerHTML = `<div class="code-display">${esc(code)}</div><div class="small">${esc(t('log_code_valid'))}</div>`;
    };
    $('btnApply').onclick = async () => {
      if (!needDevice()) return;
      const b = state.blocking;
      const extra = parseExtraPackages(b.extra);
      if (extra.invalid.length) log('Configuration', t('extra_invalid') + extra.invalid.join(', '));
      const config = { block_browsers: b.browsers, block_ai: b.ai, block_social: b.social, block_store: b.store, extra_packages: extra.valid };
      const pw = $('master').value;
      if (pw) config.unlock_intermediate_key = bytesToBase64(await deriveIntermediateKey(pw));
      try {
        await client.applyConfig(config, (s) => log('Configuration', t({ launching: 'log_launching_app', sending: 'log_sending_config', relaunching: 'log_relaunching' }[s])));
        log('Configuration', t('log_config_applied')); toast(t('log_config_applied'));
      } catch (e) { fail('Configuration', e); }
    };
  },

  Advanced(c) {
    c.innerHTML = `${head(t('advanced_title'), t('advanced_subtitle'))}
      <div class="panel"><button class="ghost" id="btnClear">${esc(t('advanced_clear'))}</button> <button class="ghost danger" id="btnUninstall">${esc(t('advanced_uninstall'))}</button></div>${logBox()}`;
    $('btnClear').onclick = async () => {
      if (!needDevice() || !confirm(t('confirm_clear'))) return;
      try {
        log('Advanced', t('log_removing_owner'));
        const r = await client.removeAdmin();
        log('Advanced', YiDreamAdb.ok(r) ? t('log_restrictions_removed') : '❌ ' + r.out);
      } catch (e) { fail('Advanced', e); }
    };
    $('btnUninstall').onclick = async () => {
      if (!needDevice() || !confirm(t('confirm_uninstall'))) return;
      try {
        log('Advanced', t('log_uninstalling'));
        const r = await client.uninstall();
        log('Advanced', YiDreamAdb.ok(r) ? t('log_uninstalled') : '❌ ' + r.out);
      } catch (e) { fail('Advanced', e); }
    };
  },

  Settings(c) {
    c.innerHTML = `<h2>Android Settings</h2><div class="sub">${esc(t('section_settings'))}</div>
      <div class="panel"><div class="field"><label>Browser connection</label><select><option>Web ADB / WebUSB</option></select></div>
      <br><div class="small">Config path: ${esc(CONFIG.configRemotePath)}</div></div>`;
  },
};

function lockScreen(c, name) {
  c.innerHTML = `<div style="text-align:center;max-width:300px;margin:40px auto">
    <div style="font-size:34px">🔒</div><h2>${esc(t('lock_title'))}</h2><div class="sub">${esc(t('lock_subtitle'))}</div>
    <div class="field"><input type="password" id="lockPw" placeholder="${esc(t('lock_placeholder'))}"></div><br>
    <button class="primary" id="btnUnlock">${esc(t('lock_button'))}</button>
    <div class="small" id="lockErr" style="color:var(--red);margin-top:10px"></div></div>`;
  const go = async () => {
    if ((await sha256Hex($('lockPw').value)) === CONFIG.adminPasswordHash) { state.adminUnlocked = true; renderAndroid(c, name); }
    else $('lockErr').textContent = t('lock_error');
  };
  $('btnUnlock').onclick = go;
  $('lockPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

export function renderAndroid(c, name) {
  current = { c, s: name };
  if (GATED.has(name) && !state.adminUnlocked) return lockScreen(c, name);
  (sections[name] || sections.Connect)(c);
  const d = $('btnDisc'); if (d && !d.onclick) d.onclick = async () => { await client.disconnect(); rerender(); };
}

export const androidNav = ['Connect', 'Install YiDream', 'Device Owner', 'Configuration', 'Unlock & Apply', 'Advanced', 'Logs', 'Settings'];
