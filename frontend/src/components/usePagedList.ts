import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "@/domain/types";

export type ListStatus = "loading" | "ready" | "error";

interface ListState<T> {
  key: string;
  items: T[];
  nextCursor: string | null;
  status: ListStatus;
  error: unknown;
  loadingMore: boolean;
}

/**
 * Cursor-paginated list reloaded from its first page whenever `key` changes (tab, filters).
 * Responses of an outdated key are dropped.
 */
export function usePagedList<T>(key: string, load: (cursor: string | null) => Promise<Page<T>>) {
  const [state, setState] = useState<ListState<T>>({
    key,
    items: [],
    nextCursor: null,
    status: "loading",
    error: null,
    loadingMore: false,
  });
  const [reloads, setReloads] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  // Reset during render, not in the effect (React's "adjusting state when a prop changes").
  if (state.key !== key) {
    setState({ key, items: [], nextCursor: null, status: "loading", error: null, loadingMore: false });
  }

  useEffect(() => {
    let current = true;
    loadRef.current(null).then(
      (page) => {
        if (current) {
          setState({ key, items: page.items, nextCursor: page.nextCursor, status: "ready", error: null, loadingMore: false });
        }
      },
      (error: unknown) => {
        if (current) {
          setState((previous) => ({ ...previous, key, status: "error", error }));
        }
      },
    );
    return () => {
      current = false;
    };
  }, [key, reloads]);

  const loadMore = useCallback(() => {
    const { key: pageKey, nextCursor: cursor, loadingMore } = state;
    if (cursor === null || loadingMore) return;
    setState((previous) => ({ ...previous, loadingMore: true }));
    loadRef.current(cursor).then(
      (page) =>
        setState((previous) =>
          previous.key === pageKey && previous.nextCursor === cursor
            ? { ...previous, items: [...previous.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false, error: null }
            : previous,
        ),
      (error: unknown) =>
        setState((previous) =>
          previous.key === pageKey ? { ...previous, loadingMore: false, error } : previous,
        ),
    );
  }, [state]);

  const setItems = useCallback((update: (items: T[]) => T[]) => {
    setState((previous) => ({ ...previous, items: update(previous.items) }));
  }, []);

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, status: "loading", error: null }));
    setReloads((count) => count + 1);
  }, []);

  return {
    items: state.items,
    status: state.status,
    error: state.error,
    hasMore: state.nextCursor !== null,
    loadingMore: state.loadingMore,
    loadMore,
    setItems,
    reload,
  };
}
