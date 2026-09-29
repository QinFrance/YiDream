// YiDream Admin — compte revendeur + données locales (démo front-end, sans serveur).
// Tout est stocké dans CE navigateur uniquement (localStorage). Ce n'est pas un vrai
// backend multi-tenant : c'est la base d'interface sur laquelle brancher une vraie API plus tard.
// Chargé en module ES (voir main.js) pour être inclus correctement dans le build Vite ;
// expose window.AdminStore pour le script classique de la Suite (index.html).
(function () {
  const K_ACCOUNT = 'yidream_admin_account_v1';
  const K_CLIENTS = 'yidream_admin_clients_v1';
  const K_DEVICES = 'yidream_admin_devices_v1';
  const K_LOGS = 'yidream_admin_logs_v1';
  const K_SESSION = 'yidream_admin_session_v1';

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const readJSON = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function getAccount() { return readJSON(K_ACCOUNT, null); }
  function hasAccount() { return !!getAccount(); }
  function isLoggedIn() { return hasAccount() && sessionStorage.getItem(K_SESSION) === 'true'; }

  async function createAccount(shopName, email, password) {
    shopName = (shopName || '').trim(); email = (email || '').trim().toLowerCase();
    if (hasAccount()) return { ok: false, error: 'exists' };
    if (!shopName || !email || !password) return { ok: false, error: 'missing' };
    if (password.length < 8) return { ok: false, error: 'weak' };
    const account = { shopName, email, passHash: await sha256Hex(password), createdAt: Date.now() };
    writeJSON(K_ACCOUNT, account);
    sessionStorage.setItem(K_SESSION, 'true');
    addLog(`Compte créé pour ${shopName}`);
    return { ok: true };
  }

  async function login(email, password) {
    const account = getAccount();
    if (!account) return { ok: false, error: 'no_account' };
    if ((email || '').trim().toLowerCase() !== account.email || (await sha256Hex(password)) !== account.passHash) {
      return { ok: false, error: 'invalid' };
    }
    sessionStorage.setItem(K_SESSION, 'true');
    addLog('Connexion réussie');
    return { ok: true };
  }

  function logout() { sessionStorage.removeItem(K_SESSION); }

  function eraseAll() {
    [K_ACCOUNT, K_CLIENTS, K_DEVICES, K_LOGS].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(K_SESSION);
  }

  // ---- Clients ----
  function listClients() { return readJSON(K_CLIENTS, []); }
  function addClient({ name, group }) {
    const list = listClients();
    const c = { id: uid(), name: (name || '').trim(), group: (group || '').trim(), createdAt: Date.now() };
    list.unshift(c); writeJSON(K_CLIENTS, list);
    addLog(`Client ajouté : ${c.name}`);
    return c;
  }
  function removeClient(id) {
    writeJSON(K_CLIENTS, listClients().filter((c) => c.id !== id));
    // Détache les appareils de ce client plutôt que de les supprimer.
    writeJSON(K_DEVICES, listDevices().map((d) => (d.clientId === id ? { ...d, clientId: null } : d)));
    addLog('Client supprimé');
  }

  // ---- Devices (enregistrements locaux — pas de connexion live avec le téléphone) ----
  function listDevices() { return readJSON(K_DEVICES, []); }
  function addDevice({ name, os, clientId, note }) {
    const list = listDevices();
    const d = { id: uid(), name: (name || '').trim(), os: os || 'Android', clientId: clientId || null, note: (note || '').trim(), addedAt: Date.now() };
    list.unshift(d); writeJSON(K_DEVICES, list);
    addLog(`Appareil ajouté : ${d.name}`);
    return d;
  }
  function removeDevice(id) { writeJSON(K_DEVICES, listDevices().filter((d) => d.id !== id)); addLog('Appareil supprimé'); }
  function getDevice(id) { return listDevices().find((d) => d.id === id) || null; }

  // ---- Journal ----
  function listLogs() { return readJSON(K_LOGS, []); }
  function addLog(action) {
    const list = listLogs();
    list.unshift({ time: new Date().toLocaleString(), action });
    writeJSON(K_LOGS, list.slice(0, 100));
  }

  function stats() {
    const devices = listDevices(), clients = listClients();
    const byOs = { Android: 0, iOS: 0, 'Nokia / Other': 0 };
    devices.forEach((d) => { byOs[d.os] = (byOs[d.os] || 0) + 1; });
    const groups = [...new Set(clients.map((c) => c.group).filter(Boolean))];
    return { totalDevices: devices.length, totalClients: clients.length, byOs, groups };
  }

  window.AdminStore = {
    hasAccount, getAccount, isLoggedIn, createAccount, login, logout, eraseAll,
    listClients, addClient, removeClient,
    listDevices, addDevice, removeDevice, getDevice,
    listLogs, addLog, stats,
  };
})();
