interface ShowMoreFooterProps {
  visibleCount: number;
  totalCount: number;
  hasMore: boolean;
  canShowAll: boolean;
  onShowMore: () => void;
  onShowAll: () => void;
}

export default function ShowMoreFooter({ visibleCount, totalCount, hasMore, canShowAll, onShowMore, onShowAll }: ShowMoreFooterProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
      <span>Showing {visibleCount} of {totalCount} graded plays</span>
      {hasMore && (
        <div className="flex gap-2">
          <button type="button" onClick={onShowMore} className="rounded-full border border-slate-300 px-3 py-1 font-bold text-slate-600 hover:bg-slate-100">
            Show More
          </button>
          {canShowAll && (
            <button type="button" onClick={onShowAll} className="rounded-full border border-slate-300 px-3 py-1 font-bold text-slate-600 hover:bg-slate-100">
              Show All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
