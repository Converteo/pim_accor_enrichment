import { useTranslations } from "next-intl";
import type { ChangeEvent, ReactNode } from "react";
import {
  FAMILY_ORDER,
  INFO_TABS,
  PRIORITY_ORDER,
  TAB_ORDER,
  type Facets,
  type Filters,
  type Stats,
  type TabKey,
} from "@/domain/types";
import { codeLabel, sourceLabel } from "./labels";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  tab: TabKey;
  filters: Filters;
  stats: Stats | null;
  facets: Facets | null;
  onFilter: (patch: Partial<Filters>) => void;
  onTab: (tab: TabKey) => void;
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

/**
 * Same numbers as the indicators above, never summed across units: the two last tabs hold a list of matches
 * and a list of attributes, so they show one counter per unit.
 */
function tabCounts(tab: TabKey, stats: Stats): { matches?: number; values?: number } {
  switch (tab) {
    case "matches":
      return { matches: stats.matchesToReview };
    case "review":
      return { values: stats.valuesToReview };
    case "pending":
      return { matches: stats.matchesPending, values: stats.valuesPending };
    case "auto":
      return { matches: stats.matchesAutoApproved, values: stats.valuesAutoApproved };
  }
}

function Segment({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className={styles.segment}>
      <span className={styles.segmentLabel}>
        <svg {...iconProps}>{icon}</svg>
        {label}
      </span>
      {children}
    </label>
  );
}

export function Toolbar({ tab, filters, stats, facets, onFilter, onTab }: ToolbarProps) {
  const t = useTranslations();
  // Only filters with an effect on the tab's lists: /matches filters by source, brand and verdict,
  // and matches waiting for the judge have no verdict yet.
  const hotelFilters = tab !== "matches";
  const verdictFilter = tab === "matches" || tab === "auto";

  function select(key: keyof Filters) {
    return (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
      onFilter({ [key]: event.target.value });
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.engine}>
        {hotelFilters ? (
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
        ) : null}
        <Segment
          label={t("filters.brandLabel")}
          icon={
            <>
              <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-8.1-7.9Z" />
              <circle cx="8.5" cy="8.5" r="1.5" />
            </>
          }
        >
          <select
            className={`${styles.control} ${styles.select}`}
            value={filters.brand}
            onChange={select("brand")}
          >
            <option value="">{t("filters.allBrands")}</option>
            {facets?.brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
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
      </div>
      <div className={styles.tabs}>
        {TAB_ORDER.map((key) => {
          const active = tab === key;
          const counts = stats ? tabCounts(key, stats) : null;
          // The label of a single-unit tab already names the unit.
          const unit = counts?.matches !== undefined && counts.values !== undefined;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              className={[styles.tab, active ? styles.active : "", INFO_TABS.includes(key) ? styles.info : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onTab(key)}
            >
              {t(`tabs.${key}`)}{" "}
              {counts ? (
                (["matches", "values"] as const).map((kind) =>
                  counts[kind] === undefined ? null : (
                    <span key={kind} className={styles.count}>
                      {unit
                        ? t(`tabs.${kind}Count`, { count: counts[kind] })
                        : t("number", { value: counts[kind] })}
                    </span>
                  ),
                )
              ) : (
                <span className={styles.count}>—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
