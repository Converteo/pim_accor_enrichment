import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ValueDecision } from "@/domain/types";
import styles from "./BulkBar.module.css";

interface BulkBarProps {
  count: number;
  busy: boolean;
  onCancel: () => void;
  /** Resolves to true once saved: the comment is kept otherwise. */
  onDecide: (decision: ValueDecision, comment: string) => Promise<boolean>;
}

/** Decides every value to review of the selected fiches. */
export function BulkBar({ count, busy, onCancel, onDecide }: BulkBarProps) {
  const t = useTranslations("bulk");
  const [comment, setComment] = useState("");

  function decide(decision: ValueDecision) {
    void onDecide(decision, comment).then((saved) => saved && setComment(""));
  }

  return (
    <div className={styles.bar} hidden={count === 0}>
      <span className={styles.count}>{t("count", { count })}</span>
      <input
        className={styles.comment}
        type="text"
        value={comment}
        maxLength={500}
        placeholder={t("comment")}
        aria-label={t("comment")}
        onChange={(event) => setComment(event.target.value)}
      />
      <div className={styles.actions}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => decide("human_rejected")}
        >
          {t("reject", { count })}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => decide("human_approved")}
        >
          {busy ? t("busy") : t("validate", { count })}
        </button>
      </div>
    </div>
  );
}
