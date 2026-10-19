-- Matches that go on to enrichment: validated by the judge agent or by a human.
SELECT * FROM `${matching}.v_rapprochements`
WHERE statut_final IN ('valide_auto', 'valide_humain')
