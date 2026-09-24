# YiDream Web ADB — écosystème d'apps

Site web (Chrome/Edge uniquement, technologie WebUSB) structuré comme un
mini "bureau" façon macOS : une page d'accueil avec des icônes d'apps,
chacune ouvrant sa propre fenêtre. Pensé pour accueillir un futur
configurateur iOS à côté de celui d'Android, sans tout mélanger dans une
seule interface géante.

## Les 4 apps

- **🤖 Android Configurator** — connexion USB, installation de l'APK,
  activation Device Owner, choix des catégories à bloquer
- **📱 iOS Configurator** — actuellement un simple "bientôt disponible" ;
  destiné à accueillir la configuration du filtre iOS une fois développée
- **🔑 Admin** — protégée par mot de passe : génération du code du jour +
  application de la configuration complète sur le téléphone, et les
  options avancées (retirer les restrictions / désinstaller)
- **ℹ️ Info** — présentation du projet + mentions légales (conditions
  d'utilisation)

## ⚠️ Windows : remplacement de pilote USB (Zadig)

WebUSB ne peut pas utiliser le pilote ADB standard. Il faut le remplacer par
un pilote générique WinUSB :

1. Télécharge Zadig : https://zadig.akeo.ie/
2. Branche le téléphone en USB, débogage USB activé
3. Zadig → Options → **List All Devices** (coche la case)
4. Sélectionne le téléphone dans la liste, choisis **WinUSB** comme pilote
   cible, clique **Replace Driver**

⚠️ Une fois ce pilote installé, `adb.exe` classique ne détecte plus ce
téléphone (les deux pilotes sont mutuellement exclusifs).

## Activer GitHub Pages (une seule fois)

`Settings > Pages > Source > GitHub Actions` sur le repo.

## Publier (à chaque modif de `webadb/`)

```bash
git add .
git commit -m "yidream web adb"
git push
```
Le site est ensuite disponible à `https://TONPSEUDO.github.io/YiDream/`.

## Accès administrateur

L'app **Admin** est protégée par un mot de passe (différent du mot de passe
maître de déverrouillage téléphone). Mot de passe par défaut : `changeme123`.

**⚠️ Change-le avant de publier le site.** Dans `src/main.js`, remplace la
valeur de `ADMIN_PASSWORD_HASH` par le hash SHA-256 de ton propre mot de
passe. Pour le générer, ouvre la console de ton navigateur (F12) sur
n'importe quelle page et tape :
```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("TON_MOT_DE_PASSE"))
  .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,"0")).join("")))
```
Copie le résultat affiché dans `ADMIN_PASSWORD_HASH`.

## Langues

Sélecteur en haut (badges EN / FR / עב / יי) — anglais par défaut, français,
hébreu et yiddish (RTL automatique). Tous les titres, sous-titres, boutons
et messages de journal sont traduits dans les 4 langues.

## Disclaimer légal

Un texte de conditions d'utilisation (en anglais) s'affiche au premier
chargement du site et bloque toute utilisation tant qu'il n'est pas
accepté, via la recopie exacte d'une phrase de confirmation. Le même texte
est aussi consultable à tout moment dans l'app **Info**.

## Verrou d'origine

Le site ne fonctionne que depuis `https://qinfrance.github.io/YiDream/` —
si le repo est cloné et déployé ailleurs, un écran de blocage s'affiche à
la place de tout le reste.

## Développement local

```bash
cd webadb
npm install
npm run dev
```
`http://localhost:5173` — HTTPS non nécessaire en local (`localhost` est un
contexte sécurisé pour WebUSB).
