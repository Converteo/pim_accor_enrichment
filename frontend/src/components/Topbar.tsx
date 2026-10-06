import { useTranslations } from "next-intl";
import type { StatusSegment } from "@/domain/types";
import { KpiStrip } from "./KpiStrip";
import { LanguageSelect } from "./LanguageSelect";
import { StatusDistribution } from "./StatusDistribution";
import styles from "./Topbar.module.css";

interface TopbarProps {
  summary: {
    total: number;
    autoPercent: number;
    reviewCount: number;
    failureCount: number;
  };
  segments: StatusSegment[];
}

export function Topbar({ summary, segments }: TopbarProps) {
  const t = useTranslations("header");

  return (
    <>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.brandBlock}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logo}
              src="/brand/all-accor.svg"
              alt="ALL Accor"
              width={72}
              height={62}
            />
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.product}>
              {t("subtitle")}
              <span className={styles.badge}>{t("badge")}</span>
            </span>
          </div>
          <LanguageSelect />
        </div>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.title}>{t("title")}</h1>
          <KpiStrip
            total={summary.total}
            autoPercent={summary.autoPercent}
            reviewCount={summary.reviewCount}
            failureCount={summary.failureCount}
          />
          <StatusDistribution segments={segments} />
        </div>
      </section>
    </>
  );
}
