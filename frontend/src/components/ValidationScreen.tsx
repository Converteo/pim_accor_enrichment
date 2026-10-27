"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  ApiError,
  decideEnrichments,
  fetchFacets,
  fetchHotel,
  fetchHotels,
  fetchHotelsDetail,
  fetchStats,
} from "@/data/source";
import { applyDecisions, cityLine, formatScore, inTable, matchKey, withCount } from "@/domain/rules";
import {
  TABLE_ORDER,
  type EnrichmentDecisionItem,
  type EnrichmentValue,
  type Facets,
  type Filters,
  type HotelDetail,
  type HotelSummary,
  type Page,
  type Stats,
  type Step,
  type TableKey,
  type ValueDecision as Decision,
} from "@/domain/types";
import { AutoValidationPanel } from "./AutoValidationPanel";
import { BulkBar } from "./BulkBar";
import { Drawer } from "./Drawer";
import { ExportBar } from "./ExportBar";
import { StatusDistribution } from "./StatusDistribution";
import { STEP_KEYS, StepCards } from "./StepCards";
import { FicheTable } from "./FicheTable";
import { GuidedTour, type TourStep } from "./GuidedTour";
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

// Set once the tour was finished or skipped: it starts by itself on the first visit only (per browser).
const TOUR_SEEN = "pim-tour-seen";

const EMPTY_FILTERS: Filters = {
  search: "",
  brand: "",
  source: "",
  family: "",
  priority: "",
  verdict: "",
  outdated: "",
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
  /** Table of step 2 whose values are shown; null: the whole fiche. */
  view: TableKey | null;
  data: HotelDetail | null;
  error: unknown;
}

interface ValidationScreenProps {
  author: string | null;
}

