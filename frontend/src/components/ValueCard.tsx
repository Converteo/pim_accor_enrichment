import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatScore } from "@/domain/rules";
import type { EnrichmentValue } from "@/domain/types";
import { sourceLabel } from "./labels";
import styles from "./ValueCard.module.css";

interface ValueCardProps {
  value: EnrichmentValue;
  /** Decision controls, under the score. */
  children?: ReactNode;
}

const CONFIDENCES = ["high", "medium", "low"];

/** One proposed value: PIM value, proposal, the source excerpt that justifies it, method, confidence, score. */
export function ValueCard({ value, children }: ValueCardProps) {
  const t = useTranslations();
  const proposed = value.valueLabel ?? value.value ?? "—";

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>
          {value.label}
          <span className={styles.field}>{value.pimField}</span>
        </span>
        <span className={styles.chips}>
          {value.entity.toLowerCase() !== "product" ? (
            <span className={styles.chip}>
              {value.entityId ? `${value.entity} ${value.entityId}` : value.entity}
            </span>
          ) : null}
          <span className={styles.chip}>{value.priority}</span>
        </span>
      </div>
      <div className={styles.vals}>
        <div className={styles.value}>
          <span className={styles.key}>{t("value.current")}</span>
          {value.pimValue ?? t("value.empty")}
        </div>
        <div className={`${styles.value} ${styles.proposed}`}>
          <span className={styles.key}>{t("value.proposed")}</span>
          {proposed}
          {value.value && value.value !== proposed ? (
            <span className={styles.code}>{value.value}</span>
          ) : null}
        </div>
      </div>
      {value.sourceExcerpt ? (
        <blockquote className={styles.excerpt}>« {value.sourceExcerpt} »</blockquote>
      ) : null}
      <div className={styles.badges}>
        {value.source ? (
          <span className={styles.source}>
            {t("value.via", { source: sourceLabel(t, value.source) })}
            {value.sourceField ? ` · ${value.sourceField}` : ""}
          </span>
        ) : null}
        {value.method ? (
          <span className={styles.badge}>{t(`value.method.${value.method}`)}</span>
        ) : null}
        {value.confidence ? (
          <span className={styles.badge}>
            {t("value.confidence", {
              level: CONFIDENCES.includes(value.confidence)
                ? t(`value.confidenceLevel.${value.confidence as "high" | "medium" | "low"}`)
                : value.confidence,
            })}
          </span>
        ) : null}
      </div>
      {value.reasonDetail ? <p className={styles.detail}>{value.reasonDetail}</p> : null}
      {value.warning ? (
        <p className={styles.warning} role="note">
          <span aria-hidden="true">⚠</span> {value.warning}
        </p>
      ) : null}
      <div className={styles.bottom}>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${value.score ?? 0}%` }} />
        </div>
        <span className={styles.score}>
          {t("value.score", { score: formatScore(value.score) })}
        </span>
      </div>
      {children}
    </article>
  );
}
