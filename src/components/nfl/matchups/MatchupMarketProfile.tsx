import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupComparisonGroup, { ComparisonHeader } from "@/components/nfl/matchups/MatchupComparisonGroup";
import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import SpreadPlaceholder from "@/components/nfl/matchups/SpreadPlaceholder";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import { formatSigned } from "@/lib/nfl/guideData";
import { MARKET_PROFILE_METRICS, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const NA = "N/A";

function wins(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(1);
}

/**
 * Descriptive market profile.
 *
 * Two clearly separated blocks:
 *  - the game's current line, which is structural and still unavailable
 *  - ATS / O/U record slots awaiting the TeamRankings phase
 *  - existing Joe Knows Ball *season* win-total context, explicitly labelled so
 *    it is never mistaken for matchup spread analysis
 *
 * No projected line, model edge or betting recommendation is produced.
 */
export default function MatchupMarketProfile({
  matchup,
  resolver,
}: {
  matchup: NflMatchup;
  resolver: NflMatchupMetricResolver;
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
      label: "Model vs Market Gap",
      help: "Projected wins minus market win total. Season value, not a head-to-head edge.",
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

  return (
    <MatchupSection id="market" subtitle="Descriptive only — no projected line and no pick.">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          This game
        </span>
        <SpreadPlaceholder spread={matchup.spread} />
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-black text-slate-500">
            {NA}
          </span>
        </div>
      </div>

      <ComparisonHeader matchup={matchup} />

      <div className="pt-1">
        <h3 className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          Season record &amp; ATS profile
        </h3>
        <MatchupComparisonGroup
          matchup={matchup}
          metrics={MARKET_PROFILE_METRICS}
          resolver={resolver}
          showHeader={false}
        />
      </div>

      <div className="pt-3">
        <h3 className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
          Joe Knows Ball season context
        </h3>
        <p className="mb-1 text-[11px] leading-4 text-slate-500">
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

      <MatchupPendingNote>
        ATS records, point/ATS differentials and over-under records populate with the TeamRankings
        phase. No line is ever inferred from the power ratings.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
