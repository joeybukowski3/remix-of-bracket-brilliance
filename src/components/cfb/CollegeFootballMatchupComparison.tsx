import { useMemo } from "react";
import { Check } from "lucide-react";
import { CFB_AP_RANKS_2026, CFB_GAMES_2026, CFB_PROVENANCE } from "@/data/cfb";
import type { CfbTeam } from "@/data/cfb/types";
import {
  createRatingsExplorerContext,
  RATINGS_VIEW_DEFINITIONS,
  type RatingsMetric,
} from "@/lib/cfb/ratingsExplorer";
import { getCfbRankCellProps } from "@/lib/cfb/rankTierPalette";
import {
  formatCfbRecord,
  getCfbTeamGameContext,
  getRankAdvantage,
  getTeamTintStyle,
  type CfbTeamGameLine,
} from "@/lib/cfb/teamContext";
import { cn } from "@/lib/utils";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  left: CfbTeam;
  right: CfbTeam;
  allTeams: readonly CfbTeam[];
  teamById: ReadonlyMap<string, CfbTeam>;
  statsSeason: 2025 | 2026;
};

function GameLine({ label, line }: { label: string; line: CfbTeamGameLine | null }) {
  return (
    <p className="text-[11px] leading-snug text-slate-600" data-game-line={label.toLowerCase()}>
      <span className="font-bold uppercase tracking-wide text-slate-500">{label}: </span>
      {line ? (
        <>
          {line.text}
          {line.opponentRank && <span className="text-slate-500"> ({line.opponentRank})</span>}
        </>
      ) : "—"}
    </p>
  );
}

function TeamIdentity({
  team,
  testId,
  showLast,
  showNext,
  last,
  next,
}: {
  team: CfbTeam;
  testId: string;
  showLast: boolean;
  showNext: boolean;
  last: CfbTeamGameLine | null;
  next: CfbTeamGameLine | null;
}) {
  return (
    <div
      data-testid={testId}
      style={getTeamTintStyle(team.primaryColor) ?? undefined}
      className="flex h-full flex-col items-center gap-1 border border-slate-200 px-2 py-2 text-center"
    >
      <CollegeFootballTeamLogo
        name={team.name}
        logo={team.logo}
        abbreviation={team.abbreviation}
        primaryColor={team.primaryColor}
      />
      <p className="text-sm font-black leading-tight text-slate-950">
        {team.name}{" "}
        <span data-testid={`${testId}-record`} className="whitespace-nowrap text-xs font-bold text-slate-600">
          {formatCfbRecord(team.record)}
        </span>
      </p>
      <p className="text-xs font-semibold text-slate-600">JKB #{team.ratings.jkbRank ?? "—"}</p>
      {(showLast || showNext) && (
        <div className="mt-1 w-full space-y-0.5 border-t border-slate-900/10 pt-1 text-left">
          {showLast && <GameLine label="Last" line={last} />}
          {showNext && <GameLine label="Next" line={next} />}
        </div>
      )}
    </div>
  );
}

