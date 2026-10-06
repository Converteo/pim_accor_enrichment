import { useTranslations } from "next-intl";
import styles from "./BulkBar.module.css";

interface BulkBarProps {
  count: number;
  onCancel: () => void;
  onReject: () => void;
  onValidate: () => void;
}

export function BulkBar({ count, onCancel, onReject, onValidate }: BulkBarProps) {
  const t = useTranslations("bulk");

  return (
    <div className={styles.bar} hidden={count === 0}>
      <span className={styles.count}>{t("count", { count })}</span>
      <div className={styles.actions}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn-danger" onClick={onReject}>
          {t("reject")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onValidate}>
          {t("validate")}
        </button>
      </div>
    </div>
  );
}
