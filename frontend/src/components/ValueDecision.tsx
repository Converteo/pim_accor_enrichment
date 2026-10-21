import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ValueDecision as Decision } from "@/domain/types";
import styles from "./ValueDecision.module.css";

interface ValueDecisionProps {
  label: string;
  busy: boolean;
  onDecide: (decision: Decision, comment: string) => void;
}

/** Approve / reject one value, with an optional comment. */
export function ValueDecision({ label, busy, onDecide }: ValueDecisionProps) {
  const t = useTranslations("decide");
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");

  return (
    <div className={styles.row}>
      {commenting ? (
        <input
          // Replaces the button that had the focus.
          autoFocus
          className={`field ${styles.comment}`}
          type="text"
          value={comment}
          maxLength={500}
          placeholder={t("commentPlaceholder")}
          aria-label={t("commentFor", { label })}
          onChange={(event) => setComment(event.target.value)}
        />
      ) : (
        <button type="button" className={styles.link} onClick={() => setCommenting(true)}>
          {t("addComment")}
        </button>
      )}
      <div className={styles.buttons}>
        <button
          type="button"
          className="btn btn-danger btn-small"
          disabled={busy}
          aria-label={t("rejectValue", { label })}
          onClick={() => onDecide("human_rejected", comment)}
        >
          ✕ {t("reject")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-small"
          disabled={busy}
          aria-label={t("approveValue", { label })}
          onClick={() => onDecide("human_approved", comment)}
        >
          ✓ {t("approve")}
        </button>
      </div>
    </div>
  );
}
