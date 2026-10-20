-- Latest value of every hotel x field x entity, with the latest human decision on it, plus the targets not enriched yet.
-- final_status: pending_enrichment | needs_review | auto_approved | auto_rejected (see reason)
--               | human_approved | human_rejected | human_corrected
WITH enrichment AS (
  SELECT * FROM `${enhanced}.enrichment_proposals`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, pim_field, IFNULL(entity_id, '') ORDER BY enriched_at DESC) = 1
),
-- Latest target set of each family (written by the enrichment job when it changes; rid is empty in the marker of an empty set)
target AS (
  SELECT * FROM `${enhanced}.enrichment_candidates`
  QUALIFY computed_at = MAX(computed_at) OVER (PARTITION BY family)
),
-- A target with no value for the same content (source_hash): not enriched yet, or its content changed since.
-- The target of a new entity (new) is met by the numbered values of the agent (new_1, new_2...).
pending AS (
  SELECT t.* FROM target t
  WHERE t.rid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM enrichment e
      WHERE e.rid = t.rid AND e.pim_field = t.pim_field AND e.source_hash = t.source_hash
        AND (IFNULL(e.entity_id, '') = IFNULL(t.entity_id, '') OR (t.entity_id = 'new' AND STARTS_WITH(e.entity_id, 'new')))
    )
),
decision AS (
  SELECT * FROM `${validation}.enrichment_decisions`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY enrichment_id ORDER BY decided_at DESC) = 1
)
SELECT
  e.enrichment_id, e.run_id, e.batch_id, e.family, e.rid, e.pim_entity_id, e.entity, e.entity_id, e.pim_field, e.label,
  e.priority, e.pim_value, e.value, e.value_label, e.method, e.source, e.source_field, e.source_excerpt, e.excerpt_found,
  e.score, e.confidence, e.warning, e.reason, e.reason_detail, e.status, e.validated_sources, e.source_hash, e.llm_model,
  e.prompt_version, e.enriched_at,
  d.decision, d.corrected_value, d.comment, d.author, d.decided_at,
  COALESCE(d.decision, e.status) AS final_status,
  IF(d.decision = 'human_corrected', d.corrected_value, e.value) AS final_value
FROM enrichment e
LEFT JOIN decision d USING (enrichment_id)
-- A value obtained on older content gives way to its pending target
WHERE NOT EXISTS (
  SELECT 1 FROM pending p
  WHERE p.rid = e.rid AND p.pim_field = e.pim_field
    AND (IFNULL(e.entity_id, '') = IFNULL(p.entity_id, '') OR (p.entity_id = 'new' AND STARTS_WITH(e.entity_id, 'new')))
)
UNION ALL
SELECT
  CAST(NULL AS STRING), p.run_id, CAST(NULL AS STRING), p.family, p.rid, p.pim_entity_id, p.entity, p.entity_id, p.pim_field,
  p.label, p.priority, p.pim_value, CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS BOOL), CAST(NULL AS INT64), CAST(NULL AS STRING),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), 'pending_enrichment', p.validated_sources, p.source_hash,
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS TIMESTAMP),
  CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS TIMESTAMP),
  'pending_enrichment', CAST(NULL AS STRING)
FROM pending p
