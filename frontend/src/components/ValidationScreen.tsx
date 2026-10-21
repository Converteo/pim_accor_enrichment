"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchFacets, fetchHotels, fetchStats } from "@/data/source";
import type { Facets, Filters, Stats, TabKey } from "@/domain/types";
import { FicheTable } from "./FicheTable";
import { errorText } from "./labels";
import { Toolbar } from "./Toolbar";
import { Topbar } from "./Topbar";
import { usePagedList } from "./usePagedList";
import styles from "./ValidationScreen.module.css";

const EMPTY_FILTERS: Filters = {
  search: "",
  brand: "",
  source: "",
  family: "",
  priority: "",
};

const NO_SELECTION: ReadonlySet<string> = new Set();

interface ValidationScreenProps {
  author: string | null;
}

export function ValidationScreen({ author }: ValidationScreenProps) {
  const t = useTranslations();
  const [tab, setTab] = useState<TabKey>("review");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // The search box filters on the back: wait for a pause in typing.
  const [query, setQuery] = useState<Filters>(EMPTY_FILTERS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);

  // The matches tab keeps the last fiche list, so coming back does not reload it.
  const [hotelView, setHotelView] = useState<"review" | "pending">("review");
  const hotels = usePagedList(JSON.stringify([hotelView, query]), (cursor) =>
    fetchHotels(hotelView, query, cursor),
  );

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters), filters.search === query.search ? 0 : 300);
    return () => clearTimeout(timer);
  }, [filters, query.search]);

  useEffect(() => {
    // Indicators and facets are secondary: the list shows its own error if the back is down.
    fetchStats().then(setStats, () => undefined);
    fetchFacets().then(setFacets, () => undefined);
  }, []);

  function onFilter(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function onTab(next: TabKey) {
    setTab(next);
    if (next !== "matches") setHotelView(next);
  }

  function onOpen(rid: string) {
    void rid;
  }

  return (
    <>
      <Topbar stats={stats} author={author} />
      <main className={styles.app}>
        <Toolbar
          tab={tab}
          filters={filters}
          stats={stats}
          facets={facets}
          onFilter={onFilter}
          onTab={onTab}
        />
        {tab === "matches" ? (
          <p className={styles.empty}>{t("list.soon")}</p>
        ) : (
          <>
            {hotels.status === "ready" && hotels.items.length > 0 ? (
              <FicheTable
                rows={hotels.items}
                selectable={false}
                selected={NO_SELECTION}
                onToggleRow={() => undefined}
                onToggleVisible={() => undefined}
                onOpen={onOpen}
              />
            ) : null}
            <ListFooter
              status={hotels.status}
              count={hotels.items.length}
              empty={t(tab === "pending" ? "list.emptyPending" : "list.empty")}
              error={hotels.error}
              hasMore={hotels.hasMore}
              loadingMore={hotels.loadingMore}
              onMore={hotels.loadMore}
              onRetry={hotels.reload}
            />
          </>
        )}
      </main>
    </>
  );
}

interface ListFooterProps {
  status: "loading" | "ready" | "error";
  count: number;
  empty: string;
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onRetry: () => void;
}

/** Loading, empty, error and « load more » states shared by the tabs. */
export function ListFooter({
  status,
  count,
  empty,
  error,
  hasMore,
  loadingMore,
  onMore,
  onRetry,
}: ListFooterProps) {
  const t = useTranslations();

  if (status === "loading") {
    return (
      <p className={styles.empty} role="status">
        {t("list.loading")}
      </p>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.empty} role="alert">
        <p>
          {t("list.error")} {errorText(t, error)}
        </p>
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          {t("list.retry")}
        </button>
      </div>
    );
  }
  if (count === 0) {
    return <p className={styles.empty}>{empty}</p>;
  }
  return (
    <div className={styles.more}>
      <span>{t("list.shown", { count })}</span>
      {error ? <span role="alert">{errorText(t, error)}</span> : null}
      {hasMore ? (
        <button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? t("list.loading") : t("list.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
