# YiDream Suite — site (Web ADB)

Voir le README à la racine du dépôt.

```
index.html          Interface Suite (Admin / Android / iOS / Info)
src/main.js         Point d'entrée : charge admin-store puis le verrou d'accès + branchement de l'UI Android
src/admin-store.js  Comptes revendeurs + clients/appareils/journal (YiDream Admin, localStorage)
src/gate.js         Verrou d'origine + conditions d'utilisation
src/ui-android.js   Sections de YiDream Android
src/adb.js          Couche WebUSB/ADB (ya-webadb)
src/crypto.js       Code du jour (HMAC-SHA256)
src/config.js       Package, sites autorisés, hash du mot de passe admin
src/i18n.js         Textes EN / FR / HE / YI
src/legal.js        Conditions d'utilisation
public/yidream.apk  Ajouté automatiquement par le workflow (non versionné)
```
