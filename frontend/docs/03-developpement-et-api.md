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
npm run dev
```

- Français : http://localhost:3000
- Anglais : http://localhost:3000/en

Si le port 3000 est déjà pris : `npm run dev -- --port 3456`, puis les mêmes chemins sur ce port.

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

## 4. Frontière actuelle

L’écran n’appelle qu’une fonction : `loadFiches(): Fiche[]`, dans `src/data/source.ts`. Elle délègue à `demoSource`, qui implémente :

```ts
export interface FicheSource {
  load(): Fiche[];
}
```

`load()` recopie le littéral de `demo-fiches.ts`. Pour chaque fiche : `status = statusFor(score)`, `selected = false`. Pour chaque attribut : `accepted = null`. `statusInitial` et `statusLabelInitial` sont jetés. Les listes de marques et de sources (`brandOptions`, `sourceOptions`) sont calculées une fois sur ce littéral, tri UTF-16, et ne sont pas reconstruites.

Après ce chargement, les fiches mutées vivent dans l’état React. Rien n’est envoyé. Rien n’est écrit en `localStorage` ni en `sessionStorage`. Un rechargement ou un changement de langue repart du jeu initial. Le cookie de locale next-intl ne contient pas de fiche.

`loadFiches()` est synchrone. C’est voulu : la démo est un tableau en mémoire, pas un appel réseau.

---

## 5. Contrats cibles

Ces interfaces ne sont pas implémentées. Aucun fichier `src/` ne les déclare. Elles décrivent ce qu’il faudra brancher, plus tard, pour alimenter la fiche hôtel et, une fois la fiche validée, la page produit. Les noms ci-dessous sont un contrat d’intention, pas du code livré.

Aujourd’hui l’écran attend un tableau complet : il n’a pas de pagination. Une API paginée reste derrière `loadFiches()` : `source.ts` parcourt les pages et renvoie encore un `Fiche[]`. Les composants ne voient pas le curseur.

### 5.1 Lecture des fiches à valider

Liste paginée. Les filtres serveur sont optionnels : s’ils sont absents, l’écran continue de filtrer en local, comme aujourd’hui. `hotelId` est l’identifiant hôtel Accor. Le jeu de démo n’en a pas ; ses `id` 1 à 14 sont des identifiants de maquette, pas des codes établissement.

```ts
type FicheStatus = "valide" | "haute" | "revoir" | "echec";

type FicheSourceName =
  | "Booking.com"
  | "Expedia"
  | "Salesforce - contact center";

interface ValidationListQuery {
  cursor?: string;
  /** Taille de page demandée. L’écran actuel n’affiche pas de pagination. */
  limit?: number;
  brand?: string;
  source?: FicheSourceName;
  status?: FicheStatus;
  /** Même règle que l’écran : sous-chaîne du nom ou de la ville, sans trim ni retrait d’accents. */
  search?: string;
}

interface ValidationFicheSummary {
  hotelId: string;
  name: string;
  brand: string;
  city: string;
  source: FicheSourceName;
  score: number;
  attributeCount: number;
}

interface ValidationListPage {
  items: ValidationFicheSummary[];
  nextCursor: string | null;
}
```

Le statut affiché ne voyage pas comme vérité métier au chargement : `source.ts` le dérive avec `statusFor(score)`, sauf si un rejet précédent a été persisté. Dans ce cas l’enregistrement doit porter le statut stocké (`echec`) à côté du score, parce qu’un rejet ne recalcule pas le statut depuis le score. La démo n’a pas ce cas au chargement.

### 5.2 Lecture du détail d’enrichissement

Un appel par hôtel, ou le détail inclus dans la liste. Six attributs dans la démo. La source d’un attribut est `Booking.com`, `Expedia` ou `Salesforce`. Ce n’est pas la source de fiche : « Salesforce - contact center » n’apparaît que sur la fiche.

```ts
type AttributeCode =
  | "address"
  | "amenities"
  | "description"
  | "classification"
  | "contact"
  | "photo";

type AttributeSource = "Booking.com" | "Expedia" | "Salesforce";

interface AttributeEnrichment {
  code: AttributeCode;
  /** Libellé français d’origine, celui de la démo. L’UI le traduit via attributes.*. */
  label: string;
  /** Valeur PIM actuelle. Texte libre, y compris « Non renseigné », « — », « Téléphone seul ». */
  current: string;
  /** Valeur proposée par la source. */
  proposed: string;
  score: number;
  source: AttributeSource;
}

interface ValidationFicheDetail extends ValidationFicheSummary {
  attributes: AttributeEnrichment[];
}
```

`accepted` n’est pas une donnée serveur aujourd’hui. C’est un drapeau d’affichage, local, perdu au rechargement.

### 5.3 Écriture

Trois commandes. Elles ne sont pas appelées. Valider, rejeter et trancher un attribut restent des mises à jour locales dans `src/domain/rules.ts`.

```ts
interface ValidateFicheCommand {
  hotelId: string;
}

interface ValidateFicheResult {
  hotelId: string;
  /** Forcé à 1, y compris si des attributs sont encore neutres ou rejetés. */
  score: 1;
  status: "valide";
}

interface RejectFicheCommand {
  hotelId: string;
}

interface RejectFicheResult {
  hotelId: string;
  /** Le score numérique précédent, inchangé. */
  score: number;
  status: "echec";
}

