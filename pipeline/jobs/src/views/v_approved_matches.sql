-- Matches that go on to enrichment: approved by the judge agent or by a human.
SELECT * FROM `${matching}.v_matches`
WHERE final_status IN ('auto_approved', 'human_approved')
