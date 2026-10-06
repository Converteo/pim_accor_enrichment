# Plan d'implémentation — Validation PIM Hôtels

Contrat d'exécution pour dupliquer la maquette interne de validation PIM. Une seule page, état en mémoire, français par défaut, anglais disponible. Ce document suffit pour coder. La spécification `docs/01-duplication-spec.md` reste la source des 14 fiches (recopier le JSON de la §7.6, ne pas le réécrire de mémoire) et le contrôle des chaînes françaises (elles doivent être identiques à la §9, caractère par caractère).

Si une phrase de ce plan contredit la spec sur un comportement d'écran, la spec gagne. S'arrêter et signaler l'écart. Ne pas « améliorer » le produit : les trous listés en spec §12 se dupliquent, ils ne se comblent pas, sauf `lang` sur `<html>` exigé par la spec §13.

---

## 1. Stack

| Choix | Version | Rôle |
| --- | --- | --- |
| Next.js | `16.3.8` (stable au 30 septembre 2026) | App Router, une route |
| React / React DOM | 19, la paire installée par `create-next-app@16.3.8` | UI |
| TypeScript | celui du CLI, `strict` | Types du domaine |
| CSS | fichier global de jetons + CSS Modules | Mise en page custom |
| next-intl | `4.14.9` | FR par défaut, EN, routage `[locale]` |
| Polices | `next/font/google` | Fraunces, Public Sans, IBM Plex Mono |

Pas de Tailwind, pas de MUI, Chakra, Radix, shadcn, ni autre bibliothèque de composants. L'interface est celle de la maquette. Pas de base de données, pas de client HTTP, pas de route `app/api`. Node.js 20.9 ou plus récent.

**Pourquoi cette stack.** L'écran est une page unique à état local : l'App Router sert le document, le titre et la locale ; React tient l'interaction. Les jetons de la spec §5 sont des variables CSS, un fichier global les pose sans couche utilitaire. next-intl porte le `lang`, les messages et le préfixe de locale sans inventer un chargeur maison. `next/font` charge les trois familles de la spec §10.1.

**Routage de locale.** `localePrefix: 'as-needed'`, `defaultLocale: 'fr'`, `locales: ['fr', 'en']`. Le français est servi sur `/`. L'anglais est servi sur `/en`. Le fichier de proxy Next.js 16 est `src/proxy.ts` (l'ancien nom `middleware.ts` ne s'utilise pas). Il exporte `createMiddleware(routing)` depuis `next-intl/middleware`.

---

## 2. Arborescence

Créer ces fichiers. Ne pas en ajouter d'autres (pas de Storybook, pas de Jest, pas de README produit).

```
next.config.ts                          plugin next-intl
tsconfig.json
package.json
package-lock.json
messages/fr.json                        chrome UI, français de la spec §9
messages/en.json                        mêmes clés, anglais de la section 8 de ce plan
src/proxy.ts                            négociation de locale
src/i18n/routing.ts                     locales, defaultLocale, localePrefix
src/i18n/request.ts                     messages selon la locale (next/root-params)
src/i18n/navigation.ts                  Link, useRouter, usePathname
src/i18n/global.ts                      typage AppConfig sur messages/fr.json
src/app/globals.css                     reset, jetons, thème, boutons, pastilles, focus
src/app/[locale]/layout.tsx             <html lang>, polices, provider, viewport
src/app/[locale]/page.tsx               metadata + <ValidationScreen />
src/app/[locale]/not-found.tsx          locale inconnue
src/domain/types.ts                     interfaces
src/domain/rules.ts                     statut, filtres, KPI, validation, rejet
src/data/demo-fiches.ts                 copie de la spec §7.6
src/data/source.ts                      frontière load()
src/components/ValidationScreen.tsx     'use client', état racine
src/components/ValidationScreen.module.css
src/components/Topbar.tsx
src/components/Topbar.module.css
src/components/LanguageSelect.tsx
src/components/LanguageSelect.module.css
src/components/KpiStrip.tsx
src/components/KpiStrip.module.css
src/components/StatusDistribution.tsx   barre + légende
src/components/StatusDistribution.module.css
src/components/Toolbar.tsx              recherche, listes, onglets
src/components/Toolbar.module.css
src/components/FicheTable.tsx
src/components/FicheTable.module.css
src/components/Drawer.tsx
src/components/Drawer.module.css
src/components/AttributeCard.tsx
src/components/AttributeCard.module.css
src/components/BulkBar.tsx
src/components/BulkBar.module.css
```

`src/app/[locale]/layout.tsx` est la racine : il rend `<html>` et `<body>`. Ne pas laisser un second `src/app/layout.tsx` qui redéclarerait `<html>`. Si le CLI en crée un, déplacer son contenu utile dans le layout de locale et supprimer le parent.

Rôles courts :

- `rules.ts` — fonctions pures. Aucun React, aucun `window`.
- `demo-fiches.ts` — littéral statique. L'UI ne l'importe pas.
- `source.ts` — seul module de données importé par l'UI.
- `ValidationScreen.tsx` — seul fichier avec `'use client'`. Les enfants sont importés par lui.
- `page.tsx` — Server Component. Il ne lit pas les fiches et ne porte pas d'état.

---

## 3. Modèle TypeScript

Aligné sur la spec §7.1, §7.2 et §7.3. `statusInitial` et `statusLabelInitial` du JSON de spec sont des annotations : les ignorer au chargement. Ne pas les mettre sur les interfaces runtime.

```ts
export type FicheStatus = "valide" | "haute" | "revoir" | "echec";

export type TabKey = "all" | FicheStatus;

/** null neutre, true accepté, false rejeté. Affichage seulement. */
export type AttributeChoice = boolean | null;

export interface Attribute {
  label: string;
  current: string;
  proposed: string;
  score: number;
  src: string;
  accepted: AttributeChoice;
}

export interface Fiche {
  id: number;
  name: string;
  brand: string;
  city: string;
  source: string;
  score: number;
  status: FicheStatus;
  selected: boolean;
  attrs: Attribute[];
}

export interface Filters {
  search: string;
  brand: string;
  source: string;
  tab: TabKey;
}

export const STATUS_ORDER: readonly FicheStatus[] = [
  "valide",
  "haute",
  "revoir",
  "echec",
];

export const TAB_ORDER: readonly TabKey[] = [
  "all",
  "valide",
  "haute",
  "revoir",
  "echec",
];
```

Le statut d'un attribut n'est pas un champ. Il se calcule à l'affichage de sa barre avec `statusFor(attr.score)`.

Libellés d'attribut stables (spec §6.13 et §13.2). La donnée garde la chaîne française ; l'UI traduit via cette table :

| Chaîne dans la donnée | Clé message `attributes.*` |
| --- | --- |
| Adresse & géolocalisation | `address` |
| Équipements & services | `amenities` |
| Description commerciale | `description` |
| Classification (catégorie) | `classification` |
| Coordonnées de contact | `contact` |
| Photo de couverture | `photo` |

Une chaîne absente de la table s'affiche telle quelle.

---

## 4. Frontière données

