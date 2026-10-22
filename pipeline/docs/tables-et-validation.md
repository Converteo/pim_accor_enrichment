# Tables BigQuery et validation humaine

À qui s'adresse ce document : au développeur du backend et du front. Il décrit chaque table et chaque vue du pipeline, puis ce
que le backend fait quand un relecteur valide ou rejette dans l'interface. Complète [contrat-back.md](contrat-back.md).

Projet `cvto-accor-pim-enrichment-<env>`, datasets `cvto_accor_pim_enrichment_<env>_euw1_<espace>` (ci-dessous : `raw`,
`matching`, `validation`, `enhanced`). Schémas : `pipeline/jobs/src/schemas/`, vues : `pipeline/jobs/src/views/`.

```
raw ──(job matching)──► matching.match_candidates ──(agent juge)──► matching.match_judgments
                                   │                                          │
                                   └──────────────► v_matches ◄───────────────┘ ◄── validation.match_decisions        ① relecteur
                                                       │
                                               v_approved_matches
                                                       │
            (agent d'enrichissement : cibles, puis valeurs)
                                                       ▼
                       enhanced.enrichment_candidates ──(agent)──► enhanced.enrichment_proposals
                                   │                                          │
                                   └──────────────► v_enrichments ◄───────────┘ ◄── validation.enrichment_decisions   ② relecteur
                                                       │
                                             v_approved_enrichments ──(job export)──► enhanced.exports + fichier plat
```

Règle commune : **les jobs et le backend n'écrivent qu'en ajout** (jamais d'`UPDATE` ni de `DELETE`). Les vues calculent l'état
courant : la dernière ligne l'emporte, et une décision humaine l'emporte toujours sur l'agent.

## 1. Les tables et les vues

### `raw` : données brutes

| Table | Écrite par | Utilité |
| --- | --- | --- |
| `booking_equipements`, `booking_piscines`, `expedia` | service de chargement, à chaque dépôt | Une table par source de scraping. Chaque dépôt est conservé (`depot_id`, `load_dts`) ; les jobs lisent la dernière ligne de chaque RID. |
| `pim_product` | job d'extraction | Une ligne par hôtel du PIM (`entity_id`, `ProductRid`, puis une colonne par champ, codes PIM bruts). Sans contacts ni données personnelles. Remplacée à chaque extraction. |
| `pim_parking`, `pim_pool`, `pim_restaurant`, `pim_bar`, `pim_breakfast`, `pim_wellnesscenter`, `pim_fitnesscenter`, `pim_sport` | job d'extraction | Une ligne par entité liée à un hôtel (`entity_id`, `rid`, champs). Un hôtel peut avoir plusieurs parkings ou piscines. |
| `pim_model` | job d'extraction | Le modèle : pour chaque champ, son type (`data_type`), sa liste de valeurs (`cvl_id`), s'il est multi-valeur. |
| `pim_cvl_values` | job d'extraction | Les codes autorisés de chaque liste (`cvl_id`, `key`) et leur libellé anglais. |

Le backend n'a pas besoin de lire `raw`, sauf pour contrôler une valeur corrigée (voir § 3.3).

### `matching` : rapprochement et agent juge

| Table / vue | Écrite par | Utilité |
| --- | --- | --- |
| `match_candidates` | job matching | Une ligne par **RID × source** : identité PIM (`pim_name`, `pim_city`, `pim_brand`…), identité scrapée (`scraped_name`, `url`, `page_name`…), contrôle déterministe (`pre_verdict`, `pre_reason`) et empreinte `source_hash`. Recalculée à chaque passage. |
| `unknown_rids` | job matching | RID présents dans un scraping mais introuvables dans le PIM (pour information). |
| `match_judgments` | agent juge | Note de l'agent : `verdict`, `score` (0-100), `confidence`, `reason`, `justification`, `status` (statut avec les seuils par défaut, pour mémoire). En ajout : un nouveau jugement seulement si l'empreinte change. |
| `v_matches` (vue) | — | **Vue de l'écran des rapprochements.** Candidat + dernier jugement + dernière décision humaine, avec `final_status`. Le statut automatique (`auto_status`) est calculé à la lecture avec les seuils en vigueur (`approve_threshold`, `reject_threshold`) ; `auto_eligible` et `auto_approvable` disent si les seuils s'appliquent. |
| `v_approved_matches` (vue) | — | Les rapprochements qui passent à l'enrichissement : `final_status` = `auto_approved` ou `human_approved`. |

`final_status` d'un rapprochement : `pending_judgment` (pas encore noté ; l'équivalent pour une valeur est `pending_enrichment`), `auto_approved` (note ≥ seuil de validation, 80 par défaut, et verdict `same_hotel`), `needs_review` (entre les deux seuils),
`auto_rejected` (note < seuil de rejet, 30 par défaut, ou autre pays), `human_approved`, `human_rejected`.

