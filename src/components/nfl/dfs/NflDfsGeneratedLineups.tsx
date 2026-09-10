import { Fragment, useMemo, useState } from "react";
import { FantasyPlayerIdentity, FantasyOpponentIdentity } from "@/components/fantasy/FantasyTable";
import { DenseTableScroller, DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW } from "@/components/ui/dense-table";
import { DfsHeatLegend, DfsHeatValue, DfsPositionBadge, DfsSortButton, FantasyPpgCell, MatchupCell } from "./DfsTableCells";
import { FpaSignal } from "./NflDfsHistory";
import { DFS_POSITION_ACCENT, dfsValueStyles, dfsWeeklyRankStyle } from "@/lib/nfl/dfs/tablePresentation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { useNflDfsOptimizer } from "@/hooks/useNflDfsOptimizer";
import type { GeneratedLineup, GeneratedLineupSlotPlayer } from "@/lib/nfl/dfs/optimizer/contracts";
import {
  DST_OBJECTIVE,
  LINEUP_STRATEGIES,
  LINEUP_STRATEGY_GOALS,
  LINEUP_STRATEGY_LABELS,
  LINEUP_STRATEGY_WEIGHTS,
  LINEUP_TIE_BREAK_ORDER,
  MINIMUM_OBJECTIVE_COVERAGE,
  OBJECTIVE_COMPONENT_DEFINITIONS,
  OBJECTIVE_COMPONENT_LABELS,
  type LineupStrategy,
  type ObjectiveComponent,
} from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import { NFL_CLASSIC_RULES } from "@/lib/nfl/dfs/nflClassicRules";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
const NFL_CLASSIC_ROSTER_TEXT = NFL_CLASSIC_RULES.roster.slots
  .map((slot) => `${slot.count} ${slot.slot}`)
  .join(", ");

const money = (value: number) => "$" + value.toLocaleString("en-US");
const num = (value: number | null | undefined, digits = 1) => (value == null ? "N/A" : value.toFixed(digits));
const pct = (value: number) => Math.round(value * 100) + "%";

