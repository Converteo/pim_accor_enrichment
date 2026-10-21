# Développement et placeholders API — Validation PIM Hôtels

Écran unique de revue des enrichissements hôtel, dupliqué depuis la maquette. Français sur `/`, anglais sur `/en`. État en mémoire. Aucune API, aucune authentification, aucune page hôtel publique.

Versions installées, telles que publiées sur npm au moment du développement : Next.js `16.3.8`, React et React DOM `19.2.4`, next-intl `4.14.9`, TypeScript `5.9.3`. Node utilisé : v24. `16.3.8` et `4.14.9` existent ; il n’y a pas d’écart de version sur ces deux paquets.

---

## 1. Ce qui a été développé

Une seule page, le poste de validation. Pas de navigation, pas de pied de page, pas de bascule de thème à l’écran.

L’en-tête porte le titre, le sous-titre, le badge « Maquette », le sélecteur de langue, puis les quatre indicateurs (fiches traitées, auto-validables, à revoir, échec). Sous l’en-tête : la barre de répartition et sa légende, la recherche, les listes marque et source, les cinq onglets, le tableau des 14 fiches, le message vide, la note de démonstration. Le tiroir de détail et la barre de lot sont des calques fixes.

L’état vit dans `ValidationScreen` :

- `fiches` — copie renvoyée par `loadFiches()` ;
- `filters` — recherche, marque, source, onglet, vides au départ ;
- `openId` — fiche ouverte, `null` si le tiroir est fermé.

Le résumé, la liste visible, le compte de sélection et la case d’en-tête sont recalculés au rendu. Les KPI, la barre et les compteurs d’onglets lisent toutes les fiches, pas la liste filtrée. La sélection survit à un filtre. Accepter ou rejeter un attribut ne change ni son score, ni le score de la fiche, ni son statut. Valider une fiche met le score à `1` et le statut à `valide`. Rejeter une fiche met le statut à `echec` sans changer le score. Le rechargement, comme le changement de langue, rappelle `loadFiches()` : scores d’origine, statuts recalculés, attributs neutres, filtres vides, tiroir fermé, rien de coché.

Langues : `messages/fr.json` reprend les chaînes françaises de la spec §9. `messages/en.json` reprend les traductions du plan §7.4, mêmes clés. Le score reste `toFixed(2)` avec un point, le pourcentage est collé (`57%`), dans les deux langues. Les noms d’hôtels, villes, marques, sources et valeurs libres restent les textes de la démo.

Où est le code :

| Rôle | Fichier |
| --- | --- |
| Page, `lang`, polices, métadonnée | `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx` |
| Négociation de locale | `src/proxy.ts`, `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/navigation.ts` |
| État et assemblage | `src/components/ValidationScreen.tsx` |
| Règles pures | `src/domain/rules.ts`, `src/domain/types.ts` |
| Jeu de démo (copie de la spec §7.6) | `src/data/demo-fiches.ts` |
| Seule frontière lue par l’écran | `src/data/source.ts` (`loadFiches`, `FicheSource`) |
| Jetons, reset, boutons, pastilles | `src/app/globals.css` |
| Mise en page | CSS Modules à côté de chaque composant |
| Contrôle des règles | `scripts/check-rules.mts` (`npm run check`) |

`ValidationScreen` est le seul module qui porte `'use client'`. Les enfants sont importés par lui. L’interface n’importe pas `demo-fiches.ts`.

---

## 2. Lancer et parcours à vérifier

```bash
npm install
npm run dev -- --port 3100
```

- Français : http://localhost:3100
- Anglais : http://localhost:3100/en

Le port 3000 est pris par un autre projet : le front tourne sur 3100, le back sur 3101. Pour brancher le back, voir §4.

Production locale : `npm run build` puis `npm run start`. Contrôle des règles, sans Jest : `npm run check`.

Parcours, en français puis en anglais. Les données d’hôtel restent en français des deux côtés.

