import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import styles from "./KpiStrip.module.css";

interface KpiStripProps {
  total: number;
  autoPercent: number;
  reviewCount: number;
  failureCount: number;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  processed: (
    <Icon>
      <rect x="4" y="3" width="13" height="17" rx="2" />
      <path d="M8 8h5M8 12h5M8 16h3" />
      <path d="M20 7v12a2 2 0 0 1-2 2H8" />
    </Icon>
  ),
  auto: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Icon>
  ),
  review: (
    <Icon>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  failure: (
    <Icon>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </Icon>
  ),
};

export function KpiStrip({
  total,
  autoPercent,
  reviewCount,
  failureCount,
}: KpiStripProps) {
  const t = useTranslations();

  const items = [
    { key: "processed", value: String(total), tone: "" },
    { key: "auto", value: t("percent", { value: autoPercent }), tone: styles.success },
    { key: "review", value: String(reviewCount), tone: styles.warn },
    { key: "failure", value: String(failureCount), tone: styles.danger },
  ] as const;

  return (
    <div className={styles.kpis}>
      {items.map((item) => (
        <div key={item.key} className={styles.chip}>
          <span className={styles.tile}>{ICONS[item.key]}</span>
          <div>
            <div className={`${styles.value} ${item.tone}`}>{item.value}</div>
            <div className={styles.label}>{t(`kpi.${item.key}`)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
