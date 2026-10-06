import { statusFor } from "../domain/rules";
import type { Fiche } from "../domain/types";
import { demoFiches } from "./demo-fiches";

export interface FicheSource {
  load(): Fiche[];
}

function distinctSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

export const brandOptions: readonly string[] = distinctSorted(
  demoFiches.map((fiche) => fiche.brand),
);

export const sourceOptions: readonly string[] = distinctSorted(
  demoFiches.map((fiche) => fiche.source),
);

function toFiche(raw: (typeof demoFiches)[number]): Fiche {
  return {
    id: raw.id,
    name: raw.name,
    brand: raw.brand,
    city: raw.city,
    source: raw.source,
    score: raw.score,
    status: statusFor(raw.score),
    selected: false,
    attrs: raw.attrs.map((attr) => ({
      label: attr.label,
      current: attr.current,
      proposed: attr.proposed,
      score: attr.score,
      src: attr.src,
      accepted: null,
    })),
  };
}

export const demoSource: FicheSource = {
  load() {
    return demoFiches.map(toFiche);
  },
};

export function loadFiches(): Fiche[] {
  return demoSource.load();
}