L'UI appelle une seule fonction, `loadFiches(): Fiche[]`, exportée par `src/data/source.ts`. Elle retourne une copie profonde neuve : statuts dérivés du score, `selected: false`, `accepted: null`. Aucun composant n'importe `demo-fiches.ts`, ne fait de `fetch`, ni ne connaît l'origine du tableau.

```ts
export interface FicheSource {
  load(): Fiche[];
}
```

Cette livraison branche `demoSource` sur le littéral de `demo-fiches.ts`. Un branchement API ultérieur remplace le corps de `loadFiches` (ou l'objet `FicheSource` qu'elle délègue) sans toucher aux composants, aux règles ni aux messages. Les fiches mutées vivent ensuite dans l'état React. Ce document ne décrit aucun endpoint.

`demo-fiches.ts` : recopier le tableau JSON de la spec §7.6. Conserver les textes libres (`name`, `brand`, `city`, `source`, `current`, `proposed`, `src`) tels quels, y compris « Non renseigné », « — », « Téléphone seul », « Image générique », « Photo basse résolution », « Aucune photo exploitable collectée », « Non déterminée », les « N étoiles », les adresses, téléphones et e-mails. La fiche 9 a une virgule entre téléphone et e-mail, pas un point médian : la recopier, ne pas la normaliser.

Au `load()`, pour chaque fiche : `status = statusFor(score)`, `selected = false`. Pour chaque attribut : `accepted = null`. Jeter `statusInitial` et `statusLabelInitial` s'ils ont été collés avec le JSON.

---

## 5. Règles métier

Tout est dans `src/domain/rules.ts`. Les mises à jour sont immuables (nouveaux objets). Le résultat observable est celui de la spec §8.

### 5.1 Statut depuis le score

Utilisé au chargement de chaque fiche, et à chaque rendu de barre d'attribut. Après un rejet de fiche, ne plus relancer cette fonction sur le score de la fiche : la pastille lit `fiche.status` et `fiche.score` séparément.

```ts
export function statusFor(score: number): FicheStatus {
  if (score >= 1) return "valide";
  if (score > 0.8) return "haute";
  if (score > 0.5) return "revoir";
  return "echec";
}
```

Frontières : `1` et `1.00` → `valide` ; `0.98` → `haute` ; `0.80` → `revoir` (pas `> 0.8`) ; `0.50` → `echec` (pas `> 0.5`). Un score `> 1` est `valide`. La démo n'en a pas.

Affichage du score : `score.toFixed(2)` dans les deux langues. `0.9` → `0.90`, `1` → `1.00`, `0.8` → `0.80`, `0.7` → `0.70`. Point décimal, jamais de virgule. Ne pas passer par `Intl.NumberFormat`.

### 5.2 Résumé global

`summarize(fiches)` lit toutes les fiches, pas la liste filtrée.

- `total` = `fiches.length` (14, et toujours 14 : aucune action ne retire une fiche).
- Comptes par `fiche.status` courant.
- Auto-validables = `Math.round((valide + haute) / total * 100)`. Affichage `{n}%` sans espace. Total 0 → afficher `0%` (cas hors démo).
- Largeur d'un segment = `((count / total) * 100).toFixed(2) + "%"`.

Oracle au chargement :

| Indicateur | Valeur |
| --- | --- |
| Fiches traitées | 14 |
| Auto-validables | 57% |
| À revoir | 4 |
| Échec | 2 |
| Segment Validée | 3 fiches, 21.43% |
| Segment Confiance haute | 5 fiches, 35.71% |
| Segment À revoir | 4 fiches, 28.57% |
| Segment Échec | 2 fiches, 14.29% |

Ordre des segments et de la légende : Validée, Confiance haute, À revoir, Échec. Légende : `{libellé} ({compte})`.

Les onglets portent les mêmes comptes globaux, plus Toutes = total. Recherche, marque et source ne changent ni les KPI, ni la barre, ni les compteurs. Seuls une validation et un rejet recalculent ce résumé.

### 5.3 Filtre

Une fiche est visible si les quatre tests passent (spec §8.2) :

1. `tab === "all"` ou `tab === fiche.status` ;
2. `brand === ""` ou `brand === fiche.brand` (égalité stricte) ;
3. `source === ""` ou `source === fiche.source` (égalité stricte) ;
4. `search === ""`, ou `search.toLowerCase()` est une sous-chaîne de `name.toLowerCase()` ou de `city.toLowerCase()`.

Pas de `trim`, pas de retrait d'accents, pas de délai, pas de bouton. La marque, la source et les attributs ne sont pas fouillés. L'ordre des lignes reste l'ordre du tableau (id 1 → 14). Aucun en-tête n'est triable.

Listes déroulantes, construites une fois depuis les valeurs distinctes du jeu initial, tri UTF-16 par défaut (`Array.prototype.sort()` sans comparateur), jamais reconstruites :

- Marques : Toutes les marques, MGallery, Mercure, Novotel, Pullman, Sofitel, ibis. La casse `ibis` est celle des données ; elle se trie après `Sofitel` parce que `i` > `S` en UTF-16.
- Sources : Toutes les sources, Booking.com, Expedia, Salesforce - contact center. Le trait d'union est entouré d'espaces. La source d'attribut `Salesforce` n'entre pas dans cette liste.

Répartition initiale pour contrôler le tableau (les attributs restent dans la spec §7.6) :

| id | Nom | Marque | Ville | Source | Score affiché | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Novotel Paris Centre Tour Eiffel | Novotel | Paris, France | Booking.com | 1.00 | valide |
| 2 | ibis Lyon Part-Dieu | ibis | Lyon, France | Expedia | 0.92 | haute |
| 3 | Mercure Marseille Vieux-Port | Mercure | Marseille, France | Booking.com | 0.88 | haute |
| 4 | Sofitel Nice Riviera | Sofitel | Nice, France | Salesforce - contact center | 0.45 | echec |
| 5 | Pullman Bordeaux Aquitania | Pullman | Bordeaux, France | Expedia | 0.95 | haute |
| 6 | MGallery Lille Vauban | MGallery | Lille, France | Booking.com | 0.62 | revoir |
| 7 | Novotel Amsterdam City | Novotel | Amsterdam, Pays-Bas | Booking.com | 1.00 | valide |
| 8 | ibis Berlin Mitte | ibis | Berlin, Allemagne | Expedia | 0.70 | revoir |
| 9 | Mercure Milano Centro | Mercure | Milan, Italie | Booking.com | 0.83 | haute |
| 10 | Sofitel Barcelona Skipper | Sofitel | Barcelone, Espagne | Salesforce - contact center | 0.58 | revoir |
| 11 | Pullman Toulouse Centre | Pullman | Toulouse, France | Expedia | 0.91 | haute |
| 12 | MGallery Strasbourg Cathédrale | MGallery | Strasbourg, France | Booking.com | 0.38 | echec |
| 13 | Novotel Nantes Centre Gare | Novotel | Nantes, France | Expedia | 1.00 | valide |
| 14 | ibis Rennes Centre Gare | ibis | Rennes, France | Booking.com | 0.76 | revoir |

Cas de recherche à respecter : `lyon` garde la fiche 2 ; `france` garde les villes qui finissent par France ; `milano` et `milan` gardent la fiche 9 ; `cathédrale` garde la fiche 12 ; `cathedrale` n'en garde aucune ; `salesforce` n'en garde aucune.

