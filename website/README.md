# Altio — Site vitrine

Site Next.js App Router / TypeScript / Tailwind CSS, séparé de l’application Expo. Les changements de cette vitrine ne modifient ni l’application ni Supabase.

## Développement

```sh
cd website
npm ci
npm run dev
```

Ouvrir http://127.0.0.1:3100. `npm run build` valide le build de production et `npm run typecheck` vérifie les types. `npm start` sert le build de production sur le même port.

## Pages et comportement

- Accueil : panorama interactif été/hiver, bénéfices propriétaires et prestataires visibles côte à côte, fonctionnement, fonctionnalités, FAQ native accessible.
- `/proprietaires` et `/prestataires` : bénéfices dédiés.
- `/contact` : validation HTML, préparation locale d’un email puis lien explicite vers la messagerie. Aucune donnée envoyée automatiquement, aucun faux message de succès.
- `/support` : assistance de l’application, compte, paiements et demandes relatives aux données.
- `/confidentialite` : informations sur l’application et la vitrine. Brouillon à finaliser avant publication : durées de conservation et transferts internationaux à confirmer. Identité officielle et contact confirmés intégrés le 09/10/2026.
- Métadonnées par page, sitemap, robots, favicon, polices locales, images optimisées par Next.js.

## Préparation de publication

Déployer sur Vercel en sélectionnant `website` comme Root Directory. Configurer `NEXT_PUBLIC_SITE_URL` avec le domaine HTTPS final (par défaut `https://altio.app`) pour les canonicals et le sitemap. Le site n’a pas été déployé par cette implémentation.

À valider avec le fondateur avant lancement public : domaine définitif, informations légales de l’éditeur et de l’hébergeur, disponibilité géographique, tarifs et liens officiels des stores. L’identité officielle de Manon Freuchet (Freuchet Services), confirmée par l’exploitant, figure sur la page de confidentialité. La vitrine oriente donc vers le contact pour les conditions et l’accès, sans liens de téléchargement inventés.

L’adresse `maximegakiere@gmail.com` a été confirmée par l’exploitant le 08/10/2026 et est utilisée pour l’assistance et les demandes de confidentialité. Le formulaire nécessite une messagerie configurée. Les cartes produit et calendriers sont explicitement illustratifs. Aucun témoignage, nombre de clients ni garantie de disponibilité n’est inventé.

## Assets

Le panorama provient de `frontend/assets/images/alpine-hero.jpg`. Les polices Plus Jakarta Sans proviennent du package déjà présent dans l’application ; leur licence OFL figure dans `public/fonts-license.txt`. Les icônes sont fournies par Lucide. Aucun asset distant ni tracker n’est nécessaire au rendu.

## Photographies — nouvelle direction visuelle

Trois photographies supplémentaires sont stockées localement et optimisées par Next.js. Elles ont été sélectionnées sur Unsplash (pages indiquant un usage sous licence Unsplash) :

- `public/images/mont-blanc.jpg` — Willian Justen de Vasconcellos, Chamonix : https://unsplash.com/photos/a-view-of-a-mountain-range-with-snow-on-it-WStW2U7iLPY
- `public/images/aiguille-du-midi.jpg` — Frédéric Barriol, Chamonix : https://unsplash.com/photos/a-mountain-range-covered-in-snow-with-mountains-in-the-background-UkxDbBfLBik
- `public/images/alpes-ete.jpg` — Tomasz Anusiewicz, Dolomites : https://unsplash.com/photos/a-small-lake-surrounded-by-a-lush-green-hillside-mODsW6HFIkM

Les Dolomites sont identifiées comme Alpes italiennes dans le sélecteur de paysage ; leur usage est illustratif et ne constitue pas une déclaration de couverture géographique du service. Aucun témoignage ou engagement chiffré n’a été ajouté.
