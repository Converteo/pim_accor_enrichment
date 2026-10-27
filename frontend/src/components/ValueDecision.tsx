import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { offeredDecisions } from "@/domain/rules";
import type { EnrichmentValue, ValueDecision as Decision } from "@/domain/types";
import { CorrectionForm } from "./CorrectionForm";
import styles from "./ValueDecision.module.css";

interface ValueDecisionProps {
  value: EnrichmentValue;
  busy: boolean;
  /** `correctedValue` (PIM format) comes with `human_corrected` only. */
  onDecide: (decision: Decision, comment: string, correctedValue?: string) => void;
}

/** Approve, reject or correct one value, with an optional comment; only the decisions that change it are offered. */
export function ValueDecision({ value, busy, onDecide }: ValueDecisionProps) {
  const t = useTranslations("decide");
  const tCorrect = useTranslations("correct");
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const correctRef = useRef<HTMLButtonElement>(null);
  const label = value.label;
  const offered = offeredDecisions(value);

  return (
    <>
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
            ref={correctRef}
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy}
            aria-label={tCorrect("openFor", { label })}
            aria-expanded={correcting}
            onClick={() => setCorrecting((open) => !open)}
          >
            ✎ {tCorrect("open")}
          </button>
          {offered.reject ? (
            <button
              type="button"
              className="btn btn-danger btn-small"
              disabled={busy}
              aria-label={t("rejectValue", { label })}
              onClick={() => onDecide("human_rejected", comment)}
            >
              ✕ {t("reject")}
            </button>
          ) : null}
          {offered.approve ? (
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={busy}
              aria-label={t("approveValue", { label })}
              onClick={() => onDecide("human_approved", comment)}
            >
              ✓ {t("approve")}
            </button>
          ) : null}
        </div>
      </div>
      {correcting ? (
        <CorrectionForm
          value={value}
          busy={busy}
          onCancel={() => {
            setCorrecting(false);
            correctRef.current?.focus();
          }}
          onSubmit={(corrected) => onDecide("human_corrected", comment, corrected)}
        />
      ) : null}
    </>
  );
}