Liste vide : en-tête du tableau visible, corps vide, paragraphe « Aucune fiche ne correspond à ces filtres. », case d'en-tête décochée, note de démonstration visible. Exemple dès l'état initial : marque Sofitel et onglet Validée (les Sofitel sont id 4 Échec et id 10 À revoir).

### 5.4 Sélection

- Cocher une ligne écrit `selected` sur cette fiche.
- La case d'en-tête écrit `selected` seulement sur les fiches visibles, avec la valeur de la case. Les fiches cochées masquées par le filtre le restent.
- Après rendu, la case d'en-tête est cochée si la liste visible est non vide et entièrement cochée. Jamais d'état indéterminé : une sélection partielle s'affiche décochée. Ne pas assigner `indeterminate`.
- Case décochée + clic : coche toutes les lignes visibles. Case cochée + clic : les décoche. Un clic quand la sélection visible est partielle coche donc toutes les visibles.
- « Annuler » met `selected` à faux sur toutes les fiches, visibles ou non.
- Le compteur de la barre compte toutes les fiches `selected`, filtre ignoré.
- La barre est masquée à 0 sélection. Elle reste affichée si des fiches hors filtre sont encore cochées, y compris quand le corps du tableau est vide.
- Pluriel : `n > 1` → « {n} fiches sélectionnées », sinon « {n} fiche sélectionnée ». Le 0 n'est pas montré.
- Ouvrir le tiroir ne change pas `selected`. Le clic sur la case ne doit pas ouvrir le tiroir (`stopPropagation`).

### 5.5 Attribut

Trois états exclusifs sur `accepted`. Accepter ou rejeter ne change ni `attr.score`, ni `fiche.score`, ni `fiche.status`.

| `accepted` | Rendu |
| --- | --- |
| `null` | Bordure `--border`, opacité 1, aucun bouton actif |
| `true` | Bordure `color-mix(in srgb, var(--success) 45%, var(--border))`, bouton ✓ actif |
| `false` | Bordure `color-mix(in srgb, var(--danger) 45%, var(--border))`, opacité 0.75, bouton ✕ actif |

Bascule : si `accepted` vaut déjà la valeur demandée (`true` pour ✓, `false` pour ✕), il redevient `null`. Sinon il prend cette valeur. Un seul état à la fois. Fermer puis rouvrir la fiche réaffiche ces choix. Ils vivent jusqu'au rechargement.

La barre de l'attribut a une largeur `score * 100 %` et la couleur de texte de `statusFor(attr.score)`, pas celle du statut de la fiche.

### 5.6 Validation

Depuis le tiroir (la fiche ouverte) ou depuis le lot (chaque fiche cochée) :

- `score = 1` ;
- `status = "valide"` ;
- `selected = false` ;
- les `accepted` ne bougent pas ;
- les scores d'attribut ne passent pas à 1.

Le bouton du tiroir ferme ensuite le tiroir. Le bouton de lot ne ferme pas un tiroir déjà ouvert ; le contenu du tiroir, s'il est ouvert, se relit dans le même état et montre donc le score `1.00` et le statut Validée.

Les deux boutons restent cliquables quel que soit le statut. Revalider une fiche déjà validée réécrit le score à 1. Valider alors que tous les attributs sont rejetés force quand même le score à 1 et le statut Validée ; les drapeaux restent `false`.

### 5.7 Rejet

Depuis le tiroir ou le lot :

- `status = "echec"` ;
- le score numérique ne change pas ;
- `selected = false` ;
- les `accepted` ne passent pas à `false` ;
- le score d'attribut ne change pas.

La pastille de score garde le nombre et prend les couleurs Échec, parce que la couleur suit `fiche.status`. Rejeter une fiche déjà en Échec réécrit le statut et laisse le score du moment. Valider (score 1) puis rejeter laisse donc l'affichage `1.00` en couleurs Échec.

Le tiroir se ferme seulement pour l'action venue du tiroir. Le lot ne le ferme pas.

### 5.8 Effets chiffrés de contrôle

Depuis l'état initial, rejeter seulement la fiche 5 (0.95, Confiance haute) : le score affiché reste `0.95` en couleurs Échec. Comptes : Validée 3, Confiance haute 4, À revoir 4, Échec 3. Auto-validables `50%` (`Math.round(7 / 14 * 100)`).

Depuis l'état initial, valider seulement la fiche 6 (0.62, À revoir) : score `1.00`, statut Validée. Comptes : Validée 4, Confiance haute 5, À revoir 3, Échec 2. Auto-validables `64%` (`Math.round(9 / 14 * 100)`).

### 5.9 Ce que les actions ne font pas

Pas d'édition du texte, pas d'envoi, pas d'auteur, pas d'heure, pas de moyenne des scores d'attribut comme score de fiche, pas de confirmation, pas de toast, pas de bouton désactivé, pas d'état de chargement, pas d'erreur réseau. « Auto-validables » n'est pas un bouton et ne valide rien. Échap ferme le tiroir s'il est ouvert et ne vide pas la sélection. Un rechargement rappelle `loadFiches()` : scores d'origine, statuts recalculés, attributs neutres, filtres vides, tiroir fermé, rien de coché.

---

## 6. Composants et état

L'état vit dans `ValidationScreen` (`'use client'`). Il n'y a pas de store, de contexte métier, ni d'état dupliqué dans les enfants.

```ts
fiches: Fiche[]          // useState(() => loadFiches())
filters: Filters         // { search: "", brand: "", source: "", tab: "all" }
openId: number | null    // null = tiroir fermé
```

Dérivé au rendu, pas stocké :

- `visible = fiches.filter(f => isVisible(f, filters))` ;
- `summary = summarize(fiches)` ;
- `selectedCount = fiches.filter(f => f.selected).length` ;
- `headerChecked = visible.length > 0 && visible.every(f => f.selected)` ;
- `openFiche = fiches.find(f => f.id === openId) ?? null`.

Garder en plus la dernière fiche affichée dans le tiroir pendant la fermeture, pour que le panneau ne se vide pas avant la translation. `openId === null` retire la classe ouverte ; le contenu reste celui de la dernière fiche jusqu'à la prochaine ouverture.

Options de marque et de source : constantes calculées une fois dans `source.ts` (tri UTF-16), passées en props, pas recalculées depuis l'état filtré.

Les gestionnaires (`onSearch`, `onToggleRow`, `onToggleVisible`, `onCancelSelection`, `onToggleAttr`, `onValidateOne`, `onRejectOne`, `onValidateSelected`, `onRejectSelected`, `onOpen`, `onClose`) sont dans `ValidationScreen` et passés en props. Ils s'appuient sur les fonctions de `rules.ts`.

### 6.1 Props essentielles

`Topbar`

- `summary`: `{ total, autoPercent, reviewCount, failureCount }`

`LanguageSelect` — aucune prop métier. Lit `useLocale()`, navigue avec `useRouter` / `usePathname` de `@/i18n/navigation`.

`KpiStrip` — les quatre nombres du résumé, dans l'ordre Fiches traitées, Auto-validables, À revoir, Échec.

`StatusDistribution`

- `segments`: `{ status: FicheStatus; count: number; width: string }[]` dans `STATUS_ORDER`

