import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSelect } from "./LanguageSelect";
import styles from "./Topbar.module.css";

interface TopbarProps {
  /** Hero content under the title: the step cards. */
  children: ReactNode;
  author: string | null;
  onOpenSettings: () => void;
}

export function Topbar({ children, author, onOpenSettings }: TopbarProps) {
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
            <button type="button" className={styles.settings} onClick={onOpenSettings}>
              {t("settings")}
            </button>
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
          {children}
        </div>
      </section>
    </>
  );
}
