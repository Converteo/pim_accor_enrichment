// Types de l'API, recopiés du contrat (docs/api-contract.md)

export const FAMILIES = ['general', 'accessibility_safety', 'dining', 'pool', 'parking', 'wellness_fitness'] as const;
export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type Family = (typeof FAMILIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ValueStatus =
  | 'pending_enrichment'
  | 'needs_review'
  | 'auto_approved'
  | 'auto_rejected'
  | 'human_approved'
  | 'human_rejected'
  | 'human_corrected';
export type MatchStatus =
  'pending_judgment' | 'needs_review' | 'auto_approved' | 'auto_rejected' | 'human_approved' | 'human_rejected';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface HotelSummary {
  rid: string;
  name: string;
  brand: string | null;
  city: string | null;
  country: string | null;
  sources: string[];
  toReviewCount: number;
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
  method: 'extracted' | 'converted' | 'inferred' | null;
  source: string | null;
  sourceField: string | null;
  sourceExcerpt: string | null;
  score: number | null;
  confidence: string | null;
  warning: string | null;
  status: ValueStatus;
  reason: string | null;
  reasonDetail: string | null;
  finalValue: string | null;
  lastDecision: Decision | null;
}

export type HotelIdentity = Pick<HotelSummary, 'rid' | 'name' | 'brand' | 'city' | 'country' | 'sources'>;

export interface HotelDetail {
  hotel: HotelIdentity;
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
  page: { scrapedName: string | null; pageName: string | null; url: string | null; country: string | null };
  preVerdict: string | null;
  preReason: string | null;
  score: number | null;
  confidence: string | null;
  judgeReason: string | null;
  justification: string | null;
  status: MatchStatus;
  lastDecision: Decision | null;
}

export interface Stats {
  hotelsToReview: number;
  hotelsPending: number;
  valuesToReview: number;
  matchesToReview: number;
  valuesPending: number;
  valuesApproved: number;
  pendingForExport: number;
}

export interface Facets {
  brands: string[];
  sources: string[];
}

export interface FieldValues {
  pimField: string;
  dataType: string;
  multivalue: boolean;
  values: { key: string; label: string }[];
}
