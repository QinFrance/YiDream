import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { PackageManager } from "@yume-chan/android-bin";

const APP_PACKAGE = "com.yidream.mdm";
const ADMIN_COMPONENT = `${APP_PACKAGE}/.MyDeviceAdminReceiver`;
const CONFIG_REMOTE_PATH = `/sdcard/Android/data/${APP_PACKAGE}/files/yidream_config.json`;
const UNLOCK_SALT = "yidream-unlock-v1";

// Hash SHA-256 du mot de passe admin. Mot de passe par défaut : "changeme123"
// !! CHANGE-LE avant de publier le site — voir README, section "Changer le mot de passe admin"
const ADMIN_PASSWORD_HASH =
  "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be".slice(0, 64);

const CredentialStore = new AdbWebCredentialStore("YiDream Configurator");

let adb;
let isAdminUnlocked = false;

// État persistant du blocage (pour survivre à la navigation entre sections)
const blockingState = {
  blockBrowsers: true,
  blockAi: true,
  blockSocial: true,
  blockStore: true,
  extraPackages: "",
};

const root = document.getElementById("app");

// ---------------------------------------------------------------------
// Styles — façon macOS, "bureau" + fenêtres d'app
// ---------------------------------------------------------------------

const style = document.createElement("style");
style.textContent = `
  :root {
    --navy: #0C1C38;
    --blue: #014DB3;
    --accent: #014DB3;
    --blue-soft: #E8EFFB;
    --bg: #E8E8ED;
    --window: #FFFFFF;
    --sidebar: #F5F5F7;
    --toolbar: #FAFAFB;
    --border: #D8D8DE;
    --text: #1D1D1F;
    --text-secondary: #6E6E73;
    --success: #1E7A3D;
    --success-bg: #E3F7E9;
    --danger: #D70015;
    --input-bg: #FFFFFF;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: var(--bg);
    font-family: -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    color: var(--text);
  }
  .desktop {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .mac-window {
    width: 100%;
    max-width: 860px;
    background: var(--window);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.22);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
  }
  .title-bar {
    background: var(--sidebar);
    border-bottom: 1px solid var(--border);
    padding: 12px 16px;
    display: flex;
    align-items: center;
  }
  .traffic-lights { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.red { background: #FF5F57; }
  .dot.yellow { background: #FEBC2E; }
  .dot.green { background: #28C840; }
  .title-bar .title {
    flex: 1;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .title-bar .title img { width: 16px; height: 16px; border-radius: 4px; }
  .lang-switcher { font-size: 15px; display: flex; align-items: center; }

  .body { display: flex; flex: 1; min-height: 0; }
  .sidebar {
    width: 190px;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    padding: 12px 8px;
    overflow-y: auto;
  }
  .nav-item {
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text);
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-item .nav-icon { width: 16px; display: flex; align-items: center; justify-content: center; opacity: 0.7; }
  .nav-item .nav-icon svg { width: 14px; height: 14px; }
  .nav-item:hover { background: rgba(0,0,0,0.05); }
  .nav-item.active { background: var(--accent); color: white; }
  .nav-item.active .nav-icon { opacity: 1; }
  .content { flex: 1; padding: 28px 32px; overflow-y: auto; }
  .content h1 { font-size: 20px; margin: 0 0 4px; color: var(--text); }
  .content p.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0 0 20px; }
  .field-group { margin-bottom: 16px; }
  .field-group label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--text-secondary); margin-bottom: 6px;
  }
  input[type="text"], input[type="password"], input[type="file"] {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border);
    border-radius: 8px; font-size: 13px; font-family: inherit;
    background: var(--input-bg); color: var(--text);
  }
  .checkbox-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: var(--text); }
  button {
    padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border);
    background: white; font-size: 13px; font-weight: 500; cursor: pointer;
    font-family: inherit; color: var(--text);
  }
  button.primary { background: var(--accent); color: white; border-color: var(--accent); }
  button.danger { background: white; color: var(--danger); border-color: var(--danger); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .status-pill {
    display: inline-block; padding: 6px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; margin-bottom: 16px;
  }
  .status-pill.ok { background: var(--success-bg); color: var(--success); }
  .status-pill.no { background: #FDECEC; color: var(--danger); }
  .row-actions { display: flex; gap: 8px; margin-top: 10px; }
  .log-box {
    margin-top: 16px; background: #1D1D1F; color: #9EA1A6;
    font-family: Consolas, monospace; font-size: 11px; border-radius: 8px;
    padding: 10px; max-height: 140px; overflow-y: auto; white-space: pre-wrap;
  }
  .code-display {
    font-family: Consolas, monospace; font-size: 28px; font-weight: 700;
    letter-spacing: 4px; color: var(--accent); background: var(--blue-soft);
    border-radius: 10px; padding: 16px; text-align: center; margin-top: 12px;
  }
  .lock-screen { text-align: center; padding: 40px 0; }
  .lock-icon { font-size: 40px; margin-bottom: 12px; }
  .apk-detected {
    background: var(--success-bg); color: var(--success); border-radius: 8px;
    padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
  }
  .coming-soon { text-align: center; padding: 40px 20px; }
  .coming-soon .big-icon { width: 48px; height: 48px; margin: 0 auto 16px; color: var(--accent); }
  .coming-soon .big-icon svg { width: 100%; height: 100%; }
  hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }

  /* Thème sombre (basculable) */
  [data-theme="dark"] {
    --bg: #1C1C1E;
    --window: #242426;
    --sidebar: #1C1C1E;
    --toolbar: #1C1C1E;
    --border: #38383A;
    --text: #F2F2F3;
    --text-secondary: #98989D;
    --input-bg: #2C2C2E;
    --blue-soft: rgba(76,158,255,0.15);
  }
  [data-theme="dark"] .status-pill.no { background: rgba(255,69,58,0.15); }
  [data-theme="dark"] .log-box { background: #0E0E10; }

  /* Écran "bureau" : fond dégradé + icônes d'app en badges colorés */
  .desktop-wallpaper {
    min-height: 100vh;
    width: 100%;
    background: radial-gradient(ellipse at 20% 0%, #2C4A8C 0%, var(--navy) 45%, #050914 100%);
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 28px;
    padding: 56px;
    position: relative;
  }
  [data-theme="dark"] .desktop-wallpaper,
  .desktop-wallpaper { background: radial-gradient(ellipse at 20% 0%, #2C4A8C 0%, var(--navy) 45%, #050914 100%); }
  .app-badge {
    width: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .app-badge .badge-tile {
    width: 66px;
    height: 66px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px rgba(0,0,0,0.3);
    transition: transform 0.15s ease;
  }
  .app-badge:hover .badge-tile { transform: translateY(-3px); }
  .app-badge .badge-tile svg { width: 32px; height: 32px; color: white; }
  .app-badge .badge-label {
    color: white;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .badge-android { background: linear-gradient(160deg, #6FCF5E, #3DA23B); }
  .badge-ios { background: linear-gradient(160deg, #3A3A3C, #17171A); }
  .badge-admin { background: linear-gradient(160deg, #4C9EFF, #0C56C4); }
  .badge-info { background: linear-gradient(160deg, #B47CE8, #7B3FC4); }

  /* Bouton + menu déroulant langue/thème, dans la barre de titre */
  .lang-theme-trigger {
    width: 26px; height: 26px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--text-secondary); position: relative;
  }
  .lang-theme-trigger:hover { background: rgba(0,0,0,0.06); }
  .lang-theme-trigger svg { width: 15px; height: 15px; }
  .lang-theme-menu {
    position: absolute;
    top: 34px;
    right: 0;
    width: 190px;
    background: var(--window);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.25);
    padding: 6px;
    z-index: 50;
    display: none;
  }
  .lang-theme-menu.open { display: block; }
  .lang-theme-menu .menu-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: var(--text-secondary); padding: 6px 8px 4px;
  }
  .lang-theme-menu .menu-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px; font-size: 13px;
    cursor: pointer; color: var(--text);
  }
  .lang-theme-menu .menu-row:hover { background: rgba(0,0,0,0.06); }
  .lang-theme-menu .menu-check { margin-left: auto; opacity: 0; font-size: 12px; color: var(--accent); }
  .lang-theme-menu .menu-row.selected .menu-check { opacity: 1; }
  .lang-theme-menu .menu-flag { font-size: 11px; font-weight: 700; width: 20px; text-align: center; }
  .lang-theme-menu hr { margin: 6px 4px; }
`;
document.head.appendChild(style);

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------
// Icônes vectorielles fines (style épuré façon SF Symbols — pas le logo
// Apple lui-même, juste le même esprit graphique que les onglets de l'app
// Android : traits fins, monochromes, minimalistes).
// ---------------------------------------------------------------------

