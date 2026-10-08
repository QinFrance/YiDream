# Publication de YiDream

## Numéro de version

Pour chaque version, augmente `versionCode` et change `versionName` dans
`app/build.gradle` et `version.json`. La publication du site calcule le
SHA-256 de l'APK et le place dans le manifeste publié.

## Clé de signature Android

Une APK destinée à des mises à jour durables doit être signée avec la même clé
privée à chaque publication. Ne place jamais le fichier de clé dans le dépôt.

Dans les paramètres GitHub du dépôt, ajoute ces quatre Actions secrets :

- `YIDREAM_KEYSTORE_BASE64` : fichier keystore encodé en Base64
- `YIDREAM_STORE_PASSWORD`
- `YIDREAM_KEY_ALIAS`
- `YIDREAM_KEY_PASSWORD`

Garde une copie de sauvegarde du keystore et de ses mots de passe. Sans ces
secrets, le workflow publie seulement un APK de prévisualisation signé en debug
sur le site et dans les artefacts Actions ; il ne crée pas de version GitHub
Release. Une APK de prévisualisation peut s'installer sur un appareil vierge,
mais elle ne convient pas à une chaîne de mises à jour destinée au public.

## Publication

Le workflow `Deploy YiDream client site and Android console` construit l'APK,
l'ajoute au site Web ADB et publie le site sur
[YiDream Pages](https://qinfrance.github.io/YiDream/). Quand les secrets de
signature sont présents, il crée aussi une GitHub Release `v5.4` avec l'APK.

Le programme de mise à jour n'accepte que l'URL YiDream publiée et compare le
SHA-256 du fichier avant l'installation silencieuse. Android vérifie également
que la signature de l'APK correspond à celle de l'application déjà installée.
