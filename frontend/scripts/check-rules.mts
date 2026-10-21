import {
  appendUnique,
  applyDecisions,
  entityOrdinals,
  formatScore,
  groupByFamily,
  isTime,
  joinCodes,
  matchKey,
  splitCodes,
  statusTone,
  withReviewCount,
} from "../src/domain/rules";
import type { EnrichmentValue, HotelDetail, HotelSummary } from "../src/domain/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// Test fixtures only: the screen reads the back through /api.
function value(overrides: Partial<EnrichmentValue>): EnrichmentValue {
  return {
    enrichmentId: "e1",
    family: "general",
    priority: "P2",
    entity: "product",
    entityId: null,
    pimField: "ProductFitnessCenter",
    label: "Fitness center",
    pimValue: null,
    value: "True",
    valueLabel: "Yes",
    method: "extracted",
    source: "booking_equipements",
    sourceField: "equipements",
    sourceExcerpt: "Salle de sport",
    score: 92,
    confidence: "high",
    warning: null,
    status: "needs_review",
    reason: null,
    reasonDetail: null,
    finalValue: null,
    lastDecision: null,
    ...overrides,
  };
}

function summary(rid: string, toReviewCount: number): HotelSummary {
  return {
    rid,
    name: rid,
    brand: null,
    city: null,
    country: null,
    sources: [],
    toReviewCount,
    avgScore: null,
    pendingCount: 0,
    conflictCount: 0,
    families: [],
  };
}

// Statuses come from the pipeline, scores only display.
assert(statusTone("needs_review") === "review", "needs_review tone");
assert(statusTone("human_corrected") === "approved", "human_corrected tone");
assert(statusTone("auto_rejected") === "rejected", "auto_rejected tone");
assert(statusTone("pending_judgment") === "pending", "pending_judgment tone");
assert(formatScore(92) === "92", "score on 100");
assert(formatScore(69.6) === "70", "score rounded");
assert(formatScore(null) === "—", "no score");

// Families in display order, priority first, back order kept inside a priority.
const groups = groupByFamily([
  value({ enrichmentId: "a", family: "pool", priority: "P2", score: 90 }),
  value({ enrichmentId: "b", family: "general", priority: "P3" }),
  value({ enrichmentId: "c", family: "pool", priority: "P1", score: 40 }),
  value({ enrichmentId: "d", family: "pool", priority: "P2", score: 80 }),
]);
assert(groups.map((group) => group.family).join() === "general,pool", "family order");
assert(
  groups[1]?.values.map((v) => v.enrichmentId).join() === "c,a,d",
  "priority then back order",
);

// Optimistic decisions: values move to the history, the agent score never changes.
const detail: HotelDetail = {
  hotel: { rid: "B6F6", name: "B6F6", brand: null, city: null, country: null, sources: [] },
  toReview: [value({ enrichmentId: "a" }), value({ enrichmentId: "b", value: "Hammam|Sauna" })],
  pending: [],
  conflicts: [],
  decided: [value({ enrichmentId: "old", status: "human_rejected" })],
};
const after = applyDecisions(
  detail,
  [
    { enrichmentId: "a", decision: "human_approved" },
    { enrichmentId: "b", decision: "human_corrected", correctedValue: "Sauna", comment: "hammam payant" },
  ],
  "test@converteo.com",
  "2026-10-21T10:04:00Z",
);
assert(after.toReview.length === 0, "decided values leave toReview");
assert(after.decided.map((v) => v.enrichmentId).join() === "a,b,old", "history order");
assert(after.decided[0]?.score === 92, "score unchanged");
assert(after.decided[1]?.finalValue === "Sauna", "corrected final value");
assert(after.decided[1]?.lastDecision?.comment === "hammam payant", "comment kept");
assert(detail.toReview.length === 2, "applyDecisions does not mutate");
const rejected = applyDecisions(detail, [{ enrichmentId: "a", decision: "human_rejected" }], null, "");
assert(rejected.toReview.length === 1 && rejected.decided[0]?.finalValue === null, "reject one");

// A fiche with nothing left to review leaves the list.
const hotels = [summary("A", 2), summary("B", 1)];
assert(withReviewCount(hotels, "A", 1)[0]?.toReviewCount === 1, "count updated");
assert(withReviewCount(hotels, "B", 0).length === 1, "empty fiche removed");

// « Charger plus » never shows a fiche twice.
const page2 = appendUnique(hotels, [summary("B", 1), summary("C", 3)], (hotel) => hotel.rid);
assert(page2.map((hotel) => hotel.rid).join() === "A,B,C", "duplicates dropped");

// Entities numbered by id inside a fiche; entities to create are not numbered.
const ordinals = entityOrdinals([
  value({ entity: "Parking", entityId: "368682" }),
  value({ entity: "Parking", entityId: "120001" }),
  value({ entity: "Parking", entityId: "368682" }),
  value({ entity: "Parking", entityId: "new_1" }),
  value({ entity: "Product", entityId: null }),
]);
assert(ordinals.get("parking|120001") === 1 && ordinals.get("parking|368682") === 2, "parking ordinals");
assert(ordinals.size === 2, "new and product not numbered");

// PIM formats.
assert(isTime("07:30") && !isTime("7:30") && !isTime("24:00") && !isTime(null), "HH:MM");
assert(joinCodes(splitCodes("Hammam|Sauna")) === "Hammam|Sauna", "codes round trip");
assert(splitCodes("").length === 0 && splitCodes(null).length === 0, "no codes");
assert(matchKey({ rid: "B6F6", source: "expedia", sourceHash: "9c1e" }) === "B6F6|expedia|9c1e", "match key");

console.log("check-rules: ok");
