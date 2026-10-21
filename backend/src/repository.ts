import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Decision,
  EnrichmentValue,
  Facets,
  Family,
  FieldValues,
  HotelDetail,
  HotelSummary,
  MatchItem,
  Page,
  Priority,
  Stats,
} from './api.js';
import type { EnrichmentDecisionRow, EnrichmentState, MatchDecisionRow } from './decisions.js';
import { ApiError } from './errors.js';
import { Bq } from './gcp.js';

export interface HotelFilters {
  view: 'review' | 'pending';
  brand?: string;
  source?: string;
  family?: Family;
  priority?: Priority;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface MatchFilters {
  source?: string;
  limit: number;
  cursor?: string;
}

/**
 * Accès aux données : toutes les requêtes SQL du back sont dans BigQueryRepository.
 * Les contrôleurs dépendent de cette classe abstraite, remplacée par un mock dans les tests unitaires.
 */
export abstract class Repository {
  abstract hotels(filters: HotelFilters): Promise<Page<HotelSummary>>;
  abstract facets(): Promise<Facets>;
  abstract stats(): Promise<Stats>;
  /** null si le RID est inconnu. */
  abstract hotel(rid: string): Promise<HotelDetail | null>;
  abstract matches(filters: MatchFilters): Promise<Page<MatchItem>>;
  abstract enrichmentStates(enrichmentIds: string[]): Promise<EnrichmentState[]>;
  /** Un seul INSERT multi-lignes ; author et decided_at (UTC) posés ici, jamais par le client. */
  abstract insertEnrichmentDecisions(rows: EnrichmentDecisionRow[], author: string): Promise<void>;
  /** Clé rid|source|source_hash → final_status, pour les clés présentes dans v_matches. */
  abstract matchStatuses(keys: string[]): Promise<Map<string, string>>;
  abstract insertMatchDecisions(rows: MatchDecisionRow[], author: string): Promise<void>;
  /** Type et codes autorisés des champs (vue v_field_allowed_values) ; un champ inconnu est absent du résultat. */
  abstract fieldValues(pimFields: string[]): Promise<FieldValues[]>;
}

// Curseur opaque = liste + clé de tri de la dernière ligne renvoyée (pagination par clé : une fiche qui sort de la
// liste ne décale pas les pages). La clé contient des compteurs : une fiche dont le score ou le nombre de champs change
// entre deux pages peut être vue deux fois ou pas du tout ; le front dédoublonne par RID.
const encodeCursor = (list: string, key: string) => Buffer.from(`${list}:${key}`).toString('base64url');
function decodeCursor(list: string, cursor?: string): string {
  if (!cursor) return '';
  const decoded = Buffer.from(cursor, 'base64url').toString();
  if (!decoded.startsWith(`${list}:`))
    throw new ApiError(HttpStatus.BAD_REQUEST, 'invalid_cursor', 'Curseur invalide.');
  return decoded.slice(list.length + 1);
}

/** Les requêtes lisent limit + 1 lignes : la ligne en trop indique qu'il reste une page. */
function page<T>(list: string, rows: Row[], limit: number, map: (row: Row) => T): Page<T> {
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  return {
    items: rows.slice(0, limit).map(map),
    nextCursor: last ? encodeCursor(list, last.sort_key as string) : null,
  };
}

/** BigQuery renvoie les TIMESTAMP sous la forme { value: '2026-10-21T09:12:00.598508000Z' } : ISO 8601 en ms. */
const iso = (ts: { value: string } | null): string | null => (ts ? new Date(ts.value).toISOString() : null);

type Row = Record<string, unknown>;
const str = (v: unknown) => (v as string | null) ?? null;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function decision(r: Row): Decision | null {
  if (!r.decision) return null;
  return {
    decision: r.decision as string,
    author: r.author as string,
    decidedAt: iso(r.decided_at as { value: string }) as string,
    comment: str(r.comment),
    correctedValue: str(r.corrected_value),
  };
}

function enrichmentValue(r: Row): EnrichmentValue {
  return {
    enrichmentId: str(r.enrichment_id),
    family: r.family as Family,
    priority: r.priority as Priority,
    entity: r.entity as string,
    entityId: str(r.entity_id),
    pimField: r.pim_field as string,
    label: (r.label as string | null) ?? (r.pim_field as string),
    pimValue: str(r.pim_value),
    value: str(r.value),
    valueLabel: str(r.value_label),
    method: str(r.method) as EnrichmentValue['method'],
    source: str(r.source),
    sourceField: str(r.source_field),
    sourceExcerpt: str(r.source_excerpt),
    score: num(r.score),
    confidence: str(r.confidence),
    warning: str(r.warning),
    status: r.final_status as EnrichmentValue['status'],
    reason: str(r.reason),
    reasonDetail: str(r.reason_detail),
    finalValue: str(r.final_value),
    lastDecision: decision(r),
  };
}

function matchItem(r: Row): MatchItem {
  return {
    rid: r.rid as string,
    source: r.source as string,
    sourceHash: r.source_hash as string,
    pim: {
      name: str(r.pim_name),
      city: str(r.pim_city),
      country: str(r.pim_country),
      brand: str(r.pim_brand),
      address: str(r.pim_address),
    },
    page: {
      scrapedName: str(r.scraped_name),
      pageName: str(r.page_name),
      url: str(r.url),
      country: str(r.page_country),
    },
    preVerdict: str(r.pre_verdict),
    preReason: str(r.pre_reason),
    score: num(r.score),
    confidence: str(r.confidence),
    judgeReason: str(r.judge_reason),
    justification: str(r.justification),
    status: r.final_status as MatchItem['status'],
    lastDecision: decision(r),
  };
}

const HOTEL_FILTER_TYPES = {
  brand: 'STRING',
  source: 'STRING',
  family: 'STRING',
  priority: 'STRING',
  search: 'STRING',
};

@Injectable()
export class BigQueryRepository extends Repository {
  constructor(@Inject(Bq) private readonly bq: Bq) {
    super();
  }

