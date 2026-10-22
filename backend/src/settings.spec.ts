import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appWithMockRepository, type MockRepository } from '../test/helpers.js';

let app: INestApplication;
let repo: MockRepository;
beforeAll(async () => ({ app, repo } = await appWithMockRepository({ SETTINGS_EDITORS: 'Chef@converteo.com' })));
afterAll(() => app.close());
beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  repo.scoreDistributions.mockResolvedValue([
    {
      step: 'match',
      approveThreshold: 80,
      rejectThreshold: 30,
      buckets: [{ score: 85, approvable: 3, total: 4 }],
    },
  ]);
  repo.autoValidationHistory.mockResolvedValue([
    {
      step: 'enrichment',
      approveThreshold: 90,
      rejectThreshold: null,
      comment: 'échantillon relu',
      author: 'chef@converteo.com',
      setAt: '2026-10-22T09:00:00.000Z',
    },
  ]);
});

describe('GET /settings/auto-validation', () => {
  it('renvoie les deux étapes, les seuils en vigueur et l’historique', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings/auto-validation')
      .set('x-pim-author', 'chef@converteo.com')
      .expect(200);
    expect(res.body.canEdit).toBe(true);
    expect(res.body.steps).toEqual([
      {
        step: 'match',
        approveThreshold: 80,
        rejectThreshold: 30,
        isDefault: true,
        distribution: [{ score: 85, approvable: 3, total: 4 }],
        history: [],
      },
      {
        step: 'enrichment',
        approveThreshold: 90,
        rejectThreshold: null,
        isDefault: false,
        distribution: [],
        history: [
          {
            approveThreshold: 90,
            rejectThreshold: null,
            comment: 'échantillon relu',
            author: 'chef@converteo.com',
            setAt: '2026-10-22T09:00:00.000Z',
          },
        ],
      },
    ]);
  });

  it.each([undefined, 'relecteur@converteo.com', 'pas-un-email'])('canEdit = false pour %s', async (author) => {
    const req = request(app.getHttpServer()).get('/settings/auto-validation');
    const res = await (author ? req.set('x-pim-author', author) : req).expect(200);
    expect(res.body.canEdit).toBe(false);
  });
});

describe('POST /settings/auto-validation/:step', () => {
  const post = (step: string, body: unknown, author = 'chef@converteo.com') =>
    request(app.getHttpServer())
      .post(`/settings/auto-validation/${step}`)
      .set('x-pim-author', author)
      .send(body as object);

  it('enregistre le réglage au nom de l’auteur et renvoie l’état à jour', async () => {
    const res = await post('enrichment', { approveThreshold: 90, rejectThreshold: 40, comment: ' test ' }).expect(200);
    expect(repo.insertAutoValidation).toHaveBeenCalledWith(
      { step: 'enrichment', approve_threshold: 90, reject_threshold: 40, comment: 'test' },
      'chef@converteo.com',
    );
    expect(res.body.steps).toHaveLength(2);
  });

  it('accepte de désactiver les deux seuils', async () => {
    await post('match', { approveThreshold: null, rejectThreshold: null }).expect(200);
    expect(repo.insertAutoValidation).toHaveBeenCalledWith(
      { step: 'match', approve_threshold: null, reject_threshold: null, comment: null },
      'chef@converteo.com',
    );
  });

  it('refuse un relecteur absent de SETTINGS_EDITORS', async () => {
    const res = await post('match', { approveThreshold: 80, rejectThreshold: 30 }, 'relecteur@converteo.com').expect(
      403,
    );
    expect(res.body.error.code).toBe('settings_forbidden');
    expect(repo.insertAutoValidation).not.toHaveBeenCalled();
  });

  it('exige un auteur', async () => {
    await request(app.getHttpServer())
      .post('/settings/auto-validation/match')
      .send({ approveThreshold: 80, rejectThreshold: 30 })
      .expect(401);
  });

  it.each([
    ['étape inconnue', 'judge', { approveThreshold: 80, rejectThreshold: 30 }],
    ['seuil hors bornes', 'match', { approveThreshold: 101, rejectThreshold: 30 }],
    ['seuil décimal', 'match', { approveThreshold: 80.5, rejectThreshold: 30 }],
    ['seuil manquant', 'match', { approveThreshold: 80 }],
    ['rejet au-dessus de la validation', 'match', { approveThreshold: 50, rejectThreshold: 60 }],
  ])('400 : %s', async (_, step, body) => {
    const res = await post(step, body).expect(400);
    expect(res.body.error.code).toBe('invalid_request');
    expect(repo.insertAutoValidation).not.toHaveBeenCalled();
  });
});
