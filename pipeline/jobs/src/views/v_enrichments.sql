-- Latest value of every hotel x field x entity, with the latest human decision on it.
-- final_status: needs_review | auto_approved | auto_rejected (see reason) | human_approved | human_rejected | human_corrected
WITH enrichment AS (
  SELECT * FROM `${enhanced}.enrichments`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, pim_field, IFNULL(entity_id, '') ORDER BY enriched_at DESC) = 1
),
decision AS (
  SELECT * FROM `${validation}.enrichment_decisions`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY enrichment_id ORDER BY decided_at DESC) = 1
)
SELECT
  e.*,
  d.decision, d.corrected_value, d.comment, d.author, d.decided_at,
  COALESCE(d.decision, e.status) AS final_status,
  IF(d.decision = 'human_corrected', d.corrected_value, e.value) AS final_value
FROM enrichment e
LEFT JOIN decision d USING (enrichment_id)
