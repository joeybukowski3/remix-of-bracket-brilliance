import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import {
  formatMoneyline,
  formatSpread,
  formatTotal,
  hasAnyMarket,
  type MarketCurrentGame,
} from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import {
  compareToMarket,
  formatPoints,
  formatProjectedSpread,
  projectedWinner,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import {
  compareTotalToMarket,
  formatTeamPoints,
  formatTotalDifference,
  formatTotalIndicatorLabel,
  totalIndicatorToneClasses,
  type TeamTotalProjection,
} from "@/lib/nfl/totalsProjectionData";

const NA = "N/A";

type DiffTone = "positive" | "negative" | "neutral" | "unavailable";

/** Sign-based tone only — never a judgement on which side the sign favours. */
function diffTone(value: number | null | undefined): DiffTone {
  if (value == null || !Number.isFinite(value)) return "unavailable";
  const rounded = Number(value.toFixed(1));
  if (rounded > 0) return "positive";
  if (rounded < 0) return "negative";
  return "neutral";
}

/**
 * One column of the unified Spread / Total / Moneyline grid: the market
 * figure, the JKB figure directly beneath it, then the difference.
 */
function MarketColumn({
  title,
  marketValue,
  jkbValue,
  diffValue,
  tone,
  extra,
}: {
  title: string;
  marketValue: string;
  jkbValue: string;
  diffValue: string;
  tone: DiffTone;
  extra?: React.ReactNode;
}) {
  return (
    <div className="matchup-market-col">
      <div className="matchup-market-col__title">{title}</div>
      <div className="matchup-market-col__market tabular-nums">{marketValue}</div>
      <div className="matchup-market-col__jkb tabular-nums">
        <span className="matchup-market-col__jkb-label">JKB</span>
        {jkbValue}
      </div>
      <div className={`matchup-market-col__diff matchup-market-col__diff--${tone} tabular-nums`}>
        {diffValue}
      </div>
      {extra}
    </div>
  );
}

/**
 * Unified Spread / Total / Moneyline comparison grid.
 *
 * Replaces the former three-piece layout (a market band row, a separate
 * projected-spread cell and a standalone oversized "JKB Projected Total"
 * card) with one aligned three-column grid, shared by mobile and desktop.
 * Each column stacks the market figure, the JKB figure directly beneath it,
 * and the difference — exactly the comparison every column already computed,
 * just no longer split across three separate surfaces.
 *
 * "JKB ML Pick" introduces no second model: it is simply the team the JKB
 * projected spread already favours (`projectedWinner`), read from the same
 * spread projection the Spread column shows.
 */
export default function MatchupMarketSummaryGrid({
  matchup,
  market,
  projection,
  totalProjection,
}: {
  matchup: NflMatchup;
  market: MarketCurrentGame | null;
  projection: GameProjection | null;
  totalProjection: TeamTotalProjection | null;
}) {
  const { away, home } = matchup;
  const priced = hasAnyMarket(market);

  // --- Spread column -------------------------------------------------
  const awaySpread = formatSpread(market?.spread.away ?? null);
  const homeSpread = formatSpread(market?.spread.home ?? null);
  const favouredIsHome = (market?.spread.home ?? 0) < 0;
  const marketSpreadValue = !priced
    ? NA
    : favouredIsHome
      ? `${home.abbr.toUpperCase()} ${homeSpread}`
      : `${away.abbr.toUpperCase()} ${awaySpread}`;
  const jkbSpreadValue = formatProjectedSpread(projection);
  const spreadComparison = compareToMarket(projection, market);
  const spreadDiffValue =
    priced && spreadComparison?.difference != null ? formatPoints(spreadComparison.difference) : NA;
  const spreadDiffTone = priced ? diffTone(spreadComparison?.difference) : "unavailable";

  // --- Total column ----------------------------------------------------
  const marketTotalValue = priced ? formatTotal(market?.total) : NA;
  const jkbTotalValue = totalProjection ? formatTeamPoints(totalProjection.projectedGameTotal) : NA;
  const totalComparison = compareTotalToMarket(totalProjection, market);
  const totalDiffValue =
    priced && totalComparison?.difference != null ? formatTotalDifference(totalComparison.difference) : NA;
  const totalDiffTone = priced ? diffTone(totalComparison?.difference) : "unavailable";
  const indicator = priced ? (totalComparison?.indicator ?? null) : null;
  const indicatorLabel = formatTotalIndicatorLabel(indicator);

  // --- Moneyline column --------------------------------------------------
  const awayMl = formatMoneyline(market?.moneyline.away ?? null);
  const homeMl = formatMoneyline(market?.moneyline.home ?? null);
  const marketMlValue = !priced
    ? NA
    : favouredIsHome
      ? `${home.abbr.toUpperCase()} ${homeMl}`
      : `${away.abbr.toUpperCase()} ${awayMl}`;
  const pickAbbr = projectedWinner(projection);
  const pickTeam = pickAbbr === away.abbr ? away : pickAbbr === home.abbr ? home : null;
  const pickSide: "away" | "home" = pickTeam === home ? "home" : "away";

  return (
    <div className="matchup-market-grid">
      <MarketColumn
        title="Spread"
        marketValue={marketSpreadValue}
        jkbValue={jkbSpreadValue}
        diffValue={spreadDiffValue}
        tone={spreadDiffTone}
      />
      <MarketColumn
        title="Total"
        marketValue={marketTotalValue}
        jkbValue={jkbTotalValue}
        diffValue={totalDiffValue}
        tone={totalDiffTone}
        extra={
          indicator && (
            <span
              className={`matchup-market-col__indicator ${totalIndicatorToneClasses(indicator)}`}
            >
              {indicatorLabel}
            </span>
          )
        }
      />
      <div className="matchup-market-col">
        <div className="matchup-market-col__title">Moneyline</div>
        <div className="matchup-market-col__market tabular-nums">{marketMlValue}</div>
        <div className="matchup-market-col__pick-label">JKB ML Pick</div>
        {pickTeam ? (
          <div className="matchup-market-col__pick">
            <NflTeamCrest team={pickTeam} side={pickSide} size={20} />
            <span>{pickTeam.abbr.toUpperCase()}</span>
          </div>
        ) : (
          <div className="matchup-market-col__pick matchup-market-col__pick--unavailable">{NA}</div>
        )}
      </div>

      {!priced && (
        <div className="matchup-market-grid__unpriced">
          <p>No market line published for this game yet.</p>
          <p>
            Spread, moneyline and total are each sourced independently and none has been priced.
            Nothing is estimated in their place.
          </p>
        </div>
      )}
    </div>
  );
}
