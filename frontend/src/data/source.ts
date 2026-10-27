import type {
  AutoValidation,
  AutoValidationStep,
  DecisionResult,
  EnrichmentDecisionItem,
  ExportExecution,
  ExportStatus,
  Facets,
  FieldValues,
  Filters,
  HotelDetail,
  HotelSummary,
  MatchDecisionItem,
  MatchFilters,
  MatchItem,
  MatchListStatus,
  Page,
  Stats,
  TableKey,
  Thresholds,
} from "../domain/types";

// Only client module that talks to the back, through the Next.js relay /api/* (src/app/api/[...path]).

const PAGE_SIZE = 50;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init?.method ?? "GET",
      headers: init ? { "Content-Type": "application/json" } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? "",
    );
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchStats(): Promise<Stats> {
  return call("/stats");
}

export function fetchFacets(): Promise<Facets> {
  return call("/hotels/facets");
}

/** Fiches of one table of step 2 (PIM-55): `count` = their values in the table's status. */
export function fetchHotels(view: TableKey, filters: Filters, cursor: string | null): Promise<Page<HotelSummary>> {
  // The verdict only filters matches.
  return call(`/hotels${query({ view, ...filters, verdict: undefined, limit: PAGE_SIZE, cursor })}`);
}

/** With a table of step 2, `values` holds the fiche's values in that table; without, the whole fiche. */
export function fetchHotel(rid: string, view?: TableKey): Promise<HotelDetail> {
  return call(`/hotels/${encodeURIComponent(rid)}${query({ view })}`);
}

/** Details of several fiches (bulk decisions), a few calls at a time to spare the back. */
export async function fetchHotelsDetail(rids: readonly string[]): Promise<HotelDetail[]> {
  const results: HotelDetail[] = [];
  for (let start = 0; start < rids.length; start += 4) {
    results.push(...(await Promise.all(rids.slice(start, start + 4).map((rid) => fetchHotel(rid)))));
  }
  return results;
}

export function decideEnrichments(items: EnrichmentDecisionItem[]): Promise<DecisionResult<"enrichmentId">> {
  return call("/decisions/enrichments", { method: "POST", body: { items } });
}

export function fetchFieldValues(pimField: string): Promise<FieldValues> {
  return call(`/fields/${encodeURIComponent(pimField)}/values`);
}

export function fetchMatches(
  { search, source, brand, verdict }: MatchFilters,
  cursor: string | null,
  status: MatchListStatus,
): Promise<Page<MatchItem>> {
  return call(`/matches${query({ status, search, source, brand, verdict, limit: PAGE_SIZE, cursor })}`);
}

export function decideMatches(items: MatchDecisionItem[]): Promise<DecisionResult<"key">> {
  return call("/decisions/matches", { method: "POST", body: { items } });
}

export function fetchExportStatus(): Promise<ExportStatus> {
  return call("/export/status");
}

export function startExport(): Promise<{ executionId: string }> {
  return call("/export", { method: "POST", body: {} });
}

export function fetchExecution(executionId: string): Promise<ExportExecution> {
  return call(`/export/executions/${encodeURIComponent(executionId)}`);
}

export function fetchAutoValidation(): Promise<AutoValidation> {
  return call("/settings/auto-validation");
}

/** Adds a row to validation.auto_validation_settings; the back answers with the updated state. */
export function saveAutoValidation(
  step: AutoValidationStep,
  thresholds: Thresholds,
  comment: string,
): Promise<AutoValidation> {
  return call(`/settings/auto-validation/${step}`, {
    method: "POST",
    body: { ...thresholds, ...(comment.trim() ? { comment: comment.trim() } : {}) },
  });
}

export function exportFileUrl(exportId: string, name: string): string {
  return `/api/exports/${encodeURIComponent(exportId)}/files/${encodeURIComponent(name)}`;
}
