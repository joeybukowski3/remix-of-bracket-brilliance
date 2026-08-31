/**
 * NFL dense-table entry point.
 *
 * The implementation now lives in the shared site-level primitive
 * (`src/components/ui/dense-table.tsx`, plan Phase 5). This module re-exports it
 * under the historical NFL names so existing NFL (and Fantasy) consumers keep
 * working unchanged. New code should import from `@/components/ui/dense-table`.
 */
export {
  DenseTableScroller as NflTableScroller,
  DENSE_TABLE_HEAD_ROW as NFL_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW as NFL_TABLE_ROW,
} from "@/components/ui/dense-table";