const ICONS = {
  android: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="10" rx="3"/><circle cx="9.5" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1.1" fill="currentColor" stroke="none"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><path d="M3 12h2M19 12h2"/></svg>`,
  ios: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 19h3"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M16 6l2 2M19 3l2 2"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.7" r="0.3" fill="currentColor"/></svg>`,
  connect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0L6 8Z"/><path d="M12 17v5"/></svg>`,
  install: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
  owner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/></svg>`,
  blocking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/></svg>`,
  advanced: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.3" fill="currentColor"/></svg>`,
  legal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 7l-4 8a4 4 0 0 0 8 0l-4-8ZM17 7l-4 8a4 4 0 0 0 8 0l-4-8Z"/><path d="M5 21h14M7 7h10"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9Z"/></svg>`,
};

// ---------------------------------------------------------------------
// Écosystème YiDream : le site est un mini "bureau", chaque fonction est
// une app séparée — pensé pour accueillir plus tard un configurateur iOS
// à côté de celui d'Android, sans tout mélanger dans une seule interface.
// ---------------------------------------------------------------------

const DESKTOP_APPS = [
  { key: "android", icon: "🤖", sections: ["connect", "install", "owner", "blocking"] },
  { key: "ios", icon: "📱", sections: ["ios"] },
  { key: "admin", icon: "🔑", sections: ["admin", "advanced"] },
  { key: "info", icon: "ℹ️", sections: ["about", "legal"] },
];

const SECTION_DEFS = {
  connect: { gated: false },
  install: { gated: false },
  owner: { gated: false },
  blocking: { gated: false },
  admin: { gated: true },
  advanced: { gated: true },
  about: { gated: false },
  legal: { gated: false },
  ios: { gated: false },
};

let currentApp = null;       // null = bureau ; sinon clé d'une DESKTOP_APPS
let currentSection = null;

// ---------------------------------------------------------------------
// Langues : EN (défaut), FR, HE, YI — sélecteur en haut à droite
//
// Les images de drapeaux hébergées sur un CDN externe peuvent échouer à
// charger (bloqueur de pub, réseau, CDN down) et faire disparaître tout
// le sélecteur sans rien afficher à la place. On utilise donc des badges
// texte autonomes qui ne dépendent d'aucune ressource externe.
// ---------------------------------------------------------------------

const LANGUAGES = [
  { code: "en", badge: "EN", label: "English", rtl: false },
  { code: "fr", badge: "FR", label: "Français", rtl: false },
  { code: "he", badge: "עב", label: "עברית", rtl: true },
  { code: "yi", badge: "יי", label: "יידיש", rtl: true },
];

let currentLang = "en";

const APP_LABELS = {
  en: { android: "Android Configurator", ios: "iOS Configurator", admin: "Admin", info: "Info" },
  fr: { android: "Configurateur Android", ios: "Configurateur iOS", admin: "Admin", info: "Info" },
  he: { android: "מגדיר אנדרואיד", ios: "מגדיר iOS", admin: "מנהל", info: "מידע" },
  yi: { android: "אַנדרואיד קאָנפֿיגוראַטאָר", ios: "iOS קאָנפֿיגוראַטאָר", admin: "אַדמין", info: "אינפֿאָ" },
};

const NAV_LABELS = {
  en: { about: "About", legal: "Legal", connect: "Connect", install: "Install APK", owner: "Device Owner",
        blocking: "Blocking", admin: "Administration", advanced: "Advanced options", ios: "iOS" },
  fr: { about: "À propos", legal: "Mentions légales", connect: "Connexion", install: "Installer l'APK", owner: "Device Owner",
        blocking: "Blocage", admin: "Administration", advanced: "Options avancées", ios: "iOS" },
  he: { about: "אודות", legal: "משפטי", connect: "התחברות", install: "התקנת APK", owner: "בעלים של המכשיר",
        blocking: "חסימה", admin: "ניהול", advanced: "אפשרויות מתקדמות", ios: "iOS" },
  yi: { about: "וועגן", legal: "לעגאַל", connect: "פארבינדן", install: "אינסטאלירן APK", owner: "באזיצער פונעם געראט",
        blocking: "בלאקירן", admin: "אדמיניסטראציע", advanced: "אַוואַנסירטע אָפּציעס", ios: "iOS" },
};

const ABOUT_CONTENT = {
  en: {
    title: "About YiDream",
    body: `YiDream is a personal, self-hosted Android device management tool.
It lets you turn a phone into a restricted ("kosher") device — blocking
whole categories of apps (browsers, standalone AI assistants, social
media, the Play Store) using Android's built-in Device Owner mode. No
custom ROM, no root, no third-party server required beyond what you
choose to host yourself.
The App Store tab only allows installing apps from one trusted source,
and everything can be reversed with an admin-only daily code.
This is a beta, personal project — not a commercial product.`,
  },
  fr: {
    title: "À propos de YiDream",
    body: `YiDream est un outil personnel et auto-hébergé de gestion d'appareil
Android. Il permet de transformer un téléphone en appareil restreint
("kosher") — en bloquant des catégories entières d'apps (navigateurs,
assistants IA autonomes, réseaux sociaux, Play Store) grâce au mode
Device Owner natif d'Android. Pas de ROM custom, pas de root, aucun
serveur tiers requis en dehors de celui que tu choisis d'héberger toi-même.
L'onglet App Store n'autorise l'installation d'apps que depuis une seule
source de confiance, et tout peut être annulé avec un code journalier
réservé à l'administrateur.
C'est un projet personnel en beta — pas un produit commercial.`,
  },
  he: {
    title: "אודות YiDream",
    body: `YiDream הוא כלי אישי לניהול מכשירי אנדרואיד, מתארח באופן עצמאי.
הוא מאפשר להפוך טלפון למכשיר מוגבל ("כשר") — חוסם קטגוריות שלמות של
אפליקציות (דפדפנים, עוזרי בינה מלאכותית, רשתות חברתיות, חנות Play)
באמצעות מצב "בעלים של המכשיר" המובנה באנדרואיד. ללא ROM מותאם אישית,
ללא רוט, ללא צורך בשרת צד שלישי מעבר למה שתבחר לארח בעצמך.
לשונית ה-App Store מאפשרת התקנת אפליקציות רק ממקור מהימן אחד, וניתן
לבטל הכול באמצעות קוד יומי השמור למנהל בלבד.
זהו פרויקט אישי בגרסת בטא — לא מוצר מסחרי.`,
  },
  yi: {
    title: "וועגן YiDream",
    body: `YiDream איז אַ פּערזענלעך, זעלבסט-באַלעבאָסטעוועט געצייג פֿאַר אַנדרואיד
געראט פֿאַרוואַלטונג. עס לאָזט דיר פֿאַרוואַנדלען אַ טעלעפֿאָן אין אַ באַגרענעצטן
("כּשר'ן") געראט מיט אַנדרואיד'ס Device Owner מאָדוס.
דאָס איז אַ פּערזענלעך פּראָיעקט אין בעטא — נישט קיין קאָמערציעלער פּראָדוקט.`,
  },
};

