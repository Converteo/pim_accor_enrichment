"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ApiError,
  decideEnrichments,
  fetchAutoApprovedValues,
  fetchFacets,
  fetchHotel,
  fetchHotels,
  fetchHotelsDetail,
  fetchMatches,
  fetchStats,
} from "@/data/source";
import { applyDecisions, cityLine, formatScore, matchKey, withReviewCount } from "@/domain/rules";
import type {
  AutoApprovedValue,
  EnrichmentDecisionItem,
  EnrichmentValue,
  Facets,
  Filters,
  HotelDetail,
  MatchItem,
  Page,
  Stats,
  TabKey,
  ValueDecision as Decision,
} from "@/domain/types";
import { AutoValidationPanel } from "./AutoValidationPanel";
import { AutoValueTable } from "./AutoValueTable";
import { BulkBar } from "./BulkBar";
import { Drawer } from "./Drawer";
import { ExportBar } from "./ExportBar";
import { FicheTable } from "./FicheTable";
import { HotelDetailView } from "./HotelDetailView";
import { MatchDetailView } from "./MatchDetailView";
import { MatchTable } from "./MatchTable";
import { errorText, sourceLabel } from "./labels";
import { Toolbar } from "./Toolbar";
import { Topbar } from "./Topbar";
import { Notice, type NoticeState } from "./Notice";
import { useMatchReview } from "./useMatchReview";
import { usePagedList } from "./usePagedList";
import { ValueDecision } from "./ValueDecision";
import styles from "./ValidationScreen.module.css";

const EMPTY_FILTERS: Filters = {
  search: "",
  brand: "",
  source: "",
  family: "",
  priority: "",
};

/** One value decided by the reviewer, with the fiche it belongs to. */
interface PendingDecision {
  rid: string;
  value: EnrichmentValue;
  item: EnrichmentDecisionItem;
}