`Toolbar`

- `filters: Filters`
- `counts: Record<TabKey, number>`
- `brandOptions: readonly string[]`
- `sourceOptions: readonly string[]`
- `onSearch(value: string)`, `onBrand(value: string)`, `onSource(value: string)`, `onTab(tab: TabKey)`

`FicheTable`

- `rows: Fiche[]`
- `headerChecked: boolean`
- `onToggleRow(id: number, selected: boolean)`
- `onToggleVisible(selected: boolean)`
- `onOpen(id: number)`

`Drawer`

- `fiche: Fiche | null` — fiche affichée (dernière fiche pendant la fermeture)
- `open: boolean`
- `onClose()`
- `onToggleAttr(index: number, value: boolean)`
- `onValidate()`
- `onReject()`

`AttributeCard`

- `label: string` — déjà traduit
- `src: string` — donnée brute, passée au message `via`
- `current: string`, `proposed: string`
- `scoreLabel: string` — déjà `toFixed(2)`
- `barStatus: FicheStatus`
- `barWidth: string` — `${score * 100}%`
- `accepted: AttributeChoice`
- `onAccept()`, `onReject()`

`BulkBar`

- `count: number` — 0 ne rend rien (`hidden` ou absence du nœud ; préférer `hidden` pour coller à `[hidden]`)
- `onCancel()`, `onReject()`, `onValidate()`

Le clic sur une ligne en dehors de la case, et le bouton « Voir détail », appellent `onOpen`. Le bouton et la case arrêtent la propagation.

Le calque du tiroir est toujours monté. Fermé : `aria-hidden="true"`, `pointer-events: none`, voile invisible, panneau `translateX(100%)`. Ouvert : `aria-hidden="false"`, voile opaque, panneau à 0. Fermeture : bouton ✕, clic sur le voile, touche Échap si ouvert. Pas de fiche précédente ni suivante. Ouvrir ne coche pas la ligne.

Z-index : tiroir 40, barre groupée 30. Tant que le tiroir est ouvert, le voile couvre la barre. L'opérateur ferme le tiroir pour l'atteindre. Le voile n'est pas un bouton.

### 6.2 Page et layout

`page.tsx` : `generateMetadata` lit `meta.title` pour la locale. Le corps est `<ValidationScreen />`. `generateStaticParams` retourne `fr` et `en`.

`layout.tsx` : valide la locale (`hasLocale`, sinon `notFound()`), charge les messages, enveloppe avec `NextIntlClientProvider`, pose `lang={locale}` sur `<html>`. Viewport : `width=device-width`, `initialScale: 1`, `viewportFit: 'cover'`.

Polices, variables CSS `--font-serif`, `--font-sans`, `--font-mono` :

| Rôle | Famille | Graisses à charger | Secours |
| --- | --- | --- | --- |
| Titres `h1`–`h3` | Fraunces | 600 | Georgia, serif |
| Texte | Public Sans | 400, 500, 600 | -apple-system, "Segoe UI", sans-serif |
| Chiffres KPI, score global, compteur d'onglet | IBM Plex Mono | 600 | monospace |

Les graisses demandées par le HTML mais inutilisées (Fraunces 500 et 700, Public Sans 700, IBM Plex Mono 500) ne sont pas chargées. `h1`–`h3` : graisse 600, `text-wrap: balance`, marge 0. Corps 14 px.

---

## 7. Plan i18n

### 7.1 Fichiers

`messages/fr.json` et `messages/en.json` ont exactement les mêmes clés. Le français est recopié de la spec §9 et §13.1 (tableau de la section 8). L'anglais est celui de ce plan, pas une reformulation au moment du code. `src/i18n/global.ts` type `AppConfig.Messages` avec le JSON français pour qu'une clé manquante casse la compilation.

`request.ts` suit le réglage next-intl 4 / Next 16.3 : `getRequestConfig`, locale lue via `next/root-params` si elle n'est pas déjà fournie, `hasLocale` puis `notFound()`, import de `../../messages/${locale}.json`.

Formats communs aux deux locales, parce que la spec §13 ne définit pas de variante anglaise et que la maquette est la référence visuelle : score `toFixed(2)` avec point, pourcentage collé `{n}%`. Ne pas localiser ces deux formats.

Le changement de langue appelle `router.replace(pathname, { locale })`. Cela remonte l'écran et rappelle `loadFiches()`. Les filtres, cases, choix d'attribut et validations du moment sont perdus, au même titre qu'un rechargement. Ne pas les sauver en `sessionStorage`, cookie métier ou variable de module.

Le cookie de locale posé par next-intl est le seul stockage autorisé.

### 7.2 Ce qui se traduit, ce qui reste de la démo

Se traduit (messages) : titre d'onglet, titres, badge, KPI, statuts, placeholder, options vides des listes, onglets, en-têtes de colonnes, « Voir détail », message vide, note de bas de page, libellés du tiroir, boutons, aria-labels, modèles à variables, les six noms d'attribut.

Reste de la donnée, affiché tel quel en français dans les deux langues : noms d'hôtels, villes, marques (Novotel, ibis, Mercure, Sofitel, Pullman, MGallery), sources de fiche et d'attribut (Booking.com, Expedia, Salesforce, Salesforce - contact center), adresses, descriptions, téléphones, e-mails, mentions de photos, « Non renseigné », « — », « Téléphone seul », « Image générique », « Photo basse résolution », « Aucune photo exploitable collectée », « Non déterminée », « N étoiles ». Ce ne sont pas des clés de message.

Le modèle `Sélectionner {name}` se traduit ; `{name}` reste le nom d'hôtel. `{marque} · {ville} · {source}` se traduit seulement par le séparateur présent dans le message (identique en anglais : ` · `). `via {src}` : le mot « via » est dans le message, `{src}` est la donnée.

`{n} attributs` est toujours le pluriel, même si la longueur valait 1. Ne pas utiliser une règle ICU `one` pour cette chaîne. La démo vaut 6 partout. La pastille lit `attrs.length`, pas la constante 6.

### 7.3 Sélecteur de langue

La maquette n'a pas de sélecteur. L'ajouter dans le bloc gauche de `.topbar`, sur la ligne du sous-titre, après le badge « Maquette », écart 8 px (le même que le badge). Il reste dans ce bloc : sous 560 px les KPI sont masqués, le sélecteur doit rester visible. Ne pas le placer dans la rangée de KPI, ni dans la barre d'outils, ni à la place du badge.

Contrôle `<select>` natif :

- options fixes, endonymes, identiques dans les deux langues : valeur `fr` / libellé `Français`, valeur `en` / libellé `English` ;
- `aria-label` = message `header.language` (« Langue » / « Language ») ;
- hauteur 28 px, padding horizontal 8 px, Public Sans 600 / 12 px, fond `--surface`, bordure 1 px `--border-strong`, rayon 8 px, largeur intrinsèque ;
- flèche native conservée (`appearance` non forcé à `none`) ;
- focus : même contour 2 px `--accent`, décalage 1 px, que les champs de la barre d'outils.

La ligne de sous-titre est déjà en `flex-wrap`. Si la largeur ne suffit pas, elle passe à la ligne ; les quatre KPI ne changent pas de taille.

