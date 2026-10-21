-- Allowed values of every PIM field, for the backend to check a corrected value (contract § 3.3).
-- One row per field x code; key and value_label are NULL for a field without a list (CVL).
-- Authorized view on raw: the backend reads it without access to raw.
SELECT
  m.entity_type, m.field_id AS pim_field, m.label, m.data_type, m.multivalue, m.cvl_id,
  v.key, v.label AS value_label
FROM `${raw}.pim_model` m
LEFT JOIN `${raw}.pim_cvl_values` v USING (cvl_id)
