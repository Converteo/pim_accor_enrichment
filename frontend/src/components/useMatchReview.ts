import { useCallback, useState } from "react";
import { decideMatches, fetchMatches } from "@/data/source";
import { matchKey } from "@/domain/rules";
import type { MatchDecision, MatchFilters, MatchItem, Page } from "@/domain/types";
import { usePagedList } from "./usePagedList";

interface Options {
  filters: MatchFilters;
  /** Matches to validate, or matches approved by the threshold that the reviewer may still reject (PIM-49). */
  status?: "needs_review" | "auto_approved";
  /** Read only while the tab showing the list is open. */
  enabled?: boolean;
  /** Called after each answer of the back, with the keys it refused (message per key). */
  onResult: (result: {
    decision: MatchDecision;
    accepted: number;
    refused: { match: MatchItem | undefined; message: string }[];
  }) => void;
  onError: (error: unknown) => void;
}

/** A list of matches to decide: list, open match, selection and decisions (PIM-30, PIM-49). */
export function useMatchReview({ filters, status = "needs_review", enabled = true, onResult, onError }: Options) {
  const list = usePagedList(
    JSON.stringify([status, enabled, filters.source, filters.brand, filters.verdict]),
    (cursor): Promise<Page<MatchItem>> =>
      enabled ? fetchMatches(filters, cursor, status) : Promise.resolve({ items: [], nextCursor: null }),
    matchKey,
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const open = list.items.find((match) => matchKey(match) === openKey) ?? null;
  const [shown, setShown] = useState<MatchItem | null>(null);
  if (open !== null && open !== shown) setShown(open);

  const close = useCallback(() => setOpenKey(null), []);

  /** One POST (one INSERT); decided matches leave the list once the back accepted them. */
  async function decide(keys: readonly string[], decision: MatchDecision, comment: string): Promise<boolean> {
    const matches = list.items.filter((match) => keys.includes(matchKey(match)));
    if (busy || matches.length === 0) return false;
    setBusy(true);
    try {
      const result = await decideMatches(
        matches.map((match) => ({
          rid: match.rid,
          source: match.source,
          sourceHash: match.sourceHash,
          decision,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        })),
      );
      const accepted = new Set(result.accepted);
      // Refused matches are stale (page changed: new sourceHash): re-read the list.
      if (result.rejected.length > 0) list.reload();
      list.setItems((items) => items.filter((match) => !accepted.has(matchKey(match))));
      setSelected((current) => new Set([...current].filter((key) => !accepted.has(key))));
      setOpenKey((current) => (current !== null && accepted.has(current) ? null : current));
      onResult({
        decision,
        accepted: accepted.size,
        refused: result.rejected.map((rejection) => ({
          match: matches.find((match) => matchKey(match) === rejection.key),
          message: rejection.message,
        })),
      });
      return accepted.size > 0;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    list,
    open,
    shown,
    openKey,
    setOpenKey,
    close,
    selected,
    setSelected,
    busy,
    decide,
  };
}
