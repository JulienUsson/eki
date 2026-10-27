# Eki · repas de la semaine

PWA (installable sur téléphone, fonctionne hors ligne) pour planifier les repas de la semaine :

- **📅 Semaine** : pour chaque jour, midi et soir, choisis un légume, un mode de cuisson, une protéine et un féculent.
  - **🎲 Compléter les trous** remplit les cases vides avec des propositions aléatoires : légumes de saison du mois de la semaine, cuisson adaptée au légume, et le moins de répétitions possible.
  - 🎲 sur un repas le complète (ou le re-tire s'il est déjà plein), ⋯ permet de le marquer « repas libre » (restes, resto…) pour qu'il soit ignoré.
- **🥕 Saison** : légumes de saison mois par mois avec leurs cuissons adaptées, et le catalogue des cuissons, protéines et féculents. Tout est modifiable (ajout, édition, suppression).
- **🛒 Courses** : liste de courses générée depuis la semaine (avec le nombre de repas par ingrédient), à cocher au magasin, avec des articles divers en plus. Partage / copie en texte.
- **⚙️ Réglages** : partage via Google Sheets, repas à planifier (midi / soir), export / import JSON.

Aucune dépendance, aucun build : HTML + CSS + modules JavaScript.

## Partager les données avec Google Sheets

Les données sont enregistrées dans une feuille Google Sheets via un petit script Apps Script. Pas de projet Google Cloud ni d'OAuth à configurer.

1. Crée une feuille Google Sheets vide.
2. **Extensions → Apps Script**, remplace le contenu de `Code.gs` par [`apps-script/Code.gs`](apps-script/Code.gs) (bouton « Copier le script » dans les réglages de l'app).
3. Remplace `change-moi` dans `const TOKEN = 'change-moi';` par un mot de passe à vous.
4. **Déployer → Nouveau déploiement** → type **Application Web** :
   - Exécuter en tant que : **moi**
   - Qui a accès : **Tout le monde**

   Autorise l'accès demandé par Google, puis copie l'URL qui se termine par `/exec`.
5. Dans l'app : **Réglages → Partage via Google Sheets**, colle l'URL et le jeton, puis **Connecter**. Les données déjà saisies sur le téléphone sont envoyées dans la feuille.
6. **🔗 Inviter** génère un lien à envoyer à ta compagne : en l'ouvrant, son téléphone se connecte à la même feuille.

La feuille contient trois onglets créés automatiquement :

| Onglet | Contenu |
| --- | --- |
| `Repas` | une ligne par repas planifié (`semaine`, `jour`, `repas`, `legume`, `cuisson`, `proteine`, `feculent`, `libre`) |
| `Catalogue` | les ingrédients ajoutés, modifiés ou supprimés par rapport au catalogue par défaut |
| `Courses` | articles cochés et articles divers de la liste de courses |

Fonctionnement de la synchro :

- chaque appareil garde une copie locale et fonctionne hors ligne ; les modifications sont envoyées dès que possible (badge ☁️ en haut à droite) ;
- l'app récupère les changements à l'ouverture, au retour sur l'app et toutes les minutes ;
- en cas de modification simultanée d'une même case, la plus récente l'emporte (colonne `updatedAt`).

Le jeton protège l'accès au script : toute personne qui a l'URL **et** le jeton peut lire et modifier le planning. Si tu modifies le script, utilise **Déployer → Gérer les déploiements → Modifier → Nouvelle version** pour garder la même URL.

## Lancer en local

```sh
npm start        # sert le dossier sur http://localhost:8080
npm test         # tests unitaires (Node 20+)
```

## Mise en ligne

Le workflow `.github/workflows/pages.yml` publie le site sur GitHub Pages à chaque push sur `main` : active-le dans **Settings → Pages → Source : GitHub Actions**. L'app est alors disponible sur `https://<utilisateur>.github.io/eki/` ; ouvre-la sur le téléphone puis « Ajouter à l'écran d'accueil ».

N'importe quel hébergement statique en HTTPS (Netlify, Cloudflare Pages…) convient aussi.
