import { cn } from "@/lib/utils";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { worstFreshnessTier, type NflFreshnessTier, type NflYardageFreshnessSource } from "@/lib/nfl/props/review/freshness";

const TIER_DOT_CLASS: Record<NflFreshnessTier, string> = {
  fresh: "bg-emerald-500",
  aging: "bg-amber-500",
  stale: "bg-rose-500",
  unknown: "bg-slate-400",
};

const TIER_TEXT_CLASS: Record<NflFreshnessTier, string> = {
  fresh: "text-slate-500",
  aging: "text-amber-700",
  stale: "text-rose-700",
  unknown: "text-slate-400",
};

function tierLabel(tier: NflFreshnessTier): string {
  if (tier === "unknown") return "unavailable";
  return tier;
}

function sourceTitle(source: NflYardageFreshnessSource): string {
  if (source.tier === "unknown") return `${source.label}: no timestamp available`;
  const when = source.generatedAt ? formatNflMetadataTimestamp(source.generatedAt) : "unknown time";
  return `${source.label}: ${tierLabel(source.tier)} · updated ${when}`;
}

/**
 * Compact per-source freshness readout for the Yardage Props Review header.
 * Deliberately lives in the header/status area rather than the table --
 * one row of small dot+label chips, not a column, so it never competes with
 * the projection data itself. A source in the "stale" tier also renders a
 * single summary warning line beneath the chips; "aging" and "fresh" do not,
 * to keep the header quiet when nothing needs attention.
 */
export default function NflYardageFreshnessStatus({ sources }: { sources: readonly NflYardageFreshnessSource[] }) {
  if (sources.length === 0) return null;
  const worst = worstFreshnessTier(sources);
  const staleSources = sources.filter((s) => s.tier === "stale" || s.tier === "unknown");

  return (
    <div className="flex flex-col gap-1" data-testid="nfl-yardage-freshness-status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" role="status" aria-live="polite">
        {sources.map((source) => (
          <span key={source.key} className={cn("flex items-center gap-1.5", TIER_TEXT_CLASS[source.tier])} title={sourceTitle(source)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", TIER_DOT_CLASS[source.tier])} aria-hidden="true" />
            <span>
              {source.label} {tierLabel(source.tier)}
            </span>
          </span>
        ))}
      </div>
      {(worst === "stale" || worst === "unknown") && staleSources.length > 0 && (
        <p
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-5 text-rose-800"
          data-testid="nfl-yardage-freshness-warning"
        >
          {staleSources.map((s) => s.label).join(", ")} {staleSources.length === 1 ? "is" : "are"} stale for this preview -- figures
          below may not reflect the latest available data.
        </p>
      )}
    </div>
  );
}