function ValueCell({
  metric,
  value,
  rank,
  fieldSize,
  side,
  isStronger,
}: {
  metric: RatingsMetric;
  value: number | null;
  rank: number | null;
  fieldSize: number;
  side: "left" | "right";
  isStronger: boolean;
}) {
  const heatProps = metric.heat ? getCfbRankCellProps(rank, fieldSize) : null;
  return (
    <td
      data-compare-side={side}
      data-metric-key={metric.key}
      data-national-rank={rank ?? undefined}
      {...(heatProps ?? {})}
      className={cn("px-1.5 py-2 text-center font-bold tabular-nums", !heatProps && "bg-slate-50 text-slate-700")}
    >
      {metric.format(value)}
      {metric.heat && rank != null && <span className="ml-1 text-[11px] font-semibold opacity-80">· #{rank}</span>}
      {isStronger && <span className="sr-only"> (advantage)</span>}
    </td>
  );
}

function AdvantageMark({ show, side }: { show: boolean; side: "left" | "right" }) {
  return (
    <span className="flex w-4 shrink-0 justify-center">
      {show && (
        <Check
          data-advantage={side}
          aria-hidden
          className="h-3.5 w-3.5 text-emerald-600"
          strokeWidth={3}
        />
      )}
    </span>
  );
}

export default function CollegeFootballMatchupComparison({ left, right, allTeams, teamById, statsSeason }: Props) {
  const context = useMemo(() => createRatingsExplorerContext([...allTeams], statsSeason), [allTeams, statsSeason]);
  const gameContext = useMemo(() => ({
    left: getCfbTeamGameContext(left.id, CFB_GAMES_2026, teamById, CFB_AP_RANKS_2026),
    right: getCfbTeamGameContext(right.id, CFB_GAMES_2026, teamById, CFB_AP_RANKS_2026),
  }), [left.id, right.id, teamById]);
  const statsLabel = `${statsSeason} ${statsSeason === 2025 ? "FINAL" : "season to date"}`;
  // Same registry as the table; metrics repeated across categories (situational) show once.
  const seenKeys = new Set<string>();
  const groups = RATINGS_VIEW_DEFINITIONS.map((definition) => ({
    definition,
    metrics: definition.metrics.filter((metric) => {
      if (seenKeys.has(metric.key)) return false;
      seenKeys.add(metric.key);
      return true;
    }),
  })).filter((group) => group.metrics.length > 0);
  const showLast = Boolean(gameContext.left.last || gameContext.right.last);
  const showNext = Boolean(gameContext.left.next || gameContext.right.next);

  return (
    <div className="mt-4 border-t border-slate-200 pt-4" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">Team comparison</p>
        <span className="bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
          {CFB_PROVENANCE.label} · advanced stats {statsLabel}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-xs" aria-label="Team comparison">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[32%]" />
          <col className="w-[34%]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="p-0 pr-1 align-top font-normal sm:pr-2">
              <TeamIdentity team={left} testId="comparison-team-a" showLast={showLast} showNext={showNext} {...gameContext.left} />
            </th>
            <th scope="col" className="sr-only">Metric</th>
            <th scope="col" className="p-0 pl-1 align-top font-normal sm:pl-2">
              <TeamIdentity team={right} testId="comparison-team-b" showLast={showLast} showNext={showNext} {...gameContext.right} />
            </th>
          </tr>
        </thead>
        {groups.map(({ definition, metrics }) => (
          <tbody key={definition.id} aria-label={`${definition.label} comparison`}>
            <tr className="bg-slate-100">
              <th colSpan={3} scope="colgroup" className="px-2 py-1.5 text-center text-xs font-black uppercase tracking-wide text-slate-700">
                {definition.label}
                {definition.usesSeasonStats && <span className="ml-2 font-bold text-slate-500">{statsLabel}</span>}
              </th>
            </tr>
            {metrics.map((metric) => {
              const leftRank = metric.readRank(left, context);
              const rightRank = metric.readRank(right, context);
              const advantage = metric.heat ? getRankAdvantage(leftRank, rightRank) : 0;
              return (
                <tr key={metric.key} className="border-t border-white">
                  <ValueCell metric={metric} value={metric.readValue(left, context)} rank={leftRank} fieldSize={context.allTeamsCount} side="left" isStronger={advantage === 1} />
                  <th scope="row" className="bg-slate-50 px-1 py-2 font-semibold uppercase tracking-wide text-slate-600">
                    <span className="flex items-center justify-between gap-0.5">
                      <AdvantageMark show={advantage === 1} side="left" />
                      <span className="text-center text-[11px] leading-tight sm:text-xs">{metric.shortLabel}</span>
                      <AdvantageMark show={advantage === -1} side="right" />
                    </span>
                  </th>
                  <ValueCell metric={metric} value={metric.readValue(right, context)} rank={rightRank} fieldSize={context.allTeamsCount} side="right" isStronger={advantage === -1} />
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
