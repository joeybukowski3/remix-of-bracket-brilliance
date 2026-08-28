import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DfsEnrichedSlateAnalysis } from "@/lib/nfl/dfs/slateAnalyzer";
import { NFL_CLASSIC_DST_SCORING, NFL_CLASSIC_OFFENSIVE_SCORING, NFL_CLASSIC_ROSTER, NFL_CLASSIC_SALARY_CAP } from "@/lib/nfl/dfs/nflClassicRules";
import { FULL_PPR_SCORING } from "@/lib/fantasy/weekly/scoring";
import { DFS_PROJECTION_SOURCE } from "@/lib/nfl/dfs/slateAnalyzer";
import { formatDfsPercent, formatDfsTimestamp } from "@/lib/nfl/dfs/presentation";
import { cn } from "@/lib/utils";

const READINESS_STYLES: Record<DfsEnrichedSlateAnalysis["summary"]["readiness"], { label: string; className: string }> = {
  READY: { label: "Ready", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  READY_WITH_WARNINGS: { label: "Ready with warnings", className: "border-amber-300 bg-amber-50 text-amber-900" },
  BLOCKED: { label: "Blocked", className: "border-rose-300 bg-rose-50 text-rose-900" },
};

export type NflDfsSlateSummaryProps = {
  analysis: DfsEnrichedSlateAnalysis;
  season: number;
  week: number;
};

const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

/**
 * DraftKings NFL Classic vs JKB Full PPR, both read from the canonical
 * authorities (nflClassicRules / weekly scoring) -- never hardcoded here.
 * This exists so the user understands JKB Proj is a Full PPR projection,
 * NOT a DraftKings-specific fantasy projection.
 */
const SCORING_COMPARISON: ReadonlyArray<{ label: string; dk: string; jkb: string }> = [
  { label: "Passing TD", dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.passing.touchdown), jkb: signed(FULL_PPR_SCORING.passingTouchdown) },
  { label: "Interception", dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.passing.interception), jkb: signed(FULL_PPR_SCORING.interception) },
  { label: "Reception", dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.receiving.reception), jkb: signed(FULL_PPR_SCORING.reception) },
  { label: "Fumble lost", dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.other.fumbleLost), jkb: signed(FULL_PPR_SCORING.fumbleLost) },
  {
    label: `${NFL_CLASSIC_OFFENSIVE_SCORING.passing.bonus.yardThreshold} passing-yard bonus`,
    dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.passing.bonus.points),
    jkb: FULL_PPR_SCORING.bonuses.length === 0 ? "none" : "yes",
  },
  {
    label: `${NFL_CLASSIC_OFFENSIVE_SCORING.rushing.bonus.yardThreshold} rushing-yard bonus`,
    dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.rushing.bonus.points),
    jkb: FULL_PPR_SCORING.bonuses.length === 0 ? "none" : "yes",
  },
  {
    label: `${NFL_CLASSIC_OFFENSIVE_SCORING.receiving.bonus.yardThreshold} receiving-yard bonus`,
    dk: signed(NFL_CLASSIC_OFFENSIVE_SCORING.receiving.bonus.points),
    jkb: FULL_PPR_SCORING.bonuses.length === 0 ? "none" : "yes",
  },
  { label: "DST projection", dk: "DK scores DST", jkb: "no JKB projection" },
];

