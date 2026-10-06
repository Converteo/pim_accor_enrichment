import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { TAB_ORDER, type Filters, type TabKey } from "@/domain/types";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  filters: Filters;
  counts: Record<TabKey, number>;
  brandOptions: readonly string[];
  sourceOptions: readonly string[];
  onSearch: (value: string) => void;
  onBrand: (value: string) => void;
  onSource: (value: string) => void;
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

export function Toolbar({
  filters,
  counts,
  brandOptions,
  sourceOptions,
  onSearch,
  onBrand,
  onSource,
  onTab,
}: ToolbarProps) {
  const t = useTranslations();

  function onSearchChange(event: ChangeEvent<HTMLInputElement>) {
    onSearch(event.target.value);
  }

  function onBrandChange(event: ChangeEvent<HTMLSelectElement>) {
    onBrand(event.target.value);
  }

  function onSourceChange(event: ChangeEvent<HTMLSelectElement>) {
    onSource(event.target.value);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.engine}>
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
            type="text"
            placeholder={t("search.placeholder")}
            autoComplete="off"
            value={filters.search}
            onChange={onSearchChange}
          />
        </label>
        <label className={styles.segment}>
          <span className={styles.segmentLabel}>
            <svg {...iconProps}>
              <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-8.1-7.9Z" />
              <circle cx="8.5" cy="8.5" r="1.5" />
            </svg>
            {t("filters.brandLabel")}
          </span>
          <select
            className={`${styles.control} ${styles.select}`}
            value={filters.brand}
            onChange={onBrandChange}
          >
            <option value="">{t("filters.allBrands")}</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.segment}>
          <span className={styles.segmentLabel}>
            <svg {...iconProps}>
              <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
              <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
              <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
            </svg>
            {t("filters.sourceLabel")}
          </span>
          <select
            className={`${styles.control} ${styles.select}`}
            value={filters.source}
            onChange={onSourceChange}
          >
            <option value="">{t("filters.allSources")}</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.tabs}>
        {TAB_ORDER.map((tab) => {
          const active = filters.tab === tab;
          const label = tab === "all" ? t("tabs.all") : t(`status.${tab}`);
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={active}
              className={active ? `${styles.tab} ${styles.active}` : styles.tab}
              onClick={() => onTab(tab)}
            >
              {tab !== "all" ? <i className={`dot dot-${tab}`} /> : null}
              {label} <span className={styles.count}>{counts[tab]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
