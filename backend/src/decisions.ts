import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Repository } from './repository.js';

const comment = z.string().trim().max(2000).nullish();

export const enrichmentDecisionsBody = z.object({
  items: z
    .array(
      z.object({
        enrichmentId: z.string().trim().min(1),
        decision: z.string().max(50),
        correctedValue: z.string().max(1000).nullish(),
        comment,
      }),
    )
    .min(1)
    .max(1000),
});
export type EnrichmentDecisionItem = z.infer<typeof enrichmentDecisionsBody>['items'][number];

/** État courant d'une valeur dans v_enrichments, relu côté serveur avant d'écrire. */
export interface EnrichmentState {
  enrichmentId: string;
  rid: string;
  pimField: string;
  entityId: string | null;
  status: string;
  /** Son rapprochement est toujours dans v_approved_matches. */
  approved: boolean;
}

/** Ligne de validation.enrichment_decisions, sans author ni decided_at (posés au moment de l'INSERT). */
export interface EnrichmentDecisionRow {
  enrichment_id: string;
  rid: string;
  pim_field: string;
  entity_id: string | null;
  decision: string;
  corrected_value: string | null;
  comment: string | null;
}

export interface Rejected<K extends string> {
  code: string;
  message: string;
  key: K;
}

const ENRICHMENT_DECISIONS = ['human_approved', 'human_rejected', 'human_corrected'];
const DECIDABLE = ['needs_review', 'human_approved', 'human_rejected', 'human_corrected'];

const reject = (key: string, code: string, message: string) => ({ key, code, message });

/**
 * Un élément répété dans la demande n'est pas écrit : deux lignes du même INSERT auraient le même decided_at et la vue
 * en choisirait une au hasard. Un seul refus par clé, pour que accepted et rejected restent disjoints.
 */
function dedupe<T>(items: T[], keyOf: (item: T) => string): { unique: T[]; duplicates: Rejected<string>[] } {
  const count = new Map<string, number>();
  for (const item of items) count.set(keyOf(item), (count.get(keyOf(item)) ?? 0) + 1);
  const repeated = [...count].filter(([, n]) => n > 1).map(([key]) => key);
  return {
    unique: items.filter((item) => count.get(keyOf(item)) === 1),
    duplicates: repeated.map((key) =>
      reject(key, 'duplicate', 'Élément présent plusieurs fois dans la demande : rien n’est écrit pour lui.'),
    ),
  };
}

/** Contrôles de tables-et-validation.md § 3.2-3.3, élément par élément ; aucune écriture. */
export function checkEnrichmentDecisions(
  items: EnrichmentDecisionItem[],
  states: Map<string, EnrichmentState>,
): { rows: EnrichmentDecisionRow[]; rejected: Rejected<string>[] } {
  const rows: EnrichmentDecisionRow[] = [];
  const { unique, duplicates: rejected } = dedupe(items, (i) => i.enrichmentId);
  for (const item of unique) {
    const id = item.enrichmentId;
    const state = states.get(id);
    const corrected = item.correctedValue?.trim() || null;
    if (!ENRICHMENT_DECISIONS.includes(item.decision))
      rejected.push(
        reject(
          id,
          'invalid_decision',
          'Décision inconnue : human_approved, human_rejected ou human_corrected attendue.',
        ),
      );
    else if (!state)
      rejected.push(
        reject(id, 'not_found', 'Valeur introuvable : la fiche a peut-être été ré-enrichie, rechargez-la.'),
      );
    else if (!DECIDABLE.includes(state.status))
      rejected.push(reject(id, 'invalid_status', `Valeur au statut ${state.status} : décision impossible.`));
    else if (!state.approved)
      rejected.push(reject(id, 'match_not_approved', "Le rapprochement de cette source n'est plus validé."));
    else if (item.decision === 'human_corrected' && !corrected)
      rejected.push(reject(id, 'corrected_value_required', 'Valeur corrigée obligatoire pour une correction.'));
    else
      rows.push({
        enrichment_id: id,
        rid: state.rid,
        pim_field: state.pimField,
        entity_id: state.entityId,
        decision: item.decision,
        corrected_value: item.decision === 'human_corrected' ? corrected : null,
        comment: item.comment || null,
      });
  }
  return { rows, rejected };
}

export const matchDecisionsBody = z.object({
  items: z
    .array(
      z.object({
        rid: z.string().trim().min(1),
        source: z.string().trim().min(1),
        sourceHash: z.string().trim().min(1),
        decision: z.string().max(50),
        comment,
      }),
    )
    .min(1)
    .max(1000),
});
export type MatchDecisionItem = z.infer<typeof matchDecisionsBody>['items'][number];

/** Ligne de validation.match_decisions, sans author ni decided_at. */
export interface MatchDecisionRow {
  rid: string;
  source: string;
  source_hash: string;
  decision: string;
  comment: string | null;
}

const MATCH_DECISIONS = ['human_approved', 'human_rejected'];
const DECIDABLE_MATCH = ['needs_review', 'human_approved', 'human_rejected'];
export const matchKey = (m: { rid: string; source: string; sourceHash: string }) =>
  `${m.rid}|${m.source}|${m.sourceHash}`;

/**
 * Contrôles de tables-et-validation.md § 3.1. statuses : clé rid|source|sourceHash → final_status dans v_matches.
 * Si la page a changé, son empreinte aussi : la clé est introuvable et la décision refusée (voulu).
 */
export function checkMatchDecisions(
  items: MatchDecisionItem[],
  statuses: Map<string, string>,
): { rows: MatchDecisionRow[]; rejected: Rejected<string>[] } {
  const rows: MatchDecisionRow[] = [];
  const { unique, duplicates: rejected } = dedupe(items, matchKey);
  for (const item of unique) {
    const key = matchKey(item);
    const status = statuses.get(key);
    if (!MATCH_DECISIONS.includes(item.decision))
      rejected.push(reject(key, 'invalid_decision', 'Décision inconnue : human_approved ou human_rejected attendue.'));
    else if (!status)
      rejected.push(
        reject(key, 'not_found', 'Rapprochement introuvable : la page a peut-être changé depuis, rechargez la liste.'),
      );
    else if (!DECIDABLE_MATCH.includes(status))
      rejected.push(reject(key, 'invalid_status', `Rapprochement au statut ${status} : décision impossible.`));
    else
      rows.push({
        rid: item.rid,
        source: item.source,
        source_hash: item.sourceHash,
        decision: item.decision,
        comment: item.comment || null,
      });
  }
  return { rows, rejected };
}

@Injectable()
export class DecisionsService {
  constructor(@Inject(Repository) private readonly repo: Repository) {}

  async decideEnrichments(items: EnrichmentDecisionItem[], author: string) {
    const states = await this.repo.enrichmentStates([...new Set(items.map((i) => i.enrichmentId))]);
    const { rows, rejected } = checkEnrichmentDecisions(items, new Map(states.map((s) => [s.enrichmentId, s])));
    if (rows.length) await this.repo.insertEnrichmentDecisions(rows, author);
    return {
      accepted: rows.map((r) => r.enrichment_id),
      rejected: rejected.map(({ key, code, message }) => ({ enrichmentId: key, code, message })),
    };
  }

  async decideMatches(items: MatchDecisionItem[], author: string) {
    const statuses = await this.repo.matchStatuses([...new Set(items.map(matchKey))]);
    const { rows, rejected } = checkMatchDecisions(items, statuses);
    if (rows.length) await this.repo.insertMatchDecisions(rows, author);
    return { accepted: rows.map((r) => matchKey({ ...r, sourceHash: r.source_hash })), rejected };
  }
}
