import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import { ComparisonHeader } from "@/components/nfl/matchups/MatchupComparisonGroup";
import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import MatchupCurrentMarket from "@/components/nfl/matchups/MatchupCurrentMarket";
import MatchupMarketRow, {
  type MarketPeriodValues,
} from "@/components/nfl/matchups/MatchupMarketRow";
import { formatSigned } from "@/lib/nfl/guideData";
import { MARKET_PROFILE_METRICS, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import type { MarketCurrentGame, MarketPeriodKey } from "@/lib/nfl/marketData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const NA = "N/A";

function wins(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(1);
}

export type MarketProfileState = {
  periods: readonly MarketPeriodKey[];
  /** One resolver per visible period. */
  resolvers: Partial<Record<MarketPeriodKey, NflMatchupMetricResolver>>;
  current: MarketCurrentGame | null;
  note?: string;
};

/**
 * Descriptive market profile.
 *
 * Three clearly separated blocks, in this order:
 *
 *  1. Current Market — this game's line, moneyline and total
 *  2. Team Market Profile — how each team performed against past market lines
 *  3. Joe Knows Ball season context — full-season win totals, explicitly
 *     labelled so it is never mistaken for matchup spread analysis
 *
 * Blocks 1 and 2 are deliberately distinct: ATS history did not produce the
 * current line, and the current line is never used to grade history.
 *
 * No projected spread, fair spread, model edge, win probability, pick,
 * confidence, expected value or stake size is produced here or downstream.
 */
export default function MatchupMarketProfile({
  matchup,
  market,
}: {
  matchup: NflMatchup;
  market?: MarketProfileState;
}) {
  const seasonRows: {
    key: string;
    label: string;
    help: string;
    value: (team: NflMatchupTeam) => string;
    rank: (team: NflMatchupTeam) => number | null;
  }[] = [
    {
      key: "marketWinTotal",
      label: "2026 Market Win Total",
      help: "Sportsbook season win total — market expectation for the full season.",
      value: (team) => wins(team.marketWinTotal),
      rank: () => null,
    },
    {
      key: "projectedWins",
      label: "Model Projected Wins",
      help: "Joe Knows Ball projected 2026 wins.",
      value: (team) => wins(team.projectedWins),
      rank: () => null,
    },
    {
      key: "modelVsMarket",
      // Deliberately not "Model vs Market": Model Analysis uses that label for
      // this game's spread in points. Two different units and subjects sharing
      // one name on the same page reads as the same metric printed twice.
      label: "Win Total Gap",
      help: "Projected wins minus market win total, in wins. A full-season figure — unrelated to this game's spread.",
      value: (team) => (team.modelVsMarketGap == null ? NA : formatSigned(team.modelVsMarketGap)),
      rank: () => null,
    },
    {
      key: "scheduleRank",
      label: "Schedule Strength Rank",
      help: "Season strength-of-schedule rank (1 = hardest). Context only.",
      value: (team) => (team.scheduleRank == null ? NA : `#${team.scheduleRank}`),
      rank: (team) => team.scheduleRank,
    },
  ];

  const periods = market?.periods ?? [];

  /** Gather one team's value for each visible period. */
  const valuesFor = (teamSlug: string, metricKey: string): MarketPeriodValues => {
    const out: MarketPeriodValues = {};
    for (const period of periods) {
      out[period] = market?.resolvers[period]?.(teamSlug, metricKey) ?? null;
    }
    return out;
  };

  return (
    <MatchupSection id="market" subtitle="Descriptive only — no projected line and no pick.">
      <MatchupCurrentMarket matchup={matchup} market={market?.current ?? null} />

      <div className="pt-3">
        <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
          Team Market Profile
        </h3>
        {market?.note && <p className="mb-1 text-[11px] leading-4 text-slate-600">{market.note}</p>}

        <ComparisonHeader matchup={matchup} />

        {periods.length === 0 ? (
          <p className="py-3 text-center text-[11px] font-semibold text-slate-600">
            Market profile not connected.
          </p>
        ) : (
          MARKET_PROFILE_METRICS.map((metric) => (
            <MatchupMarketRow
              key={metric.key}
              metricLabel={metric.label}
              shortLabel={metric.shortLabel}
              help={metric.help}
              periods={periods}
              awayValues={valuesFor(matchup.away.slug, metric.key)}
              homeValues={valuesFor(matchup.home.slug, metric.key)}
              awayTeamName={matchup.away.teamName}
              homeTeamName={matchup.home.teamName}
            />
          ))
        )}
      </div>

      <div className="pt-3">
        <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
          Joe Knows Ball season context
        </h3>
        <p className="mb-1 text-[11px] leading-4 text-slate-600">
          Full-season win-total figures. These describe the season, not this matchup&apos;s spread.
        </p>
        {seasonRows.map((row) => (
          <MatchupComparisonRow
            key={row.key}
            metricLabel={row.label}
            help={row.help}
            away={{ formattedValue: row.value(matchup.away), rank: row.rank(matchup.away) }}
            home={{ formattedValue: row.value(matchup.home), rank: row.rank(matchup.home) }}
            awayTeamName={matchup.away.teamName}
            homeTeamName={matchup.home.teamName}
          />
        ))}
      </div>
    </MatchupSection>
  );
}
