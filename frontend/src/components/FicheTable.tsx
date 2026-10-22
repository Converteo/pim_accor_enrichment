import { useTranslations } from "next-intl";
import type { ChangeEvent, MouseEvent } from "react";
import { cityLine, formatScore } from "@/domain/rules";
import type { HotelSummary } from "@/domain/types";
import { sourceLabel } from "./labels";
import styles from "./FicheTable.module.css";

interface FicheTableProps {
  rows: HotelSummary[];
  /** « En cours » lists fiches still being enriched: nothing to select or decide there. */
  selectable: boolean;
  selected: ReadonlySet<string>;
  onToggleRow: (rid: string, selected: boolean) => void;
  onToggleVisible: (selected: boolean) => void;
  onOpen: (rid: string) => void;
}

export function FicheTable({
  rows,
  selectable,
  selected,
  onToggleRow,
  onToggleVisible,
  onOpen,
}: FicheTableProps) {
  const t = useTranslations();
  const headerChecked = rows.length > 0 && rows.every((row) => selected.has(row.rid));

  function onHeaderChange(event: ChangeEvent<HTMLInputElement>) {
    onToggleVisible(event.target.checked);
  }

  function stopRowOpen(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {selectable ? (
              <th className={`${styles.headCell} ${styles.checkCol}`} scope="col">
                <input
                  type="checkbox"
                  checked={headerChecked}
                  aria-label={t("row.selectAll")}
                  onChange={onHeaderChange}
                />
              </th>
            ) : null}
            <th className={styles.headCell} scope="col">
              {t("columns.property")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.sources")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.toReview")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.score")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.info")}
            </th>
            <th className={`${styles.headCell} ${styles.actionsHead}`} scope="col">
              {t("columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selected.has(row.rid);
            return (
              <tr
                key={row.rid}
                className={isSelected ? `${styles.row} ${styles.selected}` : styles.row}
                onClick={() => onOpen(row.rid)}
              >
                {selectable ? (
                  <td className={styles.cell}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={t("row.select", { name: row.name })}
                      onClick={stopRowOpen}
                      onChange={(event) => onToggleRow(row.rid, event.target.checked)}
                    />
                  </td>
                ) : null}
                <td className={styles.cell}>
                  <div className={styles.name}>{row.name}</div>
                  <div className={styles.city}>
                    {cityLine(row)} · <span className={styles.rid}>{row.rid}</span>
                  </div>
                  {row.brand ? <span className={styles.brand}>{row.brand}</span> : null}
                </td>
                <td className={`${styles.cell} ${styles.source}`}>
                  {row.sources.map((source) => (
                    <div key={source}>{sourceLabel(t, source)}</div>
                  ))}
                </td>
                <td className={styles.cell}>
                  <span className={styles.attrs}>
                    {t("row.values", { count: row.toReviewCount })}
                  </span>
                  <div className={styles.families}>
                    {row.families.map((family) => t(`families.${family}`)).join(" · ")}
                  </div>
                </td>
                <td className={styles.cell}>
                  {row.avgScore === null ? (
                    "—"
                  ) : (
                    <span className="score-pill pill-review">
                      {formatScore(row.avgScore)}
                      <small>/100</small>
                    </span>
                  )}
                </td>
                <td className={styles.cell}>
                  <div className={styles.info}>
                    {row.pendingCount > 0 ? (
                      <span className="status-pill pill-pending">
                        <i className="dot dot-pending" />
                        {t("row.pending", { count: row.pendingCount })}
                      </span>
                    ) : null}
                    {row.outdatedCount > 0 ? (
                      <span className="status-pill pill-pending">
                        <i className="dot dot-pending" />
                        {t("row.outdated", { count: row.outdatedCount })}
                      </span>
                    ) : null}
                    {row.conflictCount > 0 ? (
                      <span className="status-pill pill-rejected">
                        <i className="dot dot-rejected" />
                        {t("row.conflicts", { count: row.conflictCount })}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={styles.cell}>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn-icon link"
                      onClick={(event) => {
                        stopRowOpen(event);
                        onOpen(row.rid);
                      }}
                    >
                      {t("row.view")}
                      <svg
                        className={styles.chevron}
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
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
