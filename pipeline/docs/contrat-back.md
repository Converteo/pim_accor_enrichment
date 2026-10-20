# Contrat entre le pipeline et le backend

Ce que le backend lit et écrit pour faire valider les rapprochements et les enrichissements dans l'interface.
Le pipeline ne connaît pas l'interface : il lit uniquement les décisions écrites dans BigQuery.

Datasets (un jeu par environnement, `<base>` = `cvto_accor_pim_enrichment_<env>_euw1`) :

| Dataset | Accès du SA backend | Contenu |
| --- | --- | --- |
| `<base>_matching` | lecture | rapprochements RID × source, jugements de l'agent juge, vue `v_matches` |
| `<base>_enhanced` | lecture | valeurs proposées par l'agent, vue `v_enrichments`, historique `exports` |
| `<base>_validation` | lecture et écriture | décisions humaines (`match_decisions`, `enrichment_decisions`) |

Le SA backend a aussi `roles/bigquery.jobUser` sur le projet, `run.invoker` sur le job d'export et la lecture du bucket des exports.
Les schémas des tables sont dans `pipeline/jobs/src/schemas/`, les vues dans `pipeline/jobs/src/views/`.

## 1. Rapprochements (bloquant)

Un hôtel n'est enrichi avec une source que si son rapprochement est validé. Il faut donc un écran pour les rapprochements
`needs_review` : sans décision, ces hôtels restent en attente.

**Lire** : `<base>_matching.v_matches`, une ligne par RID × source × page (`rid`, `source`, `source_hash`).

| Colonne | Sens |
| --- | --- |
| `pim_name`, `pim_city`, `pim_country`, `pim_brand`, `pim_address` | identité de l'hôtel dans le PIM |
| `scraped_name`, `page_name`, `url`, `page_country` | ce que la source a scrapé |
| `pre_verdict`, `pre_reason` | contrôle déterministe (brique 1) |
| `score` (0-100), `confidence`, `judge_reason`, `justification` | avis de l'agent juge (brique 2) |
| `final_status` | `auto_approved`, `needs_review`, `auto_rejected`, `human_approved`, `human_rejected`, `pending_judgment` |
| `decision`, `author`, `decided_at`, `comment` | dernière décision humaine |

**Écrire** : une ligne par décision dans `<base>_validation.match_decisions`, en ajout seul (jamais d'`UPDATE`) :
`rid`, `source`, `source_hash`, `decision` (`human_approved` | `human_rejected`), `comment`, `author` (e-mail), `decided_at`.
La dernière décision l'emporte, y compris sur l'agent juge.

## 2. Enrichissements

**Lire** : `<base>_enhanced.v_enrichments`, une ligne par hôtel × champ PIM × entité (`enrichment_id`).
À filtrer sur les rapprochements validés :

```sql
SELECT e.*
FROM `<base>_enhanced.v_enrichments` e
WHERE EXISTS (SELECT 1 FROM `<base>_matching.v_approved_matches` r WHERE r.rid = e.rid AND r.source = e.source)
  AND e.final_status = 'needs_review'
ORDER BY e.priorite, e.score DESC
```

| Colonne | Sens |
| --- | --- |
| `rid`, `family`, `priority` (P1 site, P2 API Content, P3 non exposé) | hôtel, famille de champs, exposition |
| `entity`, `entity_id`, `pim_field`, `label` | où la valeur ira dans le PIM ; plusieurs parkings ou piscines = une ligne par entité |
| `pim_value` | valeur actuelle du PIM (vide en général) |
| `value`, `value_label` | valeur proposée (code PIM et libellé pour les listes) |
| `source`, `source_field`, `source_excerpt` | justification : la phrase du scraping |
| `score` (0-100), `confidence`, `warning` | confiance de l'agent ; score plafonné à 50 si l'extrait est introuvable |
| `final_status` | `needs_review`, `auto_approved` (désactivé), `auto_rejected`, puis `human_approved`, `human_rejected`, `human_corrected` après décision |
| `reason`, `reason_detail` | pour `auto_rejected` : code (`not_in_sources`, `model_omitted`, `already_in_pim`, `pim_conflict`, `no_excerpt`, `not_in_pim_list`, `invalid_format`) et texte en français |
| `final_value` | valeur retenue (la valeur corrigée le cas échéant) |

`reason = 'pim_conflict'` : l'agent a trouvé une valeur différente de celle du PIM. Elle n'écrase jamais le PIM et n'est pas exportée ;
à afficher pour information.

**Écrire** : `<base>_validation.enrichment_decisions`, en ajout seul :
`enrichment_id`, `rid`, `pim_field`, `entity_id`, `decision` (`human_approved` | `human_rejected` | `human_corrected`),
`corrected_value` (obligatoire si `human_corrected`), `comment`, `author`, `decided_at`.

Correspondance possible avec l'écran actuel du front (`frontend/src/domain/types.ts`) : une fiche = un RID, un attribut =
une ligne de `v_enrichments`, `score` / 100 pour l'échelle 0-1. À caler avec la personne en charge du front.

## 3. Export

Le fichier plat sort quand plus rien n'est en attente. Le backend lance le job `gcrj-<base>-export` (API Cloud Run
`jobs.run`). Le job vérifie lui-même qu’aucun rapprochement ni aucune valeur `needs_review` ne reste et refuse
sinon. Il écrit dans `bkt-<base>-exports/export/<date>/` et ajoute une ligne dans `<base>_enhanced.exports`.

Nombre de décisions en attente (pour griser le bouton) :

```sql
SELECT
  (SELECT COUNT(*) FROM `<base>_matching.v_matches` WHERE final_status IN ('needs_review', 'pending_judgment'))
  + (SELECT COUNT(*) FROM `<base>_enhanced.v_enrichments` e WHERE final_status = 'needs_review'
     AND EXISTS (SELECT 1 FROM `<base>_matching.v_approved_matches` r WHERE r.rid = e.rid AND r.source = e.source)) AS en_attente
```

## 4. Rythme

Le workflow tourne à chaque dépôt de scraping et toutes les 15 minutes (planificateur). Un rapprochement validé dans
l'interface est donc enrichi au passage suivant, sans action du backend.
