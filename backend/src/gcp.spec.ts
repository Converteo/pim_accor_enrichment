import type { BigQuery } from '@google-cloud/bigquery';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from './config.js';
import { Bq } from './gcp.js';

const config = {
  GCP_PROJECT_ID: 'proj',
  REGION: 'europe-west1',
  BQ_MATCHING_DATASET: 'base_matching',
  BQ_ENHANCED_DATASET: 'base_enhanced',
  BQ_VALIDATION_DATASET: 'base_validation',
} as Config;

describe('Bq', () => {
  it("construit les noms des tables depuis la config de l'environnement", () => {
    const bq = new Bq({} as BigQuery, config);
    expect(bq.table('enhanced', 'v_enrichments')).toBe('`proj.base_enhanced.v_enrichments`');
    expect(bq.table('validation', 'match_decisions')).toBe('`proj.base_validation.match_decisions`');
  });

  it('passe les paramètres nommés au client, dans la région des datasets', async () => {
    const query = vi.fn().mockResolvedValue([[{ n: 1 }]]);
    const bq = new Bq({ query } as unknown as BigQuery, config);
    expect(await bq.query('SELECT @x AS n', { x: 1 })).toEqual([{ n: 1 }]);
    expect(query).toHaveBeenCalledWith({
      query: 'SELECT @x AS n',
      params: { x: 1 },
      types: undefined,
      location: 'europe-west1',
    });
  });
});
