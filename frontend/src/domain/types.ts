export type FicheStatus = "valide" | "haute" | "revoir" | "echec";

export type TabKey = "all" | FicheStatus;

/** null neutre, true accepté, false rejeté. Affichage seulement. */
export type AttributeChoice = boolean | null;

export interface Attribute {
  label: string;
  current: string;
  proposed: string;
  score: number;
  src: string;
  accepted: AttributeChoice;
}

export interface Fiche {
  id: number;
  name: string;
  brand: string;
  city: string;
  source: string;
  score: number;
  status: FicheStatus;
  selected: boolean;
  attrs: Attribute[];
}

export interface Filters {
  search: string;
  brand: string;
  source: string;
  tab: TabKey;
}

export const STATUS_ORDER: readonly FicheStatus[] = [
  "valide",
  "haute",
  "revoir",
  "echec",
];

export const TAB_ORDER: readonly TabKey[] = [
  "all",
  "valide",
  "haute",
  "revoir",
  "echec",
];

export interface StatusSegment {
  status: FicheStatus;
  count: number;
  width: string;
}

export interface Summary {
  total: number;
  autoPercent: number;
  reviewCount: number;
  failureCount: number;
  counts: Record<FicheStatus, number>;
  tabCounts: Record<TabKey, number>;
  segments: StatusSegment[];
}