### 7.4 Clés

Namespace unique, pas de concaténation de phrases hors messages.

| Clé | FR (spec) | EN |
| --- | --- | --- |
| `meta.title` | Validation PIM Hôtels (Copy) | Hotel PIM Validation (Copy) |
| `header.title` | Validation des enrichissements | Enrichment validation |
| `header.subtitle` | PIM Accor · Fiches établissement | Accor PIM · Property records |
| `header.badge` | Maquette | Mockup |
| `header.language` | Langue | Language |
| `kpi.processed` | Fiches traitées | Records processed |
| `kpi.auto` | Auto-validables | Auto-validatable |
| `kpi.review` | À revoir | To review |
| `kpi.failure` | Échec | Failed |
| `status.valide` | Validée | Validated |
| `status.haute` | Confiance haute | High confidence |
| `status.revoir` | À revoir | To review |
| `status.echec` | Échec | Failed |
| `tabs.all` | Toutes | All |
| `search.placeholder` | Rechercher un hôtel, une ville… | Search for a hotel or city… |
| `filters.allBrands` | Toutes les marques | All brands |
| `filters.allSources` | Toutes les sources | All sources |
| `columns.property` | Fiche établissement | Property record |
| `columns.source` | Source | Source |
| `columns.attributes` | Attributs enrichis | Enriched attributes |
| `columns.score` | Score global | Overall score |
| `columns.status` | Statut | Status |
| `columns.actions` | Actions | Actions |
| `row.view` | Voir détail | View details |
| `row.attributes` | `{count} attributs` | `{count} attributes` |
| `row.select` | Sélectionner {name} | Select {name} |
| `row.selectAll` | Tout sélectionner | Select all |
| `empty` | Aucune fiche ne correspond à ces filtres. | No records match these filters. |
| `note` | Exemple de données (maquette) — 14 fiches issues d'extractions Booking.com / Expedia / Salesforce, à des fins de démonstration de la mécanique de scoring et de revue. | Demo data (mockup) — 14 records from Booking.com / Expedia / Salesforce extracts, to demonstrate scoring and review. |
| `drawer.eyebrow` | `{brand} · {city} · {source}` | `{brand} · {city} · {source}` |
| `drawer.score` | Score {score} | Score {score} |
| `drawer.via` | via {src} | via {src} |
| `drawer.current` | Valeur PIM actuelle | Current PIM value |
| `drawer.proposed` | Valeur proposée | Proposed value |
| `drawer.accept` | Accepter cet attribut | Accept this attribute |
| `drawer.rejectAttr` | Rejeter cet attribut | Reject this attribute |
| `drawer.reject` | Rejeter la fiche | Reject record |
| `drawer.validate` | Valider la fiche | Validate record |
| `drawer.close` | Fermer le détail | Close details |
| `bulk.cancel` | Annuler | Cancel |
| `bulk.reject` | Rejeter la sélection | Reject selection |
| `bulk.validate` | Valider la sélection | Validate selection |
| `bulk.count` | `{count, plural, one {# fiche sélectionnée} other {# fiches sélectionnées}}` | `{count, plural, one {# record selected} other {# records selected}}` |
| `legend.item` | `{label} ({count})` | `{label} ({count})` |
| `percent` | `{value}%` | `{value}%` |
| `attributes.address` | Adresse & géolocalisation | Address & geolocation |
| `attributes.amenities` | Équipements & services | Facilities & services |
| `attributes.description` | Description commerciale | Marketing description |
| `attributes.classification` | Classification (catégorie) | Classification (category) |
| `attributes.contact` | Coordonnées de contact | Contact details |
| `attributes.photo` | Photo de couverture | Cover photo |

Ponctuation à ne pas remplacer : point médian `·` (U+00B7), tiret long `—` (U+2014) dans la note, points de suspension `…` (U+2026) dans le placeholder, esperluette `&` dans les libellés d'attribut. Le badge, les en-têtes de colonnes et les clés « Valeur PIM actuelle » / « Valeur proposée » sont en casse de phrase dans les JSON ; le CSS les passe en capitales.

Les libellés d'onglet de statut réutilisent `status.*`. L'onglet Toutes utilise `tabs.all`.

---

## 8. Jetons CSS et thème

Un seul fichier `src/app/globals.css` pose le reset, les variables et les variantes partagées (boutons, pastilles, focus, mouvement). Les CSS Modules posent la structure de chaque composant et consomment ces variables. Nommer les variables comme la spec, sans les renommer.

### 8.1 Reset

`box-sizing: border-box` sur tous les éléments. `margin: 0` sur le corps et les titres. `[hidden] { display: none !important; }`. `img { max-width: 100% }` (aucune image, la règle reste). Corps : 14 px, fond `--bg`, texte `--text`, famille `--font-sans`.

### 8.2 Thème clair, défaut sur `:root`

| Jeton | Hex |
| --- | --- |
| `--bg` | `#F5F6F8` |
| `--surface` | `#FFFFFF` |
| `--surface-alt` | `#FAFBFC` |
| `--border` | `#E1E5EA` |
| `--border-strong` | `#CBD2DA` |
| `--text` | `#1B2430` |
| `--text-muted` | `#5B6B7D` |
| `--text-faint` | `#8592A3` |
| `--accent` | `#14586B` |
| `--accent-hover` | `#0F4655` |
| `--accent-soft` | `#E4EEF1` |
| `--success` | `#1E8F5F` |
| `--success-soft` | `#E3F5EC` |
| `--warn` | `#B97A16` |
| `--warn-soft` | `#FBF0DC` |
| `--danger` | `#C0392E` |
| `--danger-soft` | `#FBE8E6` |
| `--shadow` | `0 12px 28px -12px rgba(20,30,40,0.18)` |
| `--shadow-sm` | `0 1px 2px rgba(20,30,40,0.06)` |
| `--radius` | `10px` |

`color-scheme: light` sur `:root`.

### 8.3 Thème sombre

Mêmes noms. S'applique dans `@media (prefers-color-scheme: dark)` sur `:root:not([data-theme="light"])`, et sur `:root[data-theme="dark"]`. `color-scheme: dark` dans ces deux cas.

| Jeton | Hex |
| --- | --- |
| `--bg` | `#10151C` |
| `--surface` | `#171E27` |
| `--surface-alt` | `#1C2430` |
| `--border` | `#2B3542` |
| `--border-strong` | `#3B4756` |
| `--text` | `#E8ECF1` |
| `--text-muted` | `#9AA8B8` |
| `--text-faint` | `#71808F` |
| `--accent` | `#5CB4C6` |
| `--accent-hover` | `#79C4D4` |
| `--accent-soft` | `#1B333A` |
| `--success` | `#49C08A` |
| `--success-soft` | `#153427` |
| `--warn` | `#E0A63E` |
| `--warn-soft` | `#3A2C11` |
| `--danger` | `#E37468` |
| `--danger-soft` | `#3A1D19` |
| `--shadow` | `0 12px 28px -12px rgba(0,0,0,0.5)` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |

La maquette n'a pas de bascule. Aucun bouton n'écrit `data-theme`. Le clair est le défaut ; le sombre suit le système. Les sélecteurs `data-theme` restent dans le CSS pour reproduire la cascade de la spec §2.8, sans contrôle à l'écran.

