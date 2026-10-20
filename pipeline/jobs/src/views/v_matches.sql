-- Current status of every match (RID x source): the latest human decision wins over the judge agent.
-- final_status: auto_approved | needs_review | auto_rejected | human_approved | human_rejected | pending_judgment
WITH judgment AS (
  SELECT * FROM `${matching}.match_judgments`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY judged_at DESC) = 1
),
decision AS (
  SELECT * FROM `${validation}.match_decisions`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY rid, source, source_hash ORDER BY decided_at DESC) = 1
)
SELECT
  c.*,
  j.verdict, j.score, j.confidence, j.reason AS judge_reason, j.justification, j.status AS judge_status, j.judged_at,
  d.decision, d.comment, d.author, d.decided_at,
  COALESCE(d.decision, j.status, 'pending_judgment') AS final_status
FROM `${matching}.match_candidates` c
LEFT JOIN judgment j USING (rid, source, source_hash)
LEFT JOIN decision d USING (rid, source, source_hash)
