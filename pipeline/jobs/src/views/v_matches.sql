-- Current status of every match (RID x source): the latest human decision wins over the automatic status.
-- final_status: auto_approved | needs_review | auto_rejected | human_approved | human_rejected | pending_judgment
-- The automatic status is computed here, at read time, from the judge's score and the thresholds in force (latest
-- 'match' row of validation.auto_validation_settings, else the Terraform defaults): changing a threshold in the app
-- applies at once, without judging again. Rule (same as decisions.match_status, which the judge only records):
--   auto_rejected  page in another country, or score < reject_threshold
--   auto_approved  score >= approve_threshold, verdict same_hotel, not rejected by the pre-filter
--   needs_review   otherwise
WITH judgment AS (
  SELECT * FROM `${matching}.match_judgments`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY judged_at DESC) = 1
),
decision AS (
  SELECT * FROM `${validation}.match_decisions`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY decided_at DESC) = 1
),
setting AS (
  SELECT
    IF(s.step IS NULL, ${match_approve_default}, s.approve_threshold) AS approve_threshold,
    IF(s.step IS NULL, ${match_reject_default}, s.reject_threshold) AS reject_threshold
  FROM (SELECT 1) LEFT JOIN (
    SELECT * FROM `${validation}.auto_validation_settings` WHERE step = 'match'
    QUALIFY ROW_NUMBER() OVER (ORDER BY set_at DESC) = 1
  ) s ON TRUE
),
judged AS (
  SELECT
    c.*,
    j.verdict, j.score, j.confidence, j.reason AS judge_reason, j.justification, j.status AS judge_status, j.judged_at,
    d.decision, d.comment, d.author, d.decided_at,
    s.approve_threshold, s.reject_threshold,
    -- Thresholds apply to judged matches, except a page in another country (always rejected)
    j.rid IS NOT NULL AND IFNULL(c.pre_reason, '') != 'Homonyme dans un autre pays' AS auto_eligible,
    j.verdict = 'same_hotel' AND IFNULL(c.pre_verdict, '') != 'rejected' AS auto_approvable
  FROM `${matching}.match_candidates` c
  LEFT JOIN judgment j USING (rid, source, source_hash)
  LEFT JOIN decision d USING (rid, source, source_hash)
  CROSS JOIN setting s
)
SELECT *, COALESCE(decision, auto_status) AS final_status
FROM (
  SELECT *,
    CASE
      WHEN judged_at IS NULL THEN 'pending_judgment'
      WHEN NOT auto_eligible THEN 'auto_rejected'
      WHEN score < reject_threshold THEN 'auto_rejected'
      WHEN score >= approve_threshold AND auto_approvable THEN 'auto_approved'
      ELSE 'needs_review'
    END AS auto_status
  FROM judged
)
