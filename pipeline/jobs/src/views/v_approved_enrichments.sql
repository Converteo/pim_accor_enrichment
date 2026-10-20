-- Values that go into the flat file: approved (by a human, or automatically if a threshold is set) or corrected,
-- and whose source is still an approved match.
SELECT e.*
FROM `${enhanced}.v_enrichments` e
WHERE e.final_status IN ('approved', 'auto_approved', 'corrected')
  AND EXISTS (
    SELECT 1 FROM `${matching}.v_approved_matches` r
    WHERE r.rid = e.rid AND r.source = e.source
  )
