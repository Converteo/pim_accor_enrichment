import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { Stats, Step } from "@/domain/types";
import styles from "./StepCards.module.css";

interface StepCardsProps {
  step: Step;
  stats: Stats | null;
  onStep: (step: Step) => void;
  /** Third card: the export banner. */
  children: ReactNode;
}

export const STEP_KEYS = { 1: "matches", 2: "values" } as const;

/** Step 1 → step 2 → export (PIM-53): what is left to check in each step, the active one stands out. */
export function StepCards({ step, stats, onStep, children }: StepCardsProps) {
  const t = useTranslations("steps");

  return (
    <div className={styles.steps} data-tour="steps">
      {([1, 2] as const).map((key) => {
        const name = STEP_KEYS[key];
        return (
          <Fragment key={key}>
            <button
              type="button"
              className={step === key ? `${styles.card} ${styles.active}` : styles.card}
              aria-current={step === key ? "step" : undefined}
              onClick={() => onStep(key)}
            >
              <span className={styles.eyebrow}>{t(`${name}.eyebrow`)}</span>
              <span className={styles.title}>{t(`${name}.title`)}</span>
              <span className={styles.question}>{t(`${name}.question`)}</span>
              <span className={styles.count}>
                {!stats
                  ? "—"
                  : key === 1
                    ? t("matches.count", { count: stats.matchesToReview })
                    : t("values.count", { count: stats.valuesToReview, hotels: stats.hotelsToReview })}
              </span>
              <span className={styles.next}>{t(`${name}.next`)}</span>
            </button>
            <svg
              className={styles.arrow}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Fragment>
        );
      })}
      {children}
    </div>
  );
}
