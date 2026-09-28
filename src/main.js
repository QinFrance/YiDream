import { YiDreamAdb } from './webadb.js';
import { CONFIG } from './config.js';

const client = new YiDreamAdb((entry) => {
  // adbLogs est défini dans le script inline de index.html
  if (Array.isArray(window.adbLogs)) window.adbLogs.push(entry);
});

// Expose l'API au script inline (les onclick de l'interface).
window.yidream = {
  get supported() { return YiDreamAdb.supported; },
  get info() { return client.info; },
  connect: () => client.connect(),
  disconnect: () => client.disconnect(),
  isInstalled: () => client.isInstalled(),
  installApk: (file) => client.installApk(file),
  setDeviceOwner: () => client.setDeviceOwner(),
  applyCategories: (cats) => client.disablePackages(cats.flatMap((c) => CONFIG.categories[c] ?? [])),
};
