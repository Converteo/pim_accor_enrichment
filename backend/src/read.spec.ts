import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appWithMockRepository, type MockRepository } from '../test/helpers.js';

let app: INestApplication;
let repo: MockRepository;
beforeAll(async () => ({ app, repo } = await appWithMockRepository()));
afterAll(() => app.close());
beforeEach(() => Object.values(repo).forEach((fn) => fn.mockReset()));

describe('GET /hotels', () => {
  it('applique les valeurs par défaut (view=review, limit=50)', async () => {
    repo.hotels.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/hotels').expect(200, { items: [], nextCursor: null });
    expect(repo.hotels).toHaveBeenCalledWith({ view: 'review', limit: 50 });
  });

  it('transmet les filtres validés', async () => {
    repo.hotels.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/hotels?view=pending&brand=Novotel&source=expedia&family=pool&priority=P1&search=paris&limit=10&cursor=abc')
      .expect(200);
    expect(repo.hotels).toHaveBeenCalledWith({
      view: 'pending',
      brand: 'Novotel',
      source: 'expedia',
      family: 'pool',
      priority: 'P1',
      search: 'paris',
      limit: 10,
      cursor: 'abc',
    });
  });

  it.each(['family=spa', 'priority=P4', 'view=all', 'limit=0', 'limit=201', 'limit=abc'])(
    'refuse %s avec une erreur 400 en français',
    async (q) => {
      const res = await request(app.getHttpServer()).get(`/hotels?${q}`).expect(400);
      expect(res.body.error.code).toBe('invalid_request');
      expect(res.body.error.message).toMatch(/^Requête invalide/);
      expect(repo.hotels).not.toHaveBeenCalled();
    },
  );

  it('ignore un filtre vide', async () => {
    repo.hotels.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/hotels?brand=&search=%20').expect(200);
    expect(repo.hotels).toHaveBeenCalledWith({ view: 'review', limit: 50 });
  });

  it('renvoie 502 si BigQuery échoue, sans exposer le détail', async () => {
    repo.hotels.mockRejectedValue(Object.assign(new Error('Access Denied: Table x'), { code: 403, errors: [] }));
    const res = await request(app.getHttpServer()).get('/hotels').expect(502);
    expect(res.body.error.code).toBe('upstream_error');
    expect(JSON.stringify(res.body)).not.toContain('Access Denied');
  });

  it('renvoie 500 pour une erreur du back lui-même', async () => {
    repo.hotels.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'rid')"));
    const res = await request(app.getHttpServer()).get('/hotels').expect(500);
    expect(res.body.error.code).toBe('internal_error');
  });
});

describe('GET /hotels/facets et /stats', () => {
  it('/hotels/facets ne passe pas pour un RID', async () => {
    repo.facets.mockResolvedValue({ brands: ['Novotel'], sources: ['expedia'] });
    await request(app.getHttpServer())
      .get('/hotels/facets')
      .expect(200, { brands: ['Novotel'], sources: ['expedia'] });
    expect(repo.hotel).not.toHaveBeenCalled();
  });

  it('/stats', async () => {
    const stats = {
      hotelsToReview: 1,
      hotelsPending: 0,
      valuesToReview: 2,
      matchesToReview: 3,
      matchesPending: 0,
      matchesAutoApproved: 4,
      valuesAutoApproved: 0,
      valuesPending: 0,
      valuesApproved: 0,
      pendingForExport: 5,
    };
    repo.stats.mockResolvedValue(stats);
    await request(app.getHttpServer()).get('/stats').expect(200, stats);
  });
});

describe('GET /hotels/:rid', () => {
  it('renvoie le détail', async () => {
    const detail = { hotel: { rid: 'B6F6' }, toReview: [], pending: [], conflicts: [], decided: [] };
    repo.hotel.mockResolvedValue(detail);
    await request(app.getHttpServer()).get('/hotels/B6F6').expect(200, detail);
    expect(repo.hotel).toHaveBeenCalledWith('B6F6');
  });

  it('404 si le RID est inconnu', async () => {
    repo.hotel.mockResolvedValue(null);
    const res = await request(app.getHttpServer()).get('/hotels/ZZZZ').expect(404);
    expect(res.body).toEqual({ error: { code: 'hotel_not_found', message: 'Hôtel ZZZZ introuvable.' } });
  });
});

describe('GET /matches', () => {
  it('transmet source, limit et cursor', async () => {
    repo.matches.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/matches?source=expedia&limit=5&cursor=x').expect(200);
    expect(repo.matches).toHaveBeenCalledWith({ status: 'needs_review', source: 'expedia', limit: 5, cursor: 'x' });
  });

  it.each(['pending_judgment', 'auto_approved'])('accepte status=%s', async (status) => {
    repo.matches.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get(`/matches?status=${status}`).expect(200);
    expect(repo.matches).toHaveBeenCalledWith({ status, limit: 50 });
  });

  it('refuse un statut sans liste (400)', async () => {
    const res = await request(app.getHttpServer()).get('/matches?status=human_approved').expect(400);
    expect(res.body.error.code).toBe('invalid_request');
  });
});

describe('GET /enrichments/auto-approved', () => {
  it('transmet les filtres des fiches, sans view', async () => {
    repo.autoApprovedValues.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/enrichments/auto-approved?family=pool&priority=P1&source=expedia&brand=Ibis&search=lyon&limit=20')
      .expect(200, { items: [], nextCursor: null });
    expect(repo.autoApprovedValues).toHaveBeenCalledWith({
      family: 'pool',
      priority: 'P1',
      source: 'expedia',
      brand: 'Ibis',
      search: 'lyon',
      limit: 20,
    });
  });

  it('refuse une famille inconnue (400)', async () => {
    await request(app.getHttpServer()).get('/enrichments/auto-approved?family=spa').expect(400);
    expect(repo.autoApprovedValues).not.toHaveBeenCalled();
  });
});

describe('GET /fields/:pimField/values', () => {
  it('renvoie le type et les codes du champ', async () => {
    const field = { pimField: 'F', dataType: 'CVL', multivalue: true, values: [{ key: 'k', label: 'K' }] };
    repo.fieldValues.mockResolvedValue([field]);
    await request(app.getHttpServer()).get('/fields/F/values').expect(200, field);
    expect(repo.fieldValues).toHaveBeenCalledWith(['F']);
  });

  it('404 si le champ est inconnu', async () => {
    repo.fieldValues.mockResolvedValue([]);
    const res = await request(app.getHttpServer()).get('/fields/Inconnu/values').expect(404);
    expect(res.body.error.code).toBe('field_not_found');
  });
});
