// YiDream — configuration du configurateur Web ADB.
// ⚠️ À adapter à ton APK réel : ces valeurs sont des PLACEHOLDERS.
export const CONFIG = {
  // Nom de package de l'application YiDream Android
  packageName: 'com.yidream.android',
  // Composant DeviceAdminReceiver déclaré dans le manifest de l'APK
  adminComponent: 'com.yidream.android/.YiDreamAdminReceiver',
  // Dossier temporaire sur le téléphone pour pousser l'APK
  remoteApkPath: '/data/local/tmp/yidream.apk',
  // Optionnel : URL d'un APK servi avec CORS activé (sinon, sélection manuelle du fichier)
  apkUrl: '',
  // Paquets désactivables depuis l'onglet Configuration (pm disable-user).
  // Les cases correspondent aux catégories affichées dans l'interface.
  categories: {
    browsers: ['com.android.chrome', 'org.mozilla.firefox', 'com.microsoft.emmx', 'com.opera.browser'],
    ai: ['com.google.android.apps.bard', 'com.openai.chatgpt', 'com.microsoft.copilot'],
    social: ['com.facebook.katana', 'com.instagram.android', 'com.zhiliaoapp.musically', 'com.twitter.android'],
    stores: ['com.android.vending'],
  },
};