export function ValidationScreen({ author }: ValidationScreenProps) {
  const t = useTranslations();
  // Step and table live in the URL (back button, shareable link). Without a step there, matches come first
  // (their values appear once approved); with none to check, step 2 opens.
  const searchParams = useSearchParams();
  const urlStep = searchParams.get("step");
  const [defaultStep, setDefaultStep] = useState<Step>(1);
  const step: Step = urlStep === "1" ? 1 : urlStep === "2" ? 2 : defaultStep;
  const table: TableKey = TABLE_ORDER.find((key) => key === searchParams.get("table")) ?? "review";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [touring, setTouring] = useState(false);
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
  const detailViewRef = useRef<TableKey | null>(null);

  useEffect(() => {
    openRidRef.current = openRid;
    detailViewRef.current = detail?.view ?? null;
  }, [openRid, detail?.view]);

  // Fiches of the step 2 table, read only while step 2 is shown.
  const hotels = usePagedList(
    JSON.stringify([step, table, query]),
    (cursor): Promise<Page<HotelSummary>> =>
      step === 2 ? fetchHotels(table, query, cursor) : Promise.resolve({ items: [], nextCursor: null }),
    (hotel) => hotel.rid,
  );
  const matchCallbacks: Pick<Parameters<typeof useMatchReview>[0], "onResult" | "onError"> = {
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
  };
  // The step 1 table (PIM-54); a decision moves the match to « Validé manuellement ».
  const matches = useMatchReview({
    filters: query,
    status: table === "review" ? "needs_review" : table,
    enabled: step === 1,
    author,
    ...matchCallbacks,
  });

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters), filters.search === query.search ? 0 : 300);
    return () => clearTimeout(timer);
  }, [filters, query.search]);

  useEffect(() => {
    // Indicators and facets are secondary: the list shows its own error if the back is down.
    fetchStats().then(
      (loaded) => {
        setStats(loaded);
        if (loaded.matchesToReview === 0) setDefaultStep(2);
        // The tour starts once the counters it points at are there.
        try {
          if (!localStorage.getItem(TOUR_SEEN)) setTouring(true);
        } catch {
          // Storage blocked: no automatic tour, the « ? » button still starts it.
        }
      },
      () => undefined,
    );
    fetchFacets().then(setFacets, () => undefined);
  }, []);

  const endTour = useCallback(() => {
    setTouring(false);
    try {
      localStorage.setItem(TOUR_SEEN, "1");
    } catch {
      // Storage blocked: the tour will start again on the next visit.
    }
  }, [setTouring]);

  /** New thresholds change statuses at once: counters and lists are read again. */
  function onThresholdsSaved(message: string) {
    setNotice({ tone: "success", text: message });
    fetchStats().then(setStats, () => undefined);
    hotels.reload();
    matches.list.reload();
  }

  // A selection only makes sense on the list it was made on.
  function onFilter(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setSelected(new Set());
    matches.setSelected(new Set());
  }

  /** Pushed to the history: the back button returns to the previous step or table. */
  function navigate(nextStep: Step, nextTable: TableKey) {
    if (nextStep === step && nextTable === table) return;
    const params = new URLSearchParams(searchParams);
    params.set("step", String(nextStep));
    if (nextTable === "review") params.delete("table");
    else params.set("table", nextTable);
    window.history.pushState(null, "", `?${params}`);
    setSelected(new Set());
    matches.setSelected(new Set());
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
   * One POST for all the values (one INSERT on the back). Optimistic: values leave their table at once (in
   * « Validé manuellement » they take their new decision); the fiches leave the list once the back has answered,
   * then the counters and the open fiche are re-read.
   */
  async function submit(decisions: PendingDecision[]): Promise<boolean> {
    if (decisions.length === 0 || busy) return false;
    const items = decisions.map((decision) => decision.item);
    const rids = new Set(decisions.map((decision) => decision.rid));
    const beforeDetail = detail;
    const beforeCounts = new Map(
      hotels.items.filter((hotel) => rids.has(hotel.rid)).map((hotel) => [hotel.rid, hotel.count]),
    );
    // A decided value leaves the table it was in, and joins « Validé manuellement ».
    const moves = (d: PendingDecision) =>
      table === "human" ? (inTable("human", d.value.status) ? 0 : 1) : inTable(table, d.value.status) ? -1 : 0;
    const remaining = new Map(
      [...beforeCounts].map(([rid, count]) => [
        rid,
        Math.max(0, count + decisions.filter((d) => d.rid === rid).reduce((sum, d) => sum + moves(d), 0)),
      ]),
    );
    setBusy(true);
    setNotice(null);
    setDetail((current) =>
      current?.data && rids.has(current.rid)
        ? {
            ...current,
            data: applyDecisions(current.data, items, author, new Date().toISOString(), table === "human"),
          }
        : current,
    );
    hotels.setItems((list) =>
      list.map((hotel) =>
        remaining.has(hotel.rid) ? { ...hotel, count: remaining.get(hotel.rid) ?? 0 } : hotel,
      ),
    );

    try {
      const result = await decideEnrichments(items);
      const counts = new Map(remaining);
      const refused = result.rejected.map((rejection) => {
        const decision = decisions.find((d) => d.value.enrichmentId === rejection.enrichmentId);
        if (decision) counts.set(decision.rid, (counts.get(decision.rid) ?? 0) - moves(decision));
        return `${decision?.value.label ?? rejection.enrichmentId} : ${rejection.message}`;
      });
      hotels.setItems((list) =>
        [...counts].reduce((acc, [rid, count]) => withCount(acc, rid, count), list),
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
          beforeCounts.has(hotel.rid) ? { ...hotel, count: beforeCounts.get(hotel.rid) ?? 0 } : hotel,
        ),
      );
      setDetail((current) => (current?.rid === beforeDetail?.rid ? beforeDetail : current));
      setNotice({ tone: "error", text: failedText(error) });
      return false;
    } finally {
      setBusy(false);
      fetchStats().then(setStats, () => undefined);
      const open = openRidRef.current;
      if (open !== null && rids.has(open)) loadDetail(open, detailViewRef.current);
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
      hotels.setItems((list) => details.reduce((acc, d) => withCount(acc, d.hotel.rid, 0), list));
      setSelected(new Set());
      setNotice({ tone: "success", text: t("decide.saved", { count: 0 }) });
      return true;
    }
    const saved = await submit(decisions);
    if (saved) setSelected(new Set());
    return saved;
  }

  function loadDetail(rid: string, view: TableKey | null) {
    fetchHotel(rid, view ?? undefined).then(
      (data) => {
        setDetail((current) => (current?.rid === rid && current.view === view ? { rid, view, data, error: null } : current));
        // The fiche is the freshest source for its row's counter, when it shows the row's table.
        const values = view === null ? data.toReview : (data.values ?? []);
        if ((view ?? "review") !== table) return;
        hotels.setItems((list) =>
          list.map((hotel) =>
            hotel.rid === rid
              ? {
                  ...hotel,
                  count: values.length,
                  outdatedCount: values.filter((value) => value.outdated !== null).length,
                }
              : hotel,
          ),
        );
      },
      (error: unknown) =>
        setDetail((current) => (current?.rid === rid && current.view === view ? { ...current, error } : current)),
    );
  }

  /** The fiche opens on the values of the table it comes from (PIM-55); « À vérifier » shows the whole fiche. */
  function onOpen(rid: string, view: TableKey | null = table === "review" ? null : table) {
    setOpenRid(rid);
    setFicheComment("");
    setDetail({ rid, view, data: null, error: null });
    loadDetail(rid, view);
  }

  const closeMatch = matches.close;
  const onClose = useCallback(() => {
    setOpenRid(null);
    setSettingsOpen(false);
    closeMatch();
  }, [closeMatch, setOpenRid, setSettingsOpen]);

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

  // Steps whose list turns out empty are skipped (PIM-60); each step only shows a screen, never decides.
  const noMatches = () => step === 1 && matches.list.status === "ready" && matches.list.items.length === 0;
  const noFiches = () => step === 2 && hotels.status === "ready" && hotels.items.length === 0;
  const tourSteps: TourStep[] = [
    { key: "steps", target: '[data-tour="steps"]' },
    { key: "why", target: '[data-tour="why"]', before: () => navigate(1, "review"), skip: noMatches },
    { key: "matchDetail", target: '[data-tour="view"]', before: () => navigate(1, "review"), skip: noMatches },
    { key: "tables", target: '[data-tour="tables"]' },
    { key: "fiche", target: '[data-tour="fiche"]', before: () => navigate(2, "review"), skip: noFiches },
    { key: "outdated", target: '[data-tour="outdated"]', before: () => navigate(2, "review") },
    { key: "filters", target: '[data-tour="filters"]' },
    { key: "bulk", target: '[data-tour="select"]', before: () => navigate(2, "review"), skip: noFiches },
    { key: "export", target: '[data-tour="export"]' },
    { key: "help", target: '[data-tour="help"]' },
  ];

  const summary = hotels.items.find((hotel) => hotel.rid === detail?.rid);
  const shownHotel = detail?.data?.hotel ?? summary;

  return (
    <>
      {/* The drawer is modal: the page behind it leaves the focus order and the accessibility tree. */}
      <div inert={drawerOpen || touring}>
        <Topbar
          author={author}
          onOpenSettings={() => {
            onClose();
            setSettingsOpen(true);
          }}
          onHelp={() => {
            onClose();
            setTouring(true);
          }}
        >
          <StepCards step={step} stats={stats} onStep={(next) => navigate(next, "review")}>
            <ExportBar stats={stats} />
          </StepCards>
          <StatusDistribution stats={stats} />
        </Topbar>
        <main className={styles.app}>
          <Toolbar
            step={step}
            table={table}
            filters={filters}
            stats={stats}
            facets={facets}
            onFilter={onFilter}
            onTable={(next) => navigate(step, next)}
          />
          {table === "review" ? null : (
            <p className={styles.hint}>{t(`tableHints.${STEP_KEYS[step]}.${table}`)}</p>
          )}
          {step === 1 ? (
            <>
              {matches.list.status === "ready" && matches.list.items.length > 0 ? (
                <MatchTable
                  rows={matches.list.items}
                  readOnly={table !== "review"}
                  decisions={table === "human"}
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
                empty={t(table === "review" ? "matches.empty" : "matches.emptyTable")}
                error={matches.list.error}
                hasMore={matches.list.hasMore}
                loadingMore={matches.list.loadingMore}
                onMore={matches.list.loadMore}
                onRetry={matches.list.reload}
              />
            </>
          ) : (
            <>
              {hotels.status === "ready" && hotels.items.length > 0 ? (
                <FicheTable
                  table={table}
                  rows={hotels.items}
                  selectable={table === "review"}
                  selected={selected}
                  onToggleRow={onToggleRow}
                  onToggleVisible={onToggleVisible}
                  onOpen={(rid) => onOpen(rid)}
                />
              ) : null}
              <ListFooter
                status={hotels.status}
                count={hotels.items.length}
                shown={t("list.shown", { count: hotels.items.length })}
                empty={t("list.empty")}
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
              {detail.view !== null ? (
                <span className="status-pill pill-review">
                  {t("drawer.inTable", { count: detail.data.values?.length ?? 0, table: t(`tables.${detail.view}`) })}
                </span>
              ) : detail.data.toReview.length > 0 ? (
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
          detail?.data && detail.view === null && detail.data.toReview.length > 0 ? (
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
            table={table}
            view={detail.view}
            onToggleView={() => onOpen(detail.rid, detail.view === null ? table : null)}
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
            <button type="button" className="btn btn-ghost" onClick={() => onOpen(detail.rid, detail.view)}>
              {t("list.retry")}
            </button>
          </div>
        ) : (
          <p className={`${styles.empty} ${styles.loading}`} role="status" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
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
              {/* A reviewer can go back on any decision, automatic or human: only the opposite one is offered. */}
              {openMatch.status === "auto_rejected" || openMatch.status === "human_rejected" ? null : (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={matches.busy}
                  onClick={() => void matches.decide([matchKey(openMatch)], "human_rejected", matchComment)}
                >
                  {t("matches.reject")}
                </button>
              )}
              {openMatch.status === "auto_approved" || openMatch.status === "human_approved" ? null : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={matches.busy}
                  onClick={() => void matches.decide([matchKey(openMatch)], "human_approved", matchComment)}
                >
                  {t(openMatch.status === "auto_rejected" ? "matches.approveAnyway" : "matches.approve")}
                </button>
              )}
            </>
          ) : null
        }
        onClose={onClose}
      >
        {openMatch ? <MatchDetailView match={openMatch} /> : null}
      </Drawer>
      {step === 1 ? (
        <BulkBar
          key="matches"
          labels="bulkMatches"
          count={table === "review" ? matches.list.items.filter((match) => matches.selected.has(matchKey(match))).length : 0}
          busy={matches.busy}
          onCancel={() => matches.setSelected(new Set())}
          onDecide={(decision, comment) => matches.decide([...matches.selected], decision, comment)}
        />
      ) : (
        <BulkBar
          key="fiches"
          labels="bulk"
          count={table === "review" ? selected.size : 0}
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
      {touring ? <GuidedTour steps={tourSteps} onClose={endTour} /> : null}
    </>
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
      <p className={`${styles.empty} ${styles.loading}`} role="status" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
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
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loadingMore}
          aria-busy={loadingMore}
          onClick={onMore}
        >
          {loadingMore ? <span className="spinner" aria-hidden="true" /> : null}
          {loadingMore ? t("list.loading") : t("list.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
