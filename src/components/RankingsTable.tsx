import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TeamLogo from "@/components/TeamLogo";
import type { Team, StatWeight } from "@/data/ncaaTeams";
import {
  calculateTeamScore,
  calculateAdjustedModelScore,
  computeHomeInflationMetrics,
  computeQuadRecord,
  dedupeTeamsByCanonicalId,
  formatStat,
  getTop50AvgDropOff,
  type ModelScoreOptions,
} from "@/data/ncaaTeams";

interface RankingsTableProps {
  teams: Team[];
  weights: StatWeight[];
  /** Full team pool for Top-50 drop-off baseline. Defaults to same as `teams`. */
  teamPool?: Team[];
  modelOpts?: ModelScoreOptions;
}

type SortKey = "rank" | "homeNet" | "awayNet" | "dropOff" | "inflation" | "q1";

export default function RankingsTable({ teams, weights, teamPool, modelOpts }: RankingsTableProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(false);

  const pool = teamPool ?? teams;
  const avgDropOff = useMemo(() => getTop50AvgDropOff(pool), [pool]);

  const ranked = useMemo(() => {
    const deduped = dedupeTeamsByCanonicalId(teams);
    const withScore = deduped.map((t, i) => {
      const opts: ModelScoreOptions = {
        ...modelOpts,
        avgTop50DropOff: avgDropOff,
        rank: i + 1,
        totalTeams: deduped.length,
      };
      const score =
        (modelOpts?.homeInflationPenaltyWeight ?? 0) > 0 || (modelOpts?.q1BonusWeight ?? 0) > 0
          ? calculateAdjustedModelScore(t, weights, opts)
          : calculateTeamScore(t.stats, weights);
      return { ...t, score };
    });

    // Initial sort by score to assign stable ranks
    withScore.sort((a, b) => b.score - a.score);

    // Attach rank-based data
    const enriched = withScore.map((t, i) => {
      const inflation = computeHomeInflationMetrics(t, avgDropOff);
      const quad = computeQuadRecord(t, i + 1, withScore.length);
      return { ...t, rank: i + 1, inflation, quad };
    });

    // Re-sort by selected key
    if (sortKey !== "rank") {
      enriched.sort((a, b) => {
        let va = 0, vb = 0;
        if (sortKey === "homeNet") { va = a.inflation.netEffHome; vb = b.inflation.netEffHome; }
        else if (sortKey === "awayNet") { va = a.inflation.netEffAway; vb = b.inflation.netEffAway; }
        else if (sortKey === "dropOff") { va = a.inflation.dropOff; vb = b.inflation.dropOff; }
        else if (sortKey === "inflation") { va = a.inflation.homeInflationScore; vb = b.inflation.homeInflationScore; }
        else if (sortKey === "q1") { va = a.quad.q1WinPct; vb = b.quad.q1WinPct; }
        return sortAsc ? va - vb : vb - va;
      });
    } else if (sortAsc) {
      enriched.reverse();
    }

    return enriched;
  }, [teams, weights, avgDropOff, modelOpts, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortTh = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <th
      className="text-right py-3 px-2 font-semibold cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {children}
      <span className="ml-0.5 text-[10px]">{sortKey === col ? (sortAsc ? "↑" : "↓") : ""}</span>
    </th>
  );

  const inflationLabel = (label: string) => {
    if (label === "home-inflated") return <span className="text-orange-400 font-bold">⚠ Inflated</span>;
    if (label === "road-tested") return <span className="text-blue-400 font-bold">💪 Road Tested</span>;
    return <span className="text-green-400 font-bold">✓ Stable</span>;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {showAdvanced ? "Hide" : "Show"} Home/Away + Resume Stats
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-secondary-foreground">
                <th
                  className="text-left py-3 px-4 font-semibold w-12 cursor-pointer select-none"
                  onClick={() => handleSort("rank")}
                >
                  #{sortKey === "rank" ? (sortAsc ? " ↑" : " ↓") : ""}
                </th>
                <th className="text-left py-3 px-4 font-semibold">Team</th>
                <th className="text-left py-3 px-2 font-semibold hidden md:table-cell">Conf</th>
                <th className="text-left py-3 px-2 font-semibold hidden lg:table-cell">Record</th>
                <th className="text-right py-3 px-2 font-semibold hidden md:table-cell">PPG</th>
                <th className="text-right py-3 px-2 font-semibold hidden md:table-cell">Opp PPG</th>
                <th className="text-right py-3 px-2 font-semibold hidden lg:table-cell">AdjOE</th>
                <th className="text-right py-3 px-2 font-semibold hidden lg:table-cell">AdjDE</th>
                <th className="text-right py-3 px-2 font-semibold hidden xl:table-cell">SOS</th>
                {showAdvanced && (
                  <>
                    <SortTh col="homeNet">Home Net</SortTh>
                    <SortTh col="awayNet">Away Net</SortTh>
                    <SortTh col="dropOff">Δ Drop</SortTh>
                    <SortTh col="inflation">Inflation</SortTh>
                    <SortTh col="q1">Q1 W-L</SortTh>
                  </>
                )}
                <th className="text-right py-3 px-4 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((team, i) => (
                <tr key={team.canonicalId} className="data-table-row">
                  <td className="py-2.5 px-4 tabular-nums font-bold text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <TeamLogo name={team.name} logo={team.logo} className="h-6 w-6" />
                      {team.seed && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary">
                          {team.seed}
                        </span>
                      )}
                      <Link to={`/team/${team.slug}`} className="truncate hover:underline">
                        {team.name}
                      </Link>
                      {team.inflation.homeInflationScore > 5 && (
                        <span
                          className="text-[11px] text-orange-400 font-bold leading-none"
                          title={`Home Inflation Score: +${team.inflation.homeInflationScore.toFixed(1)}`}
                        >
                          🏠
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-muted-foreground hidden md:table-cell">{team.conference}</td>
                  <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell tabular-nums">{team.record}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums hidden md:table-cell">{formatStat(team.stats.ppg)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums hidden md:table-cell">{formatStat(team.stats.oppPpg)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums hidden lg:table-cell">{formatStat(team.stats.adjOE)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums hidden lg:table-cell">{formatStat(team.stats.adjDE)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums hidden xl:table-cell">{formatStat(team.stats.sos)}</td>
                  {showAdvanced && (
                    <>
                      <td className="py-2.5 px-2 text-right tabular-nums text-xs">
                        {team.inflation.netEffHome.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-xs">
                        {team.inflation.netEffAway.toFixed(1)}
                      </td>
                      <td className={`py-2.5 px-2 text-right tabular-nums text-xs font-semibold ${
                        team.inflation.dropOff > 8 ? "text-orange-400" :
                        team.inflation.dropOff < 0 ? "text-blue-400" : "text-muted-foreground"
                      }`}>
                        {team.inflation.dropOff > 0 ? "+" : ""}{team.inflation.dropOff.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-xs">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`tabular-nums font-semibold ${
                            team.inflation.homeInflationScore > 5 ? "text-orange-400" :
                            team.inflation.homeInflationScore < -2 ? "text-blue-400" : "text-green-400"
                          }`}>
                            {team.inflation.homeInflationScore > 0 ? "+" : ""}{team.inflation.homeInflationScore.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-xs">
                        <div className="flex flex-col items-end">
                          <span>
                            <span className="text-yellow-400 font-semibold">{team.quad.q1.wins}-{team.quad.q1.losses}</span>
                            {" "}<span className="text-muted-foreground">|</span>{" "}
                            <span>{team.quad.q2.wins}-{team.quad.q2.losses}</span>
                          </span>
                        </div>
                      </td>
                    </>
                  )}
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                        <div
                          className="h-full rounded-full stat-bar"
                          style={{ width: `${team.score}%` }}
                        />
                      </div>
                      <span className="font-bold text-primary tabular-nums">
                        {team.score.toFixed(1)}
                      </span>
                    </div>
                    {team.statsCoverage !== "full" && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {team.statsCoverage === "partial" ? "Partial stats" : "Metadata only"}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAdvanced && (
          <div className="px-4 py-2 bg-secondary/40 border-t border-border text-[11px] text-muted-foreground flex flex-wrap gap-4">
            <span><span className="text-orange-400 font-bold">🏠 Inflated</span> — drops more than Top-50 avg on road</span>
            <span><span className="text-blue-400 font-bold">💪 Road Tested</span> — holds up or improves away</span>
            <span><span className="text-green-400 font-bold">✓ Stable</span> — near-typical home/away split</span>
            <span><span className="text-yellow-400 font-bold">Q1</span> — games vs top opponents (NET rank 1–75 away)</span>
          </div>
        )}
      </div>
    </div>
  );
}