### 8.4 Couleurs hors jetons

| Usage | Valeur |
| --- | --- |
| Texte du bouton principal et de l'onglet actif | `#fff` |
| Fond du compteur de l'onglet actif | `rgba(255,255,255,.22)` |
| Voile | `rgba(15,20,27,0.42)` |
| Bordure du badge | `color-mix(in srgb, var(--warn) 45%, transparent)` |
| Bordure du bouton danger (tiroir) | `color-mix(in srgb, var(--danger) 40%, transparent)` |
| Bordure de « Voir détail » | `color-mix(in srgb, var(--accent) 40%, transparent)` |
| Bordure d'attribut accepté | `color-mix(in srgb, var(--success) 45%, var(--border))` |
| Bordure d'attribut rejeté | `color-mix(in srgb, var(--danger) 45%, var(--border))` |
| Bordure du ✓ actif | `color-mix(in srgb, var(--success) 50%, transparent)` |
| Bordure du ✕ actif | `color-mix(in srgb, var(--danger) 50%, transparent)` |
| Bordure de « Annuler » dans la barre | `color-mix(in srgb, var(--bg) 35%, transparent)` |
| Survol de « Annuler » dans la barre | fond `color-mix(in srgb, var(--bg) 12%, transparent)` |
| Bordure de « Rejeter la sélection » | `color-mix(in srgb, var(--danger) 60%, transparent)`, fond transparent |

Pastilles de statut : texte et point = couleur forte, fond de pastille = couleur douce. `valide` → success, `haute` → accent, `revoir` → warn, `echec` → danger. Le point est un disque plein (couleur de texte), 7×7 px dans la pastille, 8×8 px dans la légende. La pastille de score global utilise le même couple, avec le nombre seul. Dans le tiroir elle est préfixée par le message `drawer.score`.

KPI : « Fiches traitées » en `--text` ; « Auto-validables » en `--success` ; « À revoir » en `--warn` ; « Échec » en `--danger`.

Barre groupée : `background: var(--text); color: var(--bg)`. Clair : fond `#1B2430`, texte `#F5F6F8`. Sombre : fond `#E8ECF1`, texte `#10151C`. Le bouton principal y garde le fond accent et le texte `#fff`. Le danger de la barre reste fond transparent au survol (cette règle suit `.btn-danger:hover`).

### 8.5 Rayons, capitales, focus

| Rayon | Usage |
| --- | --- |
| 12 px | Logo, barre groupée |
| 10 px | KPI, carte tableau |
| 9 px | Carte d'attribut |
| 8 px | Champs, boutons `.btn`, fermeture du tiroir, sélecteur de langue |
| 7 px | « Voir détail », ✓, ✕ |
| 6 px | Pastille de score, barre de statuts |
| 5 px | Badge, pastille de marque |
| 4 px | Piste de score d'attribut |
| 999 px | Onglets, compteurs d'onglet, pastilles de statut, pastille « N attributs » |

`text-transform: uppercase` et interlettrage : badge 0.06em ; en-têtes de colonnes et clés d'attribut 0.04em ; pastille de marque 0.02em. Chiffres tabulaires sur la valeur de KPI et la pastille de score globale. Le score dans la carte d'attribut est en Public Sans 11 px `--text-faint`, largeur 34 px, pas en mono.

Focus et survol (spec §5.8). Aucun `:disabled`, aucun `:active` custom.

| Cible | Focus | Survol |
| --- | --- | --- |
| Champ, liste, sélecteur de langue | Contour 2 px `--accent`, décalage 1 px | Aucun |
| Onglet inactif | Contour 2 px `--accent`, décalage 2 px | Bordure `--border-strong` |
| Onglet actif | Même contour | Reste fond `--accent`, texte `#fff`, bordure `--accent` |
| `.btn` | Contour 2 px `--accent`, décalage 2 px | Selon variante |
| Principal | — | Fond `--accent-hover` |
| Danger du tiroir | — | Fond `--danger-soft` |
| Ghost hors barre | — | Fond `--surface-alt` |
| Danger de la barre | — | Fond transparent |
| Ghost de la barre | — | Fond `color-mix(in srgb, var(--bg) 12%, transparent)`, texte `--bg` |
| « Voir détail » | Contour natif, ne pas le retirer | Texte `--accent`, bordure accent à 40 % |
| Fermeture du tiroir | Contour natif | Texte `--text`, fond `--surface-alt` |
| ✓ / ✕ | Contour natif | Aucun ; l'état actif est celui du tableau §5.5 |
| Ligne | — | `--surface-alt`, ou `--accent-soft` si la ligne est cochée |
| Case | Anneau natif, `accent-color: var(--accent)` | Curseur pointeur |

Bouton ✓ actif : fond `--success-soft`, texte `--success`. Bouton ✕ actif : fond `--danger-soft`, texte `--danger`.

### 8.6 Mesures à coder

Colonne `.app` : `max-width: 1180px`, `margin: 0 auto`, padding `20px 20px 96px`. Le `body` ajoute `env(safe-area-inset-top)` en padding haut et `env(safe-area-inset-bottom)` en padding bas.

`.topbar` : flex, wrap, `space-between`, alignement en haut, écart 20 px, padding bas 18 px, bordure basse 1 px `--border`, marge basse 16 px. Bloc gauche : logo et titres, écart 12 px. Logo : 44×44, rayon 12, fond `--accent-soft`, caractère 🏨 (U+1F3E8) en 22 px, centré, pas une image. `h1` : Fraunces 600, 22 px, interligne 1.2. Sous-titre : 13 px `--text-muted`, marge haute 4 px. Badge : 10.5 px, graisse 600, fond `--warn-soft`, texte `--warn`.

KPI : carte `--surface`, bordure `--border`, rayon 10, padding `8px 14px`, min-width 96 px, ombre `--shadow-sm`. Valeur : mono 600, 19 px, interligne 1.1. Libellé : 11 px `--text-muted`, marge haute 3 px. Écart 10 px, wrap.

Barre de statuts : hauteur 9 px, pleine largeur, rayon 6, marge basse 6 px, fond `--border`, `overflow: hidden`. Segments collés, largeur en pourcentage. Légende : flex, wrap, écart 16 px, marge basse 22 px, 12 px `--text-muted`.

Barre d'outils : flex, wrap, centrage vertical, écart 10 px, marge basse 14 px. Au-dessus de 560 px, les onglets ont `margin-left: auto`. Champ et listes : hauteur 36 px, padding `8px 12px`, rayon 8, fond `--surface`, bordure `--border-strong`, Public Sans 500 / 13.5 px, `appearance: none` (la flèche des listes n'est pas redessinée). Recherche : `flex: 1 1 220px`, `min-width: 180px`, `autocomplete="off"`, pas d'icône, pas de bouton effacer. Onglet : Public Sans 600 / 12.5 px, padding `7px 12px`, pilule, écart interne 6 px. Compteur : mono 11 px, fond `--surface-alt`, pilule, padding `1px 6px`.

