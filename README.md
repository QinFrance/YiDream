# YiDream Suite — Web ADB

Interface **YiDream Suite** (Admin, Android, iOS, Info) avec un **configurateur Web ADB réel** :
connexion USB depuis le navigateur (WebUSB), installation de l'APK YiDream, activation du Device Owner
et application de restrictions — sans installer ADB sur le PC.

> Statut : **Bêta**. Admin, iOS et Info sont pour l'instant des maquettes ; seul l'onglet **YiDream Android** est branché sur un vrai téléphone.

## Ce qui fonctionne

| Fonction | Commande ADB utilisée |
|---|---|
| Connexion + infos appareil | WebUSB + `getprop` |
| Installer l'APK | push sync + `pm install -r -d` |
| Vérifier l'installation | `pm list packages` |
| Device Owner | `dpm set-device-owner <composant>` |
| Restrictions par catégorie | `pm disable-user --user 0 <paquet>` |
| Journal de session | en mémoire (onglet Logs) |

## Prérequis

- **Chrome ou Edge** (desktop), en **HTTPS** ou `localhost`. Firefox/Safari ne supportent pas WebUSB.
- Sur le téléphone : Options développeur → **Débogage USB** activé, puis accepter l'empreinte RSA.
- **Windows** : pilote USB constructeur ou Google USB Driver. **Linux** : règles udev.
- Fermer tout autre client ADB (`adb kill-server`), sinon « appareil occupé ».
- **Device Owner** : uniquement sur un téléphone fraîchement réinitialisé, **sans aucun compte** (Google, constructeur).

## Lancer en local

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # génère dist/
```

## ⚠️ À configurer avant usage réel

Édite `src/config.js` — les valeurs actuelles sont des **placeholders** :

- `packageName` : le vrai package de ton APK YiDream Android
- `adminComponent` : le `DeviceAdminReceiver` déclaré dans le manifest (`package/.Classe`)
- `categories` : les paquets bloqués par catégorie (navigateurs, IA, réseaux sociaux, stores)

`pm disable-user` désactive des paquets ; il ne remplace pas les politiques Device Owner
appliquées par l'app YiDream Android elle-même (restrictions utilisateur, blocage d'install, etc.).

## Déployer sur GitHub Pages

1. Crée un dépôt et pousse ce dossier sur la branche `main`.
2. Dépôt → **Settings → Pages → Source : GitHub Actions**.
3. Chaque push déclenche `.github/workflows/deploy.yml` et publie `dist/`.

L'APK n'est jamais commité (`*.apk` est ignoré) : il est choisi à la main dans l'interface.

## Structure

```
index.html          Interface Suite (prototype v3.6 + hooks Web ADB)
src/main.js         Expose window.yidream à l'interface
src/webadb.js       Couche WebUSB/ADB (ya-webadb)
src/config.js       Package, composant admin, catégories
.github/workflows/  Déploiement GitHub Pages
```

## Licence

Propriétaire — tous droits réservés (`UNLICENSED`). YiDream est un produit commercial :
ne publie pas de licence open source sans avoir vérifié les dépendances et l'historique du dépôt.
Dépendances tierces : `@yume-chan/*` (ya-webadb, MIT).
