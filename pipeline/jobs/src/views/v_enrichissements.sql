-- Latest value of every hotel x field x entity, with the latest human decision on it.
-- statut_final: proposee | validee_auto | rejetee | non_traitee | ecart | deja_renseignee | validee | invalidee | corrigee
WITH enrichissement AS (
  SELECT * FROM `${enhanced}.enrichissements`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, champ_pim, IFNULL(id_entite, '') ORDER BY enriched_at DESC) = 1
),
decision AS (
  SELECT * FROM `${validation}.decisions_enrichissement`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY enrichment_id ORDER BY decided_at DESC) = 1
)
SELECT
  e.*,
  d.decision, d.valeur_corrigee, d.commentaire, d.auteur, d.decided_at,
  COALESCE(d.decision, e.statut) AS statut_final,
  IF(d.decision = 'corrigee', d.valeur_corrigee, e.valeur) AS valeur_finale
FROM enrichissement e
LEFT JOIN decision d USING (enrichment_id)
