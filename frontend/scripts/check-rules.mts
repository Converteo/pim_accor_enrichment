import {
  appendUnique,
  applyDecisions,
  entityOrdinals,
  formatScore,
  groupByFamily,
  isTime,
  joinCodes,
  matchKey,
  parseThreshold,
  simulate,
  splitCodes,
  thresholdsValid,
  statusTone,
  inTable,
  offeredDecisions,
  textMatches,
  withCount,
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
    count: toReviewCount,
    lastDecidedAt: null,
    outdatedCount: 0,
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
assert(withCount(hotels, "A", 1)[0]?.count === 1, "count updated");
assert(withCount(hotels, "B", 0).length === 1, "empty fiche removed");

// Tables of step 2 (?view=): decided values leave their table, except « Validé manuellement ».
const tableDetail: HotelDetail = { ...detail, values: [value({ enrichmentId: "a", status: "auto_approved" }), value({ enrichmentId: "z", status: "auto_approved" })] };
const fromAuto = applyDecisions(tableDetail, [{ enrichmentId: "a", decision: "human_rejected" }], null, "");
assert(fromAuto.values?.map((v) => v.enrichmentId).join() === "z", "decided value leaves its table");
const fromHuman = applyDecisions(tableDetail, [{ enrichmentId: "a", decision: "human_rejected" }], "x@converteo.com", "", true);
assert(fromHuman.values?.[0]?.status === "human_rejected" && fromHuman.values?.[0]?.lastDecision?.author === "x@converteo.com", "human table keeps the value with its decision");
assert(applyDecisions(detail, [], null, "").values === undefined, "no values without a table");
assert(inTable("review", "needs_review") && inTable("human", "human_corrected") && !inTable("auto_approved", "human_approved"), "inTable");

// The opposite decisions only; an auto-rejected value without a value or outside the PIM format can only be corrected.
const offered = (status: EnrichmentValue["status"], v: string | null = "True", reason: string | null = null) =>
  Object.entries(offeredDecisions({ status, value: v, reason })).filter(([, on]) => on).map(([k]) => k).join();
assert(offered("needs_review") === "approve,reject", "both on needs_review");
assert(offered("auto_approved") === "reject" && offered("human_approved") === "reject", "approved: reject only");
assert(offered("auto_rejected") === "approve" && offered("human_rejected") === "approve", "rejected: approve only");
assert(offered("auto_rejected", null, "already_in_pim") === "" && offered("auto_rejected", "X", "invalid_format") === "", "unfit: correct only");
assert(offered("human_corrected") === "approve,reject", "corrected: both");

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

// Automatic validation thresholds.
const distribution = [
  { score: 20, approvable: 1, total: 2 },
  { score: 60, approvable: 3, total: 5 },
  { score: 90, approvable: 4, total: 6 },
  { score: null, approvable: 1, total: 1 },
];
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
assert(
  same(simulate(distribution, { approveThreshold: null, rejectThreshold: null }), {
    autoApproved: 0,
    autoRejected: 0,
    toValidate: 14,
  }),
  "thresholds off",
);
assert(
  same(simulate(distribution, { approveThreshold: 80, rejectThreshold: 30 }), {
    autoApproved: 4,
    autoRejected: 2,
    toValidate: 8,
  }),
  "approve only approvable items, reject every item under the threshold",
);
assert(
  same(simulate(distribution, { approveThreshold: 60, rejectThreshold: 60 }), {
    autoApproved: 7,
    autoRejected: 2,
    toValidate: 5,
  }),
  "approve threshold inclusive, reject threshold exclusive",
);
assert(parseThreshold("80") === 80 && parseThreshold("0") === 0, "threshold parsed");
assert([" ", "101", "-1", "7.5", "abc"].every((text) => parseThreshold(text) === undefined), "invalid thresholds");
assert(thresholdsValid({ approveThreshold: 80, rejectThreshold: 30 }), "reject under approve");
assert(!thresholdsValid({ approveThreshold: 50, rejectThreshold: 60 }), "reject over approve");
assert(thresholdsValid({ approveThreshold: null, rejectThreshold: 60 }), "approve off");

assert(textMatches("Novotel Suites", "nov") && textMatches("Novotel", " NOV "), "brand search ignores case");
assert(textMatches("Hôtel Mercure", "hotel") && textMatches("Mercure", "ÉRC"), "brand search ignores accents");
assert(!textMatches("ibis", "nov") && textMatches("ibis", ""), "brand search");

console.log("check-rules: ok");
