# Spécification de duplication — Validation PIM Hôtels

Contrat de duplication de la maquette HTML unique `docs/source/Validation_PIM_Hôtels.html` (44 165 octets). Les libellés entre guillemets sont ceux du fichier. Les couleurs, tailles et seuils cités sont ceux du CSS et du script.

Le contexte suivant est donné par le responsable produit, il ne figure pas dans le HTML : c'est l'outil interne de validation PIM (Product Information Management) du groupe Accor, destiné à enrichir et valider des pages produit hôtel. La page hôtel publique est hors périmètre. La maquette est en français ; le produit cible devra aussi supporter l'anglais (section 13).

La maquette est une page unique, sans navigation, sans authentification et sans persistance. Recharger la page restaure le jeu de démonstration.

---

## 1. Résumé

L'écran permet à un opérateur de passer en revue des fiches établissement dont le contenu PIM a été enrichi à partir d'extractions externes. Pour chaque fiche, il voit un score global et un statut, ouvre le détail, compare la valeur PIM actuelle et la valeur proposée de chaque attribut, puis valide ou rejette la fiche, seule ou en lot.

| Élément | Valeur dans la maquette |
| --- | --- |
| Titre visible (`h1`) | Validation des enrichissements |
| Sous-titre | PIM Accor · Fiches établissement |
| Badge | Maquette (affiché en capitales par le CSS) |
| Titre de document (`title`, placé dans le `body`) | Validation PIM Hôtels (Copy) |
| Utilisateur montré par le HTML | Aucun nom, rôle, ni session |
| Utilisateur cible (responsable produit) | Opérateur interne Accor qui valide le PIM hôtel |
| Job de l'écran | Filtrer 14 fiches de démo, comparer leurs attributs, accepter ou rejeter chaque attribut, valider ou rejeter les fiches |

Le badge « Maquette » et la note de bas de page indiquent que les 14 fiches sont un exemple, extrait de Booking.com, Expedia et Salesforce, pour démontrer le scoring et la revue.

---

## 2. Inventaire des vues et états d'écran

Il n'existe qu'une vue. Les changements sont des états de cette vue : filtres, sélection, tiroir, thème, largeur d'écran.

### 2.1 Liste initiale

Au chargement, le script calcule le statut de chaque fiche, remplit les listes, puis affiche :

- recherche vide ;
- marque « Toutes les marques » ;
- source « Toutes les sources » ;
- onglet « Toutes » actif ;
- 14 lignes, dans l'ordre des identifiants 1 à 14 ;
- tiroir fermé (`aria-hidden="true"`, panneau hors écran à droite) ;
- barre d'actions groupées masquée ;
- message vide masqué ;
- aucune case cochée ;
- chaque attribut au choix neutre (`accepted` vide).

Indicateurs calculés sur les 14 fiches, pas sur le sous-ensemble filtré :

| Indicateur | Valeur affichée |
| --- | --- |
| Fiches traitées | 14 |
| Auto-validables | 57% |
| À revoir | 4 |
| Échec | 2 |

Barre de répartition, de gauche à droite. La largeur est le pourcentage du total, avec deux décimales :

| Segment | Fiches | Largeur |
| --- | --- | --- |
| Validée | 3 | 21.43% |
| Confiance haute | 5 | 35.71% |
| À revoir | 4 | 28.57% |
| Échec | 2 | 14.29% |

Légende : « Validée (3) », « Confiance haute (5) », « À revoir (4) », « Échec (2) ».

Onglets, dans cet ordre, avec leur compteur : « Toutes 14 », « Validée 3 », « Confiance haute 5 », « À revoir 4 », « Échec 2 ».

### 2.2 Filtres combinés

Quatre filtres se cumulent (tous doivent passer) :

1. onglet de statut (`all`, `valide`, `haute`, `revoir`, `echec`) ;
2. marque, égalité stricte, ou pas de filtre si la valeur est vide ;
3. source de la fiche, égalité stricte, ou pas de filtre si la valeur est vide ;
4. recherche, sous-chaîne du nom ou de la ville.

La recherche, la marque et la source ne changent ni les KPI, ni la barre, ni les compteurs d'onglets. Ces trois blocs restent calculés sur les 14 fiches, puis se mettent à jour seulement quand un statut change (validation ou rejet). L'onglet, lui, filtre le tableau ; son compteur reste global.

### 2.3 Liste vide

Si aucune fiche ne passe les filtres :

- l'en-tête du tableau reste visible ;
- le corps du tableau est vide ;
- le paragraphe « Aucune fiche ne correspond à ces filtres. » s'affiche sous le tableau ;
- la case « Tout sélectionner » est décochée ;
- la note de démonstration reste visible ;
- la barre groupée reste affichée si des fiches hors filtre sont encore cochées.

Exemple qui vide la liste dès l'état initial : marque Sofitel et onglet Validée. Les deux Sofitel sont en Échec (id 4, score 0.45) et À revoir (id 10, score 0.58).

### 2.4 Sélection de lignes

- Ligne non cochée : fond de la surface, survol `--surface-alt`.
- Ligne cochée : fond `--accent-soft`. Ce fond reste celui du survol.
- Case d'en-tête cochée seulement s'il y a au moins une ligne visible et que toutes les lignes visibles sont cochées. La maquette ne met jamais la case dans un état indéterminé : un choix partiel s'affiche comme une case décochée.
- La barre groupée apparaît dès qu'une fiche au moins est cochée, y compris une fiche cachée par le filtre courant.

### 2.5 Tiroir de détail

Fermé : calque non cliquable, voile invisible, panneau décalé de 100 % vers la droite.

Ouvert : le voile est opaque à `rgba(15,20,27,0.42)`, le panneau est visible, `aria-hidden` passe à `false`. Ouvrir le tiroir ne coche pas la ligne. Le clic sur une autre ligne est intercepté par le voile, qui ferme le tiroir. Il n'y a pas de fiche précédente ni suivante dans le tiroir.

Fermeture : bouton « Fermer le détail » (caractère ✕), clic sur le voile, ou touche Échap. Les choix d'attributs restent en mémoire jusqu'au rechargement.

### 2.6 Attribut du tiroir

Trois états exclusifs, conservés sur l'objet attribut :

| État | Valeur | Rendu |
| --- | --- | --- |
| Neutre | `null` | Bordure `--border`, opacité 1, aucun bouton actif |
| Accepté | `true` | Bordure `color-mix(in srgb, var(--success) 45%, var(--border))`, bouton ✓ actif |
| Rejeté | `false` | Bordure `color-mix(in srgb, var(--danger) 45%, var(--border))`, opacité 0.75, bouton ✕ actif |

Accepter ou rejeter un attribut ne modifie ni son score, ni le score de la fiche, ni son statut.

### 2.7 Validation et rejet

Validation d'une fiche, depuis le tiroir ou le lot :

- `score` devient 1 (affiché `1.00`) ;
- `status` devient `valide`, libellé « Validée » ;
- la fiche est décochée ;
- depuis le tiroir, le tiroir se ferme ;
- les choix d'attributs ne sont pas modifiés.

Rejet d'une fiche, depuis le tiroir ou le lot :

- `status` devient `echec`, libellé « Échec » ;
- le score numérique ne change pas ;
- la pastille de score garde ce nombre et prend les couleurs Échec, parce que sa couleur suit le statut, pas un recalcul du score ;
- la fiche est décochée ;
- depuis le tiroir, le tiroir se ferme ;
- les choix d'attributs ne sont pas modifiés.

Aucun message de succès, aucune confirmation, aucun bouton désactivé, aucun état de chargement, aucune erreur réseau.

Effet chiffré depuis l'état initial, si l'on rejette seulement la fiche 5 (0.95, Confiance haute) : le score affiché reste `0.95` en couleurs Échec. Compteurs : Validée 3, Confiance haute 4, À revoir 4, Échec 3. Auto-validables = 50% (`Math.round(7 / 14 * 100)`).

Effet chiffré depuis l'état initial, si l'on valide seulement la fiche 6 (0.62, À revoir) : score affiché `1.00`, statut Validée. Compteurs : Validée 4, Confiance haute 5, À revoir 3, Échec 2. Auto-validables = 64% (`Math.round(9 / 14 * 100)`).

### 2.8 Thème

Le thème clair est le défaut. Le thème sombre s'applique si le système demande `prefers-color-scheme: dark`, sauf lorsque la racine porte `data-theme="light"`. `data-theme="dark"` force le sombre. La page ne contient aucun bouton pour écrire ces attributs.

### 2.9 Mouvement et safe area

`prefers-reduced-motion: reduce` supprime transitions et animations, y compris l'ouverture du tiroir (opacité du voile 0.18s, translation du panneau 0.22s).

Le viewport est `width=device-width, initial-scale=1, viewport-fit=cover`. La racine réserve les safe areas haute et basse. La barre groupée ajoute `env(safe-area-inset-bottom)` à son padding bas.

### 2.10 Largeurs

| Seuil | Changement |
| --- | --- |
| 640 px et moins | La grille « valeur actuelle / valeur proposée » passe de 2 colonnes à 1 |
| 560 px et moins | Les KPI sont masqués ; la barre d'outils s'empile ; la recherche n'a plus de largeur minimale de 180 px ; les onglets ne sont plus poussés à droite ; la barre groupée s'aligne à 16 px des bords et peut passer à la ligne |

Le tableau a une largeur minimale de 760 px et défile horizontalement dans sa carte. Aucun autre breakpoint n'est défini. Il n'y a pas de sidebar à replier.

---

## 3. Parcours utilisateur

### 3.1 Arrivée sur l'écran

1. L'opérateur ouvre la page.
2. Il lit le titre « Validation des enrichissements », le sous-titre « PIM Accor · Fiches établissement » et le badge « Maquette ».
3. Il voit les quatre indicateurs, la barre colorée et sa légende.
4. Il voit la recherche, les deux listes et les cinq onglets.
5. Il parcourt le tableau des 14 fiches, de l'id 1 à l'id 14.
6. Il peut lire la note : « Exemple de données (maquette) — 14 fiches issues d'extractions Booking.com / Expedia / Salesforce, à des fins de démonstration de la mécanique de scoring et de revue. »