Carte tableau : fond `--surface`, bordure `--border`, rayon 10, ombre `--shadow-sm`, défilement horizontal. Tableau : largeur 100 %, `border-collapse`, `min-width: 760px`. En-tête : Public Sans 600 / 11 px, capitales, interlettrage 0.04em, `--text-faint`, padding `12px 14px`, fond `--surface-alt`, bordure basse `--border`, `position: sticky; top: 0`. Cellule : padding `12px 14px`, 13.5 px, bordure basse `--border`, centrage vertical. Dernière ligne sans bordure basse. Colonne case : 34 px. Colonne Actions : en-tête et contenu alignés à droite. Nom d'hôtel graisse 600 ; ville 12 px `--text-muted`, marge haute 2 px ; marque 10.5 px graisse 600, `--accent` sur `--accent-soft`, padding `2px 6px`, marge haute 5 px. Pastille d'attributs : 12 px graisse 500, `--text-muted`, fond `--surface-alt`. Case : 16×16. « Voir détail » : padding `6px 10px`.

Message vide : centré, `--text-muted`, padding `40px 16px`, 14 px, sous la carte, `hidden` dès qu'il y a une ligne. Note : 11.5 px, `--text-faint`, marge haute 14 px.

Tiroir : calque fixe, inset 0, z-index 40. Voile en opacité 0.18 s `ease`. Panneau : haut droite, hauteur 100 %, largeur `min(440px, 100vw)`, fond `--surface`, bordure gauche `--border`, ombre `--shadow`, translation 0.22 s `ease`. Fermeture : 30×30, top 14 px, right 14 px, caractère ✕ (U+2715). En-tête du panneau : padding `22px 52px 16px 22px`. Sourcil 12 px `--text-muted`. Titre Fraunces 600, 19 px, interligne 1.25. Méta : flex, wrap, écart 8 px, marge haute 10 px. Corps : padding `16px 22px`, scroll. Carte d'attribut : fond `--surface-alt`, rayon 9, padding `12px 13px`, marge basse 10 px. Grille de comparaison : 2 colonnes, écart 10 px. Clés de colonne 10.5 px, capitales. Valeur proposée en graisse 500. Piste de score : hauteur 5 px, fond `--border`, remplissage `background: currentColor`. Boutons ✓ (U+2713) et ✕ : 26×26, écart 5 px. Pied : padding `16px 22px`, bordure haute, flex, écart 10 px, aligné à droite. Ordre : « Rejeter la fiche », puis « Valider la fiche ». Boutons `.btn` : padding `9px 15px`.

Barre groupée : fixe, `bottom: 20px`, `left: 50%`, `translateX(-50%)`, z-index 30, rayon 12, ombre `--shadow`. Padding `12px 14px 12px 18px` plus `env(safe-area-inset-bottom)` sur le padding bas. Flex, écart 16 px. Libellé 13 px graisse 600, nowrap. Boutons écart 8 px, ordre : Annuler, Rejeter la sélection, Valider la sélection.

`prefers-reduced-motion: reduce` : `animation: none` et `transition: none` sur tous les éléments, y compris le tiroir.

---

## 9. Responsive

Deux seuils, pas d'autres. Pas de sidebar.

| Seuil | Changement |
| --- | --- |
| 640 px et moins | Grille « valeur actuelle / valeur proposée » en 1 colonne |
| 560 px et moins | KPI masqués (`display: none` sur la rangée, le sélecteur de langue reste). Barre d'outils en colonne étirée. Recherche `min-width: 0`. Onglets sans `margin-left: auto`. Barre groupée : `left` et `right` à 16 px, plus de translation, retour à la ligne autorisé |

Le tableau garde `min-width: 760px` et défile dans sa carte à toute largeur. Viewport `viewport-fit=cover`.

---

## 10. Accessibilité

Reproduire la spec §11.1.

