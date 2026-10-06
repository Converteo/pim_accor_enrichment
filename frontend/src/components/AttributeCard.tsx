import { useTranslations } from "next-intl";
import type { AttributeChoice, FicheStatus } from "@/domain/types";
import styles from "./AttributeCard.module.css";

interface AttributeCardProps {
  label: string;
  src: string;
  current: string;
  proposed: string;
  scoreLabel: string;
  barStatus: FicheStatus;
  barWidth: string;
  accepted: AttributeChoice;
  onAccept: () => void;
  onReject: () => void;
}

export function AttributeCard({
  label,
  src,
  current,
  proposed,
  scoreLabel,
  barStatus,
  barWidth,
  accepted,
  onAccept,
  onReject,
}: AttributeCardProps) {
  const t = useTranslations();
  const cardClass =
    accepted === true
      ? `${styles.card} ${styles.accepted}`
      : accepted === false
        ? `${styles.card} ${styles.rejected}`
        : styles.card;

  return (
    <article className={cardClass}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={styles.source}>{t("drawer.via", { src })}</span>
      </div>
      <div className={styles.vals}>
        <div className={styles.value}>
          <span className={styles.key}>{t("drawer.current")}</span>
          {current}
        </div>
        <div className={`${styles.value} ${styles.proposed}`}>
          <span className={styles.key}>{t("drawer.proposed")}</span>
          {proposed}
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.track}>
          <div
            className={`${styles.fill} dot-${barStatus}`}
            style={{ width: barWidth, background: "currentColor" }}
          />
        </div>
        <span className={styles.score}>{scoreLabel}</span>
        <div className={styles.toggle}>
          <button
            type="button"
            className={
              accepted === true
                ? `${styles.decision} ${styles.acceptActive}`
                : styles.decision
            }
            aria-label={t("drawer.accept")}
            onClick={onAccept}
          >
            ✓
          </button>
          <button
            type="button"
            className={
              accepted === false
                ? `${styles.decision} ${styles.rejectActive}`
                : styles.decision
            }
            aria-label={t("drawer.rejectAttr")}
            onClick={onReject}
          >
            ✕
          </button>
        </div>
      </div>
    </article>
  );
}