### `validation` : décisions humaines (écrites par le backend)

| Table | Utilité |
| --- | --- |
| `match_decisions` | Une ligne par décision sur un rapprochement : `rid`, `source`, `source_hash`, `decision` (`human_approved` ou `human_rejected`), `comment`, `author`, `decided_at`. |
| `enrichment_decisions` | Une ligne par décision sur une valeur : `enrichment_id`, `rid`, `pim_field`, `entity_id`, `decision` (`human_approved`, `human_rejected` ou `human_corrected`), `corrected_value`, `comment`, `author`, `decided_at`. |
| `auto_validation_settings` | Une ligne par réglage des seuils dans l'interface : `step` (`match` ou `enrichment`), `approve_threshold`, `reject_threshold` (toujours renseignés depuis l'interface), `comment`, `author`, `set_at`. La dernière ligne de chaque étape s'applique ; sans ligne, les valeurs par défaut de Terraform. |

Ce sont les **seules tables écrites par le backend.**

### `enhanced` : enrichissements et exports

| Table / vue | Écrite par | Utilité |
| --- | --- | --- |
| `enrichment_candidates` | job d'enrichissement (code, sans IA) | **Équivalent de `match_candidates` pour les valeurs.** Une ligne par hôtel × champ × entité à enrichir, pour chaque hôtel dont un rapprochement est validé : `family`, `rid`, `entity`, `entity_id`, `pim_field`, `label`, `priority`, `pim_value`, `source_hash` (empreinte du contenu de l'hôtel). Réécrite pour la famille quand ses cibles changent ; les vues lisent le dernier ensemble. |
| `enrichment_proposals` | agent d'enrichissement | Toutes les réponses de l'agent, une ligne par hôtel × champ × entité et par passage : `enrichment_id`, `family`, `priority`, `entity`, `entity_id`, `pim_field`, `label`, `pim_value`, `value`, `value_label`, `method`, `source`, `source_field`, `source_excerpt`, `score`, `confidence`, `warning`, `status`, `reason`, `reason_detail`, `source_hash`, `prompt_version`. |
| `v_enrichments` (vue) | — | **Vue de l'écran des fiches.** Dernière ligne par hôtel × champ × entité, plus la dernière décision humaine sur cette ligne, et une ligne `pending_enrichment` par cible pas encore enrichie : `final_status`, `final_value` (la valeur corrigée le cas échéant), `author`, `decided_at`. |
| `v_approved_enrichments` (vue) | — | Ce qui part à l'export : `final_status` = `human_approved`, `human_corrected` ou `auto_approved`, et dont le rapprochement est toujours validé. |
| `exports` | job export | Historique des exports : `path` (dossier du bucket), `row_count`, `hotel_count`, `files`, `triggered_by`, `exported_at`. |

`final_status` d'une valeur :

| Statut | Sens | Dans l'interface |
| --- | --- | --- |
| `pending_enrichment` | cible d'un rapprochement validé, pas encore enrichie (ou dont le contenu a changé depuis) | « en cours » ou masqué |
| `needs_review` | valeur proposée par l'agent pour un champ vide, extrait à l'appui, entre les deux seuils | **à valider** |
| `auto_approved` | score ≥ seuil de validation (85 par défaut), sans alerte, méthode autre que `inferred` | « Validés automatiquement » |
| `auto_rejected` | rien à proposer, motif dans `reason` (ci-dessous) et texte dans `reason_detail` | masqué, sauf `pim_conflict` |
| `human_approved`, `human_corrected`, `human_rejected` | décision du relecteur | historique |

