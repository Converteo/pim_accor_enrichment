import type { FieldValues } from './api.js';

// Champs texte au format heure (pipeline/tools/build_targets.py, HHMM)
const HHMM_FIELDS = new Set(['ProductCheckIn', 'ProductCheckOut']);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Checked = { value: string } | { error: string };

/**
 * Contrôle et normalise une valeur corrigée au format PIM, avec les mêmes règles que le pipeline
 * (check_value dans pipeline/jobs/src/enrichment_core.py) : code de liste (key), True/False, HH:MM, nombre ;
 * plusieurs codes séparés par « | » pour un champ multi-valeur.
 */
export function checkCorrectedValue(field: FieldValues, raw: string): Checked {
  const v = raw.trim();
  if (!v) return { error: 'Valeur vide.' };
  if (HHMM_FIELDS.has(field.pimField)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    const hhmm = m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : v;
    return HHMM.test(hhmm) ? { value: hhmm } : { error: `Heure au format HH:MM attendue : « ${raw} ».` };
  }
  switch (field.dataType) {
    case 'Boolean':
      if (/^(true|false)$/i.test(v)) return { value: v.toLowerCase() === 'true' ? 'True' : 'False' };
      return { error: `True ou False attendu : « ${raw} ».` };
    case 'Integer':
    case 'Double': {
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n) || !/^\d+([.,]\d+)?$/.test(v)) return { error: `Nombre positif attendu : « ${raw} ».` };
      if (field.dataType === 'Integer' && !Number.isInteger(n)) return { error: `Nombre entier attendu : « ${raw} ».` };
      return { value: String(n) };
    }
    case 'CVL': {
      const all = v
        .split(/[|;,]/)
        .map((k) => k.trim())
        .filter(Boolean);
      const keys = [...new Set(all)];
      if (!keys.length) return { error: 'Valeur vide.' };
      const allowed = new Set(field.values.map((x) => x.key));
      const unknown = keys.filter((k) => !allowed.has(k));
      if (unknown.length) return { error: `Hors de la liste du PIM : ${unknown.join(', ')}.` };
      if (!field.multivalue && all.length > 1) return { error: 'Une seule valeur attendue pour ce champ.' };
      return { value: keys.join('|') };
    }
    default:
      return { value: v };
  }
}