function renderAbout() {
  const t = ABOUT_CONTENT[currentLang];
  return `
    <h1>${t.title}</h1>
    <p class="subtitle" style="white-space:pre-line;line-height:1.7;">${t.body}</p>
  `;
}

const IOS_COMING_SOON = {
  en: { title: "iOS Configurator", body: "Coming soon. iOS filter configuration will live here once developed — a separate app in the same YiDream ecosystem as the Android configurator." },
  fr: { title: "Configurateur iOS", body: "Bientôt disponible. La configuration du filtre iOS vivra ici une fois développée — une app séparée dans le même écosystème YiDream que le configurateur Android." },
  he: { title: "מגדיר iOS", body: "בקרוב. תצורת הסינון עבור iOS תהיה כאן לאחר הפיתוח — אפליקציה נפרדת באותה מערכת YiDream כמו מגדיר האנדרואיד." },
  yi: { title: "iOS קאָנפֿיגוראַטאָר", body: "באַלד. די iOS קאָנפֿיגוראַציע וועט זײַן דאָ נאָך אַנטוויקלונג." },
};

function renderIos() {
  const t = IOS_COMING_SOON[currentLang];
  return `
    <div class="coming-soon">
      <div class="big-icon">📱</div>
      <h1>${t.title}</h1>
      <p class="subtitle">${t.body}</p>
    </div>
  `;
}

function renderLegal() {
  return `
    <h1>${currentLang === "fr" ? "Mentions légales" : "Legal"}</h1>
    <p class="subtitle" style="white-space:pre-line;line-height:1.6;font-size:12px;">${DISCLAIMER_TEXT}</p>
  `;
}

// ---------------------------------------------------------------------
// Traductions des titres / sous-titres / boutons de chaque section.
// (Les messages du journal restent en français — hors scope raisonnable.)
// ---------------------------------------------------------------------