interface DecideAttributeCommand {
  hotelId: string;
  code: AttributeCode;
  /** clear revient au neutre, comme le second clic sur le même bouton. */
  decision: "accept" | "reject" | "clear";
}

interface DecideAttributeResult {
  hotelId: string;
  code: AttributeCode;
  /** true accepté, false rejeté, null neutre. N’affecte ni le score d’attribut, ni le score de fiche. */
  accepted: boolean | null;
}
```

### 5.4 Projection « page hôtel »

Payload qui alimenterait la page produit publique une fois la fiche validée. Cette page n’existe pas dans cette livraison. Le payload non plus.

La maquette ne dit pas quelle valeur publier quand l’opérateur a rejeté un attribut : le drapeau est visuel, et « Valider la fiche » force quand même le score à 1. Le mapping ci-dessous prend donc la valeur proposée de chaque attribut comme contenu de page. C’est une convention de branchement, pas une règle déjà codée. Si un jour le drapeau `accepted` doit choisir entre `current` et `proposed`, ce choix se fera dans `source.ts` au moment de construire ce payload.

```ts
type PageLocale = "fr" | "en";

interface HotelPagePayload {
  /** Absent du jeu de démo. Placeholder tant que l’identifiant Accor n’est pas fourni. */
  hotelId: string | null;
  locale: PageLocale;
  name: string;
  brand: string;
  city: string;
  /** Phrase unique. Pas d’adresse structurée, pas de latitude ni de longitude séparées. */
  address: string;
  amenities: string;
  description: string;
  classification: string;
  /** Téléphone et e-mail restent une seule chaîne, comme dans la fiche. */
  contact: string;
  /**
   * Placeholder. La démo stocke une phrase (« Photo façade HD », « Aucune photo exploitable collectée »),
   * jamais une URL ni un fichier.
   */
  coverPhoto: null;
  coverPhotoCaption: string;
}
```

| Champ de page | Champ de la fiche validée |
| --- | --- |
| `name` | `name` |
| `brand` | `brand` |
| `city` | `city` |
| `address` | `proposed` de l’attribut Adresse & géolocalisation |
| `amenities` | `proposed` de Équipements & services |
| `description` | `proposed` de Description commerciale |
| `classification` | `proposed` de Classification (catégorie) |
| `contact` | `proposed` de Coordonnées de contact |
| `coverPhotoCaption` | `proposed` de Photo de couverture |
| `coverPhoto` | rien : pas d’image dans la démo |
| `hotelId` | rien : pas d’identifiant hôtel Accor dans la démo |
| `locale` | locale de la page (`fr` ou `en`), pas un champ de la fiche |

Les textes de démo sont en français dans les deux locales d’interface. Une page `en` ne traduira pas toute seule « 4 étoiles », « Non renseigné » ou les descriptions. Le score, le statut et les drapeaux d’attribut ne sont pas des champs de page produit.

Exemple de lecture, fiche 1 une fois validée : nom « Novotel Paris Centre Tour Eiffel », marque Novotel, ville « Paris, France », adresse « 61 Quai de Grenelle, 75015 Paris — 48.8496, 2.2865 », équipements la liste proposée, description la phrase Seine / Tour Eiffel, classification « 4 étoiles », contact « +33 1 40 58 20 00 · h0367@accor.com », légende photo « Photo façade HD (vue Seine) », image absente, `hotelId` null.

### 5.5 Où brancher

Uniquement dans `src/data/source.ts`.

- La lecture remplace le corps de `demoSource.load` (ou l’objet `FicheSource` que `loadFiches` délègue). Le mapping vers `Fiche` — statut dérivé, `selected: false`, `accepted: null`, abandon des champs d’annotation — reste dans ce fichier.
- `brandOptions` et `sourceOptions` restent produits ici, une fois, à partir du jeu chargé.
- Les composants, `rules.ts`, les messages et les CSS ne connaissent pas l’URL, le curseur, ni `hotelId`.
- Les écritures, le jour où elles existent, s’exportent aussi depuis `source.ts` (`validateFicheRemote`, `rejectFicheRemote`, `decideAttributeRemote`, noms indicatifs). `ValidationScreen` est aujourd’hui le seul endroit qui appelle `validateFiche`, `rejectFiche` et `toggleAttribute`. Le jour du branchement, ces trois appels pointeront vers `source.ts` au lieu de n’appliquer que la règle locale. On ne fait pas ce déplacement maintenant : il n’y a pas d’API à appeler.

`loadFiches()` reste synchrone tant que la source est le littéral. Une source réseau est asynchrone. Le jour venu, `FicheSource.load` pourra devenir `Promise<Fiche[]>`, et le `useState(() => loadFiches())` de `ValidationScreen` devra attendre ce résultat. C’est le seul point de contact avec le composant, et il n’est pas à faire tant que l’API n’existe pas.

---

## 6. Ce qu’il ne faut pas faire tant que les API n’existent pas

- Pas de `fetch`, pas de client HTTP, pas de route `src/app/api`, pas de réponse JSON fictive, pas de délai simulé.
- Pas d’authentification, de session, de rôle, ni de nom d’opérateur.
- Pas de page hôtel publique, pas de route produit, pas d’image de couverture inventée.
- Pas de `localStorage` ni de `sessionStorage` pour les fiches, les filtres ou les choix d’attributs.
- Pas de persistance du score ou du statut au-delà de la vie de la page.
- Pas de modification de `docs/01-duplication-spec.md`, de `docs/02-implementation-plan.md`, ni du HTML source pour « préparer » l’API.
