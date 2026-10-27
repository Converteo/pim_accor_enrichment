import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appWithMockRepository, type MockRepository } from '../test/helpers.js';
import type { FieldValues } from './api.js';
import {
  checkEnrichmentDecisions,
  checkMatchDecisions,
  type EnrichmentState,
  type MatchDecisionItem,
} from './decisions.js';

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

  describe('correction (PIM-26)', () => {
    const spa: FieldValues = {
      pimField: 'WellnessCenterFreeWellnessCenterServices',
      dataType: 'CVL',
      multivalue: true,
      values: [
        { key: 'Sauna', label: 'Sauna' },
        { key: 'Hammam', label: 'Hammam' },
      ],
    };
    const s1 = states(state('a', { pimField: spa.pimField }));
    const fields = new Map([[spa.pimField, spa]]);

    it('écrit la valeur normalisée au format PIM', () => {
      const { rows } = checkEnrichmentDecisions(
        [{ enrichmentId: 'a', decision: 'human_corrected', correctedValue: 'Sauna ; Hammam' }],
        s1,
        fields,
      );
      expect(rows[0]?.corrected_value).toBe('Sauna|Hammam');
    });

    it('refuse un code hors de la liste', () => {
      const { rows, rejected } = checkEnrichmentDecisions(
        [{ enrichmentId: 'a', decision: 'human_corrected', correctedValue: 'Piscine' }],
        s1,
        fields,
      );
      expect(rows).toEqual([]);
      expect(rejected).toMatchObject([
        { key: 'a', code: 'invalid_corrected_value', message: expect.stringMatching(/Piscine/) },
      ]);
    });

    it('refuse un champ absent du modèle PIM', () => {
      const { rejected } = checkEnrichmentDecisions(
        [{ enrichmentId: 'a', decision: 'human_corrected', correctedValue: 'Sauna' }],
        s1,
        new Map(),
      );
      expect(rejected).toMatchObject([{ code: 'invalid_corrected_value' }]);
    });
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

  it('lit les codes autorisés des seuls champs corrigés', async () => {
    repo.enrichmentStates.mockResolvedValue([state('a'), state('b', { pimField: 'ProductCheckIn' })]);
    repo.fieldValues.mockResolvedValue([
      { pimField: 'ProductCheckIn', dataType: 'String', multivalue: false, values: [] },
    ]);
    const res = await post({
      items: [
        { enrichmentId: 'a', decision: 'human_approved' },
        { enrichmentId: 'b', decision: 'human_corrected', correctedValue: '9:00' },
      ],
    }).expect(200);
    expect(res.body.accepted).toEqual(['a', 'b']);
    expect(repo.fieldValues).toHaveBeenCalledWith(['ProductCheckIn']);
    expect(repo.insertEnrichmentDecisions.mock.calls[0]![0][1]).toMatchObject({ corrected_value: '09:00' });
  });

  it('ne lit pas les codes autorisés sans correction', async () => {
    repo.enrichmentStates.mockResolvedValue([state('a')]);
    await post({ items: [{ enrichmentId: 'a', decision: 'human_approved' }] }).expect(200);
    expect(repo.fieldValues).not.toHaveBeenCalled();
  });

  it("n'écrit rien si tout est refusé", async () => {
    repo.enrichmentStates.mockResolvedValue([]);
    const res = await post({ items: [{ enrichmentId: 'a', decision: 'human_approved' }] }).expect(200);
    expect(res.body.accepted).toEqual([]);
    expect(repo.insertEnrichmentDecisions).not.toHaveBeenCalled();
  });
});

