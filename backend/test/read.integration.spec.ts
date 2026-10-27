import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createBq, gcpAuthClient } from '../src/gcp.js';
import { BigQueryRepository } from '../src/repository.js';

// Lecture seule contre BigQuery dev : npm run test:integration (BQ_INTEGRATION=1, backend/.env)
describe.runIf(process.env.BQ_INTEGRATION)('BigQueryRepository (dev, lecture)', { timeout: 30_000 }, () => {
  let repo: BigQueryRepository;
  beforeAll(async () => {
    const config = loadConfig();
    repo = new BigQueryRepository(createBq(config, await gcpAuthClient(config)));
  });

  it('stats : compteurs cohérents entre eux', async () => {
    const s = await repo.stats();
    expect(s.hotelsToReview).toBeGreaterThan(0);
    expect(s.valuesToReview).toBeGreaterThanOrEqual(s.hotelsToReview);
    expect(s.pendingForExport).toBeGreaterThanOrEqual(s.matchesToReview + s.valuesToReview + s.valuesPending);
  });

  it('hotels : pagination par curseur sans doublon ni trou, triée par priorité puis score', async () => {
    const first = await repo.hotels({ view: 'review', limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo.hotels({ view: 'review', limit: 5, cursor: first.nextCursor! });
    const both = await repo.hotels({ view: 'review', limit: 10 });
    expect([...first.items, ...second.items].map((h) => h.rid)).toEqual(both.items.map((h) => h.rid));
    for (const h of both.items) expect(h.toReviewCount).toBeGreaterThan(0);
    await expect(repo.hotels({ view: 'pending', limit: 5, cursor: first.nextCursor! })).rejects.toMatchObject({
      response: { error: { code: 'invalid_cursor' } },
    });
  });

  it('hotels : filtre famille et recherche', async () => {
    const pool = await repo.hotels({ view: 'review', family: 'pool', limit: 3 });
    for (const h of pool.items) expect(h.families).toContain('pool');
    const [h] = pool.items;
    const found = await repo.hotels({ view: 'review', search: h!.name.slice(0, 8).toLowerCase(), limit: 50 });
    expect(found.items.map((x) => x.rid)).toContain(h!.rid);
  });

  it('hotels : valeurs signalées (ancien nom), filtre outdated et compteur cohérent avec le détail', async () => {
    const only = await repo.hotels({ view: 'review', outdated: 'only', limit: 5 });
    expect(only.items.length).toBeGreaterThan(0);
    for (const h of only.items) expect(h.outdatedCount).toBeGreaterThan(0);
    const [summary] = only.items;
    const detail = await repo.hotel(summary!.rid);
    const flagged = detail!.toReview.filter((v) => v.outdated);
    expect(flagged).toHaveLength(summary!.outdatedCount);
    expect(flagged[0]!.outdated).toMatch(/^Page source sous un ancien nom/);
    const hide = await repo.hotels({ view: 'review', outdated: 'hide', limit: 50 });
    for (const h of hide.items) expect(h.outdatedCount).toBeLessThan(h.toReviewCount);
    // Sans filtre, les fiches entièrement signalées ne passent jamais avant une fiche qui ne l'est pas
    const all = (await repo.hotels({ view: 'review', limit: 200 })).items;
    const firstAllFlagged = all.findIndex((h) => h.outdatedCount === h.toReviewCount);
    if (firstAllFlagged >= 0)
      expect(all.slice(firstAllFlagged).every((h) => h.outdatedCount === h.toReviewCount)).toBe(true);
  });

  it('hotel : détail cohérent avec la liste, null si inconnu', async () => {
    const [summary] = (await repo.hotels({ view: 'review', limit: 1 })).items;
    const detail = await repo.hotel(summary!.rid);
    expect(detail!.hotel.rid).toBe(summary!.rid);
    expect(detail!.toReview).toHaveLength(summary!.toReviewCount);
    expect(detail!.toReview.every((v) => v.status === 'needs_review' && v.enrichmentId)).toBe(true);
    expect(await repo.hotel('ZZZZ-INCONNU')).toBeNull();
    const [value] = detail!.toReview;
    expect(await repo.enrichmentStates([value!.enrichmentId!, 'inconnu'])).toEqual([
      {
        enrichmentId: value!.enrichmentId,
        rid: summary!.rid,
        pimField: value!.pimField,
        entityId: value!.entityId,
        status: 'needs_review',
        approved: true,
      },
    ]);
  });

  it('matches : needs_review uniquement, facets non vides', async () => {
    const m = await repo.matches({ status: 'needs_review', limit: 3 });
    expect(m.items.length).toBeGreaterThan(0);
    expect(m.items.every((x) => x.status === 'needs_review' && x.sourceHash)).toBe(true);
    const [first] = m.items;
    const key = `${first!.rid}|${first!.source}|${first!.sourceHash}`;
    expect(await repo.matchStatuses([key, 'x|y|z'])).toEqual(new Map([[key, 'needs_review']]));
    const f = await repo.facets();
    expect(f.sources.length).toBeGreaterThan(0);
    expect(f.verdicts).toContain('same_hotel');
  });

  it('matches : filtres marque et avis du juge sur les validés automatiquement', async () => {
    const [first] = (await repo.matches({ status: 'auto_approved', limit: 1 })).items;
    const m = await repo.matches({
      status: 'auto_approved',
      brand: first!.pim.brand!,
      verdict: 'same_hotel',
      limit: 20,
    });
    expect(m.items.length).toBeGreaterThan(0);
    expect(m.items.every((x) => x.pim.brand === first!.pim.brand && x.verdict === 'same_hotel')).toBe(true);
    expect((await repo.matches({ status: 'auto_approved', verdict: 'undetermined', limit: 1 })).items).toEqual([]);
  });

  it('matches : rejetés auto, décisions humaines (plus récente d’abord) et recherche sans accents', async () => {
    const rejected = await repo.matches({ status: 'auto_rejected', limit: 2 });
    expect(rejected.items.every((x) => x.status === 'auto_rejected')).toBe(true);
    const human = (await repo.matches({ status: 'human', limit: 50 })).items;
    expect(human.length).toBeGreaterThan(0);
    expect(human.every((x) => x.status.startsWith('human_') && x.lastDecision?.author)).toBe(true);
    const dates = human.map((x) => x.lastDecision!.decidedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const found = await repo.matches({ status: 'auto_approved', search: 'são PAULO', limit: 5 });
    expect(found.items.length).toBeGreaterThan(0);
    expect(found.items.every((x) => /s[aã]o paulo/i.test(`${x.pim.name} ${x.pim.city}`))).toBe(true);
  });

  it('fieldValues : types et codes depuis v_field_allowed_values', async () => {
    const fields = await repo.fieldValues(['WellnessCenterFreeWellnessCenterServices', 'ProductCheckIn', 'Inconnu']);
    const byName = new Map(fields.map((f) => [f.pimField, f]));
    expect(byName.has('Inconnu')).toBe(false);
    expect(byName.get('ProductCheckIn')).toMatchObject({ dataType: 'String', values: [] });
    const spa = byName.get('WellnessCenterFreeWellnessCenterServices')!;
    expect(spa).toMatchObject({ dataType: 'CVL', multivalue: true });
    expect(spa.values.map((v) => v.key)).toContain('Hammam');
  });
});
