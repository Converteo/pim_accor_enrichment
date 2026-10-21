import { useTranslations } from "next-intl";
import type { Stats } from "@/domain/types";
import { KpiStrip } from "./KpiStrip";
import { LanguageSelect } from "./LanguageSelect";
import { StatusDistribution } from "./StatusDistribution";
import styles from "./Topbar.module.css";

interface TopbarProps {
  stats: Stats | null;
  author: string | null;
}

export function Topbar({ stats, author }: TopbarProps) {
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
            <span className={styles.product}>{t("subtitle")}</span>
          </div>
          <div className={styles.navEnd}>
            <span className={author ? styles.badge : `${styles.badge} ${styles.noUser}`}>
              {author ?? t("noUser")}
            </span>
            <LanguageSelect />
          </div>
        </div>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.title}>{t("title")}</h1>
          <KpiStrip stats={stats} />
          <StatusDistribution stats={stats} />
        </div>
      </section>
    </>
  );
}
