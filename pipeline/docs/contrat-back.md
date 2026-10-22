# Contrat entre le pipeline et le backend

Ce que le backend lit et écrit pour faire valider les rapprochements et les enrichissements dans l'interface.
Le pipeline ne connaît pas l'interface : il lit uniquement les décisions écrites dans BigQuery.

Datasets (un jeu par environnement, `<base>` = `cvto_accor_pim_enrichment_<env>_euw1`) :

| Dataset | Accès du SA backend | Contenu |
| --- | --- | --- |
| `<base>_matching` | lecture | rapprochements RID × source (`match_candidates`), notes de l'agent juge (`match_judgments`), vues `v_matches` et `v_approved_matches` |
| `<base>_enhanced` | lecture | champs à enrichir (`enrichment_candidates`), réponses de l'agent (`enrichment_proposals`), vues `v_enrichments`, `v_approved_enrichments` et `v_field_allowed_values` (codes autorisés par champ, vue autorisée sur `raw`), historique `exports` |
| `<base>_validation` | lecture et écriture | décisions humaines (`match_decisions`, `enrichment_decisions`) et seuils de validation automatique (`auto_validation_settings`) |

Le SA backend a aussi `roles/bigquery.jobUser` sur le projet, `run.jobsExecutorWithOverrides` et `run.viewer` sur le job d'export (lancement avec surcharge d'env, liste et état des exécutions) et la lecture du bucket des exports.
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
ORDER BY e.priority, e.score DESC
```

| Colonne | Sens |
| --- | --- |
| `rid`, `family`, `priority` (P1 site, P2 API Content, P3 non exposé) | hôtel, famille de champs, exposition |
| `entity`, `entity_id`, `pim_field`, `label` | où la valeur ira dans le PIM ; plusieurs parkings ou piscines = une ligne par entité |
| `pim_value` | valeur actuelle du PIM (vide en général) |
| `value`, `value_label` | valeur proposée (code PIM et libellé pour les listes) |
| `source`, `source_field`, `source_excerpt` | justification : la phrase du scraping |
| `score` (0-100), `confidence`, `warning` | confiance de l'agent ; score plafonné à 50 si l'extrait est introuvable |
| `method` | `extracted` (repris tel quel), `converted` (mis au format PIM), `inferred` (déduit) |
| `final_status` | `pending_enrichment` (pas encore enrichi), `needs_review`, `auto_approved` (désactivé), `auto_rejected`, puis `human_approved`, `human_rejected`, `human_corrected` après décision |
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
`jobs.run`, surcharge d'env `TRIGGERED_BY` = auteur ; suivi par `executions.get`). Le job vérifie lui-même que rien n'est en attente et refuse sinon : aucun rapprochement `pending_judgment` ou
`needs_review`, aucune valeur `pending_enrichment`, ni `needs_review` sur un rapprochement validé. Il écrit dans `bkt-<base>-exports/export/<date>/` et ajoute une ligne dans `<base>_enhanced.exports`.

Nombre de décisions en attente (pour griser le bouton) :

```sql
SELECT
  (SELECT COUNT(*) FROM `<base>_matching.v_matches` WHERE final_status IN ('needs_review', 'pending_judgment'))
  + (SELECT COUNT(*) FROM `<base>_enhanced.v_enrichments` e
     WHERE final_status = 'pending_enrichment'
        OR (final_status = 'needs_review'
            AND EXISTS (SELECT 1 FROM `<base>_matching.v_approved_matches` r WHERE r.rid = e.rid AND r.source = e.source))) AS en_attente
```

## 3 bis. Seuils de validation automatique

Lus et changés dans l'interface (`GET /settings/auto-validation`, `POST /settings/auto-validation/:step`). Un changement
ajoute une ligne à `<base>_validation.auto_validation_settings` (`step`, `approve_threshold`, `reject_threshold`, `comment`,
`author`, `set_at`) ; `v_matches` et `v_enrichments` appliquent tout de suite la dernière ligne de chaque étape. Seuls les
comptes de `SETTINGS_EDITORS` (variable d'environnement du back, `settings_editors` dans Terraform) peuvent écrire ;
vide = tout relecteur Converteo.

La simulation se fait dans le front à partir de la répartition des scores des éléments sans décision humaine
(colonnes `auto_eligible`, `auto_approvable`, `score` des deux vues), même règle que les vues.

## 4. Rythme

Le workflow tourne à chaque dépôt de scraping et toutes les 15 minutes (planificateur, en pause sur dev pour l'instant).
Un rapprochement validé dans l'interface est donc enrichi au passage suivant, sans action du backend ; d'ici là, ses champs
apparaissent en `pending_enrichment`.
