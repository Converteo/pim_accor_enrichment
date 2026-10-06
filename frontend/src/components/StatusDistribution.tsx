import { useTranslations } from "next-intl";
import type { StatusSegment } from "@/domain/types";
import styles from "./StatusDistribution.module.css";

interface StatusDistributionProps {
  segments: StatusSegment[];
}

export function StatusDistribution({ segments }: StatusDistributionProps) {
  const t = useTranslations();

  return (
    <>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <span
            key={segment.status}
            className={`${styles.segment} dot-${segment.status}`}
            style={{ width: segment.width }}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {segments.map((segment) => (
          <span key={segment.status} className={styles.item}>
            <i className={`dot dot-${segment.status}`} />
            {t("legend.item", {
              label: t(`status.${segment.status}`),
              count: segment.count,
            })}
          </span>
        ))}
      </div>
    </>
  );
}
