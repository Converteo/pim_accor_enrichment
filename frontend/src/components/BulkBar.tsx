import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ValueDecision } from "@/domain/types";

// A bulk decision approves or rejects; corrections are made value by value.
type BulkDecision = Exclude<ValueDecision, "human_corrected">;
import styles from "./BulkBar.module.css";

interface BulkBarProps {
  /** Messages of the fiches or of the matches tab. */
  labels: "bulk" | "bulkMatches";
  count: number;
  busy: boolean;
  onCancel: () => void;
  /** Resolves to true once saved: the comment is kept otherwise. */
  onDecide: (decision: BulkDecision, comment: string) => Promise<boolean>;
}

/** Decides the selected fiches (all their values to review) or the selected matches. */
export function BulkBar({ labels, count, busy, onCancel, onDecide }: BulkBarProps) {
  const t = useTranslations(labels);
  const [comment, setComment] = useState("");

  function decide(decision: BulkDecision) {
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