- `lang` sur `<html>` selon la locale active (ajout exigé par la spec §13 ; la maquette ne l'avait pas).
- Case d'en-tête : `aria-label` = `row.selectAll`.
- Case de ligne : `aria-label` = `row.select` avec le nom d'hôtel.
- Panneau : `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointant vers le titre du tiroir (le nom de l'hôtel).
- `aria-hidden` vrai fermé, faux ouvert.
- Fermeture : `aria-label` = `drawer.close`.
- ✓ : `drawer.accept`. ✕ : `drawer.rejectAttr`.
- Le libellé de statut est du texte à côté du point, dans la légende et dans la pastille.
- Focus visible des champs, onglets et `.btn` comme en section 8.5.
- `color-scheme` suit le thème. Cases : `accent-color`.
- `prefers-reduced-motion` coupe les animations.
- Safe areas et `viewport-fit=cover`.
- « Voir détail » est un `<button>`.
- Échap ferme le tiroir ouvert et ignore la touche s'il est fermé.
- Sélecteur de langue : `aria-label` `header.language`.

Ne pas empirer les trous de la spec §11.2.

- Pas de lien d'évitement ajouté.
- La recherche n'a pas de libellé visible. Garder le placeholder. Ne pas poser `aria-label=""`.
- Les listes n'ont pas de libellé associé. L'option vide reste leur nom visible une fois refermées.
- Les onglets sont des `<button>` sans `role="tablist"` ni `aria-selected`. L'état actif est une classe.
- Pas de `caption`. Les `th` peuvent porter `scope="col"` : cela ne change pas le visuel. Ne pas ajouter une caption visible.
- Pas d'`aria-live` sur le message vide, les KPI, les compteurs ou la barre groupée.
- Le tiroir ne prend pas le focus à l'ouverture, ne le rend pas à la fermeture, ne piège pas la tabulation, ne met pas le reste `inert`. Le défilement de la page derrière n'est pas bloqué.
- Le voile n'est pas un bouton. Fermeture au clic et à Échap.
- Ne pas mettre `outline: none` sur « Voir détail », la fermeture, ni ✓ / ✕.
- Les segments de la barre n'ont pas de nom propre ; la légende porte le texte.
- L'emoji 🏨 reste sans `aria-hidden`. Les points sont des éléments vides.
- Aucun `disabled`.
- Les boutons d'onglet restent montés (clé stable = la clé de statut). La maquette les recréait et perdait le focus ; démonter les boutons à chaque frappe reproduirait ce trou. On ne le reproduit pas.

---

## 11. Ordre d'implémentation

Chaque étape est vérifiable avant la suivante. Ne pas anticiper l'étape d'après dans le même passage.

1. **Socle.** Dans le dépôt existant (ne pas effacer `docs/` ni `README.md`), lancer `npx create-next-app@16.3.8 . --typescript --eslint --app --src-dir --import-alias "@/*" --use-npm --no-tailwind --turbopack --disable-git`. Si le CLI refuse un dossier non vide, créer `package.json` à la main et installer `next@16.3.8`, `react` et `react-dom` en 19, `next-intl@4.14.9`, et les devDependencies TypeScript / types / `eslint-config-next@16.3.8`. Brancher le plugin next-intl dans `next.config.ts`. Poser `routing`, `request`, `navigation`, `proxy.ts`, les deux JSON avec au minimum `meta.title` et `header.title`, le layout `[locale]` et une page qui affiche le titre traduit. Vérifier : `npm run dev`, `/` affiche le titre français, `/en` le titre anglais, `<html lang>` vaut `fr` puis `en`.

2. **Jetons et polices.** `globals.css` avec les deux thèmes et les polices sur le layout. Vérifier : fond `#F5F6F8` en clair ; avec le système en sombre, fond `#10151C` et texte `#E8ECF1`. Aucun bouton de thème.

3. **Domaine et données.** `types.ts`, `rules.ts`, copie intégrale de la spec §7.6 dans `demo-fiches.ts`, `loadFiches()` dans `source.ts`. Vérifier par un appel temporaire (script `node` avec strip des types, ou log retiré avant la fin de l'étape) : 14 fiches ; comptes 3 / 5 / 4 / 2 ; auto-validables 57 ; largeurs `21.43%`, `35.71%`, `28.57%`, `14.29%` ; `statusFor(0.8) === "revoir"` ; `statusFor(0.5) === "echec"` ; `statusFor(1) === "valide"` ; rejet simulé de l'id 5 → 50 % et score 0.95 ; validation simulée de l'id 6 → 64 % et score 1. Retirer le log avant de continuer.

4. **Messages complets.** Remplir `fr.json` et `en.json` avec toutes les clés de la section 7.4. Le sélecteur est rendu dans le bloc gauche, après le badge, sur une page encore sans tableau. Vérifier : les deux options s'affichent, passer de `/` à `/en` change le titre et le badge, l'URL anglaise est `/en`, revenir à `/` remet le français.

5. **En-tête chiffré.** `Topbar`, `KpiStrip`, `StatusDistribution` branchés sur `loadFiches()` via l'état initial. Vérifier les quatre KPI, la barre et la légende « Validée (3) », « Confiance haute (5) », « À revoir (4) », « Échec (2) ». Le sélecteur est toujours après le badge, les KPI à droite.

6. **Liste et filtres.** `Toolbar` et `FicheTable` : 14 lignes dans l'ordre, pastille « 6 attributs », scores sur deux décimales, statuts, bouton « Voir détail ». Recherche à chaque frappe, listes, onglets, message vide, note. Vérifier les cas de la section 5.3, dont Sofitel + Validée vide la liste sans changer les KPI ni les compteurs d'onglets. `lyon` laisse ibis Lyon Part-Dieu. `cathedrale` ne laisse rien. `cathédrale` laisse MGallery Strasbourg Cathédrale.

7. **Sélection et lot.** Cases, case d'en-tête sans état mixte, barre groupée au singulier puis au pluriel, « Annuler ». Vérifier : cocher une ligne, filtrer pour la cacher, la barre reste avec ce compte ; « Tout sélectionner » ne décoche pas cette ligne cachée ; « Annuler » la décoche. La barre est absente à 0.

8. **Tiroir et attributs.** Ouverture par la ligne et par « Voir détail », sourcil `Novotel · Paris, France · Booking.com` pour l'id 1, six cartes, ✓ / ✕ en bascule, fermeture par ✕, voile et Échap. Vérifier : accepter puis rejeter ne change pas le score de la ligne ; fermer et rouvrir conserve le choix ; le voile bloque le clic vers la liste.

9. **Validation et rejet.** Boutons du tiroir et de la barre. Vérifier les deux oracles de la section 5.8, puis le chaînage valider-puis-rejeter sur une fiche (score `1.00` en pastille Échec). Le tiroir se ferme pour son propre bouton et reste ouvert si l'action vient du lot. Recharger restaure les 14 fiches, les scores d'origine et les attributs neutres.

10. **Responsive, mouvement, passe d'accessibilité.** Vérifier 1180 px (outils en ligne, onglets à droite), 600 px (grille d'attribut en une colonne, KPI encore visibles), 520 px (KPI masqués, outils empilés, sélecteur de langue visible, barre de lot sur les bords à 16 px). Tableau scrollable sous 760 px. `prefers-reduced-motion` : le tiroir apparaît sans translation. Contrôler les `aria-label`, `lang`, Échap, et l'absence de `outline: none` sur les boutons icône.

---

## 12. Lancer et vérifier

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000` (français) et `http://localhost:3000/en` (anglais). Production locale : `npm run build` puis `npm run start`.

Parcours de la spec §3, en français puis en anglais (les données d'hôtel restent en français des deux côtés) :

1. **Arrivée.** Titre, sous-titre, badge, quatre KPI, barre, légende, recherche, deux listes, cinq onglets, 14 lignes de l'id 1 à l'id 14, note de démonstration, tiroir fermé, barre de lot absente, sélecteur de langue après le badge.
2. **Recherche.** `lyon`, `france`, `milano`, `milan`, `cathédrale`, `cathedrale`, `salesforce`, comme en section 5.3. Les KPI ne bougent pas.
3. **Marque et source.** Ordre des options cité en section 5.3. Sofitel réduit à deux lignes. Revenir à l'option vide retire le filtre. « Salesforce » n'est pas une option de source de fiche.
4. **Onglets.** Chaque onglet filtre le tableau ; son compteur reste le compte global. « Toutes » retire le filtre de statut.
5. **Ouvrir.** Ligne ou « Voir détail ». Sourcil, titre, « Score 0.92 » (fiche 2), statut, six attributs avec valeur actuelle, valeur proposée, barre, score, ✓ et ✕.
6. **Trancher.** ✓ accepte, second ✓ revient au neutre, ✕ rejette, ✓ après ✕ remplace. La ligne ne change pas. Rouvrir conserve l'état.
7. **Valider ou rejeter la fiche.** Les deux oracles de la section 5.8, puis valider une fiche dont tous les attributs sont rejetés (score `1.00`, drapeaux inchangés).
8. **Lot.** Singulier à 1, pluriel à 2, « Annuler », valider la sélection, rejeter la sélection, sélection partielle de l'en-tête, fiche cochée survivant à un filtre.
9. **Fermer.** ✕, voile, Échap. Rechargement : retour au jeu initial.
10. **Thème et petit écran.** Système sombre sans bouton. Largeurs 600 px et 520 px comme à l'étape 10. Le sélecteur de langue reste utilisable et mène à l'autre locale.

Contrôle anglais minimal sur le même parcours : `html lang="en"`, titre d'onglet « Hotel PIM Validation (Copy) », KPI « Records processed », « Auto-validatable », « To review », « Failed », onglet « High confidence », bouton « View details », tiroir « Current PIM value » / « Proposed value », et le nom « Novotel Paris Centre Tour Eiffel » inchangé.

---

## 13. Hors périmètre

Cette livraison s'arrête à la maquette interactive décrite ci-dessus.

- Authentification, session, rôle, nom d'opérateur.
- API réelle, routes `app/api`, client HTTP, description d'endpoints.
- Base de données, ORM, persistance des fiches, `localStorage`, `sessionStorage`.
- Page hôtel publique, navigation, pied de page d'application, sidebar.
- Édition des textes, commentaire, motif de rejet, photo fichier, carte, lien téléphone ou e-mail.
- Confirmation, toast, chargement, erreur réseau, bouton désactivé.
- Bascule de thème à l'écran.
- Traduction des noms d'hôtels, villes, marques, sources et valeurs libres.
- Pagination, tri de colonnes, fiche précédente / suivante dans le tiroir.
- Comblement des trous d'accessibilité de la spec §11.2 au-delà de la section 10 de ce plan.
