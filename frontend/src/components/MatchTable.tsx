import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, MouseEvent } from "react";
import { cityLine, formatScore, matchKey } from "@/domain/rules";
import type { MatchItem } from "@/domain/types";
import { countryName, sourceLabel } from "./labels";
import styles from "./FicheTable.module.css";

interface MatchTableProps {
  rows: MatchItem[];
  selected: ReadonlySet<string>;
  onToggleRow: (key: string, selected: boolean) => void;
  onToggleVisible: (selected: boolean) => void;
  onOpen: (key: string) => void;
}

/** Hotel × source matches the judge agent hesitates on (score 30-79). */
export function MatchTable({ rows, selected, onToggleRow, onToggleVisible, onOpen }: MatchTableProps) {
  const t = useTranslations();
  const locale = useLocale();
  const headerChecked = rows.length > 0 && rows.every((row) => selected.has(matchKey(row)));

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
            <th className={`${styles.headCell} ${styles.checkCol}`} scope="col">
              <input
                type="checkbox"
                checked={headerChecked}
                aria-label={t("row.selectAll")}
                onChange={onHeaderChange}
              />
            </th>
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
            <th className={`${styles.headCell} ${styles.actionsHead}`} scope="col">
              {t("columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = matchKey(row);
            const isSelected = selected.has(key);
            return (
              <tr
                key={key}
                className={isSelected ? `${styles.row} ${styles.selected}` : styles.row}
                onClick={() => onOpen(key)}
              >
                <td className={styles.cell}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label={t("row.select", { name: row.pim.name ?? row.rid })}
                    onClick={stopRowOpen}
                    onChange={(event) => onToggleRow(key, event.target.checked)}
                  />
                </td>
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
                  <span className="score-pill pill-review">
                    {formatScore(row.score)}
                    <small>/100</small>
                  </span>
                </td>
                <td className={styles.cell}>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn-icon link"
                      onClick={(event) => {
                        stopRowOpen(event);
                        onOpen(key);
                      }}
                    >
                      {t("row.view")}
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
