-- Values that go into the flat file: validated (by a human, or automatically if a threshold is set) or corrected,
-- and whose source is still a validated match.
SELECT e.*
FROM `${enhanced}.v_enrichissements` e
WHERE e.statut_final IN ('validee', 'validee_auto', 'corrigee')
  AND EXISTS (
    SELECT 1 FROM `${matching}.v_rapprochements_valides` r
    WHERE r.rid = e.rid AND r.source = e.source
  )