const UI_STRINGS = {
  en: {
    connect_title: "Connection", connect_subtitle: "Plug the phone in via USB (debugging enabled, WinUSB driver replaced via Zadig on Windows).",
    connect_connected: "✅ Connected", connect_disconnected: "Not connected", connect_button: "Connect phone",
    install_title: "Install or update the APK", install_subtitle: "Reinstalling over an existing version acts as an update.",
    install_searching: "Looking for the APK hosted on this site…", install_manual_label: "Or pick a different file manually",
    install_button: "Install / Update",
    owner_title: "Activate Device Owner", owner_subtitle: "Requires that no Google account is configured on the phone.",
    owner_button: "Activate Device Owner",
    blocking_title: "Blocking by category", blocking_subtitle: "Messaging (WhatsApp, Telegram…) is intentionally not in the list — not restricted.",
    blocking_browsers: "Web browsers", blocking_ai: "AI assistants (standalone apps)", blocking_social: "Social media", blocking_store: "Play Store",
    blocking_extra_label: "Additional apps (packages, comma-separated)", blocking_note: "These settings are sent from the \"Administration\" app (🔒).",
    admin_title: "Administration", admin_subtitle: "Generate today's code and apply the full configuration (blocking + unlock) to the phone.",
    admin_password_label: "Master password (never stored, neither here nor on the phone)", admin_generate_code: "Generate today's code",
    admin_apply: "Send and apply on the phone",
    advanced_title: "Advanced options", advanced_subtitle: "Destructive actions — use with care.",
    advanced_clear: "Remove restrictions", advanced_uninstall: "Uninstall completely",
    lock_title: "Admin access required", lock_subtitle: "This app is only accessible to you.",
    lock_placeholder: "Admin password", lock_button: "Unlock", lock_error: "Incorrect password.",
    log_searching_device: "Looking for the phone…", log_no_device: "No device selected.",
    log_connecting: "Connecting…", log_authenticating: "Authenticating (check the phone)…",
    log_connected: "✅ Connected: ", log_connect_first: "Connect first.",
    log_connect_and_apk: "Connect and make sure an APK is available.",
    log_installing: "Installing…", log_apk_installed: "✅ APK installed / updated.",
    log_activating_owner: "Activating Device Owner…", log_owner_activated: "✅ Device Owner activated.",
    log_connect_first_section: "Connect first (Connection section).",
    log_launching_app: "Launching YiDream on the phone…", log_sending_config: "Sending configuration…",
    log_relaunching: "Relaunching the app to apply…", log_config_applied: "✅ Configuration applied on the phone.",
    log_removing_owner: "Removing Device Owner status…", log_restrictions_removed: "✅ Restrictions removed.",
    log_uninstalling: "Uninstalling…", log_uninstalled: "✅ YiDream uninstalled.",
    log_code_valid: "Valid today — share it with whoever needs to unlock the phone.",
    log_apk_found: "✅ APK automatically detected on this site", log_apk_not_found: "No APK found on this site yet — pick a file manually below.",
    confirm_clear: "Remove all restrictions (the app stays installed)?",
    confirm_uninstall: "Remove restrictions AND uninstall YiDream?",
  },
  fr: {
    connect_title: "Connexion", connect_subtitle: "Branche le téléphone en USB (débogage activé, pilote WinUSB remplacé via Zadig sur Windows).",
    connect_connected: "✅ Connecté", connect_disconnected: "Non connecté", connect_button: "Connecter le téléphone",
    install_title: "Installer ou mettre à jour l'APK", install_subtitle: "Réinstaller par-dessus une version existante fait office de mise à jour.",
    install_searching: "Recherche de l'APK hébergé sur ce site…", install_manual_label: "Ou choisis un autre fichier manuellement",
    install_button: "Installer / Mettre à jour",
    owner_title: "Activer Device Owner", owner_subtitle: "Nécessite qu'aucun compte Google ne soit configuré sur le téléphone.",
    owner_button: "Activer Device Owner",
    blocking_title: "Blocage par catégorie", blocking_subtitle: "La messagerie (WhatsApp, Telegram…) n'est volontairement pas dans la liste — non restreinte.",
    blocking_browsers: "Navigateurs internet", blocking_ai: "Assistants IA (apps dédiées)", blocking_social: "Réseaux sociaux", blocking_store: "Play Store",
    blocking_extra_label: "Apps supplémentaires (packages séparés par des virgules)", blocking_note: "Ces réglages sont envoyés depuis l'app \"Admin\" (🔒).",
    admin_title: "Administration", admin_subtitle: "Génère le code du jour et applique la configuration complète (blocage + déverrouillage) sur le téléphone.",
    admin_password_label: "Mot de passe maître (jamais stocké, ni ici ni sur le téléphone)", admin_generate_code: "Générer le code du jour",
    admin_apply: "Envoyer et appliquer sur le téléphone",
    advanced_title: "Options avancées", advanced_subtitle: "Actions destructrices — à utiliser en connaissance de cause.",
    advanced_clear: "Retirer les restrictions", advanced_uninstall: "Désinstaller complètement",
    lock_title: "Accès administrateur requis", lock_subtitle: "Cette app n'est accessible qu'à toi.",
    lock_placeholder: "Mot de passe admin", lock_button: "Déverrouiller", lock_error: "Mot de passe incorrect.",
    log_searching_device: "Recherche du téléphone…", log_no_device: "Aucun appareil sélectionné.",
    log_connecting: "Connexion…", log_authenticating: "Authentification (regarde le téléphone)…",
    log_connected: "✅ Connecté : ", log_connect_first: "Connecte-toi d'abord.",
    log_connect_and_apk: "Connecte-toi et assure-toi qu'un APK est disponible.",
    log_installing: "Installation…", log_apk_installed: "✅ APK installé / mis à jour.",
    log_activating_owner: "Activation Device Owner…", log_owner_activated: "✅ Device Owner activé.",
    log_connect_first_section: "Connecte-toi d'abord (section Connexion).",
    log_launching_app: "Lancement de YiDream sur le téléphone…", log_sending_config: "Envoi de la configuration…",
    log_relaunching: "Relance de l'app pour appliquer…", log_config_applied: "✅ Configuration appliquée sur le téléphone.",
    log_removing_owner: "Retrait du statut Device Owner…", log_restrictions_removed: "✅ Restrictions levées.",
    log_uninstalling: "Désinstallation…", log_uninstalled: "✅ YiDream désinstallé.",
    log_code_valid: "Valable aujourd'hui — à communiquer à qui doit déverrouiller le téléphone.",
    log_apk_found: "✅ APK détecté automatiquement sur ce site", log_apk_not_found: "Aucun APK trouvé sur ce site pour le moment — sélectionne un fichier manuellement ci-dessous.",
    confirm_clear: "Retirer toutes les restrictions (l'app reste installée) ?",
    confirm_uninstall: "Retirer les restrictions ET désinstaller YiDream ?",
  },
  he: {
    connect_title: "התחברות", connect_subtitle: "חבר את הטלפון ב-USB (ניפוי באגים מופעל, דרייבר WinUSB הוחלף דרך Zadig ב-Windows).",
    connect_connected: "✅ מחובר", connect_disconnected: "לא מחובר", connect_button: "חבר את הטלפון",
    install_title: "התקן או עדכן את ה-APK", install_subtitle: "התקנה מחדש על גבי גרסה קיימת פועלת כעדכון.",
    install_searching: "מחפש APK המתארח באתר זה…", install_manual_label: "או בחר קובץ אחר באופן ידני",
    install_button: "התקן / עדכן",
    owner_title: "הפעל Device Owner", owner_subtitle: "דורש שלא יוגדר חשבון Google בטלפון.",
    owner_button: "הפעל Device Owner",
    blocking_title: "חסימה לפי קטגוריה", blocking_subtitle: "מסרים (WhatsApp, Telegram…) אינם ברשימה בכוונה — לא מוגבלים.",
    blocking_browsers: "דפדפני אינטרנט", blocking_ai: "עוזרי בינה מלאכותית (אפליקציות עצמאיות)", blocking_social: "רשתות חברתיות", blocking_store: "חנות Play",
    blocking_extra_label: "אפליקציות נוספות (חבילות מופרדות בפסיקים)", blocking_note: "הגדרות אלה נשלחות מאפליקציית \"אדמין\" (🔒).",
    admin_title: "ניהול", admin_subtitle: "צור את קוד היום והחל את התצורה המלאה (חסימה + שחרור) על הטלפון.",
    admin_password_label: "סיסמה ראשית (לעולם לא נשמרת, לא כאן ולא בטלפון)", admin_generate_code: "צור את קוד היום",
    admin_apply: "שלח והחל על הטלפון",
    advanced_title: "אפשרויות מתקדמות", advanced_subtitle: "פעולות הרסניות — יש להשתמש בזהירות.",
    advanced_clear: "הסר הגבלות", advanced_uninstall: "הסר התקנה לחלוטין",
    lock_title: "נדרשת גישת מנהל", lock_subtitle: "אפליקציה זו נגישה רק לך.",
    lock_placeholder: "סיסמת מנהל", lock_button: "שחרר", lock_error: "סיסמה שגויה.",
    log_searching_device: "מחפש את הטלפון…", log_no_device: "לא נבחר מכשיר.",
    log_connecting: "מתחבר…", log_authenticating: "מאמת (בדוק את הטלפון)…",
    log_connected: "✅ מחובר: ", log_connect_first: "התחבר קודם.",
    log_connect_and_apk: "התחבר וודא שקובץ APK זמין.",
    log_installing: "מתקין…", log_apk_installed: "✅ ה-APK הותקן / עודכן.",
    log_activating_owner: "מפעיל Device Owner…", log_owner_activated: "✅ Device Owner הופעל.",
    log_connect_first_section: "התחבר קודם (סעיף התחברות).",
    log_launching_app: "מפעיל את YiDream בטלפון…", log_sending_config: "שולח תצורה…",
    log_relaunching: "מפעיל מחדש את האפליקציה כדי להחיל…", log_config_applied: "✅ התצורה הוחלה בטלפון.",
    log_removing_owner: "מסיר את סטטוס Device Owner…", log_restrictions_removed: "✅ ההגבלות הוסרו.",
    log_uninstalling: "מסיר התקנה…", log_uninstalled: "✅ YiDream הוסר.",
    log_code_valid: "תקף היום — שתף עם מי שצריך לשחרר את הטלפון.",
    log_apk_found: "✅ APK זוהה אוטומטית באתר זה", log_apk_not_found: "לא נמצא APK באתר זה עדיין — בחר קובץ באופן ידני למטה.",
    confirm_clear: "להסיר את כל ההגבלות (האפליקציה נשארת מותקנת)?",
    confirm_uninstall: "להסיר הגבלות ולהסיר את ההתקנה של YiDream?",
  },
  yi: {
    connect_title: "פארבינדונג", connect_subtitle: "פֿאַרבינד דעם טעלעפֿאָן מיט USB.",
    connect_connected: "✅ פֿאַרבונדן", connect_disconnected: "נישט פֿאַרבונדן", connect_button: "פֿאַרבינדן דעם טעלעפֿאָן",
    install_title: "אינסטאַלירן אָדער אַפּדעיטן דעם APK", install_subtitle: "רעאינסטאַלאַציע פֿירט זיך ווי אַן אַפּדעיט.",
    install_searching: "זוכט דעם APK אויף דעם וועבזייטל…", install_manual_label: "אָדער קלייַב אַן אַנדער טעקע מאַנועל",
    install_button: "אינסטאַלירן / אַפּדעיטן",
    owner_title: "אַקטיווירן Device Owner", owner_subtitle: "פֿאָדערט אַז קיין Google קאָנטע איז נישט קאָנפֿיגורירט.",
    owner_button: "אַקטיווירן Device Owner",
    blocking_title: "בלאָקירן לויט קאַטעגאָריע", blocking_subtitle: "מעסידזשינג איז בכוונה נישט אין דער ליסטע.",
    blocking_browsers: "בלעטערער", blocking_ai: "קי בינה עוזרים", blocking_social: "סאָציאַלע מעדיע", blocking_store: "Play שטאָר",
    blocking_extra_label: "נאָך אַפּפּס (פּעקלעך אָפּגעטיילט מיט קאָמעס)", blocking_note: "די אײַנשטעלונגען ווערן געשיקט פֿון \"אדמין\" (🔒).",
    admin_title: "אדמיניסטראציע", admin_subtitle: "שאַף דעם היינטיקן קאָד און אָנווענדן די גאַנצע קאָנפֿיגוראַציע.",
    admin_password_label: "הויפּט פּאַראָל (קיינמאָל נישט אָפּגעהיט)", admin_generate_code: "שאַפֿן דעם היינטיקן קאָד",
    admin_apply: "שיקן און אָנווענדן אויפֿן טעלעפֿאָן",
    advanced_title: "אַוואַנסירטע אָפּציעס", advanced_subtitle: "הרסניש אַקציעס — זײַ פֿאָרזיכטיק.",
    advanced_clear: "אַראָפּנעמען באַגרענעצונגען", advanced_uninstall: "גאָר אַראָפּנעמען",
    lock_title: "מ'דאַרף אַדמין צוטריט", lock_subtitle: "די אַפּ איז נאָר צוטריטלעך פֿאַר דיר.",
    lock_placeholder: "אַדמין פּאַראָל", lock_button: "עפֿענען", lock_error: "פֿאַלשער פּאַראָל.",
    log_searching_device: "זוכט דעם טעלעפֿאָן…", log_no_device: "קיין געראַט אויסגעקליבן.",
    log_connecting: "פֿאַרבינדט…", log_authenticating: "אָטענטיקירט…",
    log_connected: "✅ פֿאַרבונדן: ", log_connect_first: "פֿאַרבינד זיך ערשט.",
    log_connect_and_apk: "פֿאַרבינד זיך און זיכער אַז אַן APK איז צוגענגלעך.",
    log_installing: "אינסטאַלירט…", log_apk_installed: "✅ APK אינסטאַלירט / אַפּדעיטעט.",
    log_activating_owner: "אַקטיווירט Device Owner…", log_owner_activated: "✅ Device Owner אַקטיוויזירט.",
    log_connect_first_section: "פֿאַרבינד זיך ערשט.",
    log_launching_app: "לאָנטשט YiDream…", log_sending_config: "שיקט קאָנפֿיגוראַציע…",
    log_relaunching: "לאָנטשט מחדש…", log_config_applied: "✅ קאָנפֿיגוראַציע אָנגעווענדט.",
    log_removing_owner: "אַראָפּנעמט Device Owner סטאַטוס…", log_restrictions_removed: "✅ באַגרענעצונגען אַראָפּגענומען.",
    log_uninstalling: "אַראָפּנעמט…", log_uninstalled: "✅ YiDream אַראָפּגענומען.",
    log_code_valid: "גילטיק היינט.",
    log_apk_found: "✅ APK געפֿונען אויף דעם וועבזייטל", log_apk_not_found: "קיין APK נישט געפֿונען — קלייַב אַ טעקע מאַנועל.",
    confirm_clear: "אַראָפּנעמען אַלע באַגרענעצונגען?",
    confirm_uninstall: "אַראָפּנעמען און דיסאינסטאַלירן YiDream?",
  },
};

