import {
  FAMILY_ORDER,
  PRIORITY_ORDER,
  type EnrichmentDecisionItem,
  type EnrichmentValue,
  type Family,
  type HotelDetail,
  type HotelSummary,
  type MatchItem,
  type MatchStatus,
  type ScoreBucket,
  type Thresholds,
  type ValueStatus,
} from "./types";

/** Pill colour of a pipeline status (CSS classes pill-* and dot-* in globals.css). */
export type StatusTone = "approved" | "review" | "pending" | "rejected";

export function statusTone(status: ValueStatus | MatchStatus): StatusTone {
  switch (status) {
    case "auto_approved":
    case "human_approved":
    case "human_corrected":
      return "approved";
    case "needs_review":
      return "review";
    case "pending_enrichment":
    case "pending_judgment":
      return "pending";
    case "auto_rejected":
    case "human_rejected":
      return "rejected";
  }
}

/** Scores travel as 0-100 integers; null when not scored. */
export function formatScore(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

export interface FamilyGroup {
  family: Family;
  values: EnrichmentValue[];
}

/** Values grouped by family in display order, each group sorted by priority (stable: keeps the back's score order). */
export function groupByFamily(values: readonly EnrichmentValue[]): FamilyGroup[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    values: values
      .filter((value) => value.family === family)
      .sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
      ),
  })).filter((group) => group.values.length > 0);
}

/** Optimistic update: decided values leave « à valider » for the history, before the back confirms. */
export function applyDecisions(
  detail: HotelDetail,
  items: readonly EnrichmentDecisionItem[],
  author: string | null,
  decidedAt: string,
): HotelDetail {
  const byId = new Map(items.map((item) => [item.enrichmentId, item]));
  const decided: EnrichmentValue[] = [];
  const toReview = detail.toReview.filter((value) => {
    const item = value.enrichmentId === null ? undefined : byId.get(value.enrichmentId);
    if (!item) return true;
    decided.push({
      ...value,
      status: item.decision,
      finalValue:
        item.decision === "human_rejected" ? null : (item.correctedValue ?? value.value),
      lastDecision: {
        decision: item.decision,
        author: author ?? "",
        decidedAt,
        comment: item.comment ?? null,
        correctedValue: item.correctedValue ?? null,
      },
    });
    return false;
  });
  return { ...detail, toReview, decided: [...decided, ...detail.decided] };
}

/** The list follows the drawer: a fiche with nothing left to review leaves the list. */
export function withReviewCount(
  hotels: readonly HotelSummary[],
  rid: string,
  toReviewCount: number,
): HotelSummary[] {
  return toReviewCount === 0
    ? hotels.filter((hotel) => hotel.rid !== rid)
    : hotels.map((hotel) => (hotel.rid === rid ? { ...hotel, toReviewCount } : hotel));
}

/** Next page appended without the items already shown: a fiche whose score or count changed can come back. */
export function appendUnique<T>(items: readonly T[], page: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set(items.map(idOf));
  return [...items, ...page.filter((item) => !seen.has(idOf(item)))];
}

/** Rank of each entity of a fiche (« parking 2 »), by id order; ids `new_*` are entities the agent proposes to create. */
export function entityOrdinals(values: readonly EnrichmentValue[]): Map<string, number> {
  const ids = new Map<string, Set<string>>();
  for (const value of values) {
    if (value.entityId === null || value.entityId.startsWith("new")) continue;
    const entity = value.entity.toLowerCase();
    ids.set(entity, (ids.get(entity) ?? new Set()).add(value.entityId));
  }
  const ordinals = new Map<string, number>();
  for (const [entity, set] of ids) {
    [...set].sort().forEach((id, index) => ordinals.set(`${entity}|${id}`, index + 1));
  }
  return ordinals;
}

/** Key the back uses in `rejected` for match decisions. */
export function matchKey(match: Pick<MatchItem, "rid" | "source" | "sourceHash">): string {
  return `${match.rid}|${match.source}|${match.sourceHash}`;
}

// PIM format of a corrected value (tables-et-validation.md § 3.3).

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: string | null): boolean {
  return value !== null && HHMM.test(value);
}

export function splitCodes(value: string | null): string[] {
  return value === null || value === "" ? [] : value.split("|");
}

export function joinCodes(keys: readonly string[]): string {
  return keys.join("|");
}

export function cityLine(place: { city: string | null; country: string | null }): string {
  return [place.city, place.country].filter(Boolean).join(", ");
}

// Automatic validation thresholds: same rule as the views v_matches and v_enrichments (pipeline/jobs/src/views).

export interface Outcome {
  autoApproved: number;
  autoRejected: number;
  toValidate: number;
}

/** What the items without a human decision would become with these thresholds (null = off). */
export function simulate(distribution: readonly ScoreBucket[], thresholds: Thresholds): Outcome {
  const { approveThreshold: approve, rejectThreshold: reject } = thresholds;
  const outcome: Outcome = { autoApproved: 0, autoRejected: 0, toValidate: 0 };
  for (const bucket of distribution) {
    if (bucket.score !== null && reject !== null && bucket.score < reject) {
      outcome.autoRejected += bucket.total;
      continue;
    }
    const approved = bucket.score !== null && approve !== null && bucket.score >= approve ? bucket.approvable : 0;
    outcome.autoApproved += approved;
    outcome.toValidate += bucket.total - approved;
  }
  return outcome;
}

/** A threshold typed in the panel: an integer from 0 to 100, or null when off. */
export function parseThreshold(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
}

export function thresholdsValid({ approveThreshold, rejectThreshold }: Thresholds): boolean {
  return approveThreshold === null || rejectThreshold === null || rejectThreshold <= approveThreshold;
}
