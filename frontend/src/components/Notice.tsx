import { useTranslations } from "next-intl";
import styles from "./Notice.module.css";

export interface NoticeState {
  tone: "success" | "error";
  text: string;
  /** One line per value the back refused. */
  details?: string[];
}

interface NoticeProps {
  notice: NoticeState | null;
  onClose: () => void;
}

/** Result of the last action, above the drawer. */
export function Notice({ notice, onClose }: NoticeProps) {
  const t = useTranslations("drawer");

  return (
    // A live region keeps its role: some screen readers ignore a region whose role changes.
    <div className={styles.region} role="status">
      {notice ? (
        <div className={notice.tone === "error" ? `${styles.notice} ${styles.error}` : styles.notice}>
          <div className={styles.body}>
            <p className={styles.text}>{notice.text}</p>
            {notice.details?.length ? (
              <ul className={styles.details}>
                {notice.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="button" className={styles.close} aria-label={t("close")} onClick={onClose}>
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
