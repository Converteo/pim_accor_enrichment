import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { exportFileUrl, fetchExecution, fetchExportStatus, startExport } from "@/data/source";
import type { ExportExecution, ExportStatus } from "@/domain/types";
import { errorText } from "./labels";
import styles from "./ExportBar.module.css";

const POLL_MS = 3000;

/** Export of the PIM enhanced: blocked while values or matches still wait for a decision. */
export function ExportBar() {
  const t = useTranslations("export");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const [execution, setExecution] = useState<({ id: string } & ExportExecution) | null>(null);

  const refresh = useCallback(() => {
    fetchExportStatus().then(
      (loaded) => {
        setStatus(loaded);
        setError(null);
      },
      setError,
    );
  }, []);

  useEffect(refresh, [refresh]);

  // Follow the Cloud Run job until it ends, then re-read the history.
  useEffect(() => {
    if (execution?.state !== "running") return;
    const timer = setTimeout(() => {
      fetchExecution(execution.id).then(
        (next) => {
          setExecution({ id: execution.id, ...next });
          if (next.state !== "running") refresh();
        },
        // A failed poll is retried at the next tick.
        () => setExecution((current) => (current ? { ...current } : current)),
      );
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [execution, refresh]);

  function launch() {
    setConfirming(false);
    startExport().then(
      ({ executionId }) => setExecution({ id: executionId, state: "running" }),
      (failure: unknown) => {
        setExecution({ id: "", state: "failed", message: errorText(tRoot, failure) });
        refresh();
      },
    );
  }

  const running = execution?.state === "running";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <section className={styles.band} aria-labelledby="exportTitle">
      <div className={styles.row}>
        <div className={styles.text}>
          <h2 id="exportTitle" className={styles.title}>
            {t("title")}
          </h2>
          <p id="exportStatus" className={styles.status} role="status">
            {error
              ? `${t("statusError")} ${errorText(tRoot, error)}`
              : !status
                ? t("loading")
                : status.canExport
                  ? t("ready")
                  : t("blocked", { count: status.pendingCount })}
          </p>
        </div>
        <div className={styles.actions}>
          {confirming ? (
            <>
              <span className={styles.confirm}>{t("confirm")}</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn btn-primary btn-small" onClick={launch}>
                {t("launch")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={!status?.canExport || running}
              aria-describedby="exportStatus"
              onClick={() => setConfirming(true)}
            >
              {running ? t("running") : t("start")}
            </button>
          )}
        </div>
      </div>

      {execution ? (
        <p
          className={execution.state === "failed" ? `${styles.execution} ${styles.failed}` : styles.execution}
          role={execution.state === "failed" ? "alert" : "status"}
        >
          {t(`state.${execution.state}`)}
          {execution.message ? ` ${execution.message}` : ""}
        </p>
      ) : null}

      {status && status.history.length > 0 ? (
        <details className={styles.history}>
          <summary>{t("history", { count: status.history.length })}</summary>
          <ul>
            {status.history.map((record) => (
              <li key={record.exportId}>
                <span>
                  {t("record", {
                    date: format.dateTime(new Date(record.exportedAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone,
                    }),
                    author: record.triggeredBy,
                    hotels: record.hotelCount,
                    rows: record.rowCount,
                  })}
                </span>
                <span className={styles.files}>
                  {record.files.map((file) => (
                    <a key={file} href={exportFileUrl(record.exportId, file)} download>
                      {file}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
