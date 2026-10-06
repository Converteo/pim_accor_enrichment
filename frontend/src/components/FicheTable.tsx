import { useTranslations } from "next-intl";
import type { ChangeEvent, MouseEvent } from "react";
import { formatScore } from "@/domain/rules";
import type { Fiche } from "@/domain/types";
import styles from "./FicheTable.module.css";

interface FicheTableProps {
  rows: Fiche[];
  headerChecked: boolean;
  onToggleRow: (id: number, selected: boolean) => void;
  onToggleVisible: (selected: boolean) => void;
  onOpen: (id: number) => void;
}

export function FicheTable({
  rows,
  headerChecked,
  onToggleRow,
  onToggleVisible,
  onOpen,
}: FicheTableProps) {
  const t = useTranslations();

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
              {t("columns.property")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.source")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.attributes")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.score")}
            </th>
            <th className={styles.headCell} scope="col">
              {t("columns.status")}
            </th>
            <th
              className={`${styles.headCell} ${styles.actionsHead}`}
              scope="col"
            >
              {t("columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                row.selected ? `${styles.row} ${styles.selected}` : styles.row
              }
              onClick={() => onOpen(row.id)}
            >
              <td className={styles.cell}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  aria-label={t("row.select", { name: row.name })}
                  onClick={stopRowOpen}
                  onChange={(event) => onToggleRow(row.id, event.target.checked)}
                />
              </td>
              <td className={styles.cell}>
                <div className={styles.name}>{row.name}</div>
                <div className={styles.city}>{row.city}</div>
                <span className={styles.brand}>{row.brand}</span>
              </td>
              <td className={`${styles.cell} ${styles.source}`}>{row.source}</td>
              <td className={styles.cell}>
                <span className={styles.attrs}>
                  {t("row.attributes", { count: row.attrs.length })}
                </span>
              </td>
              <td className={styles.cell}>
                <span className={`score-pill pill-${row.status}`}>
                  {formatScore(row.score)}
                </span>
              </td>
              <td className={styles.cell}>
                <span className={`status-pill pill-${row.status}`}>
                  <i className={`dot dot-${row.status}`} />
                  {t(`status.${row.status}`)}
                </span>
              </td>
              <td className={styles.cell}>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="btn-icon link"
                    onClick={(event) => {
                      stopRowOpen(event);
                      onOpen(row.id);
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
