import type { NflYardageReviewMarketInfo, NflYardageAltReferenceLineMode } from "@/lib/nfl/props/review/yardageMarketJoin";

const KALSHI_MODE_LABEL: Record<NflYardageAltReferenceLineMode, string> = {
  interpolated: "interpolated between contracts",
  exact_rung: "a contract priced at ~50%",
  nearest_rung: "nearest contract to 50% (ladder never crossed 50%)",
};

function formatAmerican(value: number | null): string {
  if (value == null) return "";
  return `${value > 0 ? "+" : ""}${value}`;
}

/**
 * The market-line cell for the Yardage Props Review table (desktop + mobile
 * + detail panel share it). Renders the source label so a sportsbook line
 * and a Kalshi market-implied reference line are never confused:
 *
 *   - sportsbook: real two-sided line + American over/under juice.
 *   - kalshi:     a DERIVED "~" reference line, plus the RAW cent price of
 *                 the nearest real Kalshi contract and, clearly parenthetical,
 *                 a display-only American conversion (not sportsbook juice).
 *
 * `variant="compact"` drops the price line for the narrow mobile column.
 */
export function NflYardageMarketCell({
  info,
  variant = "full",
}: {
  info: NflYardageReviewMarketInfo;
  variant?: "full" | "compact";
}) {
  if (!info.available) {
    return (
      <span className="text-slate-400" title="No sportsbook or Kalshi line for this player">
        Unavailable
      </span>
    );
  }

  if (info.source === "sportsbook") {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="font-semibold text-slate-700">{info.line.toFixed(1)}</span>
        <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">Sportsbook</span>
        {variant === "full" && (
          <span className="text-[9px] font-normal text-slate-400">
            {info.overPrice} / {info.underPrice}
          </span>
        )}
      </span>
    );
  }

  const { yesCents, americanYes } = info.exchange;
  const title =
    `Kalshi market-implied reference line — ${KALSHI_MODE_LABEL[info.referenceLineMode]}. ` +
    `This is a derived value, not a tradable line and not sportsbook odds. ` +
    `Price shown is the nearest real Kalshi contract (${info.exchange.contractThreshold}+ yds): ` +
    `${yesCents ?? "?"}¢ per YES share` +
    (americanYes != null ? ` (≈ ${formatAmerican(americanYes)} American, display only).` : ".");

  return (
    <span className="inline-flex flex-col leading-tight" title={title}>
      <span className="font-semibold text-amber-700">~{info.line.toFixed(1)}</span>
      <span className="text-[8px] font-semibold uppercase tracking-wide text-amber-600">Kalshi</span>
      {variant === "full" && (
        <span className="text-[9px] font-normal text-slate-400">
          {yesCents != null ? `${yesCents}¢ YES` : "no price"}
          {americanYes != null ? ` (≈ ${formatAmerican(americanYes)})` : ""}
        </span>
      )}
    </span>
  );
}