### 3.2 Rechercher

1. Il saisit dans le champ dont le placeholder est « Rechercher un hôtel, une ville… ».
2. Le tableau se met à jour à chaque frappe. Il n'y a pas de bouton de recherche, pas de délai, pas de `trim`.
3. La comparaison passe le texte et les champs en minuscules (`toLowerCase`) et cherche une sous-chaîne dans le nom ou dans la ville. Les accents ne sont pas retirés. La marque, la source et les attributs ne sont pas fouillés.

Conséquences directes des données :

- « lyon » garde ibis Lyon Part-Dieu ;
- « france » garde les fiches dont la ville se termine par « France » ;
- « milano » garde Mercure Milano Centro (le mot est dans le nom) ; « milan » la garde aussi (le mot est dans la ville « Milan, Italie ») ;
- « cathédrale » garde MGallery Strasbourg Cathédrale ; « cathedrale » ne la garde pas ;
- « salesforce » ne garde aucune fiche.

### 3.3 Filtrer par marque ou par source

1. Il ouvre « Toutes les marques » ou « Toutes les sources ».
2. Il choisit une valeur. Le tableau se réduit aux fiches dont le champ est exactement cette valeur.
3. Revenir à l'option vide retire ce filtre.

Options de marque, ordre du tri UTF-16 par défaut du script : Toutes les marques, MGallery, Mercure, Novotel, Pullman, Sofitel, ibis.

Options de source : Toutes les sources, Booking.com, Expedia, Salesforce - contact center.

La source d'attribut « Salesforce » (coordonnées, et tous les attributs des fiches 4 et 10) n'apparaît pas dans cette liste. La liste utilise la source de la fiche.

### 3.4 Filtrer par onglet

1. Il clique un onglet : Toutes, Validée, Confiance haute, À revoir ou Échec.
2. Le tableau ne garde que ce statut. « Toutes » retire le filtre de statut.
3. Le compteur de l'onglet ne change pas sous l'effet de la recherche ou des listes.
4. Chaque rendu reconstruit les boutons d'onglet. Le focus clavier quitte le bouton qui vient d'être activé.

### 3.5 Ouvrir une fiche

1. Il clique la ligne, en dehors de la case, ou le bouton « Voir détail ».
2. Le tiroir s'ouvre à droite.
3. La ligne d'en-tête secondaire est `{marque} · {ville} · {source fiche}`. Pour la fiche 1 : « Novotel · Paris, France · Booking.com ».
4. Le titre est le nom de l'hôtel.
5. Deux pastilles : « Score {score sur deux décimales} » et le libellé de statut avec son point coloré.
6. Six cartes d'attributs s'empilent. Chacune montre le libellé, « via {source attribut} », la colonne « Valeur PIM actuelle », la colonne « Valeur proposée », une barre de largeur égale au score × 100, le score sur deux décimales, puis ✓ et ✕.

### 3.6 Trancher un attribut

1. Il clique ✓. Si l'attribut n'était pas accepté, il devient accepté. S'il l'était déjà, il redevient neutre.
2. Il clique ✕. Même bascule vers l'état rejeté.
3. Passer de ✓ à ✕ remplace l'état : une seule valeur parmi neutre, accepté, rejeté.
4. Le tiroir se redessine. Le tableau, les KPI et le statut de la fiche restent inchangés.
5. Fermer puis rouvrir la même fiche réaffiche ces choix.

Valider la fiche alors que tous ses attributs sont rejetés force quand même le score à 1 et le statut à Validée. Les drapeaux d'attributs restent rejetés.

### 3.7 Valider ou rejeter la fiche ouverte

1. « Valider la fiche » applique la validation décrite en section 2.7 et ferme le tiroir.
2. « Rejeter la fiche » applique le rejet et ferme le tiroir.
3. Les deux boutons restent cliquables quel que soit le statut courant. Valider une fiche déjà « Validée » réécrit le score à 1. Rejeter une fiche déjà en « Échec » réécrit le statut Échec et laisse le score tel qu'il est à ce moment-là.

### 3.8 Sélectionner et traiter un lot

1. Il coche une ou plusieurs lignes, ou la case d'en-tête « Tout sélectionner ».
2. La case d'en-tête ne coche et ne décoche que les fiches visibles. Une fiche déjà cochée et masquée par un filtre le reste.
3. La barre fixe en bas affiche « 1 fiche sélectionnée » ou, dès que le nombre dépasse 1, « {n} fiches sélectionnées ». Le nombre compte toutes les fiches cochées, visibles ou non.
4. « Annuler » décoche toutes les fiches.
5. « Valider la sélection » valide chaque fiche cochée puis les décoche.
6. « Rejeter la sélection » rejette chaque fiche cochée puis les décoche.
7. Aucune demande de confirmation n'est affichée.

Si la sélection visible est partielle, la case d'en-tête est décochée. Un clic dessus coche alors toutes les lignes visibles.

Tant que le tiroir est ouvert, son voile (z-index 40) couvre la barre groupée (z-index 30). L'opérateur ferme le tiroir pour atteindre la barre.

### 3.9 Fermer et reprendre

Échap, ✕ ou le voile ferment le tiroir. La liste est déjà à jour si une validation ou un rejet a eu lieu. Rien n'est enregistré hors de la page : un rechargement remet les 14 fiches, les scores d'origine, les statuts calculés et les attributs neutres.

### 3.10 Thème et petit écran

Si le système est en sombre, les couleurs de la section 5 (colonne sombre) s'appliquent sans action de l'utilisateur. Sous 560 px, il ne voit plus les KPI ; la recherche, les listes et les onglets s'empilent ; la barre groupée occupe la largeur entre deux marges de 16 px.

---

## 4. Structure de layout

Pas de sidebar, pas de barre de navigation, pas de pied de page d'application. La page est une colonne centrée, plus deux calques fixes.

### 4.1 Colonne principale

Conteneur `.app` :

- largeur maximale 1180 px, centré (`margin: 0 auto`) ;
- padding horizontal 20 px ;
- padding haut 20 px, padding bas 96 px (dégagement pour la barre groupée) ;
- en plus, la racine du document ajoute le padding des safe areas.

De haut en bas :

1. En-tête `.topbar` : flex, retour à la ligne, `space-between`, alignement en haut, écart 20 px, padding bas 18 px, bordure basse 1 px `--border`, marge basse 16 px.
2. Bloc gauche de l'en-tête : logo et titres, écart 12 px.
3. Bloc droit : les quatre KPI, flex, retour à la ligne, écart 10 px.
4. Barre de statuts : hauteur 9 px, pleine largeur, rayon 6 px, marge basse 6 px, fond `--border`, segments collés (`overflow: hidden`).
5. Légende : flex, retour à la ligne, écart 16 px, marge basse 22 px, texte 12 px `--text-muted`. Point de 8 × 8 px, écart 6 px avec le libellé.
6. Barre d'outils : flex, retour à la ligne, centrage vertical, écart 10 px, marge basse 14 px. Les onglets sont poussés à droite (`margin-left: auto`) au-dessus de 560 px.
7. Carte tableau : fond `--surface`, bordure 1 px `--border`, rayon 10 px, ombre `--shadow-sm`, défilement si le contenu dépasse.
8. Tableau : largeur 100 %, `border-collapse`, largeur minimale 760 px.
9. Message vide, sous la carte, seulement hors filtre nul.
10. Note de maquette, 11.5px, couleur `--text-faint`, marge haute 14 px.

### 4.2 En-tête

- Logo : 44 × 44 px, rayon 12 px, fond `--accent-soft`, emoji 🏨 en 22 px, centré. Ce n'est pas une image.
- Titre : Fraunces 600, 22 px, interligne 1.2.
- Sous-titre : 13 px, `--text-muted`, marge haute 4 px, écart 8 px avec le badge, retour à la ligne autorisé.

KPI :

- carte surface, bordure `--border`, rayon 10 px, padding 8 px 14 px, largeur minimale 96 px, ombre `--shadow-sm` ;
- valeur : IBM Plex Mono 600, 19 px, interligne 1.1, chiffres tabulaires ;
- libellé : 11 px, `--text-muted`, marge haute 3 px ;
- la valeur « Auto-validables » est en `--success`, « À revoir » en `--warn`, « Échec » en `--danger`. « Fiches traitées » reste en `--text`.

### 4.3 Barre d'outils

