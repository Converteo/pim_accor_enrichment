import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { Repository } from '../src/repository.js';

export const ENV = {
  GCP_PROJECT_ID: 'p',
  REGION: 'europe-west1',
  BQ_MATCHING_DATASET: 'm',
  BQ_ENHANCED_DATASET: 'e',
  BQ_VALIDATION_DATASET: 'v',
  EXPORT_JOB: 'job',
  EXPORTS_BUCKET: 'bucket',
};

export type MockRepository = { [K in keyof Repository]: ReturnType<typeof vi.fn> };

/** Application complète, avec un Repository dont chaque méthode est un mock (aucun appel BigQuery). */
export async function appWithMockRepository(): Promise<{ app: INestApplication; repo: MockRepository }> {
  const repo = {
    hotels: vi.fn(),
    facets: vi.fn(),
    stats: vi.fn(),
    hotel: vi.fn(),
    matches: vi.fn(),
    enrichmentStates: vi.fn(),
    insertEnrichmentDecisions: vi.fn(),
    matchStatuses: vi.fn(),
    insertMatchDecisions: vi.fn(),
    fieldValues: vi.fn(),
    exports: vi.fn(),
    exportById: vi.fn(),
  } satisfies MockRepository;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadConfig(ENV))] })
    .overrideProvider(Repository)
    .useValue(repo)
    .compile();
  return { app: await moduleRef.createNestApplication({ logger: false }).init(), repo };
}
