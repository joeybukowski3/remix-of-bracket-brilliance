import { useState } from "react";
import type { BvpHistoryEntry, BvpHistorySplit } from "@/hooks/useMlbBvpHistory";
import { cn } from "@/lib/utils";

const DASH = "N/A";

function fmtInt(value: number | null | undefined) {
  return value == null ? DASH : String(value);
}

function fmtAvg(value: number | null | undefined) {
  return value == null ? DASH : value.toFixed(3).replace(/^0\./, ".");
}

/** Compact "AVG vs P" table-column cell -- shows career AVG only; the full Career/Last 5Y breakdown lives in the expandable panel. */
export function AvgVsPitcherCell({ entry, loading }: { entry: BvpHistoryEntry | undefined; loading: boolean }) {
  if (loading && !entry) return <span className="text-[11px] text-slate-300">{DASH}</span>;
  const avg = entry?.career?.avg ?? null;
  if (avg == null) return <span className="text-[11px] text-slate-300">{DASH}</span>;
  return <span className="text-[11px] font-semibold tabular-nums text-slate-700">{fmtAvg(avg)}</span>;
}

export function MlbBvpHistoryPanelLoading() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
      Loading batter-vs-pitcher history…
    </div>
  );
}

export function MlbBvpHistoryPanelUnavailable({ batter }: { batter: string }) {
  return (
    <div
      data-testid="bvp-history-unavailable"
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400"
    >
      Batter-vs-pitcher history is not available for {batter} right now.
    </div>
  );
}

export function MlbBvpHistoryPanelNoHistory({ batter, pitcher }: { batter: string; pitcher: string }) {
  return (
    <div
      data-testid="bvp-history-none"
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400"
    >
      {batter} has no recorded plate appearances against {pitcher}.
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

/**
 * Expandable batter-vs-pitcher history panel: PA, H, AVG, HR with a
 * Career / Last 5Y toggle. Display-only context -- entry is a static
 * lookup joined at render time by (batter id, pitcher id); this component
 * never reads or influences hrScore, matchup scores, rankings,
 * recommendations, confidence, eligibility, or sorting.
 */
export default function MlbBvpHistoryPanel({ entry, batter, pitcher }: { entry: BvpHistoryEntry; batter: string; pitcher: string }) {
  const [historyWindow, setHistoryWindow] = useState<"career" | "last5y">("career");
  const hasCareer = entry.career != null;
  const hasLast5y = entry.last5y != null;

  if (!hasCareer && !hasLast5y) {
    return <MlbBvpHistoryPanelNoHistory batter={batter} pitcher={pitcher} />;
  }

  const split: BvpHistorySplit | null = historyWindow === "career" ? entry.career : entry.last5y;

  return (
    <div data-testid="bvp-history-panel" className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
          {batter} vs {pitcher}
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setHistoryWindow("career")}
            aria-pressed={historyWindow === "career"}
            className={cn("rounded-md px-2 py-1 transition", historyWindow === "career" ? "bg-sky-500 text-white" : "text-slate-500 hover:text-slate-800")}
          >
            Career
          </button>
          <button
            type="button"
            onClick={() => setHistoryWindow("last5y")}
            aria-pressed={historyWindow === "last5y"}
            className={cn("rounded-md px-2 py-1 transition", historyWindow === "last5y" ? "bg-sky-500 text-white" : "text-slate-500 hover:text-slate-800")}
          >
            Last 5Y
          </button>
        </div>
      </div>
      {split ? (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <StatTile label="PA" value={fmtInt(split.pa)} />
          <StatTile label="H" value={fmtInt(split.h)} />
          <StatTile label="AVG" value={fmtAvg(split.avg)} />
          <StatTile label="HR" value={fmtInt(split.hr)} />
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-2 py-3 text-center text-[11px] text-slate-400">
          No {historyWindow === "career" ? "career" : "trailing 5-year"} history for this pair.
        </div>
      )}
      <p className="mt-2 text-[10px] leading-4 text-slate-400">Historical context only -- not used in Matchup Score, HR Score, or any ranking.</p>
    </div>
  );
}
