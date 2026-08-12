import { useMemo, useState } from "react";

const PAGE_SIZE = 20;

interface UsePaginatedRowsResult<T> {
  visibleRows: T[];
  visibleCount: number;
  totalCount: number;
  hasMore: boolean;
  /** "Show All" is only offered below this size -- rendering thousands of table rows at once is not acceptable performance. */
  canShowAll: boolean;
  showMore: () => void;
  showAll: () => void;
  reset: () => void;
}

const SHOW_ALL_MAX_ROWS = 300;

/** Shared "latest 20, then Show More / Show All" pagination for performance-preview tables. */
export function usePaginatedRows<T>(rows: T[]): UsePaginatedRowsResult<T> {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);

  return {
    visibleRows,
    visibleCount: Math.min(visibleCount, rows.length),
    totalCount: rows.length,
    hasMore: visibleCount < rows.length,
    canShowAll: rows.length <= SHOW_ALL_MAX_ROWS,
    showMore: () => setVisibleCount((count) => Math.min(count + PAGE_SIZE, rows.length)),
    showAll: () => setVisibleCount(rows.length),
    reset: () => setVisibleCount(PAGE_SIZE),
  };
}
