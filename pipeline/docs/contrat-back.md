# Contrat entre le pipeline et le backend

Ce que le backend lit et écrit pour faire valider les rapprochements et les enrichissements dans l'interface.
Le pipeline ne connaît pas l'interface : il lit uniquement les décisions écrites dans BigQuery.

Datasets (un jeu par environnement, `<base>` = `cvto_accor_pim_enrichment_<env>_euw1`) :

| Dataset | Accès du SA backend | Contenu |
| --- | --- | --- |
| `<base>_matching` | lecture | rapprochements RID × source, jugements de l'agent juge, vue `v_rapprochements` |
| `<base>_enhanced` | lecture | valeurs proposées par l'agent, vue `v_enrichissements`, historique `exports` |
| `<base>_validation` | lecture et écriture | décisions humaines (`decisions_rapprochement`, `decisions_enrichissement`) |

Le SA backend a aussi `roles/bigquery.jobUser` sur le projet, `run.invoker` sur le job d'export et la lecture du bucket des exports.
Les schémas des tables sont dans `pipeline/jobs/src/schemas/`, les vues dans `pipeline/jobs/src/views/`.

## 1. Rapprochements (bloquant)

Un hôtel n'est enrichi avec une source que si son rapprochement est validé. Il faut donc un écran pour les rapprochements
`a_valider` : sans décision, ces hôtels restent en attente.

**Lire** : `<base>_matching.v_rapprochements`, une ligne par RID × source × page (`rid`, `source`, `source_hash`).

| Colonne | Sens |
| --- | --- |
| `nom_pim`, `ville_pim`, `pays_pim`, `marque_pim`, `adresse_pim` | identité de l'hôtel dans le PIM |
| `nom_scraping`, `page_scrapee`, `url`, `pays_page` | ce que la source a scrapé |
| `pre_verdict`, `pre_motif` | contrôle déterministe (brique 1) |
| `score` (0-100), `niveau`, `motif_agent`, `justification` | avis de l'agent juge (brique 2) |
| `statut_final` | `valide_auto`, `a_valider`, `rejete_auto`, `valide_humain`, `rejete_humain`, `a_juger` |
| `decision`, `auteur`, `decided_at`, `commentaire` | dernière décision humaine |

**Écrire** : une ligne par décision dans `<base>_validation.decisions_rapprochement`, en ajout seul (jamais d'`UPDATE`) :
`rid`, `source`, `source_hash`, `decision` (`valide_humain` | `rejete_humain`), `commentaire`, `auteur` (e-mail), `decided_at`.
La dernière décision l'emporte, y compris sur l'agent juge.

## 2. Enrichissements

**Lire** : `<base>_enhanced.v_enrichissements`, une ligne par hôtel × champ PIM × entité (`enrichment_id`).
À filtrer sur les rapprochements validés :

```sql
SELECT e.*
FROM `<base>_enhanced.v_enrichissements` e
WHERE EXISTS (SELECT 1 FROM `<base>_matching.v_rapprochements_valides` r WHERE r.rid = e.rid AND r.source = e.source)
  AND e.statut_final = 'proposee'
ORDER BY e.priorite, e.score DESC
```

| Colonne | Sens |
| --- | --- |
| `rid`, `famille`, `priorite` (P1 site, P2 API Content, P3 non exposé) | hôtel, famille de champs, exposition |
| `entite`, `id_entite`, `champ_pim`, `libelle` | où la valeur ira dans le PIM ; plusieurs parkings ou piscines = une ligne par entité |
| `valeur_pim` | valeur actuelle du PIM (vide en général) |
| `valeur`, `libelle_valeur` | valeur proposée (code PIM et libellé pour les listes) |
| `source`, `champ_source`, `extrait_source` | justification : la phrase du scraping |
| `score` (0-100), `niveau`, `alerte` | confiance de l'agent ; score plafonné à 50 si l'extrait est introuvable |
| `statut_final` | `proposee`, `validee_auto`, `ecart`, `deja_renseignee`, `non_traitee`, `rejetee`, puis `validee`, `invalidee`, `corrigee` après décision |
| `valeur_finale` | valeur retenue (la valeur corrigée le cas échéant) |

`ecart` : l'agent a trouvé une valeur différente de celle du PIM. Elle n'écrase jamais le PIM et n'est pas exportée ;
à afficher pour information.

**Écrire** : `<base>_validation.decisions_enrichissement`, en ajout seul :
`enrichment_id`, `rid`, `champ_pim`, `id_entite`, `decision` (`validee` | `invalidee` | `corrigee`),
`valeur_corrigee` (obligatoire si `corrigee`), `commentaire`, `auteur`, `decided_at`.

Correspondance possible avec l'écran actuel du front (`frontend/src/domain/types.ts`) : une fiche = un RID, un attribut =
une ligne de `v_enrichissements`, `score` / 100 pour l'échelle 0-1. À caler avec la personne en charge du front.

## 3. Export

Le fichier plat sort quand plus rien n'est en attente. Le backend lance le job `gcrj-<base>-export` (API Cloud Run
`jobs.run`). Le job vérifie lui-même qu'aucun rapprochement `a_valider` ni aucune valeur `proposee` ne reste et refuse
sinon. Il écrit dans `bkt-<base>-exports/export/<date>/` et ajoute une ligne dans `<base>_enhanced.exports`.

Nombre de décisions en attente (pour griser le bouton) :

```sql
SELECT
  (SELECT COUNT(*) FROM `<base>_matching.v_rapprochements` WHERE statut_final IN ('a_valider', 'a_juger'))
  + (SELECT COUNT(*) FROM `<base>_enhanced.v_enrichissements` e WHERE statut_final = 'proposee'
     AND EXISTS (SELECT 1 FROM `<base>_matching.v_rapprochements_valides` r WHERE r.rid = e.rid AND r.source = e.source)) AS en_attente
```

## 4. Rythme

Le workflow tourne à chaque dépôt de scraping et toutes les 15 minutes (planificateur). Un rapprochement validé dans
l'interface est donc enrichi au passage suivant, sans action du backend.