1. **Arrivée.** Titre « Validation des enrichissements », sous-titre, badge, quatre KPI (`14`, `57%`, `4`, `2`), légende Validée (3), Confiance haute (5), À revoir (4), Échec (2), 14 lignes de l’id 1 à l’id 14, note, tiroir fermé, barre de lot absente, sélecteur après le badge. `<html lang="fr">`.
2. **Recherche.** `lyon` garde ibis Lyon Part-Dieu. `france` garde les villes qui finissent par France. `milano` et `milan` gardent Mercure Milano Centro. `cathédrale` garde MGallery Strasbourg Cathédrale. `cathedrale` et `salesforce` ne gardent rien. Les KPI ne bougent pas.
3. **Marque et source.** Options : Toutes les marques, MGallery, Mercure, Novotel, Pullman, Sofitel, ibis. Sources : Toutes les sources, Booking.com, Expedia, Salesforce - contact center. Sofitel réduit à deux lignes. Sofitel et l’onglet Validée vident le tableau sans changer les KPI ni les compteurs. « Salesforce » seul n’est pas une option de source de fiche.
4. **Onglets.** Chaque onglet filtre le tableau. Son compteur reste le compte global. « Toutes » retire le filtre de statut.
5. **Ouvrir.** Ligne ou « Voir détail ». Fiche 2 : sourcil `ibis · Lyon, France · Expedia`, « Score 0.92 », six attributs.
6. **Trancher.** ✓ accepte, second ✓ revient au neutre, ✕ rejette, ✓ après ✕ remplace. Le score de la ligne ne change pas. Fermer et rouvrir conserve le choix.
7. **Valider ou rejeter.** Depuis l’état initial, rejeter seulement la fiche 5 : score affiché `0.95` en couleurs Échec, auto-validables `50%`. Valider seulement la fiche 6 : score `1.00`, Validée, auto-validables `64%`. Valider puis rejeter la même fiche laisse `1.00` en pastille Échec. Valider alors que tous les attributs sont rejetés force quand même le score à 1 ; les drapeaux restent rejetés.
8. **Lot.** Singulier à 1, pluriel à 2. Une fiche cochée puis masquée par un filtre reste dans le compteur. « Tout sélectionner » ne la décoche pas. « Annuler » décoche tout, y compris hors filtre. La case d’en-tête n’a pas d’état mixte. Le lot ne ferme pas un tiroir déjà ouvert.
9. **Fermer.** ✕, clic sur le voile, Échap. Échap ne vide pas la sélection. Recharger restaure le jeu initial.
10. **Thème et petit écran.** Sombre si le système est sombre, sans bouton. À 600 px la grille d’attribut passe en une colonne et les KPI restent. À 520 px les KPI disparaissent, les outils s’empilent, le sélecteur reste, la barre de lot touche les bords à 16 px.

Contrôle anglais minimal : `lang="en"`, titre d’onglet « Hotel PIM Validation (Copy) », KPI « Records processed », « Auto-validatable », « To review », « Failed », onglet « High confidence », bouton « View details », tiroir « Current PIM value » / « Proposed value », nom « Novotel Paris Centre Tour Eiffel » inchangé.

---

## 3. Écarts assumés

**Versions.** Aucun écart sur Next.js `16.3.8` ni next-intl `4.14.9`. React `19.2.4` est la paire installée avec cette version de Next. `src/i18n/request.ts` lit la locale via `next/root-params` quand elle n’est pas déjà fournie.

**Proxy de locale.** Next.js 16 relance `src/proxy.ts` sur la réécriture interne `/` → `/fr`. next-intl renverrait alors `/fr` vers `/`, et l’accueil français bouclerait. Le proxy laisse passer cette seconde passe quand l’en-tête `x-next-intl-locale` vaut déjà `fr`. Une visite directe de `/fr` redirige toujours vers `/`. `/en` n’est pas concerné.

**Sélecteur de langue.** Absent de la maquette. Ajouté dans le bloc gauche, sur la ligne du sous-titre, après le badge, comme le plan le demande. Options fixes : `Français`, `English`. Changer de langue remonte l’écran et perd filtres, cases, choix d’attributs et validations.

**`lang` sur `<html>`.** La maquette ne l’avait pas. La spec §13 l’exige. `fr` sur `/`, `en` sur `/en`.

**Détection automatique de langue coupée.** `localeDetection: false` dans `src/i18n/routing.ts`. Sans cela, next-intl redirige `/` vers `/en` quand le navigateur demande l’anglais, et l’arrivée en français ne serait plus garantie. `/` reste le français. `/en` reste l’anglais. Le cookie de locale posé par next-intl est le seul stockage ; il ne sert pas à quitter `/` tout seul.

**Validation depuis le tiroir.** La spec §8.5 et le HTML ne décochent la fiche que pour l’action de lot. Le plan §5.6 demandait aussi `selected = false` depuis le tiroir. La spec gagne : valider ou rejeter dans le tiroir ne change pas `selected`.

**Survol du bouton danger dans la barre de lot.** La spec §5.8 le laisse sur fond transparent. Le CSS de la maquette, à spécificité réelle, repeint ce survol en `--danger-soft`. Le rendu suit la spec.

