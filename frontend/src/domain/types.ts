// Types of the back ↔ front contract (pim-chantier/api-contract.md, backend/docs/api-contract.md).
// Statuses are the pipeline's raw values: the front never derives a status from a score.

export type ValueStatus =
  | "pending_enrichment"
  | "needs_review"
  | "auto_approved"
  | "auto_rejected"
  | "human_approved"
  | "human_rejected"
  | "human_corrected";

export type MatchStatus =
  | "pending_judgment"
  | "needs_review"
  | "auto_approved"
  | "auto_rejected"
  | "human_approved"
  | "human_rejected";

export type Family =
  | "general"
  | "accessibility_safety"
  | "dining"
  | "pool"
  | "parking"
  | "wellness_fitness";

export type Priority = "P1" | "P2" | "P3";

export interface HotelSummary {
  rid: string;
  name: string;
  brand: string | null;
  city: string | null;
  country: string | null;
  sources: string[];
  toReviewCount: number;
  /** Values to review flagged « non prioritaire, à vérifier » (outdated), among toReviewCount. */
  outdatedCount: number;
  /** 0-100 */
  avgScore: number | null;
  pendingCount: number;
  conflictCount: number;
  families: Family[];
}

export interface Decision {
  decision: string;
  author: string;
  decidedAt: string;
  comment: string | null;
  correctedValue: string | null;
}

export interface EnrichmentValue {
  /** null for pending_enrichment */
  enrichmentId: string | null;
  family: Family;
  priority: Priority;
  entity: string;
  entityId: string | null;
  pimField: string;
  label: string;
  pimValue: string | null;
  value: string | null;
  valueLabel: string | null;
  method: "extracted" | "converted" | "inferred" | null;
  source: string | null;
  sourceField: string | null;
  sourceExcerpt: string | null;
  /** 0-100 */
  score: number | null;
  confidence: string | null;
  warning: string | null;
  /** Short French reason when the value is « non prioritaire, à vérifier » (e.g. source page under a former name). */
  outdated: string | null;
  status: ValueStatus;
  reason: string | null;
  reasonDetail: string | null;
  finalValue: string | null;
  lastDecision: Decision | null;
}

export interface HotelDetail {
  hotel: Pick<HotelSummary, "rid" | "name" | "brand" | "city" | "country" | "sources">;
  toReview: EnrichmentValue[];
  pending: EnrichmentValue[];
  conflicts: EnrichmentValue[];
  decided: EnrichmentValue[];
}

export interface MatchItem {
  rid: string;
  source: string;
  sourceHash: string;
  pim: {
    name: string | null;
    city: string | null;
    country: string | null;
    brand: string | null;
    address: string | null;
  };
  page: {
    scrapedName: string | null;
    pageName: string | null;
    url: string | null;
    country: string | null;
  };
  preVerdict: string | null;
  preReason: string | null;
  /** 0-100 */
  score: number | null;
  confidence: string | null;
  judgeReason: string | null;
  justification: string | null;
  /** Judge agent's verdict (same_hotel, different_hotel, undetermined); null until judged. */
  verdict: string | null;
  status: MatchStatus;
  lastDecision: Decision | null;
}

export interface Stats {
  hotelsToReview: number;
  hotelsPending: number;
  valuesToReview: number;
  matchesToReview: number;
  /** Matches waiting for the judge agent (pending_judgment). */
  matchesPending: number;
  /** Validated by the thresholds, for information (« Validés automatiquement » tab). */
  matchesAutoApproved: number;
  valuesAutoApproved: number;
  valuesPending: number;
  valuesApproved: number;
  pendingForExport: number;
}

/** Value validated by the threshold, with its fiche (read only). */
export interface AutoApprovedValue {
  hotel: Pick<HotelSummary, "rid" | "name" | "brand" | "city" | "country">;
  value: EnrichmentValue;
  approveThreshold: number | null;
}

export type AutoValidationStep = "match" | "enrichment";

export interface AutoValidationChange {
  approveThreshold: number | null;
  rejectThreshold: number | null;
  comment: string | null;
  author: string;
  setAt: string;
}

/** Items without a human decision the thresholds apply to, by score. */
export interface ScoreBucket {
  score: number | null;
  /** Could be approved automatically (rules other than the score are met). */
  approvable: number;
  total: number;
}

export interface AutoValidationStepState {
  step: AutoValidationStep;
  /** null = off. */
  approveThreshold: number | null;
  rejectThreshold: number | null;
  /** Nothing set in the app yet: deployment defaults. */
  isDefault: boolean;
  distribution: ScoreBucket[];
  /** Most recent first. */
  history: AutoValidationChange[];
}

export interface AutoValidation {
  canEdit: boolean;
  steps: AutoValidationStepState[];
}

export interface Thresholds {
  approveThreshold: number | null;
  rejectThreshold: number | null;
}

export interface Facets {
  brands: string[];
  sources: string[];
  verdicts: string[];
}

export interface FieldValues {
  pimField: string;
  dataType: string;
  multivalue: boolean;
  values: { key: string; label: string }[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type ValueDecision = "human_approved" | "human_rejected" | "human_corrected";
export type MatchDecision = "human_approved" | "human_rejected";

export interface EnrichmentDecisionItem {
  enrichmentId: string;
  decision: ValueDecision;
  correctedValue?: string;
  comment?: string;
}

export interface MatchDecisionItem {
  rid: string;
  source: string;
  sourceHash: string;
  decision: MatchDecision;
  comment?: string;
}

/** `rejected` items carry `enrichmentId` (values) or `key` = rid|source|sourceHash (matches). */
export interface DecisionResult<K extends "enrichmentId" | "key"> {
  accepted: string[];
  rejected: ({ code: string; message: string } & Record<K, string>)[];
}

export interface ExportRecord {
  exportId: string;
  path: string;
  rowCount: number;
  hotelCount: number;
  files: string[];
  triggeredBy: string;
  exportedAt: string;
}

export interface ExportStatus {
  pendingCount: number;
  /** False while items wait for a decision or while an export runs. */
  canExport: boolean;
  /** Export job running now, launched from any tab: the banner resumes following it. */
  runningExecutionId: string | null;
  history: ExportRecord[];
}

export interface ExportExecution {
  state: "running" | "succeeded" | "failed";
  message?: string;
}

// Screen state (front only)

export type TabKey = "review" | "matches" | "auto";

/** Order of the reviewer's work: matches first (their values appear once approved), then attributes. */
export const TAB_ORDER: readonly TabKey[] = ["matches", "review", "auto"];

/** Tabs with nothing to decide, shown in a lighter style. */
export const INFO_TABS: readonly TabKey[] = ["auto"];

export const FAMILY_ORDER: readonly Family[] = [
  "general",
  "accessibility_safety",
  "dining",
  "pool",
  "parking",
  "wellness_fitness",
];

export const PRIORITY_ORDER: readonly Priority[] = ["P1", "P2", "P3"];

export interface Filters {
  search: string;
  brand: string;
  source: string;
  family: "" | Family;
  priority: "" | Priority;
  /** Judge agent's verdict: matches only. */
  verdict: string;
  /** Values flagged « non prioritaire » (outdated): fiches to review only. */
  outdated: "" | "hide" | "only";
}

/** The filters /matches understands. */
export type MatchFilters = Pick<Filters, "source" | "brand" | "verdict">;
