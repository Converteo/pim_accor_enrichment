import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Drawer.module.css";

interface DrawerProps {
  open: boolean;
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Side panel shared by the fiche and the match details. */
export function Drawer({ open, eyebrow, title, meta, footer, onClose, children }: DrawerProps) {
  const t = useTranslations("drawer");
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open, onClose]);

  return (
    <div
      className={open ? `${styles.drawer} ${styles.open}` : styles.drawer}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label={t("close")}
          onClick={onClose}
        >
          ✕
        </button>
        <div className={styles.header}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={titleId} className={styles.heading}>
            {title}
          </h2>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