  private get t() {
    return {
      matches: this.bq.table('matching', 'v_matches'),
      approved: this.bq.table('matching', 'v_approved_matches'),
      enrichments: this.bq.table('enhanced', 'v_enrichments'),
    };
  }

  async hotels(f: HotelFilters): Promise<Page<HotelSummary>> {
    const { approved, enrichments } = this.t;
    // Une fiche = un RID. « À relire » : needs_review sur un rapprochement validé (EXISTS v_approved_matches, obligatoire).
    // Les compteurs portent sur toute la fiche ; les filtres décident seulement quelles fiches sortent.
    const rows = await this.bq.query<Row>(
      `
      WITH am AS (SELECT rid, source, pim_name, pim_brand, pim_city, pim_country FROM ${approved}),
      approved AS (SELECT DISTINCT rid, source FROM am),
      identity AS (
        SELECT rid, ANY_VALUE(pim_name) AS name, ANY_VALUE(pim_brand) AS brand, ANY_VALUE(pim_city) AS city,
          ANY_VALUE(pim_country) AS country
        FROM am GROUP BY rid
      ),
      e AS (
        SELECT e.rid, e.source, e.family, e.priority, e.score, e.final_status, e.validated_sources,
          e.final_status = 'needs_review' AND a.rid IS NOT NULL AS review,
          e.final_status = 'pending_enrichment' AS pending,
          e.final_status = 'auto_rejected' AND a.rid IS NOT NULL AS conflict
        FROM ${enrichments} e
        LEFT JOIN approved a ON a.rid = e.rid AND a.source = e.source
        WHERE e.final_status IN ('needs_review', 'pending_enrichment')
          OR (e.final_status = 'auto_rejected' AND e.reason = 'pim_conflict')
      ),
      agg AS (
        SELECT rid,
          COUNTIF(review) AS to_review_count,
          CAST(ROUND(AVG(IF(review, score, NULL))) AS INT64) AS avg_score,
          MIN(IF(review, priority, NULL)) AS review_priority,
          COUNTIF(pending) AS pending_count,
          COUNTIF(conflict) AS conflict_count,
          ARRAY_AGG(DISTINCT IF(review, source, NULL) IGNORE NULLS) AS sources,
          ARRAY_AGG(DISTINCT IF(IF(@view = 'pending', pending, review), family, NULL) IGNORE NULLS) AS families,
          COUNTIF(
            IF(@view = 'pending',
              pending AND (@source IS NULL OR @source IN UNNEST(SPLIT(IFNULL(validated_sources, ''), ','))),
              review AND (@source IS NULL OR source = @source))
            AND (@family IS NULL OR family = @family)
            AND (@priority IS NULL OR priority = @priority)
          ) AS selected
        FROM e GROUP BY rid
      ),
      hotels AS (
        SELECT agg.*, i.name, i.brand, i.city, i.country,
          IF(@view = 'pending',
            FORMAT('%06d|%s', 999999 - pending_count, rid),
            FORMAT('%s|%03d|%s', IFNULL(review_priority, 'P9'), 100 - IFNULL(avg_score, 0), rid)) AS sort_key
        FROM agg JOIN identity i USING (rid)
        WHERE selected > 0
          AND (@brand IS NULL OR i.brand = @brand)
          AND (@search IS NULL
            OR STRPOS(LOWER(CONCAT(IFNULL(i.name, ''), ' ', IFNULL(i.city, ''), ' ', rid)), LOWER(@search)) > 0)
      )
      SELECT * FROM hotels WHERE sort_key > @cursor ORDER BY sort_key LIMIT @limit`,
      {
        view: f.view,
        brand: f.brand ?? null,
        source: f.source ?? null,
        family: f.family ?? null,
        priority: f.priority ?? null,
        search: f.search ?? null,
        cursor: decodeCursor(f.view, f.cursor),
        limit: f.limit + 1,
      },
      HOTEL_FILTER_TYPES,
    );
    return page(f.view, rows, f.limit, (r: Row) => ({
      rid: r.rid as string,
      name: (r.name as string | null) ?? (r.rid as string),
      brand: str(r.brand),
      city: str(r.city),
      country: str(r.country),
      sources: [...(r.sources as string[])].sort(),
      toReviewCount: Number(r.to_review_count),
      avgScore: num(r.avg_score),
      pendingCount: Number(r.pending_count),
      conflictCount: Number(r.conflict_count),
      families: [...(r.families as Family[])].sort(),
    }));
  }

