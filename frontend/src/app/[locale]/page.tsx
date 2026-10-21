import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ValidationScreen } from "@/components/ValidationScreen";
import { routing } from "@/i18n/routing";
import { currentAuthor } from "@/server/author";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title") };
}

export default async function Page() {
  // Read per request: the reviewer's identity comes from the request headers (IAP).
  return <ValidationScreen author={await currentAuthor(await headers())} />;
}
