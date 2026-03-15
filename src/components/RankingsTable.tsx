import { Link } from "react-router-dom";
import type { Team, StatWeight } from "@/data/ncaaTeams";
import { calculateTeamScore, formatStat } from "@/data/ncaaTeams";

interface RankingsTableProps {
  teams: Team[];
  weights: StatWeight[];
}

export default function RankingsTable({ teams, weights }: RankingsTableProps) {
  const ranked = [...teams]
    .map((t) => ({ ...t, score: calculateTeamScore(t.stats, weights) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="text-left py-3 px-4 font-semibold w-12">#</th>
              <th className="text-left py-3 px-4 font-semibold">Team</th>
              <th className="text-left py-3 px-2 font-semibold hidden md:table-cell">Conf</th>
              <th className="text-left py-3 px-2 font-semibold hidden lg:table-cell">Record</th>
              <th className="text-right py-3 px-2 font-semibold hidden md:table-cell">PPG</th>
              <th className="text-right py-3 px-2 font-semibold hidden md:table-cell">Opp PPG</th>
              <th className="text-right py-3 px-2 font-semibold hidden lg:table-cell">AdjOE</th>
              <th className="text-right py-3 px-2 font-semibold hidden lg:table-cell">AdjDE</th>
              <th className="text-right py-3 px-2 font-semibold hidden xl:table-cell">SOS</th>
              <th className="text-right py-3 px-4 font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((team, i) => (
              <tr key={team.id} className="data-table-row">
                <td className="py-2.5 px-4 tabular-nums font-bold text-muted-foreground">
                  {i + 1}
                </td>
                <td className="py-2.5 px-4 font-semibold text-foreground">
                  <div className="flex items-center gap-2">
                    <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                    {team.seed && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-primary/20 text-primary">
                        {team.seed}
                      </span>
                    )}
                    <Link to={`/team/${team.slug}`} className="truncate hover:underline">
                      {team.name}
                    </Link>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-muted-foreground hidden md:table-cell">{team.conference}</td>
                <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell tabular-nums">{team.record}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden md:table-cell">{formatStat(team.stats.ppg)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden md:table-cell">{formatStat(team.stats.oppPpg)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden lg:table-cell">{formatStat(team.stats.adjOE)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden lg:table-cell">{formatStat(team.stats.adjDE)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden xl:table-cell">{formatStat(team.stats.sos)}</td>
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
    </div>
  );
}