  async facets(): Promise<Facets> {
    const { matches, approved } = this.t;
    const [row] = await this.bq.query<Facets>(`
      SELECT
        ARRAY(SELECT DISTINCT pim_brand FROM ${approved} WHERE pim_brand IS NOT NULL ORDER BY 1) AS brands,
        ARRAY(SELECT DISTINCT source FROM ${matches} ORDER BY 1) AS sources`);
    return row ?? { brands: [], sources: [] };
  }

  async stats(): Promise<Stats> {
    const { matches, enrichments } = this.t;
    // v_approved_matches et v_approved_enrichments recalculées ici avec leurs propres filtres (pipeline/jobs/src/views/) :
    // une lecture de v_enrichments au lieu de deux, pour rester sous les 3 s
    const [row] = await this.bq.query<Record<string, number>>(`
      WITH m AS (SELECT rid, source, final_status FROM ${matches}),
      approved AS (SELECT DISTINCT rid, source FROM m WHERE final_status IN ('auto_approved', 'human_approved')),
      e AS (
        SELECT e.rid, e.final_status, a.rid IS NOT NULL AS ok, e.rid IN (SELECT rid FROM approved) AS has_approved
        FROM ${enrichments} e
        LEFT JOIN approved a ON a.rid = e.rid AND a.source = e.source
        WHERE e.final_status IN ('needs_review', 'pending_enrichment', 'human_approved', 'auto_approved', 'human_corrected')
      ),
      counts AS (
        SELECT
          COUNT(DISTINCT IF(final_status = 'needs_review' AND ok, rid, NULL)) AS hotelsToReview,
          COUNT(DISTINCT IF(final_status = 'pending_enrichment' AND has_approved, rid, NULL)) AS hotelsPending,
          COUNTIF(final_status = 'needs_review' AND ok) AS valuesToReview,
          COUNTIF(final_status = 'pending_enrichment') AS valuesPending,
          COUNTIF(final_status IN ('human_approved', 'auto_approved', 'human_corrected') AND ok) AS valuesApproved
        FROM e
      ),
      mcounts AS (
        SELECT COUNTIF(final_status = 'needs_review') AS matchesToReview,
          COUNTIF(final_status IN ('needs_review', 'pending_judgment')) AS matchesWaiting
        FROM m
      )
      -- pendingForExport : même compte que le job d'export (contrat-back.md § 3)
      SELECT counts.*, matchesToReview, matchesWaiting + valuesToReview + valuesPending AS pendingForExport
      FROM counts CROSS JOIN mcounts`);
    const keys = [
      'hotelsToReview',
      'hotelsPending',
      'valuesToReview',
      'matchesToReview',
      'valuesPending',
      'valuesApproved',
      'pendingForExport',
    ] as const;
    return Object.fromEntries(keys.map((k) => [k, Number(row?.[k] ?? 0)])) as unknown as Stats;
  }

