// YiDream — couche Web ADB (WebUSB) basée sur ya-webadb (@yume-chan).
import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { CONFIG } from './config.js';

const PKG_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const COMPONENT_RE = /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/;

export class YiDreamAdb {
  constructor(onLog = () => {}) {
    this.adb = null;
    this.info = null;
    this.onLog = onLog;
    this.credentialStore = new AdbWebCredentialStore('YiDream');
  }

  static get supported() {
    return !!AdbDaemonWebUsbDeviceManager.BROWSER;
  }

  get connected() {
    return !!this.adb;
  }

  log(step, event, result = 'OK') {
    this.onLog({ time: new Date().toLocaleTimeString(), step, event, result });
  }

  async connect() {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) throw new Error('WebUSB indisponible : utilise Chrome ou Edge en HTTPS.');
    const device = await manager.requestDevice();
    if (!device) throw new Error('Aucun appareil sélectionné.');
    let connection;
    try {
      connection = await device.connect();
    } catch (e) {
      if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
        throw new Error("Appareil occupé : ferme tout serveur ADB sur le PC (adb kill-server) puis réessaie.");
      }
      throw e;
    }
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: this.credentialStore,
    });
    this.adb = new Adb(transport);
    this.adb.disconnected.then(() => {
      this.adb = null;
      this.info = null;
      this.log('Connection', 'Device disconnected', 'Closed');
    });
    this.info = await this.readInfo();
    this.log('Connection', `Web ADB · ${this.info.model}`, 'Connected');
    return this.info;
  }

  async disconnect() {
    if (this.adb) await this.adb.close();
    this.adb = null;
    this.info = null;
  }

  require() {
    if (!this.adb) throw new Error("Aucun appareil connecté.");
    return this.adb;
  }

  async shell(cmd) {
    return (await this.require().subprocess.noneProtocol.spawnWaitText(cmd)).trim();
  }

  async readInfo() {
    const adb = this.require();
    const [model, manufacturer, android, sdk] = await Promise.all([
      adb.getProp('ro.product.model'),
      adb.getProp('ro.product.manufacturer'),
      adb.getProp('ro.build.version.release'),
      adb.getProp('ro.build.version.sdk'),
    ]);
    return { serial: adb.serial, model: model || 'Unknown', manufacturer, android, sdk };
  }

  async isInstalled(pkg = CONFIG.packageName) {
    const out = await this.shell(`pm list packages ${pkg}`);
    return out.split('\n').some((l) => l.trim() === `package:${pkg}`);
  }

  async installApk(file, onProgress = () => {}) {
    const adb = this.require();
    const remote = CONFIG.remoteApkPath;
    this.log('Installation', `Push ${file.name} (${Math.round(file.size / 1024)} Ko)`, 'Running');
    const sync = await adb.sync();
    try {
      await sync.write({
        filename: remote,
        file: file.stream(),
        permission: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });
    } finally {
      await sync.dispose();
    }
    onProgress('push');
    const out = await this.shell(`pm install -r -d ${remote}`);
    await this.shell(`rm -f ${remote}`);
    if (!/Success/i.test(out)) {
      this.log('Installation', 'pm install', out || 'Failed');
      throw new Error(`Installation échouée : ${out}`);
    }
    this.log('Installation', 'YiDream APK', 'Installed');
    return out;
  }

  async fetchApk() {
    if (!CONFIG.apkUrl) throw new Error("Aucune URL d'APK configurée : choisis un fichier.");
    const r = await fetch(CONFIG.apkUrl);
    if (!r.ok) throw new Error(`Téléchargement APK : HTTP ${r.status}`);
    const blob = await r.blob();
    return new File([blob], 'yidream.apk', { type: 'application/vnd.android.package-archive' });
  }

  async setDeviceOwner() {
    if (!COMPONENT_RE.test(CONFIG.adminComponent)) throw new Error('adminComponent invalide dans config.js');
    const out = await this.shell(`dpm set-device-owner ${CONFIG.adminComponent}`);
    const ok = /Success/i.test(out);
    this.log('Device Owner', 'Activation', ok ? 'Active' : 'Failed');
    if (!ok) {
      throw new Error(
        `Device Owner refusé : ${out}\n` +
          "Causes fréquentes : un compte (Google, constructeur) est encore présent sur le téléphone, " +
          "ou le téléphone a déjà fini son assistant de configuration. Réinitialise en usine et retente avant d'ajouter un compte."
      );
    }
    return out;
  }

  async listDeviceAdmins() {
    return this.shell('dumpsys device_policy | grep -i -E "Device Owner|admin" | head -20');
  }

  // Désactive (pm disable-user) une liste de paquets présents sur l'appareil.
  async disablePackages(pkgs) {
    const results = [];
    for (const pkg of pkgs) {
      if (!PKG_RE.test(pkg)) { results.push({ pkg, status: 'invalid' }); continue; }
      if (!(await this.isInstalled(pkg))) { results.push({ pkg, status: 'absent' }); continue; }
      const out = await this.shell(`pm disable-user --user 0 ${pkg}`);
      const ok = /new state: disabled/i.test(out);
      results.push({ pkg, status: ok ? 'disabled' : 'failed', detail: out });
    }
    this.log('Configuration', `${results.filter((r) => r.status === 'disabled').length} app(s) désactivée(s)`, 'Applied');
    return results;
  }
}
