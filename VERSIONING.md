# Versioning et mises à jour de YiDream

## Convention de version

Chaque nouvelle version bump **deux valeurs en même temps** :
- `versionCode` (un entier, toujours **+1** à chaque version, jamais réutilisé)
- `versionName` (le nom affiché : `v1`, `v2`, `v3`, ...)

`versionCode` sert à la comparaison technique (l'app compare des entiers, pas
des strings). `versionName` c'est juste l'étiquette lisible. Les deux avancent
ensemble.

| Version | versionCode | versionName |
|---|---|---|
| Première version | 1 | v1 |
| Après une modif | 2 | v2 |
| Après une autre modif | 3 | v3 |

## À chaque modification du projet, procédure complète

### 1. Bump la version dans `app/build.gradle`
```gradle
defaultConfig {
    ...
    versionCode 2        // ← +1 par rapport à avant
    versionName "v2"      // ← v1 → v2 → v3 ...
}
```

### 2. Recompiler l'APK
Dans Android Studio : **Build > Build Bundle(s) / APK(s) > Build APK(s)**
→ récupère `app-debug.apk`, renomme-le `yidream.apk`

### 3. Publier l'APK sur GitHub (Releases)
- Va sur ton repo GitHub → onglet **Releases** (à droite) → **"Create a new release"**
- **Tag** : `v2` (doit matcher le `versionName`)
- Titre libre (ex: "Version 2")
- Glisse-dépose `yidream.apk` dans la zone "Attach binaries"
- **Publish release**
- Clique-droit sur le fichier `yidream.apk` dans la release publiée → "Copier le
  lien" → c'est l'URL à mettre dans `apkUrl` (étape suivante)

### 4. Mettre à jour `version.json` (à la racine du repo)
```json
{
  "versionCode": 2,
  "versionName": "v2",
  "apkUrl": "https://github.com/TONPSEUDO/YiDream/releases/download/v2/yidream.apk",
  "changelog": "Description courte de ce qui a changé"
}
```

### 5. Pousser sur GitHub
```bash
git add .
git commit -m "Version v2"
git push
```

### 6. C'est tout — l'app va la détecter toute seule
Dès que `version.json` est à jour sur GitHub, n'importe quel téléphone avec
YiDream ouvert et qui appuie sur **"Vérifier les mises à jour"** va :
1. Lire `version.json` (URL codée dans `UpdateManager.MANIFEST_URL`)
2. Voir que `versionCode: 2 > 1` (sa version actuelle)
3. Télécharger l'APK depuis `apkUrl`
4. Ouvrir l'installeur système (une confirmation à taper sur le téléphone,
   pas totalement silencieux — voir README pour l'explication technique)

## Configuration à faire une seule fois

Dans `app/src/main/java/com/yidream/mdm/UpdateManager.kt`, remplace
`TONPSEUDO` par ton vrai pseudo GitHub :
```kotlin
const val MANIFEST_URL = "https://raw.githubusercontent.com/TONPSEUDO/YiDream/main/version.json"
```
Recompile après ce changement (il est intégré en dur dans l'APK, donc il faut
une v1 avec la bonne URL avant de pouvoir faire des updates automatiques —
pense à changer ça avant ta toute première release).
