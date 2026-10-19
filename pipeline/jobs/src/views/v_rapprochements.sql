-- Current status of every match (RID x source): the latest human decision wins over the judge agent.
-- statut_final: valide_auto | a_valider | rejete_auto | valide_humain | rejete_humain | a_juger
WITH jugement AS (
  SELECT * FROM `${matching}.jugements`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY judged_at DESC) = 1
),
decision AS (
  SELECT * FROM `${validation}.decisions_rapprochement`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY decided_at DESC) = 1
)
SELECT
  c.*,
  j.verdict, j.score, j.niveau, j.motif AS motif_agent, j.justification, j.statut AS statut_agent, j.judged_at,
  d.decision, d.commentaire, d.auteur, d.decided_at,
  COALESCE(d.decision, j.statut, 'a_juger') AS statut_final
FROM `${matching}.candidats` c
LEFT JOIN jugement j USING (rid, source, source_hash)
LEFT JOIN decision d USING (rid, source, source_hash)