function WeightTable({ strategy }: { strategy: LineupStrategy }) {
  const weights = LINEUP_STRATEGY_WEIGHTS[strategy];
  return (
    <table className="w-full text-left text-[11px]">
      <thead>
        <tr className="uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-1 pr-3 font-black">Component</th>
          <th scope="col" className="py-1 pr-3 font-black">Weight</th>
          <th scope="col" className="py-1 font-black">Definition</th>
        </tr>
      </thead>
      <tbody>
        {(Object.keys(weights) as ObjectiveComponent[]).map((component) => (
          <tr key={component} className="border-t border-slate-100 align-top">
            <td className="py-1 pr-3 font-bold text-slate-900">{OBJECTIVE_COMPONENT_LABELS[component]}</td>
            <td className="py-1 pr-3 font-bold tabular-nums text-slate-900">{pct(weights[component] as number)}</td>
            <td className="py-1 text-slate-600">{OBJECTIVE_COMPONENT_DEFINITIONS[component]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayerReasoning({ slot }: { slot: GeneratedLineupSlotPlayer }) {
  const role = slot.roleContext;
  const dst = slot.dstMatchup;
  return (
    <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700">
      <p>
        <strong className="font-bold text-slate-900">Salary</strong> {money(slot.salary)} &middot;{" "}
        <strong className="font-bold text-slate-900">JKB Proj</strong> {slot.projectedFantasyPoints == null ? "no JKB projection" : num(slot.projectedFantasyPoints, 2)} &middot;{" "}
        <strong className="font-bold text-slate-900">DK Avg PPG</strong> {num(slot.dkAvgPointsPerGame, 1)} (DraftKings benchmark) &middot;{" "}
        <strong className="font-bold text-slate-900">Rank Diff</strong> {slot.posRankDiff ?? "N/A"}
      </p>
      {role && (
        <p>
          <strong className="font-bold text-slate-900">Role</strong> {role.roleClass} ({role.roleCertainty}) &middot; availability {role.availability} &middot;
          {" "}projected carries {num(role.projectedUsage.carries)} / targets {num(role.projectedUsage.targets)}
        </p>
      )}
      {dst && (
        <p>
          <strong className="font-bold text-slate-900">DST matchup</strong> rank {dst.dstMatchupRank ?? "N/A"} &middot; score {num(dst.dstMatchupScore)} &middot;
          {" "}percentile {num(dst.dstMatchupPercentile)} &middot; component coverage {pct(dst.componentCoverage)}. Matchup composite, not a fantasy projection.
        </p>
      )}
      <p>
        <strong className="font-bold text-slate-900">Normalized strategy score</strong> {num(slot.strategyScore.score, 2)} / 100 &middot;
        {" "}objective coverage {pct(slot.strategyScore.componentCoverage)}
      </p>
      <ul className="list-inside list-disc">
        {slot.strategyScore.components.map((component) => (
          <li key={component.component}>
            {component.label}: {component.normalized == null ? "unavailable" : num(component.normalized, 1) + "th pct"}
            {component.rawValue != null ? " (raw " + num(component.rawValue, 2) + ")" : ""} &middot; weight {pct(component.policyWeight)}
            {" "}&rarr; effective {pct(component.effectiveWeight)} &middot; {component.detail}
          </li>
        ))}
      </ul>
      {slot.strategyScore.missingComponents.length > 0 && (
        <p className="text-slate-500">
          Missing components (weights renormalized, never zero-filled): {slot.strategyScore.missingComponents.join(", ")}
        </p>
      )}
    </div>
  );
}

function LineupCard({ lineup, rows, projectionRows }: { lineup: GeneratedLineup; rows: readonly DfsEnrichedAnalyzerRow[]; projectionRows: readonly WeeklyFantasyProjectionProductionRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [weeklySort, setWeeklySort] = useState<"asc" | "desc" | null>(null);
  const rowById = useMemo(() => new Map(rows.map(row => [row.dkId, row])), [rows]);
  const projectionStyles = useMemo(() => dfsValueStyles(rows, row => row.projectedFantasyPoints), [rows]);
  const benchmarkStyles = useMemo(() => dfsValueStyles(rows, row => row.dkAvgPointsPerGame, true), [rows]);
  const slots = useMemo(() => weeklySort == null ? lineup.slots : [...lineup.slots].sort((a, b) => {
    const left = rowById.get(a.dkId)?.jkbWeeklyPositionRank;
    const right = rowById.get(b.dkId)?.jkbWeeklyPositionRank;
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return weeklySort === "asc" ? left - right : right - left;
  }), [lineup.slots, weeklySort, rowById]);

  return (
    <div role="tabpanel" aria-label={lineup.strategyLabel} className="space-y-3">
      <p className="text-[11px] text-slate-600">{LINEUP_STRATEGY_GOALS[lineup.strategy]}</p>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Salary used", value: money(lineup.salaryUsed), note: money(lineup.salaryRemaining) + " remaining" },
          {
            label: "JKB offense proj",
            value: num(lineup.jkbOffenseProjectionSubtotal, 2),
            note: lineup.jkbOffensePlayerCount + " offensive slots; DST has no JKB projection",
          },
          {
            label: "DK Avg PPG benchmark",
            value: num(lineup.dkBenchmarkSubtotal, 1),
            note: lineup.dkBenchmarkPlayerCount + " slots; DraftKings benchmark, not consensus",
          },
          { label: "Objective score", value: num(lineup.objectiveScore, 1), note: lineup.objectiveVersion },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">{tile.label}</dt>
            <dd className="mt-0.5 text-base font-black tabular-nums text-slate-900">{tile.value}</dd>
            <p className="text-[10px] text-slate-500">{tile.note}</p>
          </div>
        ))}
      </dl>

      <DenseTableScroller label="Generated lineup roster" className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[60rem] border-collapse whitespace-nowrap text-left text-[11px]" aria-label="Generated lineup roster">
          <thead><tr className={DENSE_TABLE_HEAD_ROW}>
            {["Slot", "Player", "Opp", "Matchup", "Salary", "JKB RK", "JKB Proj", "Fantasy PPG", "FPA SZN", "DK Avg PPG", "Score"].map(label => <th key={label} scope="col"
              aria-sort={label === "JKB RK" ? weeklySort === "asc" ? "ascending" : weeklySort === "desc" ? "descending" : "none" : undefined}
              className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {label === "JKB RK" ? <DfsSortButton label={label} active={weeklySort != null} direction={weeklySort ?? "asc"} onClick={() => setWeeklySort(current => current === "asc" ? "desc" : "asc")} /> : label}
            </th>)}
          </tr></thead>
          <tbody>{slots.map(slot => {
            const row = rowById.get(slot.dkId);
            const position = slot.slot === "FLEX" ? "FLEX" : slot.position;
            return <Fragment key={slot.dkId}>
              <tr className={DENSE_TABLE_ROW}>
                <td className={cn("border-l-2 px-2 py-1.5", DFS_POSITION_ACCENT[position])}><DfsPositionBadge position={position} label={slot.slot} /></td>
                <td className="px-2 py-1.5"><button type="button" onClick={() => setExpanded(current => current === slot.dkId ? null : slot.dkId)} aria-expanded={expanded === slot.dkId}
                  className="rounded text-left underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-sky-500">
                  <FantasyPlayerIdentity player={slot.playerName} team={slot.team} compact />
                </button></td>
                <td className="px-2 py-1.5">{slot.opponent ? <FantasyOpponentIdentity opponent={slot.opponent} homeAway={row?.homeAway ?? "neutral"} compact /> : "—"}</td>
                <td className="px-2 py-1.5 text-right">{row ? <MatchupCell row={row} /> : "—"}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">{money(slot.salary)}</td>
                <td className="px-2 py-1.5 text-right"><DfsHeatValue style={row ? dfsWeeklyRankStyle(row, projectionRows) : undefined}>{row?.jkbWeeklyPositionRank == null ? "—" : `${slot.position}${row.jkbWeeklyPositionRank}`}</DfsHeatValue></td>
                <td className="px-2 py-1.5 text-right"><DfsHeatValue style={projectionStyles.get(slot.dkId)}>{slot.projectedFantasyPoints == null ? "—" : num(slot.projectedFantasyPoints, 2)}</DfsHeatValue></td>
                <td className="px-2 py-1.5 text-right">{row ? <FantasyPpgCell row={row} period="season" /> : "—"}</td>
                <td className="px-2 py-1.5 text-right">{row ? <FpaSignal row={row} period="season" /> : "—"}</td>
                <td className="px-2 py-1.5 text-right"><DfsHeatValue style={benchmarkStyles.get(slot.dkId)}>{slot.dkAvgPointsPerGame == null ? "—" : num(slot.dkAvgPointsPerGame, 1)}</DfsHeatValue></td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums" title="Weighted strategy score, not a percentile or fantasy-point projection">{num(slot.strategyScore.score, 1)}</td>
              </tr>
              {expanded === slot.dkId && <tr><td colSpan={11} className="whitespace-normal p-0"><PlayerReasoning slot={slot} /></td></tr>}
            </Fragment>;
          })}</tbody>
        </table>
      </DenseTableScroller>
      <DfsHeatLegend />
      <p className="text-[10px] text-slate-500">Projection and DK benchmark colors compare the uploaded position pool. DK sample window is unspecified; benchmark heat is muted. Score is a weighted heuristic, so it is shown without percentile heat.</p>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Why this lineup scored well</p>
        <ul className="mt-1 list-inside list-disc text-[11px] text-slate-700">
          {lineup.topReasons.map((reason) => (
            <li key={reason.label}>
              <strong className="font-bold text-slate-900">{reason.label}</strong> &mdash; {reason.detail}
            </li>
          ))}
        </ul>
        {lineup.warnings.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
            {lineup.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setMethodologyOpen((open) => !open)}
          aria-expanded={methodologyOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span>{LINEUP_STRATEGY_LABELS[lineup.strategy]} v1 weights</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", methodologyOpen && "rotate-180")} />
        </button>
        {methodologyOpen && (
          <div className="border-t border-slate-200 px-3 py-2">
            <WeightTable strategy={lineup.strategy} />
          </div>
        )}
      </div>
    </div>
  );
}

export type NflDfsGeneratedLineupsProps = {
  analysis: { rows: DfsEnrichedAnalyzerRow[] } | null;
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[];
  asOf: string;
  slateKey?: string;
};

export default function NflDfsGeneratedLineups({ analysis, projectionRows, asOf, slateKey }: NflDfsGeneratedLineupsProps) {
  const [active, setActive] = useState<LineupStrategy>("ceiling");
  const optimizer = useNflDfsOptimizer({ rows: analysis?.rows ?? null, projectionRows, asOf, slateKey });

  if (!analysis) return null;

  const result = optimizer.result;
  const lineup = result?.lineups.find((entry) => entry.strategy === active) ?? null;
  const blocked = result?.infeasible.find((entry) => entry.strategy === active) ?? null;

  return (
    <section aria-labelledby="dfs-generated-lineups" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="dfs-generated-lineups" className="text-sm font-black text-slate-900">Generated Lineups</h2>
          <p className="text-[11px] text-slate-600">
            Three deterministic preset lineups built in your browser from the uploaded slate. Nothing is uploaded to a server.
          </p>
        </div>
        <button
          type="button"
          onClick={optimizer.generate}
          disabled={optimizer.status === "generating"}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
        >
          {optimizer.status === "generating" ? "Generating..." : result ? "Regenerate Lineups" : "Generate Lineups"}
        </button>
      </div>

      {!result && optimizer.status !== "generating" && (
        <p className="text-[11px] text-slate-600">
          Generate lineups against the {NFL_CLASSIC_RULES.roster.totalSlots}-slot NFL Classic roster and the verified{" "}
          {money(NFL_CLASSIC_RULES.salaryCap)} salary cap.
        </p>
      )}

      {result && (
        <>
          <div role="tablist" aria-label="Lineup strategy" className="flex flex-wrap gap-1">
            {LINEUP_STRATEGIES.map((strategy) => (
              <button
                key={strategy}
                role="tab"
                type="button"
                aria-selected={active === strategy}
                onClick={() => setActive(strategy)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-bold",
                  active === strategy
                    ? "border-slate-900 bg-white text-slate-900"
                    : "border-slate-200 bg-white/60 text-slate-500 hover:text-slate-800",
                )}
              >
                {LINEUP_STRATEGY_LABELS[strategy]}
              </button>
            ))}
          </div>

          {lineup && optimizer.snapshot && <LineupCard key={`${result.asOf}/${active}`} lineup={lineup} rows={optimizer.snapshot.rows} projectionRows={optimizer.snapshot.projectionRows} />}

          {blocked && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <p className="font-bold">{blocked.strategyLabel} could not be built.</p>
              <ul className="mt-1 list-inside list-disc">
                {blocked.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <ul className="list-inside list-disc text-[11px] text-slate-600">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <p className="text-[10px] text-slate-500">
            Candidate pool: {result.candidatePool.offenseEligible} optimizer-eligible offensive rows,{" "}
            {result.candidatePool.dstWithUsableContext} DST with usable matchup context, from{" "}
            {result.candidatePool.uploadedRows} uploaded rows. The board below can show every uploaded player.
            Generated in {result.elapsedMs} ms. Snapshot as of {result.asOf}; regenerate to use refreshed analysis.
          </p>
        </>
      )}

      <details className="border-t border-slate-200 pt-2 text-[11px] text-slate-700">
        <summary className="cursor-pointer text-xs font-bold text-slate-900">Generated-lineup methodology and limitations</summary>
        <div className="mt-2 space-y-3">
          <p>
            These are <strong className="font-bold text-slate-900">transparent product heuristics</strong>, not calibrated DFS
            expected-value coefficients and not fitted model weights. They are a starting point intended for manual review and
            tuning. No lineup here is an EV-optimal or calibrated lineup.
          </p>
          <p>
            Roster and salary rules come from the canonical contract ({NFL_CLASSIC_RULES.version}): {NFL_CLASSIC_ROSTER_TEXT},
            a {money(NFL_CLASSIC_RULES.salaryCap)} salary cap and players from at least{" "}
            {NFL_CLASSIC_RULES.roster.minimumGamesRequired} different NFL games. Cap source: {NFL_CLASSIC_RULES.salaryCapSource}.
          </p>
          <p>
            <strong className="font-bold text-slate-900">DK Avg PPG is a DraftKings benchmark</strong> from the uploaded CSV over an
            unspecified window. It is never called consensus and never added into a JKB projection total.
          </p>
          <p>
            <strong className="font-bold text-slate-900">DST has no JKB fantasy projection.</strong> {DST_OBJECTIVE.definition} JKB
            projection subtotals therefore cover the eight offensive slots only.
          </p>
          <p>
            Every component is normalized to a 0-100 percentile within its position on the uploaded slate (team-level components
            across the distinct teams on the slate), oriented so higher is always better. Missing components are never zero-filled:
            they are dropped and the remaining weights renormalized. A player needs at least {pct(MINIMUM_OBJECTIVE_COVERAGE)} of a
            strategy's original weight to receive a score; below that the player stays on the board but is not a candidate for that
            strategy.
          </p>
          <p>
            The JKB projection already contains bounded market-scoring-environment and opponent-fantasy-points-allowed adjustments.
            The matchup component therefore uses EPA, success-rate and trench edges rather than opponent FPA. The scoring-environment
            component deliberately re-emphasizes the market implied team total on top of that bounded in-projection adjustment.
          </p>
          <p>
            Ties are broken in a fixed order: {LINEUP_TIE_BREAK_ORDER.join("; then ")}. The same slate, policy and data always produce
            the same lineups. Two or three strategies may return the same lineup; no artificial diversity is imposed. There is no
            stacking, correlation, ownership or uniqueness term in v1.
          </p>
          <div className="space-y-3">
            {LINEUP_STRATEGIES.map((strategy) => (
              <div key={strategy}>
                <p className="text-xs font-black text-slate-900">{LINEUP_STRATEGY_LABELS[strategy]} v1 weights</p>
                <p className="text-slate-600">{LINEUP_STRATEGY_GOALS[strategy]}</p>
                <div className="overflow-x-auto"><WeightTable strategy={strategy} /></div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}