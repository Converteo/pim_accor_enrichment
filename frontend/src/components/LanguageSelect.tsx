import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import styles from "./LanguageSelect.module.css";

function isLocale(value: string): value is "fr" | "en" {
  return value === "fr" || value === "en";
}

export function LanguageSelect() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("header");

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isLocale(next) || next === locale) return;
    router.replace(pathname, { locale: next });
  }

  return (
    <select
      className={styles.select}
      aria-label={t("language")}
      value={locale}
      onChange={onChange}
    >
      <option value="fr">Français</option>
      <option value="en">English</option>
    </select>
  );
}
