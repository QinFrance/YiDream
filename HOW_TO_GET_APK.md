# Récupérer simplement le fichier APK

Pas besoin d'Android Studio — GitHub compile l'APK pour toi.

## Si le repo GitHub existe déjà

1. Pousse le code mis à jour :
   ```bash
   git add .
   git commit -m "Mise à jour"
   git push
   ```
2. Va sur ton repo → onglet **Actions**
3. Le workflow **"Build YiDream APK"** se lance automatiquement (ou clique
   dessus puis **"Run workflow"** pour le lancer à la main)
4. Attends le ✅ (1-2 minutes)
5. Clique sur l'exécution terminée → section **Artifacts** en bas → clique
   **yidream-apk** → ça télécharge un `.zip` contenant `app-debug.apk`
6. Renomme-le en `yidream.apk` si besoin

## Chaque nouvelle version

À chaque fois que tu bumps la version (voir `VERSIONING.md`) et que tu fais
`git push`, ce workflow recompile automatiquement le nouvel APK — tu n'as
qu'à retélécharger l'artefact le plus récent dans l'onglet Actions.

Ensuite, héberge cet APK sur ton propre serveur avec `version.json` à jour
(voir `VERSIONING.md`) pour que l'app le détecte et se mette à jour toute
seule, silencieusement.
