import type { useTranslations } from "next-intl";
import { ApiError } from "@/data/source";

type Translate = ReturnType<typeof useTranslations<never>>;

/** Readable name of a pipeline source id (booking_equipements…); unknown ids are shown as is. */
export function sourceLabel(t: Translate, source: string): string {
  const key = `sources.${source}` as Parameters<Translate>[0];
  return t.has(key) ? t(key) : source;
}

/** Message shown for a failed call: the back's French message when it gives one. */
export function errorText(t: Translate, error: unknown): string {
  if (!(error instanceof ApiError)) return t("errors.generic", { status: "?" });
  if (error.status === 0) return t("errors.network");
  if (error.status === 401) return t("errors.unauthorized");
  return error.message || t("errors.generic", { status: error.status });
}
