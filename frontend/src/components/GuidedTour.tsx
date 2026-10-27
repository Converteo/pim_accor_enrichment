import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./GuidedTour.module.css";

type TourKey = "steps" | "why" | "matchDetail" | "tables" | "fiche" | "outdated" | "filters" | "bulk" | "export" | "help";

export interface TourStep {
  /** CSS selector of the element pointed at (first match). */
  target: string;
  /** Key under `tour.steps`: title and body. */
  key: TourKey;
  /** Shows the screen the element lives on (step, table). Never takes a decision. */
  before?: () => void;
  /** True once the element is known to be missing (empty list): the step is skipped. */
  skip?: () => boolean;
}

interface GuidedTourProps {
  steps: readonly TourStep[];
  onClose: () => void;
}

// Lists load from the back: wait for the element before skipping its step.
const WAIT_MS = 6000;
const GAP = 12;

/**
 * First-use guided tour (PIM-60): bubbles pointing at the real elements of the screen, one after the other.
 * The page behind is not clickable while it runs, so the tour cannot take a decision.
 */
export function GuidedTour({ steps, onClose }: GuidedTourProps) {
  const t = useTranslations("tour");
  const id = useId();
  const [index, setIndex] = useState(0);
  // +1 forward, -1 back: a step whose element is missing is skipped in the same direction.
  const [direction, setDirection] = useState(1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef(steps);
  const [bubbleHeight, setBubbleHeight] = useState(0);

  useEffect(() => {
    stepsRef.current = steps;
  });

  const step = steps[index];

  useEffect(() => {
    const current = stepsRef.current[index];
    if (!current) return;
    current.before?.();
    setRect(null);
    const started = Date.now();
    let element: Element | null = null;
    let frame = 0;

    function place() {
      if (element) setRect(element.getBoundingClientRect());
    }

    function find() {
      element = document.querySelector(current.target);
      if (element) {
        element.scrollIntoView({ block: "center" });
        place();
        return;
      }
      // Read on the latest render: the list state changes while waiting.
      if (stepsRef.current[index]?.skip?.() || Date.now() - started > WAIT_MS) {
        const next = index + direction;
        if (next >= 0 && next < stepsRef.current.length) setIndex(next);
        else onClose();
        return;
      }
      frame = requestAnimationFrame(find);
    }

    frame = requestAnimationFrame(find);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [index, direction, onClose]);

  useLayoutEffect(() => {
    if (rect) setBubbleHeight(bubbleRef.current?.offsetHeight ?? 0);
  }, [rect, index]);

  useEffect(() => {
    if (rect) bubbleRef.current?.focus();
  }, [rect, index]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function go(delta: number) {
    const next = index + delta;
    if (next >= steps.length) {
      onClose();
      return;
    }
    setDirection(delta);
    setIndex(Math.max(0, next));
  }

  // Below the element when there is room, above otherwise; always inside the window.
  const width = Math.min(360, window.innerWidth - 2 * GAP);
  const below = rect ? rect.bottom + GAP + bubbleHeight < window.innerHeight : true;
  const top = rect
    ? Math.max(GAP, Math.min(window.innerHeight - bubbleHeight - GAP, below ? rect.bottom + GAP : rect.top - GAP - bubbleHeight))
    : 0;
  const left = rect ? Math.max(GAP, Math.min(window.innerWidth - width - GAP, rect.left)) : 0;

  return (
    <div className={styles.layer}>
      {rect ? (
        <div
          className={styles.spot}
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className={styles.scrim} />
      )}
      {step && rect ? (
        <div
          ref={bubbleRef}
          className={styles.bubble}
          style={{ top, left, width }}
          role="dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-body`}
          tabIndex={-1}
        >
          <p className={styles.counter}>{t("counter", { current: index + 1, total: steps.length })}</p>
          <h2 id={`${id}-title`} className={styles.title}>
            {t(`steps.${step.key}.title`)}
          </h2>
          <p id={`${id}-body`} className={styles.body}>
            {t(`steps.${step.key}.body`)}
          </p>
          <div className={styles.actions}>
            <button type="button" className={`btn-icon link ${styles.skip}`} onClick={onClose}>
              {t("skip")}
            </button>
            {index > 0 ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => go(-1)}>
                {t("previous")}
              </button>
            ) : null}
            <button type="button" className="btn btn-primary btn-small" onClick={() => go(1)}>
              {index === steps.length - 1 ? t("done") : t("next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
