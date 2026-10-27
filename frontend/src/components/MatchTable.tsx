import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, MouseEvent } from "react";
import { cityLine, formatScore, matchKey, statusTone } from "@/domain/rules";
import type { MatchItem } from "@/domain/types";
import { codeLabel, countryName, sourceLabel } from "./labels";
import styles from "./FicheTable.module.css";

interface MatchTableProps {
  rows: MatchItem[];
  /** No selection (no bulk decision); rows still open their detail when `onOpen` is given. */
  readOnly?: boolean;
  /** « Validé manuellement »: decision, author, date and comment of each row (PIM-54). */
  decisions?: boolean;
  selected?: ReadonlySet<string>;
  onToggleRow?: (key: string, selected: boolean) => void;
  onToggleVisible?: (selected: boolean) => void;
  onOpen?: (key: string) => void;
}

const NONE: ReadonlySet<string> = new Set();

// Pill tone of the deterministic check: only a doubt or a rejection stands out.
const CHECK_TONES: Record<string, string> = { ok: "pill-pending", to_check: "pill-review", rejected: "pill-rejected" };

/** Hotel × source matches of one table of step 1. */
export function MatchTable({
  rows,
  readOnly = false,
  decisions = false,
  selected = NONE,
  onToggleRow,
  onToggleVisible,
  onOpen,
}: MatchTableProps) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  // The reviewer's time zone: next-intl would otherwise use the server's (UTC on Cloud Run).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const headerChecked = rows.length > 0 && rows.every((row) => selected.has(matchKey(row)));

  function onHeaderChange(event: ChangeEvent<HTMLInputElement>) {
    onToggleVisible?.(event.target.checked);
  }

  function stopRowOpen(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {readOnly ? null : (
              <th className={`${styles.headCell} ${styles.checkCol}`} scope="col" data-tour="select">
                <input
                  type="checkbox"
                  checked={headerChecked}
                  aria-label={t("row.selectAll")}
                  onChange={onHeaderChange}
                />
              </th>
            )}
            <th className={styles.headCell} scope="col">
              {t("matches.pim")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("matches.page")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("filters.sourceLabel")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("matches.judge")}
            </th>
            <th className={styles.headCell} scope="col">
              {t(readOnly ? "matches.reasonColumn" : "matches.whyColumn")}
            </th>
            {decisions ? (
              <th className={styles.headCell} scope="col">
                {t("matches.decision")}
              </th>
            ) : null}
            {onOpen ? (
              <th className={`${styles.headCell} ${styles.actionsHead}`} scope="col">
                {t("columns.actions")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = matchKey(row);
            const isSelected = selected.has(key);
            return (
              <tr
                key={key}
                className={onOpen ? (isSelected ? `${styles.row} ${styles.selected}` : styles.row) : undefined}
                onClick={onOpen ? () => onOpen(key) : undefined}
              >
                {readOnly ? null : (
                  <td className={styles.cell}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={t("row.select", { name: row.pim.name ?? row.rid })}
                      onClick={stopRowOpen}
                      onChange={(event) => onToggleRow?.(key, event.target.checked)}
                    />
                  </td>
                )}
                <td className={styles.cell}>
                  <div className={styles.name}>{row.pim.name ?? row.rid}</div>
                  <div className={styles.city}>
                    {cityLine(row.pim)} · <span className={styles.rid}>{row.rid}</span>
                  </div>
                  {row.pim.brand ? <span className={styles.brand}>{row.pim.brand}</span> : null}
                </td>
                <td className={styles.cell}>
                  <div>{row.page.scrapedName ?? row.page.pageName ?? "—"}</div>
                  {row.page.country ? <div className={styles.city}>{countryName(locale, row.page.country)}</div> : null}
                </td>
                <td className={`${styles.cell} ${styles.source}`}>{sourceLabel(t, row.source)}</td>
                <td className={styles.cell}>
                  {row.score === null ? (
                    <span className="status-pill pill-pending">
                      <i className="dot dot-pending" />
                      {t("matches.notJudged")}
                    </span>
                  ) : (
                    <span className="score-pill pill-review">
                      {formatScore(row.score)}
                      <small>/100</small>
                    </span>
                  )}
                  {row.verdict ? (
                    <div className={styles.city}>{codeLabel(t, "matches.judgeVerdicts", row.verdict)}</div>
                  ) : null}
                </td>
                <td className={styles.cell} data-tour="why">
                  <WhyCell row={row} />
                </td>
                {decisions ? (
                  <td className={styles.cell}>
                    {row.status === "human_approved" || row.status === "human_rejected" ? (
                      <span className={`status-pill pill-${statusTone(row.status)}`}>
                        {t(`matches.decisions.${row.status}`)}
                      </span>
                    ) : null}
                    {row.lastDecision ? (
                      <>
                        <div className={styles.city}>
                          {t("detail.decidedBy", {
                            author: row.lastDecision.author || "—",
                            date: format.dateTime(new Date(row.lastDecision.decidedAt), {
                              dateStyle: "short",
                              timeStyle: "short",
                              timeZone,
                            }),
                          })}
                        </div>
                        {row.lastDecision.comment ? (
                          <div className={styles.clamp} title={row.lastDecision.comment}>
                            « {row.lastDecision.comment} »
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                ) : null}
                {onOpen ? (
                  <td className={styles.cell}>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn-icon link"
                        data-tour="view"
                        onClick={(event) => {
                          stopRowOpen(event);
                          onOpen(key);
                        }}
                      >
                        {t("row.view")}
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Why the match is in its table without opening it (PIM-56): judge's reason, then the deterministic check. */
function WhyCell({ row }: { row: MatchItem }) {
  const t = useTranslations();
  const reason = row.judgeReason ? codeLabel(t, "matches.reasons", row.judgeReason) : null;
  const check = row.preVerdict
    ? [codeLabel(t, "matches.verdicts", row.preVerdict), row.preReason].filter(Boolean).join(" · ")
    : row.preReason;
  const full = [reason, row.justification, check ? `${t("matches.check")} : ${check}` : null].filter(Boolean).join("\n");

  return (
    <div title={full || undefined}>
      {reason || row.justification ? (
        <div className={styles.clamp}>
          {reason ? <strong>{reason}</strong> : null}
          {reason && row.justification ? " · " : null}
          {row.justification}
        </div>
      ) : null}
      {check ? (
        <span className={`status-pill ${CHECK_TONES[row.preVerdict ?? ""] ?? "pill-pending"} ${styles.check}`}>
          {check}
        </span>
      ) : null}
    </div>
  );
}
