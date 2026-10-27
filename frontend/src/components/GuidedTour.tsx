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
// Same durations as GuidedTour.module.css: the halo glides, then the bubble fades in.
const GLIDE_MS = 480;
// Longest smooth scroll before the halo moves anyway (no `scrollend` event in older browsers).
const SCROLL_MS = 900;
// Under the sticky header, above the bottom bar: an element already there is not scrolled to.
const VISIBLE_TOP = 96;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function boxOf(element: Element): Box {
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Smooth scroll to the element, resolved once it has stopped (at once if it is already in view). */
function scrollTo(element: Element): Promise<void> {
  const { top, bottom } = element.getBoundingClientRect();
  if (top >= VISIBLE_TOP && bottom <= window.innerHeight - GAP) return Promise.resolve();
  if (reducedMotion()) {
    element.scrollIntoView({ block: "center" });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("scrollend", done);
      resolve();
    };
    const timer = setTimeout(done, SCROLL_MS);
    window.addEventListener("scrollend", done);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}


/**
 * First-use guided tour (PIM-60): bubbles pointing at the real elements of the screen, one after the other.
 * Each move is sequenced so that nothing jumps: smooth scroll to the element, then the halo glides onto it,
 * then the bubble fades in. The page behind is not clickable while it runs, so the tour cannot take a decision.
 */
export function GuidedTour({ steps, onClose }: GuidedTourProps) {
  const t = useTranslations("tour");
  const id = useId();
  const [index, setIndex] = useState(0);
  // +1 forward, -1 back: a step whose element is missing is skipped in the same direction.
  const [direction, setDirection] = useState(1);
  // The halo opens from the whole window onto the first element.
  const [box, setBox] = useState<Box>(() => ({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }));
  // Step whose bubble is shown (kept while it fades out), and whether it is visible.
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(false);
  // Following a scroll or a resize: the halo sticks to the element without gliding.
  const [follow, setFollow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef(steps);

  useEffect(() => {
    stepsRef.current = steps;
  });

  useEffect(() => {
    const current = stepsRef.current[index];
    if (!current) return;
    let cancelled = false;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let element: Element | null = null;
    setVisible(false);
    setFollow(false);
    current.before?.();
    const started = Date.now();

    function stick() {
      if (!element) return;
      setFollow(true);
      setBox(boxOf(element));
    }

    function arrive(found: Element) {
      element = found;
      void scrollTo(found).then(() => {
        if (cancelled) return;
        setBox(boxOf(found));
        timer = setTimeout(
          () => {
            setShown(index);
            setVisible(true);
            window.addEventListener("resize", stick);
            window.addEventListener("scroll", stick, true);
          },
          reducedMotion() ? 0 : GLIDE_MS,
        );
      });
    }

    function find() {
      const found = document.querySelector(current.target);
      if (found) {
        arrive(found);
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
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("resize", stick);
      window.removeEventListener("scroll", stick, true);
    };
  }, [index, direction, onClose]);

  // Below the element when there is room, above otherwise; always inside the window. Measured once the new
  // text is in the bubble, and frozen while it fades out.
  const width = Math.min(360, window.innerWidth - 2 * GAP);
  useLayoutEffect(() => {
    if (!visible) return;
    const height = bubbleRef.current?.offsetHeight ?? 0;
    const below = box.top + box.height + GAP + height < window.innerHeight;
    setPosition({
      top: Math.max(GAP, Math.min(window.innerHeight - height - GAP, below ? box.top + box.height + GAP : box.top - GAP - height)),
      left: Math.max(GAP, Math.min(window.innerWidth - width - GAP, box.left)),
    });
  }, [visible, box, shown, width]);

  useEffect(() => {
    if (visible) bubbleRef.current?.focus({ preventScroll: true });
  }, [visible, shown]);

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

  const step = steps[shown];

  return (
    <div className={styles.layer}>
      <div
        className={follow ? `${styles.spot} ${styles.follow}` : styles.spot}
        style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
      />
      {step ? (
        <div
          ref={bubbleRef}
          className={visible ? `${styles.bubble} ${styles.visible}` : styles.bubble}
          style={{ ...position, width }}
          role="dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-body`}
          aria-hidden={!visible}
          tabIndex={-1}
        >
          <p className={styles.counter}>{t("counter", { current: shown + 1, total: steps.length })}</p>
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
            {shown > 0 ? (
              <button type="button" className="btn btn-ghost btn-small" disabled={!visible} onClick={() => go(-1)}>
                {t("previous")}
              </button>
            ) : null}
            <button type="button" className="btn btn-primary btn-small" disabled={!visible} onClick={() => go(1)}>
              {shown === steps.length - 1 ? t("done") : t("next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