/** Values without enrichmentId (pending_enrichment) cannot be decided and are left out. */
function decisionsFor(
  rid: string,
  values: readonly EnrichmentValue[],
  decision: Decision,
  comment: string,
): PendingDecision[] {
  return values.flatMap((value) =>
    value.enrichmentId === null
      ? []
      : [
          {
            rid,
            value,
            item: {
              enrichmentId: value.enrichmentId,
              decision,
              ...(comment.trim() ? { comment: comment.trim() } : {}),
            },
          },
        ],
  );
}

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
  // Matches come first (their values appear once approved); with none to validate, the attributes tab opens.
  const [tab, setTab] = useState<TabKey>("matches");
  const tabChosen = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // The search box filters on the back: wait for a pause in typing.
  const [query, setQuery] = useState<Filters>(EMPTY_FILTERS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [openRid, setOpenRid] = useState<string | null>(null);
  // Kept after closing so the drawer slides out with its content.
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [ficheComment, setFicheComment] = useState("");
  const [matchComment, setMatchComment] = useState("");
  // Read after an await: the fiche open when the back answers, not when the reviewer clicked.
  const openRidRef = useRef(openRid);

  useEffect(() => {
    openRidRef.current = openRid;
  }, [openRid]);

  // The matches tab keeps the last fiche list, so coming back does not reload it.
  const [hotelView, setHotelView] = useState<"review" | "pending">("review");
  const hotels = usePagedList(JSON.stringify([hotelView, query]), (cursor) =>
    fetchHotels(hotelView, query, cursor),
    (hotel) => hotel.rid,
  );
  const matches = useMatchReview({
    source: query.source,
    onResult: ({ decision, accepted, refused }) => {
      const saved = t(decision === "human_approved" ? "matches.savedApproved" : "matches.saved", {
        count: accepted,
      });
      setNotice(
        refused.length > 0
          ? {
              tone: "error",
              text: `${accepted > 0 ? `${saved} ` : ""}${t("matches.refused", { count: refused.length })}`,
              details: refused.map(({ match, message }) => `${match?.pim.name ?? match?.rid ?? "—"} : ${message}`),
            }
          : { tone: "success", text: saved },
      );
      if (accepted > 0) setMatchComment("");
      fetchStats().then(setStats, () => undefined);
    },
    onError: (error) => setNotice({ tone: "error", text: failedText(error) }),
  });

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters), filters.search === query.search ? 0 : 300);
    return () => clearTimeout(timer);
  }, [filters, query.search]);

  // « En cours » tab: matches waiting for the judge, read only when the tab is shown.
  const pendingMatches = usePagedList(
    JSON.stringify(["pending_judgment", tab === "pending", query.source]),
    (cursor): Promise<Page<MatchItem>> =>
      tab === "pending"
        ? fetchMatches(query.source, cursor, "pending_judgment")
        : Promise.resolve({ items: [], nextCursor: null }),
    matchKey,
  );

  // « Validés automatiquement » tab (read only), read only when the tab is shown.
  const autoMatches = usePagedList(
    JSON.stringify(["auto_approved", tab === "auto", query.source]),
    (cursor): Promise<Page<MatchItem>> =>
      tab === "auto"
        ? fetchMatches(query.source, cursor, "auto_approved")
        : Promise.resolve({ items: [], nextCursor: null }),
    matchKey,
  );
  const autoValues = usePagedList(
    JSON.stringify(["auto_values", tab === "auto", query]),
    (cursor): Promise<Page<AutoApprovedValue>> =>
      tab === "auto" ? fetchAutoApprovedValues(query, cursor) : Promise.resolve({ items: [], nextCursor: null }),
    ({ hotel, value }) => `${hotel.rid}|${value.enrichmentId ?? value.pimField}`,
  );

  useEffect(() => {
    // Indicators and facets are secondary: the list shows its own error if the back is down.
    fetchStats().then(
      (loaded) => {
        setStats(loaded);
        if (!tabChosen.current && loaded.matchesToReview === 0) setTab("review");
      },
      () => undefined,
    );
    fetchFacets().then(setFacets, () => undefined);
  }, []);

  /** New thresholds change statuses at once: counters and lists are read again. */
  function onThresholdsSaved(message: string) {
    setNotice({ tone: "success", text: message });
    fetchStats().then(setStats, () => undefined);
    hotels.reload();
    matches.list.reload();
    pendingMatches.reload();
    autoMatches.reload();
    autoValues.reload();
  }

  // A selection only makes sense on the list it was made on.
  function onFilter(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setSelected(new Set());
    matches.setSelected(new Set());
  }

  function onTab(next: TabKey) {
    tabChosen.current = true;
    setTab(next);
    setSelected(new Set());
    matches.setSelected(new Set());
    if (next === "review" || next === "pending") setHotelView(next);
  }

  function onToggleRow(rid: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(rid);
      else next.delete(rid);
      return next;
    });
  }

  function onToggleVisible(checked: boolean) {
    setSelected(checked ? new Set(hotels.items.map((hotel) => hotel.rid)) : new Set());
  }

  /**
   * One POST for all the values (one INSERT on the back). Optimistic: values leave « à valider » at once;
   * the fiches leave the list once the back has answered, then the counters and the open fiche are re-read.
   */
  async function submit(decisions: PendingDecision[]): Promise<boolean> {
    if (decisions.length === 0 || busy) return false;
    const items = decisions.map((decision) => decision.item);
    const rids = new Set(decisions.map((decision) => decision.rid));
    const beforeDetail = detail;
    const beforeCounts = new Map(
      hotels.items.filter((hotel) => rids.has(hotel.rid)).map((hotel) => [hotel.rid, hotel.toReviewCount]),
    );
    const remaining = new Map(
      [...beforeCounts].map(([rid, count]) => [rid, Math.max(0, count - decisions.filter((d) => d.rid === rid).length)]),
    );
    setBusy(true);
    setNotice(null);
    setDetail((current) =>
      current?.data && rids.has(current.rid)
        ? { ...current, data: applyDecisions(current.data, items, author, new Date().toISOString()) }
        : current,
    );
    hotels.setItems((list) =>
      list.map((hotel) =>
        remaining.has(hotel.rid) ? { ...hotel, toReviewCount: remaining.get(hotel.rid) ?? 0 } : hotel,
      ),
    );

    try {
      const result = await decideEnrichments(items);
      const counts = new Map(remaining);
      const refused = result.rejected.map((rejection) => {
        const decision = decisions.find((d) => d.value.enrichmentId === rejection.enrichmentId);
        if (decision) counts.set(decision.rid, (counts.get(decision.rid) ?? 0) + 1);
        return `${decision?.value.label ?? rejection.enrichmentId} : ${rejection.message}`;
      });
      hotels.setItems((list) =>
        [...counts].reduce((acc, [rid, count]) => withReviewCount(acc, rid, count), list),
      );
      setNotice(
        refused.length > 0
          ? {
              tone: "error",
              text: `${result.accepted.length > 0 ? `${t("decide.saved", { count: result.accepted.length })} ` : ""}${t("decide.refused", { count: refused.length })}`,
              details: refused,
            }
          : { tone: "success", text: t("decide.saved", { count: result.accepted.length }) },
      );
      return true;
    } catch (error) {
      // Undo only what the optimistic update changed: the list or the open fiche may have moved since.
      hotels.setItems((list) =>
        list.map((hotel) =>
          beforeCounts.has(hotel.rid) ? { ...hotel, toReviewCount: beforeCounts.get(hotel.rid) ?? 0 } : hotel,
        ),
      );
      setDetail((current) => (current?.rid === beforeDetail?.rid ? beforeDetail : current));
      setNotice({ tone: "error", text: failedText(error) });
      return false;
    } finally {
      setBusy(false);
      fetchStats().then(setStats, () => undefined);
      const open = openRidRef.current;
      if (open !== null && rids.has(open)) loadDetail(open);
    }
  }

  function failedText(error: unknown): string {
    // The 401 message already says the decision was not saved.
    return error instanceof ApiError && error.status === 401
      ? errorText(t, error)
      : `${t("decide.failed")} ${errorText(t, error)}`;
  }

  function decideValue(value: EnrichmentValue, decision: Decision, comment: string, correctedValue?: string) {
    if (!detail?.data) return;
    void submit(
      decisionsFor(detail.rid, [value], decision, comment).map((pending) => ({
        ...pending,
        item: correctedValue === undefined ? pending.item : { ...pending.item, correctedValue },
      })),
    );
  }

  function decideFiche(decision: Decision) {
    if (!detail?.data) return;
    void submit(decisionsFor(detail.rid, detail.data.toReview, decision, ficheComment)).then(
      (saved) => saved && setFicheComment(""),
    );
  }

  /** Resolves to true when the decisions were saved (the bar then clears its comment). */
  async function decideSelection(decision: Decision, comment: string): Promise<boolean> {
    if (busy || selected.size === 0) return false;
    setBusy(true);
    let details: HotelDetail[];
    try {
      // The list only has counts: read each fiche to decide exactly the values it has to review now.
      details = await fetchHotelsDetail([...selected]);
    } catch (error) {
      setNotice({ tone: "error", text: failedText(error) });
      return false;
    } finally {
      setBusy(false);
    }
    const decisions = details.flatMap((d) => decisionsFor(d.hotel.rid, d.toReview, decision, comment));
    if (decisions.length === 0) {
      // Everything was decided in the meantime: these fiches no longer belong to the list.
      hotels.setItems((list) => details.reduce((acc, d) => withReviewCount(acc, d.hotel.rid, 0), list));
      setSelected(new Set());
      setNotice({ tone: "success", text: t("decide.saved", { count: 0 }) });
      return true;
    }
    const saved = await submit(decisions);
    if (saved) setSelected(new Set());
    return saved;
  }

  function loadDetail(rid: string) {
    fetchHotel(rid).then(
      (data) => {
        setDetail((current) => (current?.rid === rid ? { rid, data, error: null } : current));
        // The fiche is the freshest source for its row's counter.
        hotels.setItems((list) =>
          list.map((hotel) => (hotel.rid === rid ? { ...hotel, toReviewCount: data.toReview.length } : hotel)),
        );
      },
      (error: unknown) => setDetail((current) => (current?.rid === rid ? { ...current, error } : current)),
    );
  }

  function onOpen(rid: string) {
    setOpenRid(rid);
    setFicheComment("");
    setDetail({ rid, data: null, error: null });
    loadDetail(rid);
  }

  const closeMatch = matches.close;
  const onClose = useCallback(() => {
    setOpenRid(null);
    setSettingsOpen(false);
    closeMatch();
  }, [closeMatch]);

  function onOpenMatch(key: string) {
    setOpenRid(null);
    setMatchComment("");
    matches.setOpenKey(key);
  }

  function onToggleMatch(key: string, checked: boolean) {
    matches.setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Last match shown: the drawer slides out with its content after a decision or a close.
  const openMatch = matches.shown;
  const drawerOpen = openRid !== null || matches.open !== null || settingsOpen;

  const summary = hotels.items.find((hotel) => hotel.rid === detail?.rid);
  const shownHotel = detail?.data?.hotel ?? summary;

  return (
    <>
      {/* The drawer is modal: the page behind it leaves the focus order and the accessibility tree. */}
      <div inert={drawerOpen}>
        <Topbar
          stats={stats}
          author={author}
          onOpenSettings={() => {
            setOpenRid(null);
            closeMatch();
            setSettingsOpen(true);
          }}
        />
        <main className={styles.app}>
          <Toolbar
            tab={tab}
            filters={filters}
            stats={stats}
            facets={facets}
            onFilter={onFilter}
            onTab={onTab}
          />
          <ExportBar pending={stats?.pendingForExport} />
          {tab === "matches" ? (
            <>
              {matches.list.status === "ready" && matches.list.items.length > 0 ? (
                <MatchTable
                  rows={matches.list.items}
                  selected={matches.selected}
                  onToggleRow={onToggleMatch}
                  onToggleVisible={(checked) =>
                    matches.setSelected(checked ? new Set(matches.list.items.map(matchKey)) : new Set())
                  }
                  onOpen={onOpenMatch}
                />
              ) : null}
              <ListFooter
                status={matches.list.status}
                count={matches.list.items.length}
                shown={t("matches.shown", { count: matches.list.items.length })}
                empty={t("matches.empty")}
                error={matches.list.error}
                hasMore={matches.list.hasMore}
                loadingMore={matches.list.loadingMore}
                onMore={matches.list.loadMore}
                onRetry={matches.list.reload}
              />
            </>
          ) : tab === "auto" ? (
            <>
              <SectionTitle title={t("autoTab.matches")} hint={t("autoTab.matchesHint")} />
              {autoMatches.status === "ready" && autoMatches.items.length > 0 ? (
                <MatchTable rows={autoMatches.items} readOnly />
              ) : null}
              <ListFooter
                status={autoMatches.status}
                count={autoMatches.items.length}
                shown={t("matches.shown", { count: autoMatches.items.length })}
                empty={t("autoTab.matchesEmpty")}
                error={autoMatches.error}
                hasMore={autoMatches.hasMore}
                loadingMore={autoMatches.loadingMore}
                onMore={autoMatches.loadMore}
                onRetry={autoMatches.reload}
              />
              <SectionTitle title={t("autoTab.values")} hint={t("autoTab.valuesHint")} />
              {autoValues.status === "ready" && autoValues.items.length > 0 ? (
                <AutoValueTable rows={autoValues.items} />
              ) : null}
              <ListFooter
                status={autoValues.status}
                count={autoValues.items.length}
                shown={t("autoTab.valuesShown", { count: autoValues.items.length })}
                empty={t("autoTab.valuesEmpty")}
                error={autoValues.error}
                hasMore={autoValues.hasMore}
                loadingMore={autoValues.loadingMore}
                onMore={autoValues.loadMore}
                onRetry={autoValues.reload}
              />
            </>
          ) : (
            <>
              {tab === "pending" ? (
                <>
                  <SectionTitle title={t("pendingTab.matches")} hint={t("pendingTab.matchesHint")} />
                  {pendingMatches.status === "ready" && pendingMatches.items.length > 0 ? (
                    <MatchTable rows={pendingMatches.items} readOnly />
                  ) : null}
                  <ListFooter
                    status={pendingMatches.status}
                    count={pendingMatches.items.length}
                    shown={t("matches.shown", { count: pendingMatches.items.length })}
                    empty={t("pendingTab.matchesEmpty")}
                    error={pendingMatches.error}
                    hasMore={pendingMatches.hasMore}
                    loadingMore={pendingMatches.loadingMore}
                    onMore={pendingMatches.loadMore}
                    onRetry={pendingMatches.reload}
                  />
                  <SectionTitle title={t("pendingTab.values")} hint={t("pendingTab.valuesHint")} />
                </>
              ) : null}
              {hotels.status === "ready" && hotels.items.length > 0 ? (
                <FicheTable
                  rows={hotels.items}
                  selectable={tab === "review"}
                  selected={selected}
                  onToggleRow={onToggleRow}
                  onToggleVisible={onToggleVisible}
                  onOpen={onOpen}
                />
              ) : null}
              <ListFooter
                status={hotels.status}
                count={hotels.items.length}
                shown={t("list.shown", { count: hotels.items.length })}
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
      </div>
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
              {detail.data.toReview.length > 0 ? (
                <span className="status-pill pill-review">
                  <i className="dot dot-review" />
                  {t("drawer.toReview", { count: detail.data.toReview.length })}
                </span>
              ) : null}
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
        footer={
          detail?.data && detail.data.toReview.length > 0 ? (
            <>
              <input
                className={`field ${styles.comment}`}
                type="text"
                value={ficheComment}
                maxLength={500}
                placeholder={t("decide.commentPlaceholder")}
                aria-label={t("decide.ficheComment")}
                onChange={(event) => setFicheComment(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => decideFiche("human_rejected")}
              >
                {t("decide.rejectFiche", { count: detail.data.toReview.length })}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => decideFiche("human_approved")}
              >
                {t("decide.approveFiche", { count: detail.data.toReview.length })}
              </button>
            </>
          ) : null
        }
        onClose={onClose}
      >
        {detail?.data ? (
          <HotelDetailView
            detail={detail.data}
            renderActions={(value) => (
              <ValueDecision
                value={value}
                busy={busy}
                onDecide={(decision, comment, correctedValue) =>
                  decideValue(value, decision, comment, correctedValue)
                }
              />
            )}
          />
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
      <Drawer
        open={matches.open !== null}
        eyebrow={
          openMatch
            ? t("drawer.eyebrow", {
                brand: openMatch.pim.brand ?? "—",
                place: cityLine(openMatch.pim),
                rid: openMatch.rid,
              })
            : ""
        }
        title={openMatch?.pim.name ?? openMatch?.rid ?? ""}
        meta={
          openMatch ? (
            <span className={styles.sources}>{sourceLabel(t, openMatch.source)}</span>
          ) : null
        }
        footer={
          openMatch ? (
            <>
              <input
                className={`field ${styles.comment}`}
                type="text"
                value={matchComment}
                maxLength={500}
                placeholder={t("matches.comment")}
                aria-label={t("matches.comment")}
                onChange={(event) => setMatchComment(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger"
                disabled={matches.busy}
                onClick={() => void matches.decide([matchKey(openMatch)], "human_rejected", matchComment)}
              >
                {t("matches.reject")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={matches.busy}
                onClick={() => void matches.decide([matchKey(openMatch)], "human_approved", matchComment)}
              >
                {t("matches.approve")}
              </button>
            </>
          ) : null
        }
        onClose={onClose}
      >
        {openMatch ? <MatchDetailView match={openMatch} /> : null}
      </Drawer>
      {tab === "matches" ? (
        <BulkBar
          key="matches"
          labels="bulkMatches"
          count={matches.list.items.filter((match) => matches.selected.has(matchKey(match))).length}
          busy={matches.busy}
          onCancel={() => matches.setSelected(new Set())}
          onDecide={(decision, comment) => matches.decide([...matches.selected], decision, comment)}
        />
      ) : (
        <BulkBar
          key="fiches"
          labels="bulk"
          count={tab === "review" ? selected.size : 0}
          busy={busy}
          onCancel={() => setSelected(new Set())}
          onDecide={decideSelection}
        />
      )}
      <Drawer
        open={settingsOpen}
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        onClose={onClose}
      >
        <AutoValidationPanel open={settingsOpen} onSaved={onThresholdsSaved} />
      </Drawer>
      <Notice notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}

/** Heading of one list of the « En cours » tab. */
function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionHint}>{hint}</p>
    </div>
  );
}

interface ListFooterProps {
  status: "loading" | "ready" | "error";
  count: number;
  shown: string;
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
  shown,
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
      <span>{shown}</span>
      {error ? <span role="alert">{errorText(t, error)}</span> : null}
      {hasMore ? (
        <button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? t("list.loading") : t("list.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
