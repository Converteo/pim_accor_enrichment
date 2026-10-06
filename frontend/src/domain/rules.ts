import {
  STATUS_ORDER,
  type AttributeChoice,
  type Fiche,
  type FicheStatus,
  type Filters,
  type Summary,
} from "./types";

export function statusFor(score: number): FicheStatus {
  if (score >= 1) return "valide";
  if (score > 0.8) return "haute";
  if (score > 0.5) return "revoir";
  return "echec";
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function summarize(fiches: readonly Fiche[]): Summary {
  const counts: Record<FicheStatus, number> = {
    valide: 0,
    haute: 0,
    revoir: 0,
    echec: 0,
  };

  for (const fiche of fiches) {
    counts[fiche.status] += 1;
  }

  const total = fiches.length;
  const autoPercent =
    total === 0
      ? 0
      : Math.round(((counts.valide + counts.haute) / total) * 100);

  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: counts[status],
    width:
      total === 0 ? "0.00%" : `${((counts[status] / total) * 100).toFixed(2)}%`,
  }));

  return {
    total,
    autoPercent,
    reviewCount: counts.revoir,
    failureCount: counts.echec,
    counts,
    tabCounts: {
      all: total,
      valide: counts.valide,
      haute: counts.haute,
      revoir: counts.revoir,
      echec: counts.echec,
    },
    segments,
  };
}

export function isVisible(fiche: Fiche, filters: Filters): boolean {
  if (filters.tab !== "all" && filters.tab !== fiche.status) return false;
  if (filters.brand !== "" && filters.brand !== fiche.brand) return false;
  if (filters.source !== "" && filters.source !== fiche.source) return false;
  if (filters.search !== "") {
    const query = filters.search.toLowerCase();
    const inName = fiche.name.toLowerCase().includes(query);
    const inCity = fiche.city.toLowerCase().includes(query);
    if (!inName && !inCity) return false;
  }
  return true;
}

export function visibleFiches(fiches: readonly Fiche[], filters: Filters): Fiche[] {
  return fiches.filter((fiche) => isVisible(fiche, filters));
}

export function setRowSelected(
  fiches: readonly Fiche[],
  id: number,
  selected: boolean,
): Fiche[] {
  return fiches.map((fiche) =>
    fiche.id === id ? { ...fiche, selected } : fiche,
  );
}

export function setVisibleSelected(
  fiches: readonly Fiche[],
  filters: Filters,
  selected: boolean,
): Fiche[] {
  return fiches.map((fiche) =>
    isVisible(fiche, filters) ? { ...fiche, selected } : fiche,
  );
}

export function clearSelection(fiches: readonly Fiche[]): Fiche[] {
  return fiches.map((fiche) =>
    fiche.selected ? { ...fiche, selected: false } : fiche,
  );
}

export function headerChecked(
  fiches: readonly Fiche[],
  filters: Filters,
): boolean {
  const visible = visibleFiches(fiches, filters);
  return visible.length > 0 && visible.every((fiche) => fiche.selected);
}

export function nextAccepted(
  current: AttributeChoice,
  requested: boolean,
): AttributeChoice {
  return current === requested ? null : requested;
}

export function toggleAttribute(
  fiche: Fiche,
  index: number,
  value: boolean,
): Fiche {
  return {
    ...fiche,
    attrs: fiche.attrs.map((attr, attrIndex) =>
      attrIndex === index
        ? { ...attr, accepted: nextAccepted(attr.accepted, value) }
        : attr,
    ),
  };
}

function copyAttrs(fiche: Fiche): Fiche["attrs"] {
  return fiche.attrs.map((attr) => ({ ...attr }));
}

/** Tiroir : score 1 et statut valide. La sélection ne change pas (spec §8.5). */
export function validateFiche(fiche: Fiche): Fiche {
  return {
    ...fiche,
    score: 1,
    status: "valide",
    attrs: copyAttrs(fiche),
  };
}

/** Lot : même effet, puis la fiche est décochée. */
export function validateFicheInBatch(fiche: Fiche): Fiche {
  return {
    ...validateFiche(fiche),
    selected: false,
  };
}

/** Tiroir : statut échec, score inchangé. La sélection ne change pas (spec §8.6). */
export function rejectFiche(fiche: Fiche): Fiche {
  return {
    ...fiche,
    status: "echec",
    attrs: copyAttrs(fiche),
  };
}

/** Lot : même effet, puis la fiche est décochée. */
export function rejectFicheInBatch(fiche: Fiche): Fiche {
  return {
    ...rejectFiche(fiche),
    selected: false,
  };
}
