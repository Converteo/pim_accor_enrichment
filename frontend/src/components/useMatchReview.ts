import { useCallback, useState } from "react";
import { decideMatches, fetchMatches } from "@/data/source";
import { matchKey } from "@/domain/rules";
import type { MatchDecision, MatchItem } from "@/domain/types";
import { usePagedList } from "./usePagedList";

interface Options {
  source: string;
  /** Called after each answer of the back, with the keys it refused (message per key). */
  onResult: (result: {
    decision: MatchDecision;
    accepted: number;
    refused: { match: MatchItem | undefined; message: string }[];
  }) => void;
  onError: (error: unknown) => void;
}

/** « Rapprochements à valider » tab: list, open match, selection and decisions (PIM-30). */
export function useMatchReview({ source, onResult, onError }: Options) {
  const list = usePagedList(JSON.stringify(["matches", source]), (cursor) => fetchMatches(source, cursor), matchKey);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
      return true;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    list,
    open: list.items.find((match) => matchKey(match) === openKey) ?? null,
    openKey,
    setOpenKey,
    close,
    selected,
    setSelected,
    busy,
    decide,
  };
}