Champ texte et listes : hauteur 36 px, padding 8 px 12 px, rayon 8 px, fond `--surface`, bordure 1 px `--border-strong`, texte Public Sans 500 / 13.5px, `appearance: none` (la flèche native des listes n'est pas redessinée).

Recherche : `flex: 1 1 220px`, largeur minimale 180 px (0 sous 560 px).

Listes : largeur automatique, elles ne s'étirent pas au-dessus de 560 px. Sous 560 px, la barre d'outils est une colonne étirée, donc les listes prennent la largeur.

Onglet : Public Sans 600 / 12.5px, padding 7 px 12 px, rayon pilule (999 px), écart interne 6 px, bordure `--border`, fond `--surface`, texte `--text-muted`. Le compteur est IBM Plex Mono 11 px, fond `--surface-alt`, rayon pilule, padding 1 px 6 px.

### 4.4 Tableau

| Colonne | Contenu | Alignement et largeur |
| --- | --- | --- |
| Case | Checkbox, `aria-label` « Tout sélectionner » dans l'en-tête | Largeur de colonne 34 px |
| Fiche établissement | Nom, ville, pastille de marque | Gauche |
| Source | Source de la fiche | Gauche, texte nowrap |
| Attributs enrichis | Pastille « {n} attributs » | Gauche |
| Score global | Pastille numérique | Gauche |
| Statut | Pastille avec point | Gauche |
| Actions | Bouton « Voir détail » | En-tête aligné à droite ; contenu aligné à droite |

En-tête : Public Sans 600 / 11 px, capitales, interlettrage 0.04em, couleur `--text-faint`, padding 12 px 14 px, fond `--surface-alt`, bordure basse `--border`, `position: sticky; top: 0` dans la carte défilante. Pas de z-index sur ces cellules.

Cellule : padding 12 px 14 px, 13.5px, bordure basse `--border`, centrage vertical. Dernière ligne sans bordure basse.

Cellule hôtel :

- nom en graisse 600 ;
- ville en 12 px `--text-muted`, marge haute 2 px ;
- marque : Public Sans 600 / 10.5px, interlettrage 0.02em, couleur `--accent`, fond `--accent-soft`, rayon 5 px, padding 2 px 6 px, marge haute 5 px.

Pastille d'attributs : Public Sans 500 / 12 px, `--text-muted`, fond `--surface-alt`, bordure `--border`, padding 3 px 9 px, rayon pilule.

Pastille de score : IBM Plex Mono 600 / 13 px, chiffres tabulaires, padding 3 px 9 px, rayon 6 px, écart 3 px.

Pastille de statut : Public Sans 600 / 12 px, padding 4 px 10 px, rayon pilule, écart 6 px, point 7 × 7 px.

Actions de ligne : flex, écart 6 px, alignées à droite. Un seul bouton, « Voir détail ».

Checkbox : 16 × 16 px, `accent-color` = `--accent`, curseur pointeur.

### 4.5 Tiroir

Calque fixe sur toute la fenêtre, z-index 40. Tant qu'il est fermé, `pointer-events: none`.

Voile : `rgba(15,20,27,0.42)`, opacité animée en 0.18s `ease`.

Panneau : collé en haut à droite, hauteur 100 %, largeur `min(440px, 100vw)`, fond `--surface`, bordure gauche 1 px `--border`, ombre `--shadow`, colonne flex. Translation animée en 0.22s `ease`.

Fermeture : bouton 30 × 30 px, position absolue top 14 px / right 14 px, rayon 8 px, bordure `--border`, fond `--surface`, texte 14 px `--text-muted`, caractère ✕.

En-tête du panneau : padding 22 px 52 px 16 px 22 px (le padding droit laisse la place au bouton), bordure basse `--border`.

- Sourcil : 12 px `--text-muted`, marge basse 4 px.
- Titre : Fraunces 600, 19 px, interligne 1.25.
- Méta : flex, écart 8 px, retour à la ligne, marge haute 10 px.

Corps : padding 16 px 22 px, défilement vertical, prend la place restante.

Carte d'attribut : fond `--surface-alt`, bordure `--border`, rayon 9 px, padding 12 px 13 px, marge basse 10 px.

- Ligne de titre : libellé Public Sans 600 / 12.5px à gauche, « via … » en 11 px `--text-faint` à droite, écart 8 px, marge basse 8 px.
- Comparaison : grille 2 colonnes, écart 10 px, marge basse 9 px. Sous 640 px, 1 colonne.
- Clé de colonne : 10.5px, capitales, interlettrage 0.04em, `--text-faint`, marge basse 3 px. Textes : « Valeur PIM actuelle », « Valeur proposée ».
- Valeur : 12.5px, interligne 1.4. La valeur proposée est en graisse 500.
- Ligne du bas : barre flexible, score sur 34 px de large en 11 px `--text-faint`, puis deux boutons, écart 10 px entre les groupes.

Barre de score : piste hauteur 5 px, fond `--border`, rayon 4 px. Remplissage de hauteur 100 %, largeur `score × 100 %`, couleur = couleur de texte du statut (vert, accent, ambre ou rouge). Le `background: currentColor` en ligne l'emporte sur le fond du point.

Boutons ✓ / ✕ : 26 × 26 px, rayon 7 px, bordure `--border-strong`, fond `--surface`, texte 12 px `--text-muted`, écart 5 px.

Pied du tiroir : padding 16 px 22 px, bordure haute `--border`, flex, écart 10 px, contenu aligné à droite. Ordre visuel : « Rejeter la fiche », puis « Valider la fiche ».

### 4.6 Barre groupée

Fixe, bas 20 px, centrée (`left: 50%`, `translateX(-50%)`), z-index 30, rayon 12 px, ombre `--shadow`. Padding 12 px 14 px 12 px 18 px, plus la safe area basse. Flex, écart 16 px, alignement centré.

Fond = couleur de texte du thème, texte = couleur de fond du thème. En clair : fond `#1B2430`, texte `#F5F6F8`. En sombre : fond `#E8ECF1`, texte `#10151C`.

Le libellé de compte est Public Sans 600 / 13 px, nowrap. Les boutons sont dans un groupe d'écart 8 px, dans l'ordre : Annuler, Rejeter la sélection, Valider la sélection.

Sous 560 px : `left` et `right` à 16 px, plus de translation, retour à la ligne autorisé.

### 4.7 Message vide

Paragraphe centré, `--text-muted`, padding 40 px 16 px, 14 px. Il est hors du tableau, masqué par l'attribut `hidden` quand il y a au moins une ligne.

---

## 5. Design system extrait du CSS

Deux blocs de style se suivent. Le premier pose un reset. Le second pose le thème de l'outil et, pour `body`, remplace le fond, la couleur de texte et la famille. La taille de 14 px du reset reste celle du corps, car le second bloc ne la redéfinit pas.

Reset ensuite recouvert pour le fond et le texte : fond `#faf9f5`, texte `#141413`, famille `-apple-system, BlinkMacSystemFont, sans-serif`. Valeurs effectives : fond `--bg`, texte `--text`, famille Public Sans ci-dessous.

Le reset définit aussi `color-scheme: light` sur la racine, `img { max-width: 100% }` (aucune image dans la page) et `[hidden] { display: none !important }` sauf `hidden="until-found"`. `box-sizing: border-box` s'applique à tous les éléments.

### 5.1 Couleurs — thème clair (défaut)

| Jeton | Hex | Rôle observé |
| --- | --- | --- |
| `--bg` | `#F5F6F8` | Fond de page ; texte de la barre groupée |
| `--surface` | `#FFFFFF` | Cartes, champs, tiroir, boutons ghost/danger/icône |
| `--surface-alt` | `#FAFBFC` | En-tête de tableau, survol de ligne, compteur d'onglet, cartes d'attribut, survol ghost |
| `--border` | `#E1E5EA` | Bordures courantes, piste de score, fond de la barre de statuts |
| `--border-strong` | `#CBD2DA` | Bordure des champs, boutons ghost et icônes, boutons d'attribut |
| `--text` | `#1B2430` | Texte principal ; fond de la barre groupée |
| `--text-muted` | `#5B6B7D` | Sous-titre, ville, légende, boutons secondaires |
| `--text-faint` | `#8592A3` | En-têtes de colonnes, clés d'attribut, « via … », note de bas de page |
| `--accent` | `#14586B` | Action principale, onglet actif, marque, statut Confiance haute, focus |
| `--accent-hover` | `#0F4655` | Survol du bouton principal |
| `--accent-soft` | `#E4EEF1` | Fond du logo, de la marque, de la ligne cochée, du statut Confiance haute |
| `--success` | `#1E8F5F` | Validée, KPI auto-validables, attribut accepté |
| `--success-soft` | `#E3F5EC` | Fond des pastilles Validée et du bouton ✓ actif |
| `--warn` | `#B97A16` | À revoir, badge Maquette, KPI À revoir |
| `--warn-soft` | `#FBF0DC` | Fond du badge et des pastilles À revoir |
| `--danger` | `#C0392E` | Échec, boutons de rejet, KPI Échec |
| `--danger-soft` | `#FBE8E6` | Fond des pastilles Échec et du bouton ✕ actif |

Ombres claires :

- `--shadow` : `0 12px 28px -12px rgba(20,30,40,0.18)` — tiroir et barre groupée ;
- `--shadow-sm` : `0 1px 2px rgba(20,30,40,0.06)` — KPI et carte tableau.

`--radius` : 10 px.

### 5.2 Couleurs — thème sombre

Identique pour `prefers-color-scheme: dark` (si la racine n'a pas `data-theme="light"`) et pour `:root[data-theme="dark"]`.

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

Ombres sombres :

- `--shadow` : `0 12px 28px -12px rgba(0,0,0,0.5)` ;
- `--shadow-sm` : `0 1px 2px rgba(0,0,0,0.3)`.

`color-scheme` suit le thème (`light` ou `dark`), ce qui teinte les contrôles natifs (cases, listes).

### 5.3 Couleurs hors jetons

| Usage | Valeur |
| --- | --- |
| Texte du bouton principal et de l'onglet actif | `#fff` |
| Fond du compteur de l'onglet actif | `rgba(255,255,255,.22)` |
| Voile du tiroir | `rgba(15,20,27,0.42)` |
| Bordure du badge Maquette | `color-mix(in srgb, var(--warn) 45%, transparent)` |
| Bordure du bouton danger | `color-mix(in srgb, var(--danger) 40%, transparent)` |
| Bordure de « Voir détail » | `color-mix(in srgb, var(--accent) 40%, transparent)` |
| Bordure d'attribut accepté | `color-mix(in srgb, var(--success) 45%, var(--border))` |
| Bordure d'attribut rejeté | `color-mix(in srgb, var(--danger) 45%, var(--border))` |
| Bordure du ✓ actif | `color-mix(in srgb, var(--success) 50%, transparent)` |
| Bordure du ✕ actif | `color-mix(in srgb, var(--danger) 50%, transparent)` |
| Bordure de « Annuler » dans la barre groupée | `color-mix(in srgb, var(--bg) 35%, transparent)` |
| Survol de « Annuler » dans la barre groupée | fond `color-mix(in srgb, var(--bg) 12%, transparent)` |
| Bordure de « Rejeter la sélection » | `color-mix(in srgb, var(--danger) 60%, transparent)`, fond transparent |

### 5.4 Couleurs de statut

Les classes `pill-*` colorent les pastilles. Les classes `dot-*` colorent les points, les segments de la barre et, via `currentColor`, le remplissage du score d'attribut.

| Clé | Libellé | Texte et point | Fond de pastille |
| --- | --- | --- | --- |
| `valide` | Validée | `--success` | `--success-soft` |
| `haute` | Confiance haute | `--accent` | `--accent-soft` |
| `revoir` | À revoir | `--warn` | `--warn-soft` |
| `echec` | Échec | `--danger` | `--danger-soft` |

Le point seul a un fond plein (la couleur de texte), pas le fond doux. La pastille a le fond doux et le texte coloré.

### 5.5 Typographie

Familles effectives :

| Rôle | Famille déclarée | Secours |
| --- | --- | --- |
| Texte, boutons, champs | Public Sans | `-apple-system`, `"Segoe UI"`, `sans-serif` |
| Titres `h1`, `h2`, `h3` | Fraunces | `Georgia`, `serif` |
| Chiffres (KPI, score, compteur d'onglet) | IBM Plex Mono | `monospace` |

Les titres ont `font-weight: 600`, `text-wrap: balance`, marge 0. Le CSS prépare `h3` ; la page n'en contient aucun.

Graisses utilisées : 400 sur le texte courant (héritée), 500 sur les champs, la pastille d'attributs et la valeur proposée, 600 sur les titres, le badge, le nom d'hôtel, les KPI, les onglets, les boutons, les en-têtes, les pastilles de statut et de score, les libellés d'attribut et le compteur de la barre groupée.

| Élément | Taille | Graisse | Détail |
| --- | --- | --- | --- |
| Corps | 14 px | 400 | Héritée du reset |
| `h1` | 22 px | 600 | Interligne 1.2 |
| Titre du tiroir | 19 px | 600 | Interligne 1.25 |
| Valeur de KPI | 19 px | 600 | Mono, interligne 1.1, chiffres tabulaires |
| Emoji du logo | 22 px | — | |
| Fermeture du tiroir | 14 px | — | |
| Message vide | 14 px | 400 | |
| Champ, cellule | 13.5px | 500 pour le champ | |
| Sous-titre, bouton, score, compteur de lot | 13 px | 600 pour bouton, score et compteur | |
| Onglet, libellé d'attribut, valeurs d'attribut | 12.5px | 600 pour onglet et libellé ; 500 pour la valeur proposée | Interligne des valeurs 1.4 |
| Ville, légende, source, pastille d'attributs, statut, sourcil, bouton icône | 12 px | 600 pour le statut | |
| Note de bas de page | 11.5px | 400 | |
| Libellé de KPI, compteur d'onglet, « via … », score d'attribut | 11 px | 600 pour le compteur d'onglet (mono) | |
| Badge, pastille de marque, clé de colonne | 10.5px | 600 | |

Capitales imposées par CSS, le texte source restant en casse de phrase :

- badge « Maquette » ;
- les sept intitulés de colonnes ;
- « Valeur PIM actuelle » et « Valeur proposée ».

Interlettrage : badge 0.06em ; en-têtes de colonnes et clés d'attribut 0.04em ; pastille de marque 0.02em.

Chiffres tabulaires sur la valeur de KPI et la pastille de score globale. Le score dans la carte d'attribut est en Public Sans 11 px `--text-faint`, largeur réservée 34 px, pas en mono.

### 5.6 Rayons

| Valeur | Usage |
| --- | --- |
| 12 px | Logo ; barre groupée |
| 10 px (`--radius`) | KPI ; carte tableau |
| 9 px | Carte d'attribut |
| 8 px | Champs ; boutons `.btn` ; fermeture du tiroir |
| 7 px | Bouton icône « Voir détail » ; boutons ✓ / ✕ |
| 6 px | Pastille de score ; barre de statuts |
| 5 px | Badge Maquette ; pastille de marque |
| 4 px | Piste et remplissage du score d'attribut |
| 999 px | Onglets, compteurs d'onglet, pastilles de statut, pastille « N attributs » |
| 50 % | Points de légende et de statut |

### 5.7 Espacements récurrents

Valeurs présentes dans le CSS, en pixels : 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20, 22, 40, 52, 96. Il n'y a pas d'échelle nommée au-delà de ces littéraux. Le détail par zone est en section 4.

Padding des boutons `.btn` : 9 px 15 px, écart d'icône 6 px. Padding du bouton icône : 6 px 10 px.

### 5.8 États hover, focus, active

Le CSS ne définit aucun `:active` ni aucun `:disabled`.

| Cible | Focus visible | Survol effectif |
| --- | --- | --- |
| Champ et liste | Contour 2 px `--accent`, décalage 1 px | Aucun style de survol |
| Onglet inactif | Contour 2 px `--accent`, décalage 2 px | Bordure `--border-strong` |
| Onglet actif | Même contour | Reste fond `--accent`, texte `#fff`, bordure `--accent` (la règle `.tab.active` suit `.tab:hover`) |
| Bouton `.btn` | Contour 2 px `--accent`, décalage 2 px | Selon la variante |
| Principal | — | Fond `--accent-hover` |
| Danger (tiroir) | — | Fond `--danger-soft` |
| Ghost hors barre | — | Fond `--surface-alt` |
| Danger dans la barre groupée | — | Reste fond transparent : la règle de la barre est déclarée après `.btn-danger:hover` à spécificité égale |
| Ghost dans la barre | — | Fond `color-mix(in srgb, var(--bg) 12%, transparent)`, texte `--bg` |
| Icône simple | Pas de contour dédié (ce n'est pas `.btn`) | Texte `--text`, bordure `--text-faint` |
| « Voir détail » (`.btn-icon.link`) | Pas de contour dédié | Garde le texte `--accent` et la bordure accent à 40 % : `.btn-icon.link` est déclaré après `.btn-icon:hover` |
| Fermeture du tiroir | Contour natif | Texte `--text`, fond `--surface-alt` |
| ✓ / ✕ | Contour natif | Aucun style de survol |
| Ligne de tableau | — | Fond `--surface-alt`, sauf si la ligne est cochée : le fond reste `--accent-soft` |
| Case | Anneau natif, teinte `--accent` | Curseur pointeur |

Onglet actif : fond et bordure `--accent`, texte `#fff`, compteur fond blanc à 22 % et texte `#fff`.

Bouton ✓ actif : fond `--success-soft`, texte `--success`, bordure succès à 50 %. Bouton ✕ actif : fond `--danger-soft`, texte `--danger`, bordure danger à 50 %.

---

## 6. Inventaire des composants

Chaque libellé ci-dessous est le texte source. Le rendu en capitales, quand il existe, vient du CSS (section 5.5).

### 6.1 Marque et titre

- Logo emoji 🏨, sans lien.
- `h1` « Validation des enrichissements ».
- Sous-titre « PIM Accor · Fiches établissement ». Le séparateur est le point médian `·` (U+00B7).
- Badge « Maquette » : fond ambre doux, texte ambre, bordure ambre à 45 %, rayon 5 px, capitales, interlettrage 0.06em. Variante unique.

### 6.2 Indicateurs KPI

Quatre cartes, dans cet ordre, une seule variante chacune :

| Ordre | Variante | Libellé | Valeur initiale |
| --- | --- | --- | --- |
| 1 | neutre | Fiches traitées | 14 |
| 2 | `success` | Auto-validables | 57% |
| 3 | `warn` | À revoir | 4 |
| 4 | `danger` | Échec | 2 |

« Auto-validables » est le libellé du taux `(Validée + Confiance haute) / total`, arrondi à l'entier le plus proche, collé au signe `%` sans espace. Ce n'est pas un bouton et cela ne déclenche aucune validation automatique.

### 6.3 Barre de statuts et légende

Quatre segments dans l'ordre Validée, Confiance haute, À revoir, Échec. La légende reprend le même ordre, format « {libellé} ({compte}) », avec un point rond de la couleur du statut. Pas d'interaction.

### 6.4 Recherche

Un champ `type="text"`, `autocomplete="off"`, placeholder « Rechercher un hôtel, une ville… ». Pas de libellé visible, pas d'icône, pas de bouton effacer.

### 6.5 Liste des marques

Première option, valeur vide : « Toutes les marques ». Puis les marques distinctes triées : MGallery, Mercure, Novotel, Pullman, Sofitel, ibis. La casse « ibis » est celle des données.

### 6.6 Liste des sources

Première option, valeur vide : « Toutes les sources ». Puis : Booking.com, Expedia, Salesforce - contact center. Le tiret de « Salesforce - contact center » est un trait d'union entouré d'espaces, pas un tiret long.

### 6.7 Onglets de statut

Cinq boutons pilule. Variantes : inactif, actif, survol, focus clavier. Le compteur est un fils du bouton.

| Clé interne | Libellé | Compteur initial |
| --- | --- | --- |
| `all` | Toutes | 14 |
| `valide` | Validée | 3 |
| `haute` | Confiance haute | 5 |
| `revoir` | À revoir | 4 |
| `echec` | Échec | 2 |

L'onglet initial actif est « Toutes ».

### 6.8 Tableau des fiches

En-têtes source, avant capitales CSS : case sans texte (accessible via « Tout sélectionner »), « Fiche établissement », « Source », « Attributs enrichis », « Score global », « Statut », « Actions ».

Ligne : case « Sélectionner {nom de l'hôtel} », bloc hôtel, source, pastille « {n} attributs » (dans la démo, toujours « 6 attributs »), score `toFixed(2)`, pastille de statut, bouton « Voir détail ».

Variantes de ligne : défaut, survol, cochée (classe sélectionnée). Le bouton « Voir détail » a la variante lien : texte accent, bordure accent à 40 %, rayon 7 px. Il n'existe pas d'autre action de ligne.

### 6.9 Pastilles de score et de statut

Score global : nombre seul, fond doux et texte de la couleur du statut courant (pas forcément du score, après un rejet).

Statut : point plein + libellé. Quatre variantes, section 5.4.

Dans le tiroir, la pastille de score est préfixée : « Score 1.00 », « Score 0.92 », etc.

### 6.10 État vide

Un seul texte : « Aucune fiche ne correspond à ces filtres. »

### 6.11 Note de démonstration

« Exemple de données (maquette) — 14 fiches issues d'extractions Booking.com / Expedia / Salesforce, à des fins de démonstration de la mécanique de scoring et de revue. »

Le tiret est un tiret long `—` (U+2014).

### 6.12 Tiroir

Composants : voile, panneau `role="dialog"` `aria-modal="true"`, fermeture ✕ (« Fermer le détail »), sourcil, titre, méta (score + statut), liste d'attributs, pied avec deux boutons.

Boutons du pied :

| Bouton | Variante | Libellé |
| --- | --- | --- |
| Rejet | danger (fond surface, texte danger, bordure danger 40 %) | Rejeter la fiche |
| Validation | principal (fond accent, texte `#fff`) | Valider la fiche |

### 6.13 Carte d'attribut

Sous-parties fixes : libellé, « via {source} », « Valeur PIM actuelle », « Valeur proposée », barre, score sur deux décimales, ✓ (« Accepter cet attribut »), ✕ (« Rejeter cet attribut »).

Variantes de carte : neutre, acceptée, rejetée. Variantes de bouton : inactif, ✓ actif, ✕ actif. Les caractères sont ✓ (U+2713) et ✕ (U+2715). La fermeture du tiroir utilise aussi ✕.

Les six libellés d'attribut, identiques et dans le même ordre sur les 14 fiches :

1. Adresse & géolocalisation
2. Équipements & services
3. Description commerciale
4. Classification (catégorie)
5. Coordonnées de contact
6. Photo de couverture

### 6.14 Barre d'actions groupées

Masquée à 0 sélection. Visible sinon.

| Élément | Variante dans la barre | Libellé |
| --- | --- | --- |
| Compteur | texte inversé | « {n} fiche sélectionnée » si n ≤ 1 ; « {n} fiches sélectionnées » si n > 1 |
| Secondaire | ghost inversé | Annuler |
| Danger | danger sur fond transparent, bordure danger 60 % | Rejeter la sélection |
| Principal | principal inchangé | Valider la sélection |

À 0 fiche la barre est masquée, donc la forme singulière de 0 n'est pas montrée, bien que la formule l'emploierait (`n > 1` est le seul test de pluriel).

---

## 7. Modèle de données implicite

Deux entités. Pas d'utilisateur, de commentaire, d'historique, de pièce jointe, ni de photo réelle. « Photo de couverture » est une chaîne qui décrit la photo, pas un fichier.

### 7.1 Fiche établissement

| Champ | Type dans le script | Rôle |
| --- | --- | --- |
| `id` | nombre entier | Identifiant stable, 1 à 14 |
| `name` | texte | Nom affiché et titre du tiroir |
| `brand` | texte | Pastille et filtre marque |
| `city` | texte | Sous le nom, format « {ville}, {pays} » dans la démo |
| `source` | texte | Colonne Source, filtre, et troisième segment du sourcil |
| `score` | nombre | Score global, affiché avec deux décimales. Plage observée : 0.38 à 1 |
| `status` | clé `valide` \| `haute` \| `revoir` \| `echec` | Calculé au chargement, puis écrasé par une validation ou un rejet |
| `selected` | booléen | Cochée ou non. Faux au départ |
| `attrs` | liste d'attributs | Toujours 6 éléments dans la démo ; le libellé de pastille utilise la longueur réelle |

### 7.2 Attribut

| Champ | Type | Rôle |
| --- | --- | --- |
| `label` | texte | Nom de l'attribut PIM |
| `current` | texte | « Valeur PIM actuelle » |
| `proposed` | texte | « Valeur proposée » |
| `score` | nombre | Score de l'attribut, indépendant du score de fiche après une action utilisateur |
| `src` | texte | Source de cet attribut, affichée « via {src} ». Peut différer de `source` |
| `accepted` | `null`, `true` ou `false` | Neutre, accepté, rejeté. `null` au départ |

Le statut d'un attribut n'est pas stocké. Il est recalculé à l'affichage de la barre avec la même règle que la fiche. Il ne change pas quand on accepte ou rejette l'attribut.

### 7.3 Règle de statut à partir du score

Appliquée au chargement à chaque fiche, et à chaque affichage de barre d'attribut :

| Condition | Clé | Libellé |
| --- | --- | --- |
| score ≥ 1 | `valide` | Validée |
| score > 0.8 et score < 1 | `haute` | Confiance haute |
| score > 0.5 et score ≤ 0.8 | `revoir` | À revoir |
| score ≤ 0.5 | `echec` | Échec |

Frontières présentes dans les données : 1 et 1.00 → Validée ; 0.98 → Confiance haute ; 0.80 (littéral `0.8`) → À revoir ; 0.50 (littéral `0.5`) → Échec. Un score supérieur à 1 reçoit aussi la clé `valide`. La démo n'en contient pas.

Affichage : toujours deux décimales. Le littéral `0.9` s'affiche `0.90`, `1` s'affiche `1.00`, `0.8` s'affiche `0.80`.

KPI « Auto-validables » : `Math.round((nombre valide + nombre haute) / nombre de fiches × 100)` puis le caractère `%`. Le dénominateur est le nombre total de fiches, pas le nombre de lignes visibles. La maquette ne retire jamais une fiche de la liste, donc ce dénominateur reste 14 tant qu'on ne recharge pas après avoir seulement changé des statuts : le total reste 14 aussi après validation ou rejet.

Largeur d'un segment : `(compte / total × 100)` formaté avec deux décimales et le suffixe `%`.

### 7.4 Répartition initiale

| id | Nom | Marque | Ville | Source fiche | Score stocké | Affiché | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Novotel Paris Centre Tour Eiffel | Novotel | Paris, France | Booking.com | 1 | 1.00 | Validée |
| 2 | ibis Lyon Part-Dieu | ibis | Lyon, France | Expedia | 0.92 | 0.92 | Confiance haute |
| 3 | Mercure Marseille Vieux-Port | Mercure | Marseille, France | Booking.com | 0.88 | 0.88 | Confiance haute |
| 4 | Sofitel Nice Riviera | Sofitel | Nice, France | Salesforce - contact center | 0.45 | 0.45 | Échec |
| 5 | Pullman Bordeaux Aquitania | Pullman | Bordeaux, France | Expedia | 0.95 | 0.95 | Confiance haute |
| 6 | MGallery Lille Vauban | MGallery | Lille, France | Booking.com | 0.62 | 0.62 | À revoir |
| 7 | Novotel Amsterdam City | Novotel | Amsterdam, Pays-Bas | Booking.com | 1 | 1.00 | Validée |
| 8 | ibis Berlin Mitte | ibis | Berlin, Allemagne | Expedia | 0.7 | 0.70 | À revoir |
| 9 | Mercure Milano Centro | Mercure | Milan, Italie | Booking.com | 0.83 | 0.83 | Confiance haute |
| 10 | Sofitel Barcelona Skipper | Sofitel | Barcelone, Espagne | Salesforce - contact center | 0.58 | 0.58 | À revoir |
| 11 | Pullman Toulouse Centre | Pullman | Toulouse, France | Expedia | 0.91 | 0.91 | Confiance haute |
| 12 | MGallery Strasbourg Cathédrale | MGallery | Strasbourg, France | Booking.com | 0.38 | 0.38 | Échec |
| 13 | Novotel Nantes Centre Gare | Novotel | Nantes, France | Expedia | 1 | 1.00 | Validée |
| 14 | ibis Rennes Centre Gare | ibis | Rennes, France | Booking.com | 0.76 | 0.76 | À revoir |

Marques : Novotel 3 (1, 7, 13), ibis 3 (2, 8, 14), Mercure 2 (3, 9), Sofitel 2 (4, 10), Pullman 2 (5, 11), MGallery 2 (6, 12).

Sources de fiche : Booking.com 7 (1, 3, 6, 7, 9, 12, 14), Expedia 5 (2, 5, 8, 11, 13), Salesforce - contact center 2 (4, 10).

Dans la démo, l'attribut « Coordonnées de contact » a toujours `src` = `Salesforce`, y compris quand la fiche vient de Booking.com ou d'Expedia. Sur les fiches 4 et 10, tous les attributs ont `src` = `Salesforce`, alors que la source de fiche est `Salesforce - contact center`.

### 7.5 Textes récurrents des valeurs, observés et non énumérés par le code

Le script traite `current` et `proposed` comme du texte libre. Les chaînes suivantes reviennent dans la démo ; rien ne les déclare comme liste fermée.

Valeur actuelle :

- « Non renseigné »
- « — » (tiret long seul, pour un contact vide)
- « Wifi »
- « Wifi, Parking »
- « Téléphone seul »
- « Image générique »
- « Photo basse résolution »
- « 3 étoiles », « 4 étoiles », « 5 étoiles »
- adresses réduites : code postal et ville (« 75015 Paris (code postal seul) », « 13001 Marseille », « 06000 Nice », « 59000 Lille », « 67000 Strasbourg », « 44000 Nantes », « 35000 Rennes ») ou « {ville} (ville seule) »

Valeur proposée, photos : « Photo façade HD (vue Seine) », « Photo façade HD », « Photo hall d'accueil HD », « Photo vue Garonne HD », « Photo façade historique HD », « Aucune photo exploitable collectée ».

Les descriptions proposées utilisent parfois le caractère ★ (U+2605), par exemple « 4★ », alors que la classification utilise le mot « étoiles ».

Le séparateur entre téléphone et e-mail est en général « · ». Exception à recopier telle quelle, fiche 9 : « +39 02 6749 9, h0319@accor.com » (virgule, pas de point médian).

### 7.6 Jeu de démonstration réinjectable

`statusInitial` est le statut calculé au chargement (clé interne). `statusLabelInitial` est le libellé français correspondant. Ni l'un ni l'autre ne sont des champs du littéral HTML : le script n'écrit que `score`, puis calcule `status`. `selected` et `accepted` sont l'état d'exécution initial. Tous les autres champs sont les littéraux du script.

```json
[
  {
    "id": 1,
    "name": "Novotel Paris Centre Tour Eiffel",
    "brand": "Novotel",
    "city": "Paris, France",
    "source": "Booking.com",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "75015 Paris (code postal seul)",
        "proposed": "61 Quai de Grenelle, 75015 Paris — 48.8496, 2.2865",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, salle de sport, bar panoramique, room service, parking payant",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ avec vue sur la Seine, à 10 min à pied de la Tour Eiffel, idéal séjours affaires et loisirs.",
        "score": 0.98,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 1 40 58 20 00 · h0367@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD (vue Seine)",
        "score": 0.97,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 2,
    "name": "ibis Lyon Part-Dieu",
    "brand": "ibis",
    "city": "Lyon, France",
    "source": "Expedia",
    "score": 0.92,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Lyon (ville seule)",
        "proposed": "28 Rue Maurice Flandin, 69003 Lyon — 45.7614, 4.8574",
        "score": 0.96,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking, parking privé sur réservation",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique proche gare Part-Dieu, accès direct métro et tramway.",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 4 72 68 31 00 · h1478@accor.com",
        "score": 0.92,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 3,
    "name": "Mercure Marseille Vieux-Port",
    "brand": "Mercure",
    "city": "Marseille, France",
    "source": "Booking.com",
    "score": 0.88,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "13001 Marseille",
        "proposed": "1 Rue Neuve Saint-Martin, 13001 Marseille — 43.2986, 5.3745",
        "score": 0.95,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi, Parking",
        "proposed": "Wifi gratuit, parking privé, bar, restaurant, salles de réunion (3)",
        "score": 0.86,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "À deux pas du Vieux-Port, hôtel 4★ au décor contemporain inspiré de la Méditerranée.",
        "score": 0.83,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 0.88,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 4 96 17 22 22 · h0542@accor.com",
        "score": 0.9,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo hall d'accueil HD",
        "score": 0.84,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 4,
    "name": "Sofitel Nice Riviera",
    "brand": "Sofitel",
    "city": "Nice, France",
    "source": "Salesforce - contact center",
    "score": 0.45,
    "statusInitial": "echec",
    "statusLabelInitial": "Échec",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "06000 Nice",
        "proposed": "12-14 Avenue Félix Faure, 06000 Nice — coordonnées non confirmées (conflit Booking/Expedia)",
        "score": 0.4,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Spa, piscine intérieure, 2 restaurants — liste partielle, doublons détectés",
        "score": 0.35,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Texte tronqué en cours de collecte, à retravailler avant publication.",
        "score": 0.3,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Classification (catégorie)",
        "current": "5 étoiles",
        "proposed": "4 étoiles (valeur contradictoire avec le PIM)",
        "score": 0.4,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 4 92 00 00 00 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 5,
    "name": "Pullman Bordeaux Aquitania",
    "brand": "Pullman",
    "city": "Bordeaux, France",
    "source": "Expedia",
    "score": 0.95,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Bordeaux (ville seule)",
        "proposed": "Rue Jean Samazeuilh, 33300 Bordeaux — 44.8547, -0.5678",
        "score": 0.97,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, piscine extérieure, bar, restaurant panoramique, centre d'affaires",
        "score": 0.96,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ face au Parc des Expositions, vue sur la Garonne depuis le bar au 15ème étage.",
        "score": 0.94,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 5 56 69 66 66 · h1445@accor.com",
        "score": 0.93,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo vue Garonne HD",
        "score": 0.92,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 6,
    "name": "MGallery Lille Vauban",
    "brand": "MGallery",
    "city": "Lille, France",
    "source": "Booking.com",
    "score": 0.62,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "59000 Lille",
        "proposed": "5 Square Daubenton, 59800 Lille — 50.6394, 3.0553",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar à vins, jardin intérieur — 2 équipements non confirmés",
        "score": 0.55,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Ancien couvent du 17ème siècle réhabilité, charme et caractère au cœur du Vieux-Lille.",
        "score": 0.75,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles (à confirmer)",
        "score": 0.5,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 3 20 06 58 58",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade historique HD",
        "score": 0.55,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 7,
    "name": "Novotel Amsterdam City",
    "brand": "Novotel",
    "city": "Amsterdam, Pays-Bas",
    "source": "Booking.com",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Amsterdam (ville seule)",
        "proposed": "Europaboulevard 10, 1083 AD Amsterdam — 52.3384, 4.8907",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, piscine, salle de sport, bar, parking privé",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel familial proche RAI Convention Centre, accès direct métro vers le centre-ville.",
        "score": 0.97,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+31 20 541 1123 · h1121@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD",
        "score": 0.98,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 8,
    "name": "ibis Berlin Mitte",
    "brand": "ibis",
    "city": "Berlin, Allemagne",
    "source": "Expedia",
    "score": 0.7,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Berlin (ville seule)",
        "proposed": "Prenzlauer Allee 4, 10405 Berlin — 52.5283, 13.4155",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking — équipements sport non confirmés",
        "score": 0.65,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique proche Alexanderplatz, accès rapide aux transports en commun.",
        "score": 0.72,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+49 30 443 1450 (email non confirmé)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.68,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 9,
    "name": "Mercure Milano Centro",
    "brand": "Mercure",
    "city": "Milan, Italie",
    "source": "Booking.com",
    "score": 0.83,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Milano (ville seule)",
        "proposed": "Via Napo Torriani 9, 20124 Milano — 45.4823, 9.2044",
        "score": 0.9,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, bar, salle de sport, salles de réunion (4)",
        "score": 0.85,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "À 200m de la gare centrale, hôtel 4★ au design contemporain pour voyageurs d'affaires.",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 0.85,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+39 02 6749 9, h0319@accor.com",
        "score": 0.78,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo hall d'accueil HD",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 10,
    "name": "Sofitel Barcelona Skipper",
    "brand": "Sofitel",
    "city": "Barcelone, Espagne",
    "source": "Salesforce - contact center",
    "score": 0.58,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Barcelona (ville seule)",
        "proposed": "Carrer de la Marina 16-18, 08005 Barcelona — 41.3874, 2.1979",
        "score": 0.7,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Spa, piscine sur toit, restaurant gastronomique — liste à vérifier (source unique)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Face à la plage de la Barceloneta, hôtel 5★ avec vue sur le port olympique.",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "5 étoiles (à confirmer)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+34 932 21 10 00",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 11,
    "name": "Pullman Toulouse Centre",
    "brand": "Pullman",
    "city": "Toulouse, France",
    "source": "Expedia",
    "score": 0.91,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Toulouse (ville seule)",
        "proposed": "84 Allées Jean Jaurès, 31000 Toulouse — 43.6096, 1.4558",
        "score": 0.95,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, salle de sport, bar, restaurant, parking privé",
        "score": 0.92,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ au cœur de la Ville Rose, à 5 min à pied de la place du Capitole.",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 5 61 10 23 10 · h1076@accor.com",
        "score": 0.88,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 12,
    "name": "MGallery Strasbourg Cathédrale",
    "brand": "MGallery",
    "city": "Strasbourg, France",
    "source": "Booking.com",
    "score": 0.38,
    "statusInitial": "echec",
    "statusLabelInitial": "Échec",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "67000 Strasbourg",
        "proposed": "Adresse en conflit entre sources — non résolue automatiquement",
        "score": 0.3,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Liste quasi vide — collecte incomplète côté source",
        "score": 0.25,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Texte générique non spécifique à l'établissement, à réécrire.",
        "score": 0.35,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "Non déterminée",
        "score": 0.2,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 3 88 32 10 10 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.6,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 13,
    "name": "Novotel Nantes Centre Gare",
    "brand": "Novotel",
    "city": "Nantes, France",
    "source": "Expedia",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "44000 Nantes",
        "proposed": "1 Boulevard de Stalingrad, 44000 Nantes — 47.2158, -1.5410",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, bar, restaurant, parking privé, salles de réunion (2)",
        "score": 0.98,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Face à la gare SNCF, hôtel 4★ idéal pour une clientèle affaires et TGV.",
        "score": 0.97,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 2 40 12 91 91 · h0567@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD",
        "score": 0.98,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 14,
    "name": "ibis Rennes Centre Gare",
    "brand": "ibis",
    "city": "Rennes, France",
    "source": "Booking.com",
    "score": 0.76,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "35000 Rennes",
        "proposed": "22 Boulevard Beaumont, 35000 Rennes — 48.1023, -1.6689",
        "score": 0.88,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking, parking payant",
        "score": 0.78,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique à 5 min à pied de la gare, proche du centre historique.",
        "score": 0.75,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 2 99 30 28 28 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.7,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  }
]

```

---

## 8. Interactions et règles métier

La logique tient dans un seul script, sans appel réseau. L'état vit dans le tableau `FICHES` et dans l'objet `state = { search: "", brand: "", source: "", tab: "all" }`.

### 8.1 Initialisation

1. Chaque attribut reçoit `accepted: null` s'il ne l'a pas déjà.
2. Chaque fiche reçoit `status = statusFor(score)` et `selected = false`.
3. Les listes sont remplies une fois, à partir des valeurs distinctes, tri UTF-16. Elles ne sont pas reconstruites ensuite.
4. Le premier rendu construit les onglets, les KPI, la barre, la légende, les lignes, masque la barre groupée et laisse le tiroir fermé.

### 8.2 Filtrage

Une fiche est visible si :

- l'onglet vaut `all` ou égale `fiche.status` ;
- la marque est vide ou égale `fiche.brand` ;
- la source est vide ou égale `fiche.source` ;
- la recherche est vide, ou sa version minuscule est contenue dans le nom minuscule ou dans la ville minuscule.

L'ordre des lignes reste l'ordre du tableau (id 1 → 14). Aucune colonne n'est triable : les en-têtes ne sont pas des boutons.

Les KPI, la barre et les compteurs d'onglets ignorent `search`, `brand` et `source`. Ils relisent toutes les fiches et leur `status` courant.

### 8.3 Sélection

- Cocher une ligne écrit `selected` sur la fiche, puis redessine tout.
- La case d'en-tête écrit `selected` pour chaque fiche visible seulement, avec la valeur de la case.
- Après rendu, la case d'en-tête est cochée si la liste visible est non vide et entièrement cochée.
- « Annuler » met `selected` à faux sur toutes les fiches.
- Le compteur de la barre compte les fiches `selected`, sans regarder le filtre.
- Ouvrir le tiroir ne change pas `selected`.

### 8.4 Tiroir

`openDrawer(id)` mémorise l'id, relit la fiche, remplit sourcil, titre, pastilles et cartes, ajoute la classe ouverte et passe `aria-hidden` à `false`.

Le clic ✓ ou ✕ compare la valeur demandée à `accepted`. Si elle est déjà cette valeur, `accepted` redevient `null`. Sinon il devient `true` (accepter) ou `false` (rejeter). Le tiroir est rouvert sur le même id, ce qui le redessine.

Échap ne ferme le tiroir que s'il est ouvert. Échap ne vide pas la sélection.

### 8.5 Validation

Pour la fiche du tiroir, ou pour chaque fiche cochée :

- `score = 1` ;
- `status = "valide"` ;
- en lot, `selected = false`.

Le statut n'est pas recalculé depuis les attributs. Les scores d'attributs ne sont pas mis à 1. Les drapeaux `accepted` ne sont pas mis à `true`.

Le bouton du tiroir ferme ensuite le tiroir et redessine. Le bouton de lot redessine sans fermer un tiroir déjà ouvert.

### 8.6 Rejet

Pour la fiche du tiroir, ou pour chaque fiche cochée :

- `status = "echec"` ;
- le score n'est pas modifié ;
- en lot, `selected = false`.

Les pastilles de la ligne utilisent `fiche.status` pour leur couleur et leur libellé, et `fiche.score` pour le nombre. Après rejet, un score de 0.95 s'affiche donc `0.95` dans une pastille Échec.

Les drapeaux `accepted` ne sont pas mis à `false`. Le score d'attribut ne change pas.

### 8.7 Ce que les actions ne font pas

- Elles n'éditent pas le texte proposé ni le texte PIM.
- Elles n'envoient rien à un serveur.
- Elles ne journalisent pas l'auteur ni l'heure.
- Elles ne comparent pas deux sources côte à côte au-delà du couple « valeur actuelle / valeur proposée ».
- Elles ne calculent pas le score global comme moyenne des scores d'attributs. Le score de fiche est une donnée, puis éventuellement forcé à 1.
- « Auto-validables » ne valide aucune fiche tout seul.

### 8.8 Formules de référence

Statut :

- si score ≥ 1 → `valide` ;
- sinon si score > 0.8 → `haute` ;
- sinon si score > 0.5 → `revoir` ;
- sinon → `echec`.

Auto-validables : entier le plus proche de `(valide + haute) / total × 100`, affiché avec `%` collé.

Pluriel du lot : si le nombre de fiches cochées est strictement supérieur à 1, « fiches sélectionnées », sinon « fiche sélectionnée ».

Pastille d'attributs : `"{longueur} attributs"`, au pluriel même si la longueur valait 1. Dans la démo la longueur vaut 6 pour chaque fiche.

---

## 9. Microcopie

Chaînes d'interface, dans l'ordre de lecture. Les contenus d'hôtels et d'attributs sont en section 7, pas ici.

### 9.1 Chrome visible

| Emplacement | Chaîne exacte |
| --- | --- |
| `title` | Validation PIM Hôtels (Copy) |
| `h1` | Validation des enrichissements |
| Sous-titre | PIM Accor · Fiches établissement |
| Badge | Maquette |
| KPI | Fiches traitées |
| KPI | Auto-validables |
| KPI | À revoir |
| KPI | Échec |
| Placeholder | Rechercher un hôtel, une ville… |
| Liste marque | Toutes les marques |
| Liste source | Toutes les sources |
| Onglet | Toutes |
| Onglet et pastille | Validée |
| Onglet et pastille | Confiance haute |
| Onglet, pastille et KPI | À revoir |
| Onglet, pastille et KPI | Échec |
| Colonne | Fiche établissement |
| Colonne | Source |
| Colonne | Attributs enrichis |
| Colonne | Score global |
| Colonne | Statut |
| Colonne | Actions |
| Ligne | {n} attributs |
| Ligne | Voir détail |
| Vide | Aucune fiche ne correspond à ces filtres. |
| Note | Exemple de données (maquette) — 14 fiches issues d'extractions Booking.com / Expedia / Salesforce, à des fins de démonstration de la mécanique de scoring et de revue. |
| Tiroir, clés | Valeur PIM actuelle |
| Tiroir, clés | Valeur proposée |
| Tiroir | Rejeter la fiche |
| Tiroir | Valider la fiche |
| Lot | Annuler |
| Lot | Rejeter la sélection |
| Lot | Valider la sélection |

### 9.2 Modèles dynamiques

| Modèle | Exemple réel |
| --- | --- |
| `{libellé de statut} ({compte})` | Validée (3) |
| `{n}%` | 57% |
| `{marque} · {ville} · {source}` | Novotel · Paris, France · Booking.com |
| `Score {score.toFixed(2)}` | Score 1.00 |
| `via {src}` | via Booking.com |
| `{n} attributs` | 6 attributs |
| `{n} fiche sélectionnée` | 1 fiche sélectionnée |
| `{n} fiches sélectionnées` | 2 fiches sélectionnées |

### 9.3 Textes accessibles, non visibles comme libellés

| Support | Chaîne |
| --- | --- |
| Case d'en-tête | Tout sélectionner |
| Case de ligne | Sélectionner {nom} |
| Fermeture | Fermer le détail |
| ✓ | Accepter cet attribut |
| ✕ | Rejeter cet attribut |

### 9.4 Libellés de domaine affichés sur chaque fiche

Adresse & géolocalisation ; Équipements & services ; Description commerciale ; Classification (catégorie) ; Coordonnées de contact ; Photo de couverture.

### 9.5 Ponctuation à conserver

- Point médian `·` : sous-titre, sourcil du tiroir, téléphone et e-mail (sauf la fiche 9).
- Tiret long `—` : note de bas de page, adresses proposées (avant les coordonnées ou la réserve), contact vide « — ».
- Points de suspension du placeholder : caractère unique `…` (U+2026), dans « Rechercher un hôtel, une ville… ».
- Étoile `★` dans certaines descriptions proposées.
- Apostrophe ASCII dans « d'extractions », « d'affaires », « l'établissement », « d'accueil ».

---

## 10. Assets et dépendances

### 10.1 Polices

Lien déclaré :

`https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap`

Preconnect déclaré : `https://fonts.googleapis.com` seulement. La feuille Google charge ensuite les fichiers de police (hôte habituel `fonts.gstatic.com`) ; ce second hôte n'est pas écrit dans le HTML.

| Famille | Graisses demandées au CDN | Graisses réellement utilisées par le CSS |
| --- | --- | --- |
| Fraunces, axe optique 9..144 | 500, 600, 700 | 600 sur `h1`–`h3` |
| Public Sans | 400, 500, 600, 700 | 400 (corps), 500 (champs, pastille d'attributs, valeur proposée), 600 (la plupart des libellés) |
| IBM Plex Mono | 500, 600 | 600 (KPI, pastille de score, compteur d'onglet) |

Fraunces 500 et 700, Public Sans 700 et IBM Plex Mono 500 sont demandés et ne sont référencés par aucune règle `font-weight`.

Secours si la police ne charge pas : Georgia pour les titres ; `-apple-system` puis Segoe UI pour le texte ; `monospace` pour les chiffres.

### 10.2 Icônes, images, scripts

- Aucune balise `img`, aucun SVG, aucun favicon, aucune image de couverture. Les « photos » sont des phrases.
- Icônes = caractères : 🏨 (U+1F3E8), ✓ (U+2713), ✕ (U+2715). Les points de statut sont des éléments `i` stylés en disques, sans contenu texte.
- Aucune bibliothèque JavaScript. Le comportement est un script inline en fin de `body`.
- Aucun autre CDN.

### 10.3 Document

- `<!doctype html>`, `charset=utf8`.
- Viewport : `width=device-width, initial-scale=1, viewport-fit=cover`.
- Pas de `lang` sur `<html>`.
- La balise `title` est dans le `body`, avant le second bloc de style. Les navigateurs l'utilisent quand même comme titre d'onglet : « Validation PIM Hôtels (Copy) ».

---

## 11. Accessibilité observée

### 11.1 Présent dans le HTML

- Case d'en-tête : `aria-label="Tout sélectionner"`.
- Case de ligne : `aria-label="Sélectionner {nom}"`.
- Panneau : `role="dialog"`, `aria-modal="true"`, `aria-labelledby="drawerTitle"`.
- Tiroir : `aria-hidden` vrai quand il est fermé, faux quand il est ouvert.
- Fermeture : `aria-label="Fermer le détail"`.
- ✓ : `aria-label="Accepter cet attribut"`.
- ✕ : `aria-label="Rejeter cet attribut"`.
- Le libellé de statut est du texte à côté du point coloré, dans la légende et dans la pastille.
- Focus clavier visible sur les champs, les onglets et les boutons `.btn` (contour accent).
- `color-scheme` suit le thème, les cases utilisent `accent-color`.
- `prefers-reduced-motion` coupe les animations.
- Safe areas et `viewport-fit=cover`.
- « Voir détail » est un bouton, donc le détail est atteignable au clavier sans cliquer la ligne.
- Échap ferme le tiroir ouvert.

### 11.2 Absent du HTML

- Pas d'attribut `lang`.
- Pas de lien d'évitement.
- La recherche n'a ni `label`, ni `aria-label`. Seul le placeholder la nomme.
- Les deux listes n'ont pas de libellé associé. L'option vide (« Toutes les marques », « Toutes les sources ») sert de nom visible une fois le contrôle refermé.
- Les onglets n'ont pas `role="tablist"`, `role="tab"`, ni `aria-selected`. L'état actif est une classe.
- Le tableau n'a pas de `caption`. Les `th` n'ont pas `scope`.
- Le message vide n'a pas `aria-live`. Les KPI, les compteurs et la barre groupée non plus.
- Le tiroir ne déplace pas le focus à l'ouverture, ne le rend pas à la ligne à la fermeture, et ne piège pas la tabulation. `aria-modal="true"` est posé, mais le reste de la page n'est pas `inert` : on peut tabuler vers la liste derrière le voile.
- Le voile n'est pas un bouton. Il se ferme au clic et via Échap, pas au clavier direct.
- « Voir détail », la fermeture du tiroir et les boutons ✓ / ✕ n'ont pas le contour `:focus-visible` des boutons `.btn`.
- Les segments de la barre de statuts n'ont pas de nom accessible propre ; la légende voisine porte le texte.
- L'emoji 🏨 n'a pas `aria-hidden`. Les `i` des points sont vides.
- Aucun état `disabled`, aucun `aria-disabled`, aucun message d'erreur associé à un champ.
- Reconstruire les onglets à chaque rendu retire le focus du bouton d'onglet activé.

Le contraste des couples texte / fond n'est pas mesuré dans la maquette. Couples à vérifier lors de la duplication, parce que le CSS les fixe ainsi : `#fff` sur `--accent` (`#14586B` en clair, `#5CB4C6` en sombre), texte `--text-faint` en 10.5–11px, barre groupée inversée.

---

## 12. Écarts et zones ambiguës

Le HTML suggère ces sujets sans les trancher. Les dupliquer fidèlement, c'est reproduire le comportement décrit plus haut, pas combler les trous.

1. Le titre d'onglet est « Validation PIM Hôtels (Copy) » et le titre visible est « Validation des enrichissements ». Le fichier ne dit pas lequel est le nom du produit, ni si « (Copy) » doit rester.
2. Le badge « Maquette » et la note de bas de page présentent l'écran comme une démonstration. Le fichier ne dit pas s'ils restent dans le produit.
3. Aucune session utilisateur. On ne sait pas qui valide, ni si l'action est définitive, réversible ou soumise à un autre rôle.
4. Accepter ou rejeter un attribut est purement visuel. Le fichier ne dit pas si ce choix doit peser sur le score, bloquer « Valider la fiche », ou être enregistré.
5. « Valider la fiche » force le score à 1 même si des attributs sont rejetés ou encore neutres. « Rejeter la fiche » ne change pas le score. Aucune règle écrite ne dit si ce découplage est voulu.
6. Après un rejet, la couleur du score suit le statut Échec alors que le nombre peut rester au-dessus de 0.8. Le rendu relit le statut déjà porté par la fiche et ne relance pas la règle de score. Le fichier ne dit pas si ce découplage doit rester.
7. « Auto-validables » additionne Validée et Confiance haute. Rien ne déclenche cette validation. Le seuil « confiance haute » (score > 0.8) n'est pas expliqué dans l'interface.
8. Les compteurs d'onglets, les KPI et la barre ignorent la recherche et les listes. On ne sait pas si c'est un choix de pilotage (vue globale) ou un oubli.
9. « Tout sélectionner » ne concerne que les lignes visibles, alors que le lot agit aussi sur les lignes cochées masquées. Le fichier ne prévient pas l'opérateur.
10. La case d'en-tête ne montre pas l'état mixte.
11. La recherche ne parcourt pas la marque, la source ni les attributs, et ne normalise pas les accents ni les espaces.
12. Deux libellés de source coexistent : « Salesforce - contact center » sur la fiche et « Salesforce » sur l'attribut. Le filtre ne propose que la première forme. Rien ne dit comment les rattacher.
13. Les valeurs « Non renseigné », « — », « Téléphone seul », « Image générique », « Photo basse résolution » ressemblent à un vocabulaire, mais le code les traite comme du texte libre.
14. La photo, l'adresse et les coordonnées GPS sont du texte. Pas de carte, pas de lien e-mail ou téléphone, pas de lien vers Booking.com, Expedia ou Salesforce.
15. Pas d'édition, de commentaire, de motif de rejet, ni de comparaison de plus de deux valeurs.
16. Pas de tri, de pagination, ni de persistance. La liste ne grandit pas et ne rétrécit pas.
17. Pas de message de succès ni de confirmation. On ne sait pas si le produit doit en ajouter.
18. Le thème sombre est prévu par le CSS, sans contrôle à l'écran. On ne sait pas si un interrupteur est attendu.
19. Les listes perdent leur flèche native (`appearance: none`) et aucune flèche de remplacement n'est dessinée.
20. Le focus quitte l'onglet à chaque clic, parce que les boutons sont recréés.
21. Le tiroir annonce une modale sans piéger le focus ni geler l'arrière-plan. Le défilement de la page derrière n'est pas bloqué.
22. Sous 560 px les KPI disparaissent sans version de remplacement.
23. Le style de `h3` et plusieurs graisses de polices chargées ne servent aucun élément.
24. Le score global n'est pas défini comme une agrégation des six scores. Toute formule de moyenne serait une invention.
25. Les e-mails `@accor.com`, téléphones et coordonnées sont des données de démo. Le fichier ne dit pas s'ils sont fictifs à remplacer.

---

## 13. Exigence i18n FR + EN

Le produit cible doit présenter l'interface en français et en anglais. La maquette ne contient que le français : elle est la source des chaînes FR. Aucune traduction anglaise n'y figure ; cette spécification n'en fournit pas. Il faudra un passage de traduction, pas une invention au fil de l'implémentation.

La locale active doit piloter la langue de la page (`lang`), les chaînes et les règles de pluriel. Le format d'affichage des scores dans la maquette est le point décimal et deux chiffres (`1.00`, `0.90`), et le pourcentage est collé (`57%`). Le fichier ne montre pas la variante française avec virgule ni espace avant `%`. Tant que la maquette est la référence visuelle du français, ces formats restent ceux du FR de la démo ; l'anglais n'est pas spécifié.

Il n'y a pas de sélecteur de langue dans la maquette. Son emplacement n'est pas spécifié ici.

### 13.1 Chaînes d'interface à externaliser

À cataloguer en FR (valeur ci-dessous) et en EN (à produire) :

- Validation PIM Hôtels (Copy)
- Validation des enrichissements
- PIM Accor · Fiches établissement
- Maquette
- Fiches traitées
- Auto-validables
- À revoir
- Échec
- Rechercher un hôtel, une ville…
- Toutes les marques
- Toutes les sources
- Toutes
- Validée
- Confiance haute
- Fiche établissement
- Source
- Attributs enrichis
- Score global
- Statut
- Actions
- Voir détail
- Aucune fiche ne correspond à ces filtres.
- Exemple de données (maquette) — 14 fiches issues d'extractions Booking.com / Expedia / Salesforce, à des fins de démonstration de la mécanique de scoring et de revue.
- Valeur PIM actuelle
- Valeur proposée
- Rejeter la fiche
- Valider la fiche
- Annuler
- Rejeter la sélection
- Valider la sélection
- Tout sélectionner
- Fermer le détail
- Accepter cet attribut
- Rejeter cet attribut

Modèles à externaliser avec variables, pas par concatenation figée :

| Modèle FR | Variables | Pluriel dans la maquette |
| --- | --- | --- |
| `{label} ({count})` | libellé de statut, compte | — |
| `{n}%` | entier | — |
| `{brand} · {city} · {source}` | trois textes | — |
| `Score {score}` | score déjà formaté | — |
| `via {src}` | source d'attribut | — |
| `{n} attributs` | longueur | Toujours le pluriel « attributs » |
| `{n} fiche sélectionnée` | n ≤ 1 | Singulier |
| `{n} fiches sélectionnées` | n > 1 | Pluriel |
| `Sélectionner {name}` | nom d'hôtel | — |

Les clés internes `all`, `valide`, `haute`, `revoir`, `echec` restent des codes. Seuls les libellés sont traduits.

### 13.2 Chaînes de domaine affichées

Les six noms d'attribut sont stables dans la démo et visibles. Les cataloguer à part du contenu libre :

- Adresse & géolocalisation
- Équipements & services
- Description commerciale
- Classification (catégorie)
- Coordonnées de contact
- Photo de couverture

Les noms d'hôtels, villes, marques, sources, adresses, descriptions, téléphones, e-mails et mentions de photos sont des données de la section 7. Les traduire ou non est une décision de contenu PIM, absente de la maquette. Les noms propres de marque (Novotel, ibis, Mercure, Sofitel, Pullman, MGallery) et les noms de sources (Booking.com, Expedia, Salesforce, Salesforce - contact center) sont à conserver comme données, pas comme chaînes d'interface.

Les valeurs récurrentes « Non renseigné », « Téléphone seul », « Image générique », « Photo basse résolution », « Aucune photo exploitable collectée », « Non déterminée » et les formulations « N étoiles » sont du contenu de démo en français. Si le produit les élève au rang de vocabulaire contrôlé, elles entreront dans le catalogue. La maquette ne le décide pas.
