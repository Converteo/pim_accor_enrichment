import { useTranslations } from "next-intl";
import { cityLine, formatScore } from "@/domain/rules";
import type { AutoApprovedValue } from "@/domain/types";
import { codeLabel, readableValue, sourceLabel } from "./labels";
import tableStyles from "./FicheTable.module.css";
import styles from "./AutoValueTable.module.css";

interface AutoValueTableProps {
  rows: AutoApprovedValue[];
}

const keyOf = ({ value }: AutoApprovedValue) => value.enrichmentId ?? `${value.pimField}|${value.entityId ?? ""}`;

/** Attributes validated by the threshold, lowest score first: read only, for information. */
export function AutoValueTable({ rows }: AutoValueTableProps) {
  const t = useTranslations();

  return (
    <div className={tableStyles.wrap}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className={tableStyles.headCell} scope="col">
              {t("columns.property")}
            </th>
            <th className={tableStyles.headCell} scope="col">
              {t("autoTab.attribute")}
            </th>
            <th className={tableStyles.headCell} scope="col">
              {t("autoTab.value")}
            </th>
            <th className={tableStyles.headCell} scope="col">
              {t("autoTab.excerpt")}
            </th>
            <th className={tableStyles.headCell} scope="col">
              {t("autoTab.score")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { hotel, value } = row;
            const entity = value.entity.toLowerCase();
            return (
              <tr key={`${hotel.rid}|${keyOf(row)}`}>
                <td className={tableStyles.cell}>
                  <div className={tableStyles.name}>{hotel.name}</div>
                  <div className={tableStyles.city}>
                    {cityLine(hotel)} · <span className={tableStyles.rid}>{hotel.rid}</span>
                  </div>
                </td>
                <td className={tableStyles.cell}>
                  <div>{value.label}</div>
                  <div className={tableStyles.city}>
                    {t(`families.${value.family}`)}
                    {entity !== "product" ? ` · ${codeLabel(t, "entities", entity)}` : ""} · {value.priority}
                  </div>
                </td>
                <td className={tableStyles.cell}>{value.valueLabel ?? readableValue(t, value.value)}</td>
                <td className={tableStyles.cell}>
                  {value.sourceExcerpt ? (
                    <div className={styles.excerpt} title={value.sourceExcerpt}>
                      « {value.sourceExcerpt} »
                    </div>
                  ) : "—"}
                  {value.source ? <div className={tableStyles.city}>{sourceLabel(t, value.source)}</div> : null}
                </td>
                <td className={tableStyles.cell}>
                  <span className="score-pill pill-approved">
                    {formatScore(value.score)}
                    <small>/100</small>
                  </span>
                  {row.approveThreshold !== null ? (
                    <div className={tableStyles.city}>{t("autoTab.threshold", { value: row.approveThreshold })}</div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