function tr(key) {
  return UI_STRINGS[currentLang]?.[key] || UI_STRINGS.en[key] || key;
}

// ---------------------------------------------------------------------
// Rendu : bureau (icônes) puis fenêtre d'app (sidebar + contenu)
// ---------------------------------------------------------------------

const BADGE_CLASSES = { android: "badge-android", ios: "badge-ios", admin: "badge-admin", info: "badge-info" };

let currentTheme = "light";

function paint() {
  if (currentApp === null) {
    paintDesktop();
  } else {
    paintAppWindow();
  }
}

function paintDesktop() {
  const isRtl = LANGUAGES.find((l) => l.code === currentLang)?.rtl;
  document.documentElement.setAttribute("data-theme", currentTheme);
  root.innerHTML = `
    <div class="desktop-wallpaper" dir="${isRtl ? "rtl" : "ltr"}">
      ${DESKTOP_APPS.map((appDef) => `
        <div class="app-badge" data-app="${appDef.key}">
          <div class="badge-tile ${BADGE_CLASSES[appDef.key]}">${ICONS[appDef.key]}</div>
          <div class="badge-label">${APP_LABELS[currentLang]?.[appDef.key] || appDef.key}</div>
        </div>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".app-badge").forEach((el) => {
    el.addEventListener("click", () => {
      const appDef = DESKTOP_APPS.find((a) => a.key === el.dataset.app);
      currentApp = appDef.key;
      currentSection = appDef.sections[0];
      paint();
    });
  });
}

