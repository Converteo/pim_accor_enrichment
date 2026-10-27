import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, exportFileUrl, fetchExecution, fetchExportStatus, startExport } from "@/data/source";
import type { ExportExecution, ExportStatus, Stats } from "@/domain/types";
import { errorText } from "./labels";
import styles from "./ExportBar.module.css";

const POLL_MS = 3000;

interface ExportBarProps {
  /** The banner re-reads its status when the items waiting for a decision change, and details them. */
  stats: Stats | null;
}

// Same counters as the tabs and the indicators: their sum is pendingForExport (back, /stats).
const WAITING = ["matchesToReview", "valuesToReview", "matchesPending", "valuesPending"] as const;

type Execution = { id: string } & ExportExecution & {
  /** Exports already in the history when the follow-up started. */
  known?: string[];
  /** The job succeeded without adding an export: nothing was approved, or items started waiting again. */
  empty?: boolean;
};

/** Export of the PIM enhanced, third card of the steps: blocked while values or matches still wait for a decision. */
export function ExportBar({ stats }: ExportBarProps) {
  const t = useTranslations("export");
  const pending = stats?.pendingForExport;
  const tRoot = useTranslations();
  const format = useFormatter();
  const id = useId();
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  // An empty id means the launch request is in flight.
  const [execution, setExecution] = useState<Execution | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(
    () =>
      fetchExportStatus().then(
        (loaded) => {
          setStatus(loaded);
          setError(null);
          // A job launched elsewhere (another tab, another reviewer, before a reload): follow it too.
          const running = loaded.runningExecutionId;
          setExecution((current) =>
            running && current?.state !== "running"
              ? { id: running, state: "running", known: loaded.history.map((record) => record.exportId) }
              : current,
          );
          return loaded;
        },
        (failure: unknown) => {
          setError(failure);
          return null;
        },
      ),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, pending]);

  function errorMessage(failure: unknown): string {
    return failure instanceof ApiError && failure.status === 401 ? t("unauthorized") : errorText(tRoot, failure);
  }

  // Follow the Cloud Run job until it ends, then re-read the history.
  useEffect(() => {
    if (execution?.state !== "running" || !execution.id) return;
    const timer = setTimeout(() => {
      fetchExecution(execution.id).then(
        (next) => {
          if (next.state === "running") {
            setExecution({ ...execution });
            return;
          }
          void refresh().then((loaded) =>
            setExecution({
              id: execution.id,
              ...next,
              empty:
                next.state === "succeeded" &&
                loaded !== null &&
                loaded.history.every((record) => execution.known?.includes(record.exportId)),
            }),
          );
        },
        (failure: unknown) => {
          // Network or server hiccup: try again at the next tick. A 4xx (unknown execution…) will not get better.
          const final = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
          setExecution(final ? { id: execution.id, state: "failed", message: errorMessage(failure) } : { ...execution });
        },
      );
    }, POLL_MS);
    return () => clearTimeout(timer);
    // errorMessage only reads translations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution, refresh]);

  function cancel() {
    setConfirming(false);
    startRef.current?.focus();
  }

  function launch() {
    setConfirming(false);
    const known = status?.history.map((record) => record.exportId) ?? [];
    setExecution({ id: "", state: "running", known });
    startExport().then(
      ({ executionId }) => setExecution({ id: executionId, state: "running", known }),
      (failure: unknown) => {
        setExecution({ id: "", state: "failed", message: errorMessage(failure) });
        refresh();
      },
    );
  }

  const running = execution?.state === "running";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <section className={styles.band} aria-labelledby={`${id}-title`}>
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.eyebrow}>{t("eyebrow")}</span>
          <h2 id={`${id}-title`} className={styles.title}>
            {t("title")}
          </h2>
          <p className={styles.count}>{stats ? t("approved", { count: stats.valuesApproved }) : "—"}</p>
          <p id={`${id}-status`} className={styles.status} role="status">
            {error
              ? `${t("statusError")} ${errorMessage(error)}`
              : !status
                ? t("loading")
                : status.runningExecutionId
                  ? t("busy")
                  : status.canExport
                    ? t("ready")
                    : // Detailed from /stats, read with the tabs, so that both agree even while the pipeline runs.
                      stats && stats.pendingForExport > 0
                      ? t("blockedDetail", {
                          details: format.list(
                            WAITING.filter((key) => stats[key] > 0).map((key) =>
                              t(`waiting.${key}`, { count: stats[key] }),
                            ),
                          ),
                        })
                      : t("blocked", { count: status.pendingCount })}
          </p>
        </div>
        <div className={styles.actions}>
          {confirming ? (
            <>
              <span id={`${id}-confirm`} className={styles.confirm}>
                {t("confirm")}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                // Replaces the launch button that had the focus.
                autoFocus
                aria-describedby={`${id}-confirm`}
                onClick={cancel}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                aria-describedby={`${id}-confirm`}
                onClick={launch}
              >
                {t("launch")}
              </button>
            </>
          ) : (
            <button
              ref={startRef}
              type="button"
              className="btn btn-primary btn-small"
              disabled={!status?.canExport || running || Boolean(error)}
              aria-describedby={`${id}-status`}
              onClick={() => setConfirming(true)}
            >
              {running ? t("running") : t("start")}
            </button>
          )}
        </div>
      </div>

      {/* Always mounted, so screen readers announce each change of the execution. */}
      <p
        className={execution?.state === "failed" ? `${styles.execution} ${styles.failed}` : styles.execution}
        role="status"
      >
        {execution ? t(execution.empty ? "state.empty" : `state.${execution.state}`) : ""}
        {execution?.message ? ` ${execution.message}` : ""}
      </p>

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
                  {/* No `download`: the back sends Content-Disposition, and an error stays visible. */}
                  {record.files.map((file) => (
                    <a key={file} href={exportFileUrl(record.exportId, file)}>
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
