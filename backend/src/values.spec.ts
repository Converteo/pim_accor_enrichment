import { describe, expect, it } from 'vitest';
import type { FieldValues } from './api.js';
import { checkCorrectedValue } from './values.js';

const field = (over: Partial<FieldValues>): FieldValues => ({
  pimField: 'F',
  dataType: 'String',
  multivalue: false,
  values: [],
  ...over,
});
const cvl = (multivalue: boolean) =>
  field({
    dataType: 'CVL',
    multivalue,
    values: [
      { key: 'Sauna', label: 'Sauna' },
      { key: 'Hammam', label: 'Turkish bath' },
    ],
  });

describe('checkCorrectedValue', () => {
  it.each([
    ['liste simple', cvl(false), ' Sauna ', 'Sauna'],
    ['liste multiple, séparateurs normalisés et doublons retirés', cvl(true), 'Sauna; Hammam,Sauna', 'Sauna|Hammam'],
    ['booléen', field({ dataType: 'Boolean' }), 'true', 'True'],
    ['booléen faux', field({ dataType: 'Boolean' }), 'FALSE', 'False'],
    ['heure', field({ pimField: 'ProductCheckIn' }), '9:30', '09:30'],
    ['entier', field({ dataType: 'Integer' }), '12', '12'],
    ['décimal à virgule', field({ dataType: 'Double' }), '2,50', '2.5'],
    ['texte', field({ dataType: 'String' }), '  libre ', 'libre'],
  ])('accepte : %s', (_, f, raw, expected) => {
    expect(checkCorrectedValue(f, raw)).toEqual({ value: expected });
  });

  it.each([
    ['vide', field({}), '  ', /vide/],
    ['liste faite de séparateurs', cvl(true), ' | ; ', /vide/],
    ['code répété pour un champ simple (comme le pipeline)', cvl(false), 'Sauna|Sauna', /Une seule valeur/],
    ['libellé au lieu du code', cvl(false), 'Turkish bath', /Hors de la liste.*Turkish bath/],
    ['plusieurs codes pour un champ simple', cvl(false), 'Sauna|Hammam', /Une seule valeur/],
    ['booléen mal formé', field({ dataType: 'Boolean' }), 'oui', /True ou False/],
    ['heure hors bornes', field({ pimField: 'ProductCheckOut' }), '24:00', /HH:MM/],
    ['heure en texte', field({ pimField: 'ProductCheckOut' }), 'midi', /HH:MM/],
    ['nombre négatif', field({ dataType: 'Integer' }), '-3', /positif/],
    ['entier décimal', field({ dataType: 'Integer' }), '2.5', /entier/],
    ['pas un nombre', field({ dataType: 'Double' }), '12abc', /Nombre/],
  ])('refuse : %s', (_, f, raw, message) => {
    const r = checkCorrectedValue(f, raw);
    expect(r).toHaveProperty('error');
    expect((r as { error: string }).error).toMatch(message);
  });
});
