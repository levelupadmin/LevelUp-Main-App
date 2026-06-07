import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePaginatedTable — the fetch + page-state + nav boilerplate shared by the
 * admin tables (applications, announcements, enrolments).
 *
 * It owns `page`, `loading`, the row list, the total/hasMore bookkeeping, and
 * the effect that re-fetches when the page (or a caller-supplied dependency)
 * changes. The page-specific query stays in the caller's `fetchPage` callback —
 * different tables join, filter, and enrich differently — so this hook makes no
 * assumptions about the data source.
 *
 * Two pagination styles are supported by what `fetchPage` returns:
 *   - count-based: return `{ rows, count }`. `total` / `totalPages` are derived
 *     and `hasMore` becomes `(page + 1) * pageSize < count`.
 *   - cursor / N+1: return `{ rows, hasMore }` when a total count isn't cheap to
 *     compute. `total` stays 0 and the caller uses `hasMore` for the Next button.
 */

export interface PaginatedFetchContext {
  page: number;
  pageSize: number;
  /** `page * pageSize` — the inclusive lower bound for a Supabase `.range()`. */
  from: number;
  /** `from + pageSize - 1` — the inclusive upper bound for a Supabase `.range()`. */
  to: number;
}

export interface PaginatedFetchResult<T> {
  rows: T[];
  /** Total rows across all pages. Provide for count-based pagination. */
  count?: number | null;
  /** Explicit next-page signal when a total count isn't available. Ignored when
   *  `count` is provided. */
  hasMore?: boolean;
}

export interface UsePaginatedTableOptions<T> {
  pageSize: number;
  fetchPage: (ctx: PaginatedFetchContext) => Promise<PaginatedFetchResult<T>>;
  /**
   * Re-fetch (on the current page) whenever any of these values change — pass
   * the server-side filters here. To jump back to page 0 on a filter change,
   * call `setPage(0)` in the filter's onChange handler (React batches it with
   * the filter state update, so the fetch still runs only once). This mirrors
   * the existing admin pages.
   */
  deps?: React.DependencyList;
  initialPage?: number;
  /**
   * Keep the previously-loaded rows/total when a fetch throws, instead of
   * clearing them. Matches pages that silently ignore transient load errors.
   * When false (default), a thrown fetch clears rows and resets total to 0.
   * Note: a `fetchPage` that handles its own errors and resolves normally
   * (e.g. toasts then returns `{ rows: [], count: 0 }`) bypasses this entirely.
   */
  keepRowsOnError?: boolean;
}

export interface PaginatedTable<T> {
  rows: T[];
  setRows: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  /** Total rows across all pages (0 in hasMore mode). */
  total: number;
  /** `Math.ceil(total / pageSize)` (0 in hasMore mode). */
  totalPages: number;
  hasMore: boolean;
  nextPage: () => void;
  prevPage: () => void;
  /** Re-run the current fetch (e.g. after a mutation). */
  refetch: () => void;
}

export function usePaginatedTable<T>(opts: UsePaginatedTableOptions<T>): PaginatedTable<T> {
  const { pageSize, deps = [], initialPage = 0, keepRowsOnError = false } = opts;

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Call the latest `fetchPage` closure (it captures current filter values)
  // without making it an effect dependency — a fresh closure each render would
  // otherwise refetch on every render.
  const fetchPageRef = useRef(opts.fetchPage);
  fetchPageRef.current = opts.fetchPage;

  // Only the most recently started fetch is allowed to commit, so overlapping
  // fetches from rapid page/filter changes can't land out of order.
  const callIdRef = useRef(0);

  useEffect(() => {
    const myCallId = ++callIdRef.current;
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    fetchPageRef
      .current({ page, pageSize, from, to })
      .then((res) => {
        if (myCallId !== callIdRef.current) return;
        setRows(res.rows);
        if (res.count !== undefined && res.count !== null) {
          setTotal(res.count);
          setHasMore((page + 1) * pageSize < res.count);
        } else {
          setHasMore(Boolean(res.hasMore));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (myCallId !== callIdRef.current) return;
        if (import.meta.env.DEV) console.error("usePaginatedTable fetch failed:", err);
        if (!keepRowsOnError) {
          setRows([]);
          setTotal(0);
          setHasMore(false);
        }
        setLoading(false);
      });
    // fetchPage is intentionally read via ref, not listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, reloadToken, ...deps]);

  const totalPages = Math.ceil(total / pageSize);

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    rows,
    setRows,
    loading,
    page,
    setPage,
    total,
    totalPages,
    hasMore,
    nextPage,
    prevPage,
    refetch,
  };
}
