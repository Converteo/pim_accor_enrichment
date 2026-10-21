import { z } from 'zod';

const schema = z.object({
  GCP_PROJECT_ID: z.string().min(1),
  REGION: z.string().min(1),
  BQ_MATCHING_DATASET: z.string().min(1),
  BQ_ENHANCED_DATASET: z.string().min(1),
  BQ_VALIDATION_DATASET: z.string().min(1),
  EXPORT_JOB: z.string().min(1),
  EXPORTS_BUCKET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8080),
  GOOGLE_IMPERSONATE_SERVICE_ACCOUNT: z.string().optional(),
});

export type Config = z.infer<typeof schema>;
export const CONFIG = Symbol('CONFIG');

/** Lit et valide les variables d'environnement ; arrête le démarrage si l'une manque. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuration invalide : ${missing}`);
  }
  return parsed.data;
}
