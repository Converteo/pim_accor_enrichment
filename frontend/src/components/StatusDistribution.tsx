import { useTranslations } from "next-intl";
import type { Stats } from "@/domain/types";
import styles from "./StatusDistribution.module.css";

interface StatusDistributionProps {
  stats: Stats | null;
}

/** Progress of the values: to review, still being enriched, approved for export. */
export function StatusDistribution({ stats }: StatusDistributionProps) {
  const t = useTranslations();
  if (!stats) return null;

  const segments = [
    { key: "review", tone: "review", count: stats.valuesToReview },
    { key: "pending", tone: "pending", count: stats.valuesPending },
    { key: "approved", tone: "approved", count: stats.valuesApproved },
  ] as const;
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`${styles.segment} dot-${segment.tone}`}
            style={{ width: total === 0 ? "0%" : `${(segment.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {segments.map((segment) => (
          <span key={segment.key} className={styles.item}>
            <i className={`dot dot-${segment.tone}`} />
            {t("legend.item", {
              label: t(`legend.${segment.key}`),
              count: segment.count,
            })}
          </span>
        ))}
      </div>
    </>
  );
}