  async hotel(rid: string): Promise<HotelDetail | null> {
    const { matches, approved, enrichments } = this.t;
    const [identities, rows] = await Promise.all([
      this.bq.query<Row>(
        `SELECT rid, ANY_VALUE(pim_name) AS name, ANY_VALUE(pim_brand) AS brand, ANY_VALUE(pim_city) AS city,
          ANY_VALUE(pim_country) AS country,
          ARRAY_AGG(DISTINCT IF(final_status IN ('auto_approved', 'human_approved'), source, NULL) IGNORE NULLS) AS sources
        FROM ${matches} WHERE rid = @rid GROUP BY rid`,
        { rid },
      ),
      // Les auto_rejected autres que pim_conflict ne sont jamais renvoyés
      this.bq.query<Row>(
        `SELECT e.*,
          EXISTS (SELECT 1 FROM ${approved} r WHERE r.rid = e.rid AND r.source = e.source) AS approved
        FROM ${enrichments} e
        WHERE e.rid = @rid
          AND (e.final_status IN ('needs_review', 'pending_enrichment', 'human_approved', 'human_rejected', 'human_corrected')
            OR (e.final_status = 'auto_rejected' AND e.reason = 'pim_conflict'))
        ORDER BY e.priority IS NULL, e.priority, e.score DESC, e.pim_field, e.entity_id`,
        { rid },
      ),
    ]);
    const identity = identities[0];
    if (!identity && rows.length === 0) return null;
    const pick = (keep: (r: Row) => boolean) => rows.filter(keep).map(enrichmentValue);
    return {
      hotel: {
        rid,
        name: (identity?.name as string | null) ?? rid,
        brand: str(identity?.brand),
        city: str(identity?.city),
        country: str(identity?.country),
        sources: [...((identity?.sources as string[]) ?? [])].sort(),
      },
      toReview: pick((r) => r.final_status === 'needs_review' && r.approved === true),
      pending: pick((r) => r.final_status === 'pending_enrichment'),
      conflicts: pick((r) => r.final_status === 'auto_rejected' && r.approved === true),
      decided: pick((r) => String(r.final_status).startsWith('human_')),
    };
  }

  async matches(f: MatchFilters): Promise<Page<MatchItem>> {
    const { matches } = this.t;
    const rows = await this.bq.query<Row>(
      `SELECT * FROM (
        SELECT *, FORMAT('%s|%03d|%s|%s', source, 100 - IFNULL(score, 0), rid, source_hash) AS sort_key
        FROM ${matches}
        WHERE final_status = 'needs_review' AND (@source IS NULL OR source = @source)
      )
      WHERE sort_key > @cursor ORDER BY sort_key LIMIT @limit`,
      { source: f.source ?? null, cursor: decodeCursor('matches', f.cursor), limit: f.limit + 1 },
      { source: 'STRING' },
    );
    return page('matches', rows, f.limit, matchItem);
  }

