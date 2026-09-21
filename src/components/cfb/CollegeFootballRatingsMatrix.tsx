import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { CfbTeam } from "@/data/cfb/types";
import {
  createRatingsExplorerContext,
  getRatingsHeatClass,
  getRatingsViewDefinition,
  type RatingsDisplay,
  type RatingsView,
} from "@/lib/cfb/ratingsExplorer";
import { getCfbTeamPath } from "@/lib/cfb/routes";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

export default function CollegeFootballRatingsMatrix({
  teams,
  allTeams,
  view,
  display,
  statsSeason,
}: {
  teams: CfbTeam[];
  allTeams: CfbTeam[];
  view: RatingsView;
  display: RatingsDisplay;
  statsSeason: 2025 | 2026;
}) {
  const context = useMemo(
    () => createRatingsExplorerContext(allTeams, statsSeason),
    [allTeams, statsSeason],
  );
  const definition = getRatingsViewDefinition(view);

  if (!teams.length) {
    return (
      <div className="border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
        No teams match these filters.
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="College Football power ratings"
      tabIndex={0}
      className="overflow-x-auto border border-slate-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <table className="w-full min-w-[520px] sm:min-w-[760px] border-collapse text-xs">
        <thead className="bg-[#071b36] text-white">
          <tr className="text-xs uppercase tracking-[0.12em]">
            <th scope="col" className="w-10 px-2 py-3 text-center sm:w-14 sm:px-3">Rank</th>
            <th scope="col" className="sticky left-0 z-10 min-w-40 bg-[#071b36] px-3 py-3 text-left sm:min-w-48">Team</th>
            <th scope="col" className="hidden px-3 py-3 text-left sm:table-cell">Conf</th>
            {definition.metrics.map((metric) => (
              <th key={metric.key} scope="col" title={metric.label} className="min-w-24 px-2 py-3 text-center sm:min-w-28 sm:px-3">
                {metric.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="group border-t border-slate-100 transition-colors hover:bg-slate-50">
              <td className="px-2 py-2.5 text-center font-bold tabular-nums text-slate-700 sm:px-3">
                {team.ratings.jkbRank ?? "—"}
              </td>
              <td className="sticky left-0 z-[1] bg-white p-0 shadow-[1px_0_0_rgb(226_232_240)] group-hover:bg-slate-50">
                <Link
                  to={getCfbTeamPath(team.slug)}
                  className="flex items-center gap-2.5 px-3 py-2 font-semibold text-slate-900 hover:text-sky-800 hover:underline"
                >
                  <CollegeFootballTeamLogo
                    name={team.name}
                    logo={team.logo}
                    abbreviation={team.abbreviation}
                    primaryColor={team.primaryColor}
                    size="sm"
                  />
                  <span className="whitespace-nowrap">{team.name}</span>
                </Link>
              </td>
              <td className="hidden px-3 py-2.5 font-medium text-slate-500 sm:table-cell">
                {team.conference.replaceAll("-", " ").toUpperCase()}
              </td>
              {definition.metrics.map((metric) => {
                const value = metric.readValue(team, context);
                const rank = metric.readRank(team, context);
                const text = display === "ranks" && metric.heat
                  ? rank == null ? "—" : `#${rank}`
                  : metric.format(value);
                return (
                  <td key={metric.key} className="p-1.5 text-center">
                    <span
                      data-team-id={team.id}
                      data-metric-key={metric.key}
                      data-national-rank={rank ?? undefined}
                      className={cn(
                        "block px-2 py-1.5 font-bold tabular-nums",
                        metric.heat
                          ? getRatingsHeatClass(rank, context.allTeamsCount)
                          : "bg-slate-50 text-slate-700",
                      )}
                    >
                      {text}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
