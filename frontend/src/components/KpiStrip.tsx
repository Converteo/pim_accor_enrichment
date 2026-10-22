import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Stats } from "@/domain/types";
import styles from "./KpiStrip.module.css";

interface KpiStripProps {
  stats: Stats | null;
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
  hotelsToReview: (
    <Icon>
      <rect x="4" y="3" width="13" height="17" rx="2" />
      <path d="M8 8h5M8 12h5M8 16h3" />
      <path d="M20 7v12a2 2 0 0 1-2 2H8" />
    </Icon>
  ),
  valuesToReview: (
    <Icon>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  matchesToReview: (
    <Icon>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </Icon>
  ),
  valuesPending: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  ),
  valuesApproved: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Icon>
  ),
};

// Order of the workflow: matches first, then the attributes they bring.
const ITEMS = [
  { key: "matchesToReview", tone: styles.warn },
  { key: "hotelsToReview", tone: "" },
  { key: "valuesToReview", tone: "" },
  { key: "valuesPending", tone: styles.warn },
  { key: "valuesApproved", tone: styles.success },
] as const;

export function KpiStrip({ stats }: KpiStripProps) {
  const t = useTranslations();

  return (
    <div className={styles.kpis}>
      {ITEMS.map((item) => (
        <div key={item.key} className={styles.chip}>
          <span className={styles.tile}>{ICONS[item.key]}</span>
          <div>
            <div className={`${styles.value} ${item.tone}`}>
              {stats ? t("number", { value: stats[item.key] }) : "—"}
            </div>
            <div className={styles.label}>{t(`kpi.${item.key}`)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