**Fichiers hors arborescence du plan.** `scripts/check-rules.mts` (contrôle demandé, Jest interdit), ce document, `.gitignore`. `package.json` porte `"type": "module"` pour que ce script importe les modules TypeScript en ESM. `tsx` est une devDependency, uniquement pour lancer ce script. `next.config.ts` pose `agentRules: false` pour que Next n’écrive pas `AGENTS.md` ni `CLAUDE.md` à la racine.

**Page inconnue.** `src/app/[locale]/not-found.tsx` affiche « Page introuvable. ». La spec ne fournit pas de microcopie pour ce cas.

**Trous de la spec §12.** Ils sont dupliqués : pas de confirmation, pas de toast, pas d’auteur, pas d’heure, pas de tri, pas de pagination à l’écran, pas de focus piégé dans le tiroir, pas de libellé sur la recherche ni sur les listes, pas de `role="tablist"`, case d’en-tête sans état mixte, recherche sensible aux accents et aux espaces.

---

## 4. Branchement au back

Le navigateur n’appelle que le front, sur `/api/*`. Il ne connaît ni l’URL du back ni aucun jeton.

**Relais.** `src/app/api/[...path]/route.ts` (avec `src/server/backend.ts` et `src/server/author.ts`) relaie `GET` et `POST` vers `BACKEND_URL`, même chemin sans le préfixe `/api`, query string conservée. Chaque segment est réencodé ; `.` et `..` sont refusés (400). Les en-têtes envoyés au back sont reconstruits : `Accept`, `Content-Type: application/json` s’il y a un corps, `Authorization` et `X-PIM-Author` décrits ci-dessous. Aucun en-tête du navigateur n’est recopié. La réponse garde le statut et le corps du back, avec `Content-Type`, `Content-Disposition` (téléchargements d’export) et `Cache-Control: no-store`.

**Local ou Cloud Run.** Si `BACKEND_URL` commence par `https://` (Cloud Run), le relais demande au serveur de métadonnées un jeton d’identité Google, audience = `BACKEND_URL` sans slash final, le garde 50 minutes en mémoire et l’envoie en `Authorization: Bearer`. En `http://` (local), l’appel part sans jeton.

**Auteur.** `X-PIM-Author` est posé par le relais, jamais par le navigateur ; un `X-PIM-Author` venu du navigateur est ignoré. Source de l’auteur (`src/server/author.ts`) : quand `IAP_AUDIENCE` est posée, l’e-mail de l’en-tête signé `x-goog-iap-jwt-assertion`, vérifié côté serveur (signature ES256 avec les clés publiques d’IAP, rechargées au plus une fois par minute ; émetteur `https://cloud.google.com/iap` ; audience = `IAP_AUDIENCE` ; expiration). Pour IAP activé directement sur Cloud Run, `IAP_AUDIENCE` = `/projects/<numéro du projet>/locations/europe-west1/services/<nom du service front>` (le numéro, pas l’identifiant du projet ; une audience fausse est signalée une fois dans les logs). Quand `IAP_AUDIENCE` est posée, un appel sans identité vérifiée est refusé par le relais (401 `iap_required`), lectures comprises : protection si IAP est contourné. Sans IAP : `DEV_AUTHOR`, lue uniquement hors Cloud Run (`K_SERVICE` absente) ; elle doit être une adresse `@converteo.com` (le back refuse les autres en 403), `test@converteo.com` pour les essais en dev. Sans auteur, le back refuse les écritures (401). L’auteur est affiché dans l’en-tête de l’écran (lu par la page côté serveur). Contrôle : `scripts/check-author.mts`.

**Erreurs du relais.** Format du contrat, `{ "error": { "code", "message" } }` : `BACKEND_URL` absente → 500 `backend_not_configured` ; back injoignable ou jeton impossible à obtenir → 502 `backend_unreachable` ; erreur du back sans corps JSON (403 HTML de Cloud Run, 5xx du load balancer) → 502 `backend_error`. Les erreurs JSON du back (400, 401, 404, 409, 502) passent telles quelles. Un `POST` venu d’un autre site (`Sec-Fetch-Site` différent de `same-origin`) est refusé en 403 `cross_site`, un corps qui n’est pas en `application/json` en 415 : ces écritures portent l’identité du relecteur. Les redirections du back ne sont pas suivies.

**Côté client.** `src/data/source.ts` est le seul module client qui appelle `/api`. Le contrat de référence (chemins, types, erreurs) est le contrat partagé entre back et front (`pim-chantier/api-contract.md`, recopié dans `backend/docs/api-contract.md` sur la branche du back). Contrôle du relais : `scripts/check-relay.mts`, lancé par `npm run check`.

Lancer en local, back démarré sur le port 3101 :

```bash
BACKEND_URL=http://localhost:3101 DEV_AUTHOR=test@converteo.com npm run dev -- --port 3100
```