export default function NflDfsSlateSummary({ analysis, season, week }: NflDfsSlateSummaryProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [scoringOpen, setScoringOpen] = useState(false);
  const { summary, compatibility } = analysis;
  const readiness = READINESS_STYLES[summary.readiness];
  const errorIssues = compatibility.issues.filter((issue) => issue.severity === "error");
  const warningIssues = compatibility.issues.filter((issue) => issue.severity === "warning");

  return (
    <section className="space-y-2" aria-label="Slate summary">
      <div className={cn("rounded-lg border px-3 py-2", readiness.className)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
          <span className="rounded border border-current px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{readiness.label}</span>
          <span>NFL Classic</span>
          <span>{summary.gamesPresent.length} Games</span>
          <span>{summary.teamsPresent.length} Teams</span>
          <span>{summary.totalUploadedRows} Entries</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          <span>JKB Week {week} ({season})</span>
          <span>{formatDfsPercent(summary.projectionCoveragePct)} Projection Match</span>
          <span>{formatDfsPercent(summary.researchCoveragePct)} Research Match</span>
        </div>
        <p className="mt-1 text-[10px] opacity-80">
          Projection generated {formatDfsTimestamp(analysis.compatibility.projection.generatedAt)} &middot; input as of {formatDfsTimestamp(analysis.compatibility.projection.inputAsOf)}
        </p>

        {errorIssues.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-current/20 pt-2 text-[11px]">
            {errorIssues.map((issue, index) => (
              <li key={index}>&bull; {issue.message}</li>
            ))}
          </ul>
        )}
        {summary.readiness === "READY_WITH_WARNINGS" && warningIssues.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-current/20 pt-2 text-[11px]">
            {warningIssues.map((issue, index) => (
              <li key={index}>&bull; {issue.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setRulesOpen((open) => !open)}
          aria-expanded={rulesOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span>Contest Rules -- NFL Classic</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", rulesOpen && "rotate-180")} />
        </button>
        {rulesOpen && (
          <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-700">
            <p>
              <strong className="font-bold text-slate-900">Roster:</strong> 1 QB &middot; 2 RB &middot; 3 WR &middot; 1 TE &middot; 1 FLEX (RB/WR/TE) &middot; 1 DST ({NFL_CLASSIC_ROSTER.totalSlots} total slots)
            </p>
            <p>
              <strong className="font-bold text-slate-900">Minimum games:</strong> players from at least {NFL_CLASSIC_ROSTER.minimumGamesRequired} different NFL games.
            </p>
            <p>
              <strong className="font-bold text-slate-900">Scoring highlights:</strong> Full PPR (+{NFL_CLASSIC_OFFENSIVE_SCORING.receiving.reception}/reception) &middot;
              {" "}+{NFL_CLASSIC_OFFENSIVE_SCORING.passing.bonus.points} at {NFL_CLASSIC_OFFENSIVE_SCORING.passing.bonus.yardThreshold}+ pass yds &middot;
              {" "}+{NFL_CLASSIC_OFFENSIVE_SCORING.rushing.bonus.points} at {NFL_CLASSIC_OFFENSIVE_SCORING.rushing.bonus.yardThreshold}+ rush yds &middot;
              {" "}+{NFL_CLASSIC_OFFENSIVE_SCORING.receiving.bonus.points} at {NFL_CLASSIC_OFFENSIVE_SCORING.receiving.bonus.yardThreshold}+ rec yds
            </p>
            <p>
              <strong className="font-bold text-slate-900">DST scoring:</strong> sack +{NFL_CLASSIC_DST_SCORING.sack} &middot; INT +{NFL_CLASSIC_DST_SCORING.interception} &middot;
              {" "}fumble rec +{NFL_CLASSIC_DST_SCORING.fumbleRecovery} &middot; safety +{NFL_CLASSIC_DST_SCORING.safety} &middot; TD +6, points-allowed tiers apply.
            </p>
            {NFL_CLASSIC_SALARY_CAP == null && (
              <p className="italic text-slate-500">Salary cap is not shown -- no verified value is available.</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setScoringOpen((open) => !open)}
          aria-expanded={scoringOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span>How JKB Proj compares to DraftKings scoring</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", scoringOpen && "rotate-180")} />
        </button>
        {scoringOpen && (
          <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-700">
            <p>
              <strong className="font-bold text-slate-900">JKB Proj</strong> and <strong className="font-bold text-slate-900">JKB Pts/$1K</strong> are built from
              the {DFS_PROJECTION_SOURCE} weekly projection &mdash; a full-PPR fantasy projection, <strong className="font-bold text-slate-900">not</strong> a
              DraftKings-specific fantasy projection. The scoring rules differ:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-1 pr-3 font-black">Rule</th>
                    <th scope="col" className="py-1 pr-3 font-black">DraftKings</th>
                    <th scope="col" className="py-1 font-black">{DFS_PROJECTION_SOURCE}</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORING_COMPARISON.map((row) => (
                    <tr key={row.label} className="border-t border-slate-100">
                      <td className="py-1 pr-3 text-slate-600">{row.label}</td>
                      <td className="py-1 pr-3 font-bold tabular-nums text-slate-900">{row.dk}</td>
                      <td className="py-1 font-bold tabular-nums text-slate-900">{row.jkb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-slate-500">
              DraftKings also awards its own DST points; JKB publishes no DST projection, so DST rows show DraftKings context only.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