function paintAppWindow() {
  const isRtl = LANGUAGES.find((l) => l.code === currentLang)?.rtl;
  document.documentElement.setAttribute("data-theme", currentTheme);
  const appDef = DESKTOP_APPS.find((a) => a.key === currentApp);
  const appLabel = APP_LABELS[currentLang]?.[currentApp] || currentApp;

  root.innerHTML = `
    <div class="desktop" dir="${isRtl ? "rtl" : "ltr"}">
      <div class="mac-window">
        <div class="title-bar">
          <div class="traffic-lights" id="btn-close-app" title="Bureau">
            <div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div>
          </div>
          <div class="title">${appLabel}</div>
          <div class="lang-theme-trigger" id="lang-theme-trigger">
            ${ICONS.globe}
            ${renderLangThemeMenu()}
          </div>
        </div>
        <div class="body">
          <div class="sidebar" id="sidebar"></div>
          <div class="content" id="content"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-close-app").addEventListener("click", () => {
    currentApp = null;
    currentSection = null;
    paint();
  });

  wireLangThemeMenu();

  const sidebar = document.getElementById("sidebar");
  appDef.sections.forEach((sectionKey) => {
    const gated = SECTION_DEFS[sectionKey]?.gated;
    const el = document.createElement("div");
    el.className = "nav-item" + (sectionKey === currentSection ? " active" : "");
    const iconSvg = gated
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="9" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`
      : (ICONS[sectionKey] || ICONS.info);
    el.innerHTML = `<span class="nav-icon">${iconSvg}</span>` + (NAV_LABELS[currentLang]?.[sectionKey] || sectionKey);
    el.addEventListener("click", () => { currentSection = sectionKey; paintAppWindow(); });
    sidebar.appendChild(el);
  });

  renderSection(currentSection);
}

function renderLangThemeMenu() {
  const langLabel = currentLang === "he" || currentLang === "yi" ? "שפה" : currentLang === "en" ? "Language" : "Langue";
  const themeLabel = currentLang === "he" || currentLang === "yi" ? "ערכת נושא" : currentLang === "en" ? "Theme" : "Thème";
  const themeNames = {
    en: { light: "Light", dark: "Dark" },
    fr: { light: "Clair", dark: "Sombre" },
    he: { light: "בהיר", dark: "כהה" },
    yi: { light: "ליכטיק", dark: "טונקל" },
  };
  const t = themeNames[currentLang] || themeNames.en;

  return `
    <div class="lang-theme-menu" id="lang-theme-menu">
      <div class="menu-label">${langLabel}</div>
      ${LANGUAGES.map((l) => `
        <div class="menu-row lang-option ${l.code === currentLang ? "selected" : ""}" data-lang="${l.code}">
          <span class="menu-flag">${l.badge}</span>
          <span>${l.label}</span>
          <span class="menu-check">✓</span>
        </div>
      `).join("")}
      <hr />
      <div class="menu-label">${themeLabel}</div>
      <div class="menu-row theme-option ${currentTheme === "light" ? "selected" : ""}" data-theme-choice="light">
        <span>${t.light}</span><span class="menu-check">✓</span>
      </div>
      <div class="menu-row theme-option ${currentTheme === "dark" ? "selected" : ""}" data-theme-choice="dark">
        <span>${t.dark}</span><span class="menu-check">✓</span>
      </div>
    </div>
  `;
}

function wireLangThemeMenu() {
  const trigger = document.getElementById("lang-theme-trigger");
  const menu = document.getElementById("lang-theme-menu");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", () => menu.classList.remove("open"), { once: true });

  menu.querySelectorAll(".lang-option").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      currentLang = el.dataset.lang;
      paintAppWindow();
    });
  });
  menu.querySelectorAll(".theme-option").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      currentTheme = el.dataset.themeChoice;
      paintAppWindow();
    });
  });
}

function renderSection(key) {
  const content = document.getElementById("content");
  const gated = SECTION_DEFS[key]?.gated;

  if (gated && !isAdminUnlocked) {
    content.innerHTML = `
      <div class="lock-screen">
        <div class="lock-icon">🔒</div>
        <h1>${tr("lock_title")}</h1>
        <p class="subtitle">${tr("lock_subtitle")}</p>
        <div class="field-group" style="max-width:240px;margin:0 auto;">
          <input type="password" id="admin-password" placeholder="${tr("lock_placeholder")}" />
        </div>
        <button class="primary" id="btn-admin-unlock">${tr("lock_button")}</button>
        <p class="subtitle" id="admin-error" style="color:var(--danger);margin-top:10px;"></p>
      </div>
    `;
    document.getElementById("btn-admin-unlock").addEventListener("click", async () => {
      const pwd = document.getElementById("admin-password").value;
      const hash = await sha256Hex(pwd);
      if (hash === ADMIN_PASSWORD_HASH) {
        isAdminUnlocked = true;
        renderSection(key);
      } else {
        document.getElementById("admin-error").textContent = tr("lock_error");
      }
    });
    return;
  }

  const renderers = {
    about: renderAbout,
    legal: renderLegal,
    ios: renderIos,
    connect: renderConnect,
    install: renderInstall,
    owner: renderOwner,
    blocking: renderBlocking,
    admin: renderAdmin,
    advanced: renderAdvanced,
  };
  content.innerHTML = renderers[key]();
  wireSection(key);
}

