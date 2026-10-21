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

/** Contrôles de tables-et-validation.md § 3.2-3.3, élément par élément ; aucune écriture. */
export function checkEnrichmentDecisions(
  items: EnrichmentDecisionItem[],
  states: Map<string, EnrichmentState>,
): { rows: EnrichmentDecisionRow[]; rejected: Rejected<string>[] } {
  const rows: EnrichmentDecisionRow[] = [];
  const rejected: Rejected<string>[] = [];
  // Un identifiant répété n'est pas écrit : deux lignes du même INSERT auraient le même decided_at et la vue en
  // choisirait une au hasard. Un seul refus par identifiant, pour que accepted et rejected restent disjoints.
  const count = new Map<string, number>();
  for (const { enrichmentId } of items) count.set(enrichmentId, (count.get(enrichmentId) ?? 0) + 1);
  const seen = new Set<string>();
  for (const item of items) {
    const id = item.enrichmentId;
    if (seen.has(id)) continue;
    seen.add(id);
    const state = states.get(id);
    const corrected = item.correctedValue?.trim() || null;
    if (count.get(id)! > 1)
      rejected.push(
        reject(id, 'duplicate', 'Valeur présente plusieurs fois dans la demande : rien n’est écrit pour elle.'),
      );
    else if (!ENRICHMENT_DECISIONS.includes(item.decision))
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
}
