import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { entityOrdinals, groupByFamily, statusTone } from "@/domain/rules";
import type { EnrichmentValue, HotelDetail } from "@/domain/types";
import { entityLabel, readableValue, sourceLabel } from "./labels";
import { ValueCard } from "./ValueCard";
import styles from "./HotelDetailView.module.css";

interface HotelDetailViewProps {
  detail: HotelDetail;
  /** Decision controls of one value to review (PIM-23). */
  renderActions?: (value: EnrichmentValue) => ReactNode;
}

export function HotelDetailView({ detail, renderActions }: HotelDetailViewProps) {
  const t = useTranslations();
  const format = useFormatter();
  // The reviewer's time zone: next-intl would otherwise use the server's (UTC on Cloud Run).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ordinals = entityOrdinals([...detail.toReview, ...detail.pending, ...detail.conflicts, ...detail.decided]);

  function entityText(value: EnrichmentValue): string {
    const entity = entityLabel(t, value, ordinals);
    return entity ? `${value.label} · ${entity}` : value.label;
  }

  return (
    <>
      {detail.toReview.length === 0 ? (
        <p className={styles.done}>{t("detail.nothingToReview")}</p>
      ) : null}
      {groupByFamily(detail.toReview).map((group) => (
        <details key={group.family} className={styles.family} open>
          <summary className={styles.summary}>
            {t(`families.${group.family}`)}
            <span className={styles.count}>{group.values.length}</span>
          </summary>
          {group.values.map((value) => (
            <ValueCard
              key={value.enrichmentId ?? `${value.pimField}-${value.entityId}`}
              value={value}
              entity={entityLabel(t, value, ordinals)}
            >
              {renderActions?.(value)}
            </ValueCard>
          ))}
        </details>
      ))}

      {detail.pending.length > 0 ? (
        <details className={styles.block}>
          <summary className={styles.summary}>
            {t("detail.pending")}
            <span className={styles.count}>{detail.pending.length}</span>
          </summary>
          <p className={styles.hint}>{t("detail.pendingHint")}</p>
          <ul className={styles.list}>
            {detail.pending.map((value) => (
              <li key={`${value.pimField}-${value.entityId}`}>
                {entityText(value)}
                <span className={styles.muted}> · {t(`families.${value.family}`)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {detail.conflicts.length > 0 ? (
        <details className={styles.block} open>
          <summary className={styles.summary}>
            {t("detail.conflicts")}
            <span className={styles.count}>{detail.conflicts.length}</span>
          </summary>
          <p className={styles.hint}>{t("detail.conflictsHint")}</p>
          <ul className={styles.list}>
            {detail.conflicts.map((value) => (
              <li key={value.enrichmentId ?? `${value.pimField}-${value.entityId}`}>
                <strong>{entityText(value)}</strong>
                <div>
                  {t("detail.pimHas", { value: readableValue(t, value.pimValue) })}
                </div>
                <div>
                  {t("detail.sourceSays", {
                    value: value.valueLabel ?? readableValue(t, value.value),
                    source: value.source ? sourceLabel(t, value.source) : "—",
                  })}
                </div>
                {value.reasonDetail ? <div className={styles.muted}>{value.reasonDetail}</div> : null}
                {value.sourceExcerpt ? (
                  <div className={styles.quote}>« {value.sourceExcerpt} »</div>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {detail.decided.length > 0 ? (
        <details className={styles.block}>
          <summary className={styles.summary}>
            {t("detail.history")}
            <span className={styles.count}>{detail.decided.length}</span>
          </summary>
          <ul className={styles.list}>
            {detail.decided.map((value) => (
              <li key={value.enrichmentId ?? `${value.pimField}-${value.entityId}`}>
                <div className={styles.historyTop}>
                  <strong>{entityText(value)}</strong>
                  <span className={`status-pill pill-${statusTone(value.status)}`}>
                    {t(`decision.${value.status as "human_approved" | "human_rejected" | "human_corrected"}`)}
                  </span>
                </div>
                <div>
                  {value.status === "human_corrected" || value.valueLabel === null
                    ? readableValue(t, value.finalValue ?? value.value)
                    : value.valueLabel}
                </div>
                {value.lastDecision ? (
                  <div className={styles.muted}>
                    {t("detail.decidedBy", {
                      author: value.lastDecision.author || "—",
                      date: format.dateTime(new Date(value.lastDecision.decidedAt), {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone,
                      }),
                    })}
                    {value.lastDecision.comment ? ` · « ${value.lastDecision.comment} »` : ""}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
