import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

const ENV = {
  GCP_PROJECT_ID: 'p',
  REGION: 'europe-west1',
  BQ_MATCHING_DATASET: 'm',
  BQ_ENHANCED_DATASET: 'e',
  BQ_VALIDATION_DATASET: 'v',
  EXPORT_JOB: 'job',
  EXPORTS_BUCKET: 'bucket',
};

describe('loadConfig', () => {
  it('lit les variables et met le port à 8080 par défaut', () => {
    expect(loadConfig(ENV)).toMatchObject({ PORT: 8080, BQ_ENHANCED_DATASET: 'e' });
  });

  it('refuse une configuration incomplète en nommant les variables manquantes', () => {
    expect(() => loadConfig({ ...ENV, EXPORT_JOB: undefined })).toThrow(/EXPORT_JOB/);
  });
});

describe('application', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadConfig(ENV))] }).compile();
    app = await moduleRef.createNestApplication().init();
  });
  afterAll(() => app.close());

  it('GET /healthz', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('renvoie les erreurs au format du contrat', async () => {
    const res = await request(app.getHttpServer()).get('/inconnu').expect(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Ressource introuvable.' } });
  });
});
