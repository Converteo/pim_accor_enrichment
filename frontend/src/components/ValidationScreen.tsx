"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchFacets, fetchHotel, fetchHotels, fetchStats } from "@/data/source";
import { cityLine, formatScore } from "@/domain/rules";
import type { Facets, Filters, HotelDetail, Stats, TabKey } from "@/domain/types";
import { Drawer } from "./Drawer";
import { FicheTable } from "./FicheTable";
import { HotelDetailView } from "./HotelDetailView";
import { errorText, sourceLabel } from "./labels";
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

interface DetailState {
  rid: string;
  data: HotelDetail | null;
  error: unknown;
}

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
  const [openRid, setOpenRid] = useState<string | null>(null);
  // Kept after closing so the drawer slides out with its content.
  const [detail, setDetail] = useState<DetailState | null>(null);

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

  function loadDetail(rid: string) {
    fetchHotel(rid).then(
      (data) => setDetail((current) => (current?.rid === rid ? { rid, data, error: null } : current)),
      (error: unknown) => setDetail((current) => (current?.rid === rid ? { ...current, error } : current)),
    );
  }

  function onOpen(rid: string) {
    setOpenRid(rid);
    setDetail({ rid, data: null, error: null });
    loadDetail(rid);
  }

  const onClose = useCallback(() => setOpenRid(null), []);

  const summary = hotels.items.find((hotel) => hotel.rid === detail?.rid);
  const shownHotel = detail?.data?.hotel ?? summary;

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
      <Drawer
        open={openRid !== null}
        eyebrow={
          shownHotel
            ? t("drawer.eyebrow", {
                brand: shownHotel.brand ?? "—",
                place: cityLine(shownHotel),
                rid: shownHotel.rid,
              })
            : ""
        }
        title={shownHotel?.name ?? ""}
        meta={
          detail?.data ? (
            <>
              <span className="status-pill pill-review">
                <i className="dot dot-review" />
                {t("drawer.toReview", { count: detail.data.toReview.length })}
              </span>
              {summary?.avgScore != null ? (
                <span className="score-pill pill-review">
                  {t("drawer.avgScore", { score: formatScore(summary.avgScore) })}
                </span>
              ) : null}
              <span className={styles.sources}>
                {detail.data.hotel.sources.map((source) => sourceLabel(t, source)).join(" · ")}
              </span>
            </>
          ) : null
        }
        onClose={onClose}
      >
        {detail?.data ? (
          <HotelDetailView detail={detail.data} />
        ) : detail?.error ? (
          <div className={styles.empty} role="alert">
            <p>
              {t("drawer.error")} {errorText(t, detail.error)}
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => onOpen(detail.rid)}>
              {t("list.retry")}
            </button>
          </div>
        ) : (
          <p className={styles.empty} role="status">
            {t("drawer.loading")}
          </p>
        )}
      </Drawer>
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