describe('checkMatchDecisions', () => {
  const item = (over: Partial<MatchDecisionItem> = {}): MatchDecisionItem => ({
    rid: 'B6F6',
    source: 'booking_equipements',
    sourceHash: '9c1e',
    decision: 'human_approved',
    ...over,
  });
  const KEY = 'B6F6|booking_equipements|9c1e';

  it('écrit la clé lue à l’affichage, avec la décision et le commentaire', () => {
    const { rows, rejected } = checkMatchDecisions([item({ comment: 'TEST' })], new Map([[KEY, 'needs_review']]));
    expect(rejected).toEqual([]);
    expect(rows).toEqual([
      { rid: 'B6F6', source: 'booking_equipements', source_hash: '9c1e', decision: 'human_approved', comment: 'TEST' },
    ]);
  });

  it.each([
    ['page changée (empreinte inconnue)', item({ sourceHash: 'autre' }), 'not_found'],
    ['correction impossible sur un rapprochement', item({ decision: 'human_corrected' }), 'invalid_decision'],
  ])('refuse : %s', (_, i, code) => {
    const { rows, rejected } = checkMatchDecisions([i], new Map([[KEY, 'needs_review']]));
    expect(rows).toEqual([]);
    expect(rejected).toMatchObject([{ code }]);
  });

  it('refuse le statut pending_judgment', () => {
    const status = 'pending_judgment';
    expect(checkMatchDecisions([item()], new Map([[KEY, status]])).rejected).toMatchObject([
      { key: KEY, code: 'invalid_status' },
    ]);
  });

  it.each([
    ['human_rejected', 'auto_approved'],
    ['human_approved', 'auto_approved'],
    ['human_approved', 'auto_rejected'],
    ['human_rejected', 'auto_rejected'],
  ])('accepte %s sur un rapprochement %s (revenir sur la décision automatique)', (decision, status) => {
    const { rows, rejected } = checkMatchDecisions([item({ decision })], new Map([[KEY, status]]));
    expect(rejected).toEqual([]);
    expect(rows).toMatchObject([{ decision }]);
  });

  it('accepte de revenir sur une décision humaine', () => {
    const { rows } = checkMatchDecisions([item({ decision: 'human_rejected' })], new Map([[KEY, 'human_approved']]));
    expect(rows).toHaveLength(1);
  });
});

describe('POST /decisions/matches', () => {
  let app: INestApplication;
  let repo: MockRepository;
  beforeAll(async () => ({ app, repo } = await appWithMockRepository()));
  afterAll(() => app.close());
  beforeEach(() => Object.values(repo).forEach((fn) => fn.mockReset()));

  it('401 sans auteur', async () => {
    await request(app.getHttpServer())
      .post('/decisions/matches')
      .send({ items: [{ rid: 'a', source: 's', sourceHash: 'h', decision: 'human_approved' }] })
      .expect(401);
    expect(repo.matchStatuses).not.toHaveBeenCalled();
  });

  it('un seul INSERT, clés acceptées et refusées au format rid|source|sourceHash', async () => {
    repo.matchStatuses.mockResolvedValue(new Map([['a|s|h', 'needs_review']]));
    const res = await request(app.getHttpServer())
      .post('/decisions/matches')
      .set('X-PIM-Author', 'test@converteo.com')
      .send({
        items: [
          { rid: 'a', source: 's', sourceHash: 'h', decision: 'human_approved' },
          { rid: 'b', source: 's', sourceHash: 'h', decision: 'human_rejected' },
        ],
      })
      .expect(200);
    expect(res.body).toEqual({
      accepted: ['a|s|h'],
      rejected: [{ key: 'b|s|h', code: 'not_found', message: expect.any(String) }],
    });
    expect(repo.matchStatuses).toHaveBeenCalledWith(['a|s|h', 'b|s|h']);
    expect(repo.insertMatchDecisions).toHaveBeenCalledTimes(1);
    expect(repo.insertMatchDecisions).toHaveBeenCalledWith(
      [{ rid: 'a', source: 's', source_hash: 'h', decision: 'human_approved', comment: null }],
      'test@converteo.com',
    );
  });
});

describe("routes d'écriture (PIM-38)", () => {
  let app: INestApplication;
  let repo: MockRepository;
  beforeAll(async () => ({ app, repo } = await appWithMockRepository()));
  afterAll(() => app.close());

  it.each(['/decisions/enrichments', '/decisions/matches', '/export'])(
    '%s : 401 sans auteur, 403 hors Converteo, sans rien lire ni écrire',
    async (path) => {
      await request(app.getHttpServer()).post(path).send({}).expect(401);
      const res = await request(app.getHttpServer()).post(path).set('X-PIM-Author', 'j.martin@accor.com').send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('author_forbidden');
      for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
    },
  );
});