`reason` d'une valeur `auto_rejected` :

| `reason` | Cas | Dans l'interface |
| --- | --- | --- |
| `not_in_sources` | l'agent n'a rien trouvé dans les sources | masqué |
| `model_omitted` | la cible manque dans la réponse du modèle ; redemandée au passage suivant, jusqu'à 3 fois pour un même contenu | masqué |
| `already_in_pim` | la source confirme la valeur du PIM | masqué |
| `pim_conflict` | la source contredit le PIM (`reason_detail` : « le PIM contient … ») ; le PIM n'est jamais écrasé | à afficher pour information |
| `no_excerpt` | valeur sans extrait de la source | masqué |
| `not_in_pim_list` | code absent de la liste du PIM | masqué |
| `invalid_format` | heure, booléen ou nombre mal formé, valeur vide, plusieurs valeurs pour un champ simple | masqué |
| `low_score` | score sous le seuil de rejet en vigueur (posé par `v_enrichments` à la lecture, pas par le job) | masqué |

## 2. Le parcours d'une fiche en relecture

Une **fiche** dans l'interface = un **hôtel (RID)**. Ses **attributs** = ses lignes de `v_enrichments` au statut
`needs_review`, une par champ × entité. Une fiche passe par deux validations, dans cet ordre :

1. **① Valider le rapprochement** (hôtel × source), seulement s'il est `needs_review`. Tant qu'il n'est pas validé, l'hôtel n'a
   aucun attribut proposé pour cette source : il n'y a rien à afficher dans la fiche.
2. **② Valider les attributs** proposés. Ils n'apparaissent qu'une fois le rapprochement validé (automatiquement ou par ①),
   après le passage suivant du pipeline.

Requête de la liste des fiches à relire :

```sql
SELECT e.rid, COUNT(*) AS attributs, ROUND(AVG(e.score)) AS score_moyen
FROM `…_enhanced.v_enrichments` e
WHERE e.final_status = 'needs_review'
  AND EXISTS (SELECT 1 FROM `…_matching.v_approved_matches` r WHERE r.rid = e.rid AND r.source = e.source)
GROUP BY e.rid
```

Le filtre `EXISTS` est **obligatoire** : si un relecteur rejette un rapprochement déjà enrichi, les valeurs de cette source
restent dans la table mais ne doivent plus être proposées (et ne partent pas à l'export).

Détail d'une fiche : les mêmes lignes sans `GROUP BY`, avec `family`, `label`, `entity`, `entity_id`, `pim_value`, `value`,
`value_label`, `source`, `source_field`, `source_excerpt`, `score`, `confidence`, `warning`, `reason_detail`. L'extrait est la
justification à montrer au relecteur.

À afficher à part, pour information : les champs encore `pending_enrichment` de l'hôtel (« en cours d'enrichissement ») et ses
valeurs `auto_rejected` de motif `pim_conflict` (la source contredit le PIM, `reason_detail` donne la valeur du PIM).

### Exemple de bout en bout : l'hôtel B6F6

Valeurs illustratives (identifiants, extraits et auteur abrégés ou inventés). Ce qu'on suit : quelle ligne est écrite où,
et ce que les vues en déduisent.

**Étape 1 : l'agent juge hésite.** Le job matching a écrit le candidat B6F6 × `booking_equipements`, l'agent juge le note :

`matching.match_judgments`

| rid | source | source_hash | score | status | reason | justification |
| --- | --- | --- | --- | --- | --- | --- |
| B6F6 | booking_equipements | `9c1e…` | 62 | `needs_review` | `other` | même ville, nom proche, adresse non confirmée |

Les codes (`status`, `reason`…) sont en anglais ; les textes lus par les relecteurs (`justification`, `pre_reason`, `warning`,
`reason_detail`) restent en français. Rapprochements et valeurs suivent la même convention : `needs_review` attend un relecteur,
`auto_*` est décidé par la machine, `human_*` par un relecteur.

`v_matches` → `final_status = needs_review`. L'hôtel n'est **pas** dans `v_approved_matches` : il n'est pas enrichi.

**Étape 2 : le relecteur valide le rapprochement (①).** Le backend ajoute une ligne :

`validation.match_decisions`

