# YiDream

App Android de type MDM personnel (Device Owner natif d'Android, pas de ROM
custom, pas de root) pour restreindre un téléphone. Toute la configuration se
fait depuis un **site web** (`webadb/`) utilisant WebUSB — pas d'ADB ni de
logiciel à installer sur l'ordinateur de configuration, juste Chrome ou Edge.

## Architecture

- **`app/`** — l'app Android (Device Owner). Une fois installée et configurée,
  elle n'affiche que 3 options à l'utilisateur du téléphone :
  1. **Vérifier les mises à jour** — installation silencieuse (Device Owner,
     aucune confirmation système requise)
  2. **Apps autorisées** — whitelist d'apps installables/mises à jour
     silencieusement (le reste du système reste bloqué en permanence)
  3. **Supprimer le filtre** — nécessite un code du jour, généré à partir
     d'un mot de passe maître jamais stocké sur le téléphone
- **`webadb/`** — le configurateur, en site web (WebUSB), publié sur GitHub
  Pages. Voir `webadb/README.md` pour le détail (dont la manip Zadig
  nécessaire sous Windows).

## Ce qui est bloqué / pas bloqué

- **Bloqué par catégorie** (choix à la configuration) : navigateurs internet,
  apps d'IA autonomes, réseaux sociaux, Play Store — blocage de l'app
  entière, seule granularité possible via les API Android de gestion
  d'appareil.
- **Volontairement non restreint** : la messagerie (WhatsApp, Telegram…).
  Limiter des fonctionnalités précises *à l'intérieur* d'une app tierce
  (ex: bloquer uniquement les "Chaînes" ou le "Statut" de WhatsApp sans
  toucher au reste) n'est techniquement pas possible via les API Android
  de gestion d'appareil — seule une modification du code de l'app tierce
  elle-même le permettrait, ce qui n'est ni légal ni supporté ici.

## Installation

1. Compile l'APK (voir `HOW_TO_GET_APK.md` — via GitHub Actions, pas besoin
   d'Android Studio)
2. Va sur le site Web ADB publié (`webadb/README.md` pour l'activer sur ton
   repo) et suis les étapes : connexion, installation de l'APK, activation
   Device Owner, configuration du blocage / whitelist / code de
   déverrouillage

## Mises à jour

Voir `VERSIONING.md` — bump `versionCode`/`versionName` à chaque changement,
recompile, héberge le nouvel APK + `version.json` sur ton propre serveur.
L'app les détecte et s'installe silencieusement toute seule.
