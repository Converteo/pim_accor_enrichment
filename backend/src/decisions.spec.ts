import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appWithMockRepository, type MockRepository } from '../test/helpers.js';
import { checkEnrichmentDecisions, type EnrichmentState } from './decisions.js';

const state = (id: string, over: Partial<EnrichmentState> = {}): EnrichmentState => ({
  enrichmentId: id,
  rid: 'B6F6',
  pimField: 'ProductFitnessCenter',
  entityId: null,
  status: 'needs_review',
  approved: true,
  ...over,
});
const states = (...s: EnrichmentState[]) => new Map(s.map((x) => [x.enrichmentId, x]));

describe('checkEnrichmentDecisions', () => {
  it('relit rid, pim_field et entity_id côté serveur', () => {
    const { rows, rejected } = checkEnrichmentDecisions(
      [{ enrichmentId: 'a', decision: 'human_approved', comment: 'ok' }],
      states(state('a', { entityId: '172961', pimField: 'ParkingCharged' })),
    );
    expect(rejected).toEqual([]);
    expect(rows).toEqual([
      {
        enrichment_id: 'a',
        rid: 'B6F6',
        pim_field: 'ParkingCharged',
        entity_id: '172961',
        decision: 'human_approved',
        corrected_value: null,
        comment: 'ok',
      },
    ]);
  });

  it('accepte de revenir sur une décision humaine', () => {
    const { rows } = checkEnrichmentDecisions(
      [{ enrichmentId: 'a', decision: 'human_rejected' }],
      states(state('a', { status: 'human_approved' })),
    );
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['inconnue', { enrichmentId: 'x', decision: 'human_approved' }, states(), 'not_found'],
    ['décision hors liste', { enrichmentId: 'a', decision: 'auto_approved' }, states(state('a')), 'invalid_decision'],
    [
      'statut non décidable',
      { enrichmentId: 'a', decision: 'human_approved' },
      states(state('a', { status: 'auto_rejected' })),
      'invalid_status',
    ],
    [
      'rapprochement plus validé',
      { enrichmentId: 'a', decision: 'human_approved' },
      states(state('a', { approved: false })),
      'match_not_approved',
    ],
    [
      'correction sans valeur',
      { enrichmentId: 'a', decision: 'human_corrected', correctedValue: '  ' },
      states(state('a')),
      'corrected_value_required',
    ],
  ])('refuse : %s', (_, item, s, code) => {
    const { rows, rejected } = checkEnrichmentDecisions([item], s);
    expect(rows).toEqual([]);
    expect(rejected).toMatchObject([{ key: item.enrichmentId, code }]);
  });

  it('refuse un identifiant répété dans la demande, une seule fois, sans rien écrire pour lui', () => {
    const { rows, rejected } = checkEnrichmentDecisions(
      [
        { enrichmentId: 'a', decision: 'human_approved' },
        { enrichmentId: 'b', decision: 'human_approved' },
        { enrichmentId: 'a', decision: 'human_rejected' },
      ],
      states(state('a'), state('b')),
    );
    expect(rows.map((r) => r.enrichment_id)).toEqual(['b']);
    expect(rejected).toEqual([{ key: 'a', code: 'duplicate', message: expect.any(String) }]);
  });

  it('ignore correctedValue hors correction', () => {
    const { rows } = checkEnrichmentDecisions(
      [{ enrichmentId: 'a', decision: 'human_approved', correctedValue: 'x' }],
      states(state('a')),
    );
    expect(rows[0]?.corrected_value).toBeNull();
  });
});

describe('POST /decisions/enrichments', () => {
  let app: INestApplication;
  let repo: MockRepository;
  beforeAll(async () => ({ app, repo } = await appWithMockRepository()));
  afterAll(() => app.close());
  beforeEach(() => Object.values(repo).forEach((fn) => fn.mockReset()));

  const post = (body: unknown, author: string | null = 'test@converteo.com') => {
    const req = request(app.getHttpServer()).post('/decisions/enrichments');
    return (author ? req.set('X-PIM-Author', author) : req).send(body as object);
  };

  it('401 sans auteur, avant toute lecture', async () => {
    const res = await post({ items: [{ enrichmentId: 'a', decision: 'human_approved' }] }, null).expect(401);
    expect(res.body.error.code).toBe('author_required');
    expect(repo.enrichmentStates).not.toHaveBeenCalled();
  });

  it.each([{}, { items: [] }, { items: [{ decision: 'human_approved' }] }])(
    '400 si le corps est invalide : %j',
    async (body) => {
      await post(body).expect(400);
      expect(repo.insertEnrichmentDecisions).not.toHaveBeenCalled();
    },
  );

  it('un seul INSERT avec les éléments acceptés, détail des refusés', async () => {
    repo.enrichmentStates.mockResolvedValue([state('a'), state('b', { approved: false })]);
    const res = await post({
      items: [
        { enrichmentId: 'a', decision: 'human_approved', comment: 'TEST ok' },
        { enrichmentId: 'b', decision: 'human_approved' },
      ],
    }).expect(200);
    expect(res.body).toEqual({
      accepted: ['a'],
      rejected: [{ enrichmentId: 'b', code: 'match_not_approved', message: expect.any(String) }],
    });
    expect(repo.enrichmentStates).toHaveBeenCalledWith(['a', 'b']);
    expect(repo.insertEnrichmentDecisions).toHaveBeenCalledTimes(1);
    expect(repo.insertEnrichmentDecisions).toHaveBeenCalledWith(
      [expect.objectContaining({ enrichment_id: 'a', comment: 'TEST ok' })],
      'test@converteo.com',
    );
  });

  it("n'écrit rien si tout est refusé", async () => {
    repo.enrichmentStates.mockResolvedValue([]);
    const res = await post({ items: [{ enrichmentId: 'a', decision: 'human_approved' }] }).expect(200);
    expect(res.body.accepted).toEqual([]);
    expect(repo.insertEnrichmentDecisions).not.toHaveBeenCalled();
  });
});