| rid | source | source_hash | decision | author | decided_at |
| --- | --- | --- | --- | --- | --- |
| B6F6 | booking_equipements | `9c1e…` | `human_approved` | j.martin@accor.com | 2026-10-21 09:12 |

`match_judgments` n'est pas modifiée. `v_matches` combine les deux : `final_status = human_approved` (l'humain l'emporte sur
la note de 62). L'hôtel entre dans `v_approved_matches`.

**Étape 3 : le pipeline enrichit l'hôtel** au passage suivant. L'agent d'enrichissement écrit dans `enhanced.enrichment_proposals` :

| enrichment_id | rid | pim_field | pim_value | value | source_excerpt | score | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a41f…` | B6F6 | ProductFitnessCenter | *(vide)* | True | « Salle de sport » | 92 | `needs_review` |
| `b7d0…` | B6F6 | WellnessCenterFreeWellnessCenterServices | *(vide)* | Hammam\|Sauna | « Sauna ; Hammam (payant) » | 70 | `needs_review` |
| `c2e9…` | B6F6 | ProductAvailableWellnessCenter | True | True | « Spa et centre de bien-être » | 95 | `auto_rejected` (`already_in_pim`) |

La fiche B6F6 apparaît dans la liste avec **2 attributs** à relire (les lignes `needs_review`) ; la 3ᵉ confirme le PIM et est masquée.

**Étape 4 : le relecteur traite les attributs (②).** Il valide la salle de sport et corrige les services gratuits, car
l'extrait dit que le hammam est payant. Le backend ajoute deux lignes :

`validation.enrichment_decisions`

| enrichment_id | rid | pim_field | decision | corrected_value | author | decided_at |
| --- | --- | --- | --- | --- | --- | --- |
| `a41f…` | B6F6 | ProductFitnessCenter | `human_approved` | | j.martin@accor.com | 2026-10-21 10:03 |
| `b7d0…` | B6F6 | WellnessCenterFreeWellnessCenterServices | `human_corrected` | Sauna | j.martin@accor.com | 2026-10-21 10:04 |

`enrichment_proposals` n'est pas modifiée. `v_enrichments` en déduit :

| pim_field | value | final_status | final_value |
| --- | --- | --- | --- |
| ProductFitnessCenter | True | `human_approved` | True |
| WellnessCenterFreeWellnessCenterServices | Hammam\|Sauna | `human_corrected` | Sauna |

Les deux lignes entrent dans `v_approved_enrichments` et partiront à l'export avec `final_value`. La fiche n'a plus
d'attribut `needs_review` : elle sort de la liste.

**Étape 5 (facultative) : le relecteur change d'avis.** Il rejette finalement la salle de sport. Le backend **ajoute** une
troisième ligne (`a41f…`, `human_rejected`, 2026-10-21 14:30) ; la ligne `human_approved` de 10:03 reste dans la table comme historique.
La vue ne retient que la plus récente : `final_status = human_rejected`, la valeur ne part plus à l'export.

**Ce que montre l'exemple :**
- Les tables des jobs (`match_judgments`, `enrichment_proposals`) ne sont **jamais modifiées** par le backend ; un nouveau passage du
  pipeline peut les réécrire sans effacer une décision humaine.
- Les tables `*_decisions` ne font que **grossir** : tout l'historique (qui, quoi, quand) est conservé.
- L'état réel se lit **uniquement dans les vues** `v_*`, qui superposent la dernière décision aux propositions des agents.

## 3. Ce que fait le backend à chaque décision

Dans tous les cas : **une ligne ajoutée** dans la table de décisions, avec `author` (identité du relecteur, obligatoire) et
`decided_at` (heure du serveur, UTC). Pas de mise à jour, pas de suppression : la vue prend la dernière décision. Une décision
sur plusieurs éléments (validation en masse) = plusieurs lignes dans le même `INSERT`.

### 3.1 Rapprochement validé ou rejeté (①)

```sql
INSERT INTO `…_validation.match_decisions` (rid, source, source_hash, decision, comment, author, decided_at)
VALUES (@rid, @source, @source_hash, 'human_approved', @comment, @author, CURRENT_TIMESTAMP())   -- ou 'human_rejected'
```

- `source_hash` est lu dans `v_matches` au moment de l'affichage et renvoyé tel quel. Il lie la décision à la page vue
  par le relecteur : si un nouveau scraping change la page, l'empreinte change, la décision ne s'applique plus et le
  rapprochement est rejugé. C'est voulu.
- **Validé** : le rapprochement entre dans `v_approved_matches`. L'hôtel est enrichi pour cette source **au passage
  suivant du pipeline** (planificateur toutes les 15 minutes ; il est en pause sur dev pour l'instant, voir § 4).
- **Rejeté** : la source n'est jamais utilisée pour cet hôtel. Si elle avait déjà été enrichie, ses valeurs sortent de la liste
  des fiches et de l'export grâce au filtre `EXISTS`.

### 3.2 Attribut validé ou rejeté (②)

```sql
INSERT INTO `…_validation.enrichment_decisions`
  (enrichment_id, rid, pim_field, entity_id, decision, corrected_value, comment, author, decided_at)
