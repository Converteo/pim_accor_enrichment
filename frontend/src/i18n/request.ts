import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale();
    if (hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages =
    locale === "en"
      ? (await import("../../messages/en.json")).default
      : (await import("../../messages/fr.json")).default;

  return {
    locale,
    messages,
  };
});
