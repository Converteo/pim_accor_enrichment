-- Latest value of every hotel x field x entity, with the latest human decision on it, plus the targets not enriched yet.
-- final_status: pending_enrichment | needs_review | auto_approved | auto_rejected (see reason)
--               | human_approved | human_rejected | human_corrected
-- status is the job's verdict (needs_review or auto_rejected with its reason). A needs_review value then goes through
-- the thresholds in force, at read time (latest 'enrichment' row of validation.auto_validation_settings, else the
-- Terraform defaults): changing a threshold in the app applies at once, without enriching again.
--   auto_rejected  score < reject_threshold (reason low_score)
--   auto_approved  score >= approve_threshold, no warning, method not inferred
--   needs_review   otherwise
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
),
setting AS (
  SELECT
    IF(s.step IS NULL, ${enrichment_approve_default}, s.approve_threshold) AS approve_threshold,
    IF(s.step IS NULL, ${enrichment_reject_default}, s.reject_threshold) AS reject_threshold
  FROM (SELECT 1) LEFT JOIN (
    SELECT * FROM `${validation}.auto_validation_settings` WHERE step = 'enrichment'
    QUALIFY ROW_NUMBER() OVER (ORDER BY set_at DESC) = 1
  ) s ON TRUE
),
scored AS (
  SELECT e.*, s.approve_threshold, s.reject_threshold,
    e.status = 'needs_review' AS auto_eligible,
    e.warning IS NULL AND IFNULL(e.method, '') != 'inferred' AS auto_approvable,
    CASE
      WHEN e.status != 'needs_review' THEN e.status
      WHEN e.score < s.reject_threshold THEN 'auto_rejected'
      WHEN e.score >= s.approve_threshold AND e.warning IS NULL AND IFNULL(e.method, '') != 'inferred' THEN 'auto_approved'
      ELSE 'needs_review'
    END AS auto_status
  FROM enrichment e CROSS JOIN setting s
)
SELECT
  e.enrichment_id, e.run_id, e.batch_id, e.family, e.rid, e.pim_entity_id, e.entity, e.entity_id, e.pim_field, e.label,
  e.priority, e.pim_value, e.value, e.value_label, e.method, e.source, e.source_field, e.source_excerpt, e.excerpt_found,
  e.score, e.confidence, e.warning,
  IF(e.auto_eligible AND e.auto_status = 'auto_rejected', 'low_score', e.reason) AS reason,
  IF(e.auto_eligible AND e.auto_status = 'auto_rejected',
    FORMAT('score %d inférieur au seuil de rejet %d', e.score, e.reject_threshold), e.reason_detail) AS reason_detail,
  e.status, e.validated_sources, e.source_hash, e.llm_model, e.prompt_version, e.enriched_at,
  d.decision, d.corrected_value, d.comment, d.author, d.decided_at,
  e.auto_status, e.auto_eligible, e.auto_approvable, e.approve_threshold, e.reject_threshold,
  COALESCE(d.decision, e.auto_status) AS final_status,
  IF(d.decision = 'human_corrected', d.corrected_value, e.value) AS final_value
FROM scored e
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
  'pending_enrichment', FALSE, FALSE, CAST(NULL AS INT64), CAST(NULL AS INT64),
  'pending_enrichment', CAST(NULL AS STRING)
FROM pending p
