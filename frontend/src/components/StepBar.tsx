import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import type { Stats, Step } from "@/domain/types";
import styles from "./StepBar.module.css";

interface StepBarProps {
  step: Step;
  stats: Stats | null;
  onStep: (step: Step) => void;
  /** Last segment: the export. */
  children: ReactNode;
}

export const STEP_KEYS = { 1: "matches", 2: "values" } as const;

/** Chevron between two segments, as in the booking steps of all.accor.com. */
export function StepChevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Check mark of a step with nothing left to check. */
export function StepCheck() {
  return (
    <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12.5 4 4 8-9" />
    </svg>
  );
}

/**
 * Step 1 → step 2 → export (PIM-53): one compact bar, a number per step, the active step filled in brand blue.
 * What each step is for lives in a tooltip and in the guided tour.
 */
export function StepBar({ step, stats, onStep, children }: StepBarProps) {
  const t = useTranslations("steps");
  const tRoot = useTranslations();
  const id = useId();

  return (
    <nav className={styles.bar} aria-label={t("label")} data-tour="steps">
      <ol className={styles.list}>
        {([1, 2] as const).map((key) => {
          const name = STEP_KEYS[key];
          const count = stats ? (key === 1 ? stats.matchesToReview : stats.valuesToReview) : null;
          const active = step === key;
          return (
            <li key={key} className={styles.item}>
              <button
                type="button"
                className={active ? `${styles.segment} ${styles.active}` : styles.segment}
                aria-current={active ? "step" : undefined}
                aria-describedby={`${id}-${key}`}
                onClick={() => onStep(key)}
              >
                <span className={styles.badge}>{count === 0 ? <StepCheck /> : key}</span>
                <span className={styles.text}>
                  <span className={styles.title}>
                    <span className={styles.long}>{t(`${name}.title`)}</span>
                    <span className={styles.short}>
                      {t(`${name}.short`)}
                    </span>
                  </span>
                  <span className={styles.figure}>
                    {count === null ? (
                      "—"
                    ) : count === 0 ? (
                      t("done")
                    ) : (
                      <>
                        <strong>{tRoot("number", { value: count })}</strong>{" "}
                        <span className={styles.unit}>{t("toCheck")}</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
              <span role="tooltip" id={`${id}-${key}`} className={styles.tip}>
                {t(`${name}.hint`)}
                {/* Values still being enriched (PIM-57): a mention, not a table. */}
                {key === 2 && stats && stats.valuesPending > 0 ? (
                  // The space keeps two sentences apart in the description read with the button.
                  <span className={styles.tipLine}>{" "}{t("values.arriving", { count: stats.valuesPending })}</span>
                ) : null}
              </span>
              <StepChevron />
            </li>
          );
        })}
        <li className={`${styles.item} ${styles.last}`}>{children}</li>
      </ol>
    </nav>
  );
}
