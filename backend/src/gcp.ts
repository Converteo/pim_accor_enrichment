import { BigQuery, type Query } from '@google-cloud/bigquery';
import { AuthClient, GoogleAuth, Impersonated } from 'google-auth-library';
import type { Config } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/**
 * Identité GCP du back : ADC (sa-<env>-backend sur Cloud Run).
 * En local seulement, GOOGLE_IMPERSONATE_SERVICE_ACCOUNT fait agir les ADC du développeur au nom d'un SA,
 * car un compte humain viewer ne peut pas lancer de requête BigQuery.
 */
export async function gcpAuthClient(config: Config): Promise<AuthClient | undefined> {
  if (!config.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) return undefined;
  return new Impersonated({
    sourceClient: await new GoogleAuth({ scopes: SCOPES }).getClient(),
    targetPrincipal: config.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT,
    targetScopes: SCOPES,
  });
}

export type Params = Record<string, unknown>;
/** Types BigQuery des paramètres qui peuvent valoir null (BigQuery ne sait pas les deviner). */
export type ParamTypes = NonNullable<Query['types']>;

/** Exécute du SQL à paramètres nommés (@nom). Les noms de tables viennent de la config, jamais de la saisie. */
export class Bq {
  constructor(
    private readonly client: BigQuery,
    private readonly config: Config,
  ) {}

  async query<T>(sql: string, params: Params = {}, types?: ParamTypes): Promise<T[]> {
    const [rows] = (await this.client.query({
      query: sql,
      params,
      types,
      location: this.config.REGION,
    })) as unknown as [T[]];
    return rows;
  }

  /** Nom complet d'une table ou d'une vue, entre backquotes. */
  table(dataset: 'matching' | 'enhanced' | 'validation', name: string): string {
    const ds = {
      matching: this.config.BQ_MATCHING_DATASET,
      enhanced: this.config.BQ_ENHANCED_DATASET,
      validation: this.config.BQ_VALIDATION_DATASET,
    }[dataset];
    return `\`${this.config.GCP_PROJECT_ID}.${ds}.${name}\``;
  }
}

export function createBq(config: Config, authClient: AuthClient | undefined): Bq {
  return new Bq(new BigQuery({ projectId: config.GCP_PROJECT_ID, authClient }), config);
}
