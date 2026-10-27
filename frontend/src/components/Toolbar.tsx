import { useTranslations } from "next-intl";
import type { ChangeEvent, ReactNode } from "react";
import {
  FAMILY_ORDER,
  PRIORITY_ORDER,
  TABLE_ORDER,
  type Facets,
  type Filters,
  type Stats,
  type Step,
  type TableKey,
} from "@/domain/types";
import { BrandFilter } from "./BrandFilter";
import { STEP_KEYS } from "./StepBar";
import { codeLabel, sourceLabel } from "./labels";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  step: Step;
  table: TableKey;
  filters: Filters;
  stats: Stats | null;
  facets: Facets | null;
  onFilter: (patch: Partial<Filters>) => void;
  onTable: (table: TableKey) => void;
}

const iconProps = {
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Same counters as the step cards and the export banner (/stats); the tables of a step never overlap.
const MATCH_COUNTS = {
  review: "matchesToReview",
  auto_approved: "matchesAutoApproved",
  auto_rejected: "matchesAutoRejected",
  human: "matchesHuman",
} as const satisfies Record<TableKey, keyof Stats>;
const VALUE_COUNTS = {
  review: "valuesToReview",
  auto_approved: "valuesAutoApproved",
  auto_rejected: "valuesAutoRejected",
  human: "valuesHuman",
} as const satisfies Record<TableKey, keyof Stats>;
const HOTEL_COUNTS = {
  review: "hotelsToReview",
  auto_approved: "hotelsAutoApproved",
  auto_rejected: "hotelsAutoRejected",
  human: "hotelsHuman",
} as const satisfies Record<TableKey, keyof Stats>;

function Segment({ label, icon, tour, children }: { label: string; icon: ReactNode; tour?: string; children: ReactNode }) {
  return (
    <label className={styles.segment} data-tour={tour}>
      <span className={styles.segmentLabel}>
        <svg {...iconProps}>{icon}</svg>
        {label}
      </span>
      {children}
    </label>
  );
}

export function Toolbar({ step, table, filters, stats, facets, onFilter, onTable }: ToolbarProps) {
  const t = useTranslations();
  // Only filters with an effect on the step's lists: /matches filters by search, source, brand and verdict.
  const hotelFilters = step === 2;
  const verdictFilter = step === 1;
  const outdatedFilter = step === 2;

  function select(key: keyof Filters) {
    return (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
      onFilter({ [key]: event.target.value });
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.engine} data-tour="filters">
        <label className={`${styles.segment} ${styles.search}`}>
          <span className={styles.segmentLabel}>
            <svg {...iconProps}>
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m20 20-4.8-4.8" />
            </svg>
            {t("filters.searchLabel")}
          </span>
          <input
            className={styles.control}
            type="search"
            placeholder={t("search.placeholder")}
            autoComplete="off"
            value={filters.search}
            onChange={select("search")}
          />
        </label>
        <Segment
          label={t("filters.brandLabel")}
          icon={
            <>
              <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-8.1-7.9Z" />
              <circle cx="8.5" cy="8.5" r="1.5" />
            </>
          }
        >
          <BrandFilter
            className={`${styles.control} ${styles.select}`}
            brands={facets?.brands ?? []}
            value={filters.brand}
            onChange={(brand) => onFilter({ brand })}
          />
        </Segment>
        <Segment
          label={t("filters.sourceLabel")}
          icon={
            <>
              <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
              <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
              <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
            </>
          }
        >
          <select
            className={`${styles.control} ${styles.select}`}
            value={filters.source}
            onChange={select("source")}
          >
            <option value="">{t("filters.allSources")}</option>
            {facets?.sources.map((source) => (
              <option key={source} value={source}>
                {sourceLabel(t, source)}
              </option>
            ))}
          </select>
        </Segment>
        {verdictFilter ? (
          <Segment label={t("filters.verdictLabel")} icon={<path d="M4 5.5h16v10H9.5L4 19.5v-14Z" />}>
            <select
              className={`${styles.control} ${styles.select}`}
              value={filters.verdict}
              onChange={select("verdict")}
            >
              <option value="">{t("filters.allVerdicts")}</option>
              {facets?.verdicts?.map((verdict) => (
                <option key={verdict} value={verdict}>
                  {codeLabel(t, "matches.judgeVerdicts", verdict)}
                </option>
              ))}
            </select>
          </Segment>
        ) : null}
        {hotelFilters ? (
          <Segment
            label={t("filters.familyLabel")}
            icon={
              <>
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
              </>
            }
          >
            <select
              className={`${styles.control} ${styles.select}`}
              value={filters.family}
              onChange={select("family")}
            >
              <option value="">{t("filters.allFamilies")}</option>
              {FAMILY_ORDER.map((family) => (
                <option key={family} value={family}>
                  {t(`families.${family}`)}
                </option>
              ))}
            </select>
          </Segment>
        ) : null}
        {hotelFilters ? (
          <Segment
            label={t("filters.priorityLabel")}
            icon={<path d="M5 20.5V4M5 4.5h11l-2 4 2 4H5" />}
          >
            <select
              className={`${styles.control} ${styles.select}`}
              value={filters.priority}
              onChange={select("priority")}
            >
              <option value="">{t("filters.allPriorities")}</option>
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </Segment>
        ) : null}
        {outdatedFilter ? (
          <Segment
            label={t("filters.outdatedLabel")}
            tour="outdated"
            icon={
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5v5M12 16.2v.3" />
              </>
            }
          >
            <select
              className={`${styles.control} ${styles.select}`}
              value={filters.outdated}
              onChange={select("outdated")}
            >
              <option value="">{t("filters.outdatedAll")}</option>
              <option value="hide">{t("filters.outdatedHide")}</option>
              <option value="only">{t("filters.outdatedOnly")}</option>
            </select>
          </Segment>
        ) : null}
      </div>
      <div className={styles.tabs} data-tour="tables" role="group" aria-label={t(`steps.${STEP_KEYS[step]}.title`)}>
        {TABLE_ORDER.map((key) => {
          const active = table === key;
          const count = stats?.[step === 1 ? MATCH_COUNTS[key] : VALUE_COUNTS[key]];
          const hotels = stats?.[HOTEL_COUNTS[key]];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              className={[styles.tab, active ? styles.active : "", key === "review" ? "" : styles.info]
                .filter(Boolean)
                .join(" ")}
              title={
                step === 2 && count !== undefined && hotels !== undefined
                  ? t("tables.valuesIn", { values: count, hotels })
                  : undefined
              }
              onClick={() => onTable(key)}
            >
              {t(`tables.${key}`)}{" "}
              <span className={styles.count}>{count === undefined ? "—" : t("number", { value: count })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