  async enrichmentStates(enrichmentIds: string[]): Promise<EnrichmentState[]> {
    const { approved, enrichments } = this.t;
    return this.bq.query<EnrichmentState>(
      `SELECT e.enrichment_id AS enrichmentId, e.rid, e.pim_field AS pimField, e.entity_id AS entityId,
        e.final_status AS status,
        EXISTS (SELECT 1 FROM ${approved} r WHERE r.rid = e.rid AND r.source = e.source) AS approved
      FROM ${enrichments} e
      WHERE e.enrichment_id IN UNNEST(@ids)`,
      { ids: enrichmentIds },
      { ids: ['STRING'] },
    );
  }

  async insertEnrichmentDecisions(rows: EnrichmentDecisionRow[], author: string): Promise<void> {
    await this.bq.query(
      `INSERT INTO ${this.bq.table('validation', 'enrichment_decisions')}
        (enrichment_id, rid, pim_field, entity_id, decision, corrected_value, comment, author, decided_at)
      SELECT enrichment_id, rid, pim_field, entity_id, decision, corrected_value, comment, @author, CURRENT_TIMESTAMP()
      FROM UNNEST(@rows)`,
      { rows, author },
      {
        rows: [
          {
            enrichment_id: 'STRING',
            rid: 'STRING',
            pim_field: 'STRING',
            entity_id: 'STRING',
            decision: 'STRING',
            corrected_value: 'STRING',
            comment: 'STRING',
          },
        ],
      },
    );
  }

  async matchStatuses(keys: string[]): Promise<Map<string, string>> {
    const rows = await this.bq.query<{ key: string; final_status: string }>(
      `SELECT CONCAT(rid, '|', source, '|', source_hash) AS key, final_status FROM ${this.t.matches}
      WHERE CONCAT(rid, '|', source, '|', source_hash) IN UNNEST(@keys)`,
      { keys },
      { keys: ['STRING'] },
    );
    return new Map(rows.map((r) => [r.key, r.final_status]));
  }

  async insertMatchDecisions(rows: MatchDecisionRow[], author: string): Promise<void> {
    await this.bq.query(
      `INSERT INTO ${this.bq.table('validation', 'match_decisions')}
        (rid, source, source_hash, decision, comment, author, decided_at)
      SELECT rid, source, source_hash, decision, comment, @author, CURRENT_TIMESTAMP()
      FROM UNNEST(@rows)`,
      { rows, author },
      { rows: [{ rid: 'STRING', source: 'STRING', source_hash: 'STRING', decision: 'STRING', comment: 'STRING' }] },
    );
  }

  async fieldValues(pimFields: string[]): Promise<FieldValues[]> {
    const rows = await this.bq.query<{
      pim_field: string;
      data_type: string;
      multivalue: boolean | null;
      key: string | null;
      value_label: string | null;
    }>(
      `SELECT pim_field, data_type, multivalue, key, value_label
      FROM ${this.bq.table('enhanced', 'v_field_allowed_values')}
      WHERE pim_field IN UNNEST(@fields)
      ORDER BY pim_field, value_label, key`,
      { fields: pimFields },
      { fields: ['STRING'] },
    );
    const fields = new Map<string, FieldValues>();
    for (const r of rows) {
      const field = fields.get(r.pim_field) ?? {
        pimField: r.pim_field,
        dataType: r.data_type,
        multivalue: r.multivalue ?? false,
        values: [],
      };
      if (r.key && !field.values.some((v) => v.key === r.key))
        field.values.push({ key: r.key, label: r.value_label ?? r.key });
      fields.set(r.pim_field, field);
    }
    return [...fields.values()];
  }
}