function log(message) {
  const el = document.getElementById("log-box");
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${message}\n`;
  el.scrollTop = el.scrollHeight;
}

// ---------------------------------------------------------------------
// Rendu des sections
// ---------------------------------------------------------------------

function renderConnect() {
  const status = adb
    ? `<div class="status-pill ok">${tr("connect_connected")}</div>`
    : `<div class="status-pill no">${tr("connect_disconnected")}</div>`;
  return `
    <h1>${tr("connect_title")}</h1>
    <p class="subtitle">${tr("connect_subtitle")}</p>
    ${status}
    <div><button class="primary" id="btn-connect">${tr("connect_button")}</button></div>
    <div class="log-box" id="log-box"></div>
  `;
}

function renderInstall() {
  return `
    <h1>${tr("install_title")}</h1>
    <p class="subtitle">${tr("install_subtitle")}</p>
    <div id="apk-auto-zone"><p class="subtitle">${tr("install_searching")}</p></div>
    <hr />
    <div class="field-group">
      <label>${tr("install_manual_label")}</label>
      <input type="file" id="apk-input" accept=".apk" />
    </div>
    <button class="primary" id="btn-install">${tr("install_button")}</button>
    <div class="log-box" id="log-box"></div>
  `;
}

function renderOwner() {
  return `
    <h1>${tr("owner_title")}</h1>
    <p class="subtitle">${tr("owner_subtitle")}</p>
    <button class="primary" id="btn-owner">${tr("owner_button")}</button>
    <div class="log-box" id="log-box"></div>
  `;
}

function renderBlocking() {
  return `
    <h1>${tr("blocking_title")}</h1>
    <p class="subtitle">${tr("blocking_subtitle")}</p>
    <div class="checkbox-row"><input type="checkbox" id="cat-browsers" ${blockingState.blockBrowsers ? "checked" : ""} /> ${tr("blocking_browsers")}</div>
    <div class="checkbox-row"><input type="checkbox" id="cat-ai" ${blockingState.blockAi ? "checked" : ""} /> ${tr("blocking_ai")}</div>
    <div class="checkbox-row"><input type="checkbox" id="cat-social" ${blockingState.blockSocial ? "checked" : ""} /> ${tr("blocking_social")}</div>
    <div class="checkbox-row"><input type="checkbox" id="cat-store" ${blockingState.blockStore ? "checked" : ""} /> ${tr("blocking_store")}</div>
    <div class="field-group" style="margin-top:14px;">
      <label>${tr("blocking_extra_label")}</label>
      <input type="text" id="extra-packages" placeholder="com.example.app1, com.example.app2" value="${blockingState.extraPackages}" />
    </div>
    <p class="subtitle">${tr("blocking_note")}</p>
  `;
}

function renderAdmin() {
  return `
    <h1>${tr("admin_title")}</h1>
    <p class="subtitle">${tr("admin_subtitle")}</p>

    <div class="field-group">
      <label>${tr("admin_password_label")}</label>
      <input type="password" id="master-password" />
    </div>
    <div class="row-actions">
      <button id="btn-generate-code">${tr("admin_generate_code")}</button>
    </div>
    <div id="code-output"></div>

    <hr />

    <button class="primary" id="btn-apply">${tr("admin_apply")}</button>
    <div class="log-box" id="log-box"></div>
  `;
}

function renderAdvanced() {
  return `
    <h1>${tr("advanced_title")}</h1>
    <p class="subtitle">${tr("advanced_subtitle")}</p>
    <div class="row-actions">
      <button id="btn-clear">${tr("advanced_clear")}</button>
      <button class="danger" id="btn-uninstall">${tr("advanced_uninstall")}</button>
    </div>
    <div class="log-box" id="log-box"></div>
  `;
}

// ---------------------------------------------------------------------
// Câblage
// ---------------------------------------------------------------------

function wireSection(key) {
  if (key === "connect") document.getElementById("btn-connect").addEventListener("click", onConnectClick);

  if (key === "install") {
    document.getElementById("btn-install").addEventListener("click", onInstallClick);
    checkForBundledApk();
  }

  if (key === "owner") document.getElementById("btn-owner").addEventListener("click", onOwnerClick);

  if (key === "blocking") {
    document.getElementById("cat-browsers").addEventListener("change", (e) => blockingState.blockBrowsers = e.target.checked);
    document.getElementById("cat-ai").addEventListener("change", (e) => blockingState.blockAi = e.target.checked);
    document.getElementById("cat-social").addEventListener("change", (e) => blockingState.blockSocial = e.target.checked);
    document.getElementById("cat-store").addEventListener("change", (e) => blockingState.blockStore = e.target.checked);
    document.getElementById("extra-packages").addEventListener("input", (e) => blockingState.extraPackages = e.target.value);
  }

  if (key === "admin") {
    document.getElementById("btn-generate-code").addEventListener("click", async () => {
      const password = document.getElementById("master-password").value;
      if (!password) return;
      const key = await deriveIntermediateKey(password);
      const code = await deriveDailyCode(key, todayString());
      document.getElementById("code-output").innerHTML =
        `<div class="code-display">${code}</div><p class="subtitle">${tr("log_code_valid")}</p>`;
    });
    document.getElementById("btn-apply").addEventListener("click", onApplyClick);
  }

  if (key === "advanced") {
    document.getElementById("btn-clear").addEventListener("click", onClearClick);
    document.getElementById("btn-uninstall").addEventListener("click", onUninstallClick);
  }
}

// ---------------------------------------------------------------------
// APK bundlé automatiquement (plus besoin de le télécharger à la main)
// ---------------------------------------------------------------------

let bundledApkBlob = null;

async function checkForBundledApk() {
  const zone = document.getElementById("apk-auto-zone");
  try {
    const response = await fetch("./yidream.apk", { cache: "no-store" });
    if (!response.ok) throw new Error("not found");
    bundledApkBlob = await response.blob();
    const sizeMb = (bundledApkBlob.size / 1024 / 1024).toFixed(1);
    zone.innerHTML = `<div class="apk-detected">${tr("log_apk_found")} (${sizeMb} Mo)</div>`;
  } catch (e) {
    bundledApkBlob = null;
    zone.innerHTML = `<p class="subtitle">${tr("log_apk_not_found")}</p>`;
  }
}

// ---------------------------------------------------------------------
// Crypto : dérivation clé intermédiaire + code du jour
// ---------------------------------------------------------------------

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function hmacSha256(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function deriveIntermediateKey(masterPassword) {
  const passwordBytes = new TextEncoder().encode(masterPassword);
  return await hmacSha256(passwordBytes, UNLOCK_SALT);
}

async function deriveDailyCode(intermediateKeyBytes, dateString) {
  const digest = await hmacSha256(intermediateKeyBytes, dateString);
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("").slice(0, 6);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// ---------------------------------------------------------------------
// Actions ADB
// ---------------------------------------------------------------------

async function onConnectClick() {
  if (!navigator.usb) { log("❌ WebUSB non supporté. Utilise Chrome ou Edge."); return; }
  const Manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!Manager) { log("❌ WebUSB indisponible (HTTPS requis)."); return; }

  try {
    log(tr("log_searching_device"));
    const device = await Manager.requestDevice();
    if (!device) { log(tr("log_no_device")); return; }

    log(tr("log_connecting"));
    const connection = await device.connect();

    log(tr("log_authenticating"));
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial, connection, credentialStore: CredentialStore,
    });

    adb = new Adb(transport);
    log(tr("log_connected") + device.serial);
    renderSection("connect");
  } catch (error) {
    log("❌ " + error.message);
  }
}

async function onInstallClick() {
  const fileInput = document.getElementById("apk-input").files[0];
  const source = fileInput || bundledApkBlob;

  if (!source || !adb) { log(tr("log_connect_and_apk")); return; }
  try {
    log(`${tr("log_installing")} (${(source.size / 1024 / 1024).toFixed(1)} Mo)`);
    const pm = new PackageManager(adb);
    await pm.installStream(source.size, source.stream());
    log(tr("log_apk_installed"));
  } catch (error) {
    log("❌ " + error.message);
  }
}

async function onOwnerClick() {
  if (!adb) { log(tr("log_connect_first")); return; }
  try {
    log(tr("log_activating_owner"));
    const result = await adb.subprocess.shellProtocol.spawnWaitText(["dpm", "set-device-owner", ADMIN_COMPONENT]);
    log(result.exitCode === 0 ? tr("log_owner_activated") : "❌ " + result.stdout + result.stderr);
  } catch (error) {
    log("❌ " + error.message);
  }
}

async function onApplyClick() {
  if (!adb) { log(tr("log_connect_first_section")); return; }

  const password = document.getElementById("master-password").value;

  const config = {
    block_browsers: blockingState.blockBrowsers,
    block_ai: blockingState.blockAi,
    block_social: blockingState.blockSocial,
    block_store: blockingState.blockStore,
    extra_packages: blockingState.extraPackages.split(",").map((s) => s.trim()).filter(Boolean),
  };

  if (password) {
    const key = await deriveIntermediateKey(password);
    config.unlock_intermediate_key = bytesToBase64(key);
  }

  try {
    log(tr("log_launching_app"));
    await adb.subprocess.shellProtocol.spawnWaitText([
      "monkey", "-p", APP_PACKAGE, "-c", "android.intent.category.LAUNCHER", "1",
    ]);
    await new Promise((r) => setTimeout(r, 2000));

    log(tr("log_sending_config"));
    const sync = await adb.sync();
    try {
      const blob = new Blob([JSON.stringify(config)], { type: "application/json" });
      await sync.write({ filename: CONFIG_REMOTE_PATH, file: blob.stream() });
    } finally {
      await sync.dispose();
    }

    log(tr("log_relaunching"));
    await adb.subprocess.shellProtocol.spawnWaitText(["am", "force-stop", APP_PACKAGE]);
    await adb.subprocess.shellProtocol.spawnWaitText([
      "monkey", "-p", APP_PACKAGE, "-c", "android.intent.category.LAUNCHER", "1",
    ]);
    log(tr("log_config_applied"));
  } catch (error) {
    log("❌ " + error.message);
  }
}

async function onClearClick() {
  if (!adb) return;
  if (!confirm(tr("confirm_clear"))) return;
  try {
    log(tr("log_removing_owner"));
    const result = await adb.subprocess.shellProtocol.spawnWaitText(["dpm", "remove-active-admin", ADMIN_COMPONENT]);
    log(result.exitCode === 0 ? tr("log_restrictions_removed") : "❌ " + result.stderr);
  } catch (error) {
    log("❌ " + error.message);
  }
}

async function onUninstallClick() {
  if (!adb) return;
  if (!confirm(tr("confirm_uninstall"))) return;
  try {
    log(tr("log_removing_owner"));
    await adb.subprocess.shellProtocol.spawnWaitText(["dpm", "remove-active-admin", ADMIN_COMPONENT]);
    await new Promise((r) => setTimeout(r, 1000));
    log(tr("log_uninstalling"));
    const result = await adb.subprocess.shellProtocol.spawnWaitText(["pm", "uninstall", APP_PACKAGE]);
    log(result.exitCode === 0 ? tr("log_uninstalled") : "❌ " + result.stdout + result.stderr);
  } catch (error) {
    log("❌ " + error.message);
  }
}

// ---------------------------------------------------------------------
// Disclaimer légal — bloque toute utilisation tant qu'il n'est pas accepté.
// Confirmation par recopie exacte d'une phrase (pas juste une case à cocher).
// ---------------------------------------------------------------------

const DISCLAIMER_STORAGE_KEY = "yidream_disclaimer_accepted_v1";
const CONFIRMATION_PHRASE = "I HAVE READ AND UNDERSTAND";

const DISCLAIMER_TEXT = `The use of the YiDream application (hereinafter referred to as "the Application") is subject to the following terms and conditions. By using the Application, you accept these terms and conditions in their entirety.

## State and Availability
The Application is provided "AS IS" and "AS AVAILABLE". YiDream and its developer make no warranties that the Application's functionalities will meet your needs, or that the operation of the Application will be uninterrupted, fast, secure, or error-free.

## Liability and Damages
Neither YiDream, nor its developer, nor its affiliates, nor its service providers can be held responsible for any direct, indirect, consequential, special, exemplary, or punitive damages, including, but not limited to, damages related to loss of profits, business interruption, loss of information or data, or any other financial loss.

## Warranties
The Application is provided without any warranties of any kind, either express or implied.

## Authorized Use
It is strictly prohibited to install this Application on a device that does not belong to you without the formal authorization of the device's owner. Furthermore, it is imperative that the device owner read and accept these terms and conditions before any use of the Application.

## Text Copy Confirmation
To activate certain features of the Application, it is necessary to type a specific confirmation phrase on screen. This step aims to ensure that the user understands the implications of activating these features. It is solely the responsibility of the device owner, and no one else, to type this phrase in order to confirm their consent and understanding of the features in question.

## Indemnification
By using the Application, you agree to release YiDream, its developer and its affiliates from any liability against any claim, loss, liability, or expense, including but not limited to attorney's fees, arising from or related to your use of the Application or the violation of these terms and conditions.`;

function showDisclaimerIfNeeded() {
  if (localStorage.getItem(DISCLAIMER_STORAGE_KEY) === "true") {
    paint();
    return;
  }

  root.innerHTML = `
    <div class="desktop">
      <div class="mac-window" style="max-width:640px;">
        <div class="title-bar">
          <div class="title" style="margin:0 auto;">⚠️ Terms of Use — YiDream</div>
        </div>
        <div class="content" style="max-height:60vh;">
          <div style="white-space:pre-line; font-size:12px; line-height:1.6; color:var(--text-secondary);">${DISCLAIMER_TEXT}</div>
          <hr />
          <p class="subtitle">Type the following phrase exactly to confirm you have read and understood these terms:</p>
          <p style="font-weight:700; font-size:13px; user-select:all;">${CONFIRMATION_PHRASE}</p>
          <div class="field-group">
            <input type="text" id="disclaimer-input" placeholder="Type the phrase here" />
          </div>
          <button class="primary" id="btn-disclaimer-accept" disabled>I Accept</button>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById("disclaimer-input");
  const acceptBtn = document.getElementById("btn-disclaimer-accept");

  input.addEventListener("input", () => {
    acceptBtn.disabled = input.value.trim().toUpperCase() !== CONFIRMATION_PHRASE;
  });

  acceptBtn.addEventListener("click", () => {
    localStorage.setItem(DISCLAIMER_STORAGE_KEY, "true");
    paint();
  });
}

// ---------------------------------------------------------------------
// Verrou d'origine : cet outil ne fonctionne que sur l'adresse officielle.
// ---------------------------------------------------------------------

const OFFICIAL_ORIGIN = "https://qinfrance.github.io";
const OFFICIAL_PATH = "/YiDream/";

function isOfficialSite() {
  return location.origin === OFFICIAL_ORIGIN && location.pathname.startsWith(OFFICIAL_PATH);
}

function showOriginBlockedScreen() {
  root.innerHTML = `
    <div class="desktop">
      <div class="mac-window" style="max-width:480px;">
        <div class="title-bar">
          <div class="title" style="margin:0 auto;">🚫 YiDream Configurator</div>
        </div>
        <div class="content" style="text-align:center;">
          <h1>Site non autorisé</h1>
          <p class="subtitle">
            Cet outil ne fonctionne que depuis son adresse officielle :<br />
            <strong>${OFFICIAL_ORIGIN}${OFFICIAL_PATH}</strong>
          </p>
        </div>
      </div>
    </div>
  `;
}

if (isOfficialSite()) {
  showDisclaimerIfNeeded();
} else {
  showOriginBlockedScreen();
}