VALUES (@enrichment_id, @rid, @pim_field, @entity_id, 'human_approved', NULL, @comment, @author, CURRENT_TIMESTAMP())
-- rejet : 'human_rejected' ; correction : 'human_corrected' avec corrected_value
```

- `enrichment_id`, `rid`, `pim_field`, `entity_id` sont repris de la ligne de `v_enrichments` affichée.
- **Validé** (`human_approved`) : la valeur part à l'export.
- **Rejeté** (`human_rejected`) : la valeur ne part pas à l'export ; le champ reste tel qu'il est dans le PIM.
- **Valider ou rejeter toute la fiche** = une ligne par attribut `needs_review` de l'hôtel, avec la même décision. La note de l'agent
  (`score`) ne change pas : contrairement à la maquette actuelle, valider une fiche ne la met pas à 1.

### 3.3 Attribut corrigé

`decision = 'human_corrected'` et `corrected_value` au **format PIM** : code de la liste (`key` de `pim_cvl_values`, jamais le
libellé), `True`/`False`, heure `HH:MM`, nombre ; plusieurs codes séparés par `|`. La vue renvoie alors `final_value` =
`corrected_value`.

Le backend doit contrôler la valeur avant d'écrire (le code existe-t-il dans la liste du champ ?). Il lit pour cela la vue
`enhanced.v_field_allowed_values` (une ligne par champ × code : `entity_type, pim_field, label, data_type, multivalue, cvl_id,
key, value_label`, `key` NULL pour un champ sans liste), construite sur `raw.pim_model` et `raw.pim_cvl_values`. C'est une
**vue autorisée** sur `raw` : le compte de service du backend n'a pas accès à `raw`.

### 3.4 Revenir sur une décision

Une nouvelle décision remplace la précédente (dernière ligne). Il n'existe pas de décision « remettre en attente » : si le
besoin existe, il faut l'ajouter aux valeurs autorisées et aux vues.

## 4. Points d'attention

- **Nouvel enrichissement d'un hôtel = nouvelles lignes, décisions à reprendre.** `enrichment_id` est tiré au hasard à chaque
  passage de l'agent. Un hôtel n'est ré-enrichi que si quelque chose change (nouveau scraping, nouvelle version des prompts,
  nouveau rapprochement validé) ; dans ce cas, ses nouvelles valeurs repartent en `needs_review`, et les décisions prises sur les
  anciennes lignes ne s'appliquent plus. Reporter une décision quand la nouvelle valeur est identique est une évolution
  possible du pipeline, pas encore faite.
- **Délai entre ① et ②** : après la validation d'un rapprochement, les attributs apparaissent au passage suivant du pipeline.
  Sur dev, le planificateur est en pause : il faut le reprendre (`scheduler_paused = false` dans `terraform.tfvars`) ou lancer
  le workflow à la main.
- **Identité du relecteur** : `author` est obligatoire. L'interface est publique aujourd'hui, sans authentification ; il faudra
  une identité (IAP, SSO Accor…) avant de charger des données réelles.
- **Export** : le backend lance le job `gcrj-…-export` (`jobs.run`, droit `run.invoker` déjà donné) quand plus rien n'est en
  attente. Le job le vérifie lui-même et refuse sinon. Requête du nombre d'éléments en attente : voir
  [contrat-back.md](contrat-back.md) § 3.
