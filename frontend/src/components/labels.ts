import type { useTranslations } from "next-intl";
import { ApiError } from "@/data/source";
import { splitCodes } from "@/domain/rules";
import type { EnrichmentValue } from "@/domain/types";

type Translate = ReturnType<typeof useTranslations<never>>;

/** Readable label of a pipeline code (`group.code` in the messages); unknown codes are shown as is. */
export function codeLabel(t: Translate, group: string, code: string): string {
  const key = `${group}.${code}` as Parameters<Translate>[0];
  return t.has(key) ? t(key) : code;
}

/** PIM raw value made readable: booleans in words, list codes separated by commas. */
export function readableValue(t: Translate, value: string | null): string {
  if (value === null || value === "") return "—";
  if (value === "True") return t("value.yes");
  if (value === "False") return t("value.no");
  return splitCodes(value).join(", ");
}

/** « Parking 2 », « Piscine (nouvelle) »; null for the hotel itself. */
export function entityLabel(t: Translate, value: EnrichmentValue, ordinals: Map<string, number>): string | null {
  const entity = value.entity.toLowerCase();
  if (entity === "product") return null;
  const name = codeLabel(t, "entities", entity);
  if (value.entityId === null) return name;
  if (value.entityId.startsWith("new")) return t("value.newEntity", { name });
  const ordinal = ordinals.get(`${entity}|${value.entityId}`);
  return ordinal === undefined ? name : `${name} ${ordinal}`;
}

/** Country name from an ISO code (« LU » → « Luxembourg »); other values unchanged. */
export function countryName(locale: string, country: string | null): string | null {
  if (!country || !/^[A-Z]{2}$/.test(country)) return country;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

export function sourceLabel(t: Translate, source: string): string {
  return codeLabel(t, "sources", source);
}

/** Message shown for a failed call: the back's French message when it gives one. */
export function errorText(t: Translate, error: unknown): string {
  if (!(error instanceof ApiError)) return t("errors.generic", { status: "?" });
  if (error.status === 0) return t("errors.network");
  if (error.status === 401) return t("errors.unauthorized");
  return error.message || t("errors.generic", { status: error.status });
}
