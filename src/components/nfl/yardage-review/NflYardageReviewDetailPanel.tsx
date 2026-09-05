/**
 * Expandable player-level detail panel for the Yardage Props Review table
 * (desktop row expansion) and mobile table (mobile row expansion). Pure
 * presentation over `playerDetailView.ts`'s selectors and
 * `yardageHistoryView.ts`'s history selectors -- no model input is ever
 * recomputed here; every value rendered is read directly from the
 * projection row, the sportsbook join, the opponent-context join, or the
 * generated Last-10 history artifact.
 *
 * Structure: compact mobile-only header, then two independent tab systems
 * -- Player Stats / Opponent Stats (NflYardageStatsTabs) above Player Last
 * 10 / Opponent Last 10 (Last10Tabs below) -- then "Projection Details"
 * (Show the Work / Role & Provenance / Notes) collapsed by default at the
 * very bottom -- never before the Last 10 analysis, on any screen size.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatYardsAllowed } from "@/lib/nfl/productionAllowedData";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import type { NflCurrentWeekProjectionRow } from "@/lib/nfl/props/types/currentWeekProjection";
import type { NflWindowedRate } from "@/lib/nfl/props/types/qbPassingFeatures";
import type { NflYardageReviewMarketInfo } from "@/lib/nfl/props/review/yardageMarketJoin";
import { MATCHUP_SCORE_BAND_LABEL } from "@/lib/nfl/props/review/yardageMarketJoin";
import type { NflYardageOpponentContextWithHeat } from "@/lib/nfl/props/review/yardageHeat";
import {
  buildProjectionSummary,
  buildDetailComponents,
  buildRoleProvenance,
  buildSportsbookDetail,
  buildDetailNotes,
  buildDiffEquation,
  buildMatchupSummary,
  buildEdgeEquation,
  resolveWindowSource,
  WINDOW_SOURCE_LABEL,
  type NflYardageDetailMarketContext,
} from "@/lib/nfl/props/review/playerDetailView";
import { useNflYardageHistory } from "@/hooks/useNflYardageHistory";
import { lookupPlayerHistory, lookupOpponentHistory, resolvePositionSlice } from "@/lib/nfl/props/review/yardageHistoryView";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";
import NflYardagePlayerLast10Table from "./NflYardagePlayerLast10Table";
import NflYardageOpponentLast10Table from "./NflYardageOpponentLast10Table";
import NflYardageStatsTabs from "./NflYardageStatsTabs";

function fmt1(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}
function fmtPct(value: number | null): string {
  return value != null && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
}
function fmtSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** One windowed rolling rate: value + which window backs it. Never claims a window it doesn't have. */
function WindowedStat({ label, rate, formatter = fmt1 }: { label: string; rate: NflWindowedRate; formatter?: (v: number | null) => string }) {
  const source = resolveWindowSource(rate);
  const value = source ? rate[source] : null;
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-800">
        {formatter(value)}
        {source && <span className="ml-1 text-[9px] font-normal text-slate-400">({WINDOW_SOURCE_LABEL[source]})</span>}
      </span>
    </div>
  );
}

function MarketContextRow({ market }: { market: NflYardageDetailMarketContext }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Spread</span><span className="tabular-nums text-slate-800">{market.spread != null ? market.spread.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Total</span><span className="tabular-nums text-slate-800">{market.total != null ? market.total.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Implied Team Total</span><span className="tabular-nums text-slate-800">{market.impliedTeamTotal != null ? market.impliedTeamTotal.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Home/Away</span><span className="text-slate-800">{market.homeAway}</span></div>
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Dome</span><span className="text-slate-800">{market.isDome == null ? "N/A" : market.isDome ? "Yes" : "No"}</span></div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-2.5">
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{title}</h4>
      {children}
    </div>
  );
}

/**
 * One of the collapsible subsections. Collapsing only hides the rendered
 * subtree -- the Last-10 history fetch lives in the parent panel's
 * `useNflYardageHistory` hook, so no already-loaded data is discarded by
 * collapsing a section.
 */
function CollapsibleSection({
  title,
  tone,
  defaultOpen = true,
  children,
}: {
  title: string;
  tone: "sky" | "amber" | "violet" | "slate";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerTone = {
    sky: "bg-sky-50 hover:bg-sky-100",
    amber: "bg-amber-50 hover:bg-amber-100",
    violet: "bg-violet-50 hover:bg-violet-100",
    slate: "bg-slate-100 hover:bg-slate-200",
  }[tone];
  return (
    <div className="rounded-md border-2 border-slate-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
          headerTone,
          open ? "rounded-t-[calc(0.375rem-2px)] border-b-2 border-slate-300" : "rounded-[calc(0.375rem-2px)]",
        )}
      >
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</h3>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function ProjectionInputs({ row }: { row: NflCurrentWeekProjectionRow }) {
  const components = buildDetailComponents(row);
  if (components.market === "passing") {
    return (
      <div className="space-y-0.5">
        <WindowedStat label="QB Attempts/Game" rate={components.data.qbAttemptsPerGame} />
        <WindowedStat label="YPA" rate={components.data.yardsPerAttempt} />
        <WindowedStat label="Completion %" rate={components.data.completionPct} formatter={fmtPct} />
        <WindowedStat label="Team Pass Attempts/Game" rate={components.data.teamPassAttemptsPerGame} />
        <WindowedStat label="Team Dropback Rate" rate={components.data.teamDropbackRate} formatter={fmtPct} />
        <WindowedStat label="Early-Down Neutral Pass Rate" rate={components.data.earlyDownNeutralPassRate} formatter={fmtPct} />
        <WindowedStat label="PROE" rate={components.data.passRateOverExpected} formatter={fmtPct} />
        <div className="mt-1.5 border-t border-slate-200 pt-1.5"><MarketContextRow market={components.data.market} /></div>
      </div>
    );
  }
  if (components.market === "rushing") {
    return (
      <div className="space-y-0.5">
        <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Projected Carries</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedCarries)}</span></div>
        <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Shrunk YPC</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedYardsPerCarry)}</span></div>
        <WindowedStat label="Carries/Game (rolling)" rate={components.data.carriesPerGame} />
        <WindowedStat label="Carry Share" rate={components.data.carryShare} formatter={fmtPct} />
        <WindowedStat label="YPC (rolling, unshrunk)" rate={components.data.rollingYardsPerCarry} />
        <div className="mt-1.5 border-t border-slate-200 pt-1.5 space-y-0.5">
          <WindowedStat label="Team Rush Attempts/Game" rate={components.data.teamRushAttemptsPerGame} />
          <WindowedStat label="Team Dropback Rate" rate={components.data.teamDropbackRate} formatter={fmtPct} />
          <WindowedStat label="Team PROE" rate={components.data.teamPassRateOverExpected} formatter={fmtPct} />
          <WindowedStat label="Opp Rush Attempts Allowed/Game" rate={components.data.opponentRushAttemptsAllowedPerGame} />
        </div>
        <div className="mt-1.5 border-t border-slate-200 pt-1.5"><MarketContextRow market={components.data.market} /></div>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Projected Targets</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedTargets)}</span></div>
      <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Shrunk YPT</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedYardsPerTarget)}</span></div>
      <WindowedStat label="Targets/Game (rolling)" rate={components.data.targetsPerGame} />
      <WindowedStat label="Target Share" rate={components.data.targetShare} formatter={fmtPct} />
      <WindowedStat label="YPT (rolling, unshrunk)" rate={components.data.rollingYardsPerTarget} />
      <div className="mt-1.5 border-t border-slate-200 pt-1.5 space-y-0.5">
        <WindowedStat label="Team Pass Attempts/Game" rate={components.data.teamPassAttemptsPerGame} />
        <WindowedStat label="Team Dropback Rate" rate={components.data.teamDropbackRate} formatter={fmtPct} />
        <WindowedStat label="Team PROE" rate={components.data.teamPassRateOverExpected} formatter={fmtPct} />
        <WindowedStat label="Target Concentration" rate={components.data.targetConcentration} formatter={fmtPct} />
        <WindowedStat label="Opp Targets Allowed/Game" rate={components.data.opponentTargetsAllowedPerGame} />
      </div>
      <div className="mt-1.5 border-t border-slate-200 pt-1.5"><MarketContextRow market={components.data.market} /></div>
    </div>
  );
}

/** Player/Opponent Last-10 as a single-active-tab control -- only one table rendered at a time. */
function Last10Tabs({
  row,
  playerHistory,
  opponentHistory,
  currentLine,
  historyError,
}: {
  row: NflCurrentWeekProjectionRow;
  playerHistory: ReturnType<typeof lookupPlayerHistory>;
  opponentHistory: ReturnType<typeof lookupOpponentHistory>;
  currentLine: number | null;
  historyError: boolean;
}) {
  const [active, setActive] = useState<"player" | "opponent">("player");
  // Distinct, restrained per-tab color identity -- sky for Player, light violet/purple for Opponent.
  // Selected state is filled/tinted + stronger border, but `aria-selected` (not
  // color alone) is what actually communicates the active tab to assistive tech.
  const tabClass = (isActive: boolean, tone: "player" | "opponent") =>
    cn(
      "rounded border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition",
      tone === "player"
        ? isActive
          ? "border-sky-700 bg-sky-600 text-white shadow-sm"
          : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
        : isActive
          ? "border-violet-600 bg-violet-600 text-white shadow-sm"
          : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
    );
  return (
    <div>
      <div role="tablist" aria-label="Last 10 history" className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          role="tab"
          id="last10-tab-player"
          aria-selected={active === "player"}
          aria-controls="last10-panel-player"
          tabIndex={active === "player" ? 0 : -1}
          onClick={() => setActive("player")}
          className={tabClass(active === "player", "player")}
        >
          Player Last 10
        </button>
        <button
          type="button"
          role="tab"
          id="last10-tab-opponent"
          aria-selected={active === "opponent"}
          aria-controls="last10-panel-opponent"
          tabIndex={active === "opponent" ? 0 : -1}
          onClick={() => setActive("opponent")}
          className={tabClass(active === "opponent", "opponent")}
        >
          Opponent Last 10
        </button>
      </div>
      <div id="last10-panel-player" role="tabpanel" aria-labelledby="last10-tab-player" className={cn("mt-2", active === "player" && "border-t-2 border-sky-200 pt-2")}>
        {active === "player" &&
          (historyError ? (
            <p className="text-slate-400">Last-10 history unavailable this run.</p>
          ) : (
            <NflYardagePlayerLast10Table playerName={row.playerName} history={playerHistory} currentLine={currentLine} />
          ))}
      </div>
      <div id="last10-panel-opponent" role="tabpanel" aria-labelledby="last10-tab-opponent" className={cn("mt-2", active === "opponent" && "border-t-2 border-violet-200 pt-2")}>
        {active === "opponent" &&
          (historyError ? (
            <p className="text-slate-400">Last-10 history unavailable this run.</p>
          ) : (
            <NflYardageOpponentLast10Table
              opponentAbbr={row.opponent}
              position={resolvePositionSlice(row.market, row.position)}
              history={opponentHistory}
              currentLine={currentLine}
            />
          ))}
      </div>
    </div>
  );
}

export default function NflYardageReviewDetailPanel({
  row,
  marketInfo,
  opponentContext,
  season,
}: {
  row: NflCurrentWeekProjectionRow;
  marketInfo: NflYardageReviewMarketInfo;
  opponentContext: NflYardageOpponentContextWithHeat | undefined;
  season: number;
}) {
  const projection = buildProjectionSummary(row);
  const role = buildRoleProvenance(row);
  const sportsbook = buildSportsbookDetail(marketInfo);
  const diff = buildDiffEquation(row, marketInfo);
  const matchup = buildMatchupSummary(row);
  const edge = buildEdgeEquation(opponentContext);
  const notes = buildDetailNotes(row, marketInfo);

  const history = useNflYardageHistory(season, true);
  const playerHistory = lookupPlayerHistory(history.data, row.playerId, row.market);
  const opponentHistory = lookupOpponentHistory(history.data, row.opponent, row.market, row.position);
  const currentLine = marketInfo.available ? marketInfo.line : null;

  return (
    // Faint warm contrast against the neutral collapsed row board below -- deliberately NOT the
    // site's amber "warning" tone (that stays reserved for the Projection Preview notice and Notes
    // card); this is `yellow-50` at partial opacity, restrained enough that metric colors and table
    // text still read cleanly on top of it.
    <div className="space-y-3 border-y-2 border-slate-300 bg-yellow-50/60 p-3 text-[11px] shadow-inner">
      {/* Mobile-only compact context header -- on desktop this context already lives in the row's own columns. */}
      <div className="md:hidden">
        <p className="text-[13px] font-bold text-slate-900">{row.playerName}</p>
        <p className="text-[10px] text-slate-500">
          {row.team.toUpperCase()} vs {row.opponent.toUpperCase()} · {row.position}
          {marketInfo.available && <> · Line {marketInfo.line.toFixed(1)}</>}
        </p>
      </div>

      {/* Player Stats / Opponent Stats -- a separate tab system from Last 10 below, on every screen size. */}
      <NflYardageStatsTabs row={row} opponentContext={opponentContext} playerHistory={playerHistory} />

      <Last10Tabs row={row} playerHistory={playerHistory} opponentHistory={opponentHistory} currentLine={currentLine} historyError={Boolean(history.error)} />

      <CollapsibleSection title="Projection Details" tone="slate" defaultOpen={false}>
        <div className="space-y-3">
          <CollapsibleSection title="Show the Work" tone="sky" defaultOpen={false}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="1. Projected Yards">
                <div className="space-y-0.5">
                  <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Projected Yards</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(projection.projectedYards)}</span></div>
                  <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Estimated Range</span><span className="tabular-nums text-slate-800">{projection.estimatedRange ? `${projection.estimatedRange.estimatedLow.toFixed(0)}–${projection.estimatedRange.estimatedHigh.toFixed(0)}` : "N/A"}</span></div>
                  <div className="mt-1.5 border-t border-slate-200 pt-1.5"><ProjectionInputs row={row} /></div>
                </div>
              </Card>

              <Card title="2. Sportsbook">
                {sportsbook.available ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Book</span><span className="text-slate-800">{sportsbook.book}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Line</span><span className="tabular-nums text-slate-800">{sportsbook.line.toFixed(1)}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Over / Under</span><span className="tabular-nums text-slate-800">{sportsbook.overPrice} / {sportsbook.underPrice}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Observed</span><span className="text-slate-800">{new Date(sportsbook.lastUpdate).toLocaleString()}</span></div>
                  </div>
                ) : (
                  <p className="text-slate-400">No approved sportsbook line available.</p>
                )}
              </Card>

              {/* Research context only -- literal equation, never a betting recommendation. */}
              <Card title="3. Diff">
                {diff ? (
                  <div className="space-y-1">
                    <p className="tabular-nums text-slate-800">
                      {diff.projectedYards.toFixed(1)} − {diff.line.toFixed(1)} = <span className="font-semibold">{fmtSigned(diff.diff)}</span>
                    </p>
                    <p className="text-[10px] text-slate-400">Projection − Sportsbook Line. Research context only, not a recommendation.</p>
                  </div>
                ) : (
                  <p className="text-slate-400">No available line to diff against.</p>
                )}
              </Card>

              <Card title="4. Matchup">
                {matchup ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Matchup Score</span><span className="font-semibold tabular-nums text-slate-900">{matchup.matchupScore.toFixed(1)}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Band</span><span className="text-slate-800">{matchup.band ? MATCHUP_SCORE_BAND_LABEL[matchup.band] : "N/A"}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Opportunity</span><span className="tabular-nums text-slate-800">{matchup.opportunityScore.toFixed(1)}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Environment</span><span className="tabular-nums text-slate-800">{matchup.environmentScore.toFixed(1)}</span></div>
                    <div className="mt-1.5 border-t border-slate-200 pt-1.5 space-y-0.5">
                      {matchup.components.map((c) => (
                        <div key={c.key} className="flex items-baseline justify-between">
                          <span className="capitalize font-medium text-slate-600">{c.key.replace(/([A-Z])/g, " $1").trim()}</span>
                          <span className="tabular-nums text-slate-800">
                            {c.score.toFixed(1)}
                            {c.weight != null && <span className="ml-1 text-[9px] font-normal text-slate-400">({(c.weight * 100).toFixed(0)}% contribution)</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-[9px] italic text-slate-400">Contribution is each component&apos;s share of this row&apos;s total score, not a literal configured weight.</p>
                  </div>
                ) : (
                  <p className="text-slate-400">No Matchup Score available.</p>
                )}
              </Card>

              <Card title="5. Yds Allowed Season / Last 5">
                {opponentContext ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Slice</span><span className="text-slate-800">{opponentContext.productionAllowed.position}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Season</span><span className="tabular-nums text-slate-800">{formatYardsAllowed(opponentContext.productionAllowed.season)}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Last 5</span><span className="tabular-nums text-slate-800">{formatYardsAllowed(opponentContext.productionAllowed.last5)}</span></div>
                  </div>
                ) : (
                  <p className="text-slate-400">No opponent context available.</p>
                )}
              </Card>

              <Card title="6. Opp EPA Allowed">
                {opponentContext?.epaEdge.defense ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Value</span><span className="tabular-nums text-slate-800">{opponentContext.epaEdge.defense.formattedValue}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Rank</span><span className="tabular-nums text-slate-800">{formatRankOrdinal(opponentContext.epaEdge.defenseRank) ?? "N/A"}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Mode</span><span className="capitalize text-slate-800">{opponentContext.mode}</span></div>
                  </div>
                ) : (
                  <p className="text-slate-400">No EPA data available.</p>
                )}
              </Card>

              <Card title="7. Opp Success Allowed">
                {opponentContext?.successEdge.defense ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Value</span><span className="tabular-nums text-slate-800">{opponentContext.successEdge.defense.formattedValue}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Rank</span><span className="tabular-nums text-slate-800">{formatRankOrdinal(opponentContext.successEdge.defenseRank) ?? "N/A"}</span></div>
                    <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Period</span><span className="text-slate-800">{opponentContext.successPeriodLabel}</span></div>
                  </div>
                ) : (
                  <p className="text-slate-400">No Success Rate data available.</p>
                )}
              </Card>

              <Card title="8. Team Edge">
                {edge ? (
                  <div className="space-y-1">
                    <p className="tabular-nums text-slate-800">
                      {edge.defenseRank} − {edge.offenseRank} = <span className="font-semibold">{fmtSigned(edge.edge)}</span> Team Edge
                    </p>
                    <p className="text-[10px] text-slate-400">Opponent Defense EPA Rank − Team Offense EPA Rank = Team Edge. Distinct from Matchup Score.</p>
                  </div>
                ) : (
                  <p className="text-slate-400">No rank data available for Team Edge.</p>
                )}
              </Card>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Role / Provenance" tone="slate" defaultOpen={false}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Depth Rank</span><span className="text-slate-800">{role.depthRank ?? "N/A"}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Starter</span><span className="text-slate-800">{role.starterFlag ? "Yes" : "No"}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Role Source</span><span className="max-w-[140px] truncate text-right text-slate-800" title={role.roleSource}>{role.roleSource}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Role Confidence</span><span className="text-slate-800">{role.roleConfidence}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Fallback Provenance</span><span className="text-slate-800">{role.fallbackProvenance}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Games w/ Prior Usage</span><span className="tabular-nums text-slate-800">{role.gamesWithPriorUsage}</span></div>
              <div className="flex items-baseline justify-between"><span className="font-medium text-slate-600">Team Changed</span><span className="text-slate-800">{role.teamChanged ? "Yes" : "No"}</span></div>
            </div>
          </CollapsibleSection>

          {notes.length > 0 && (
            <CollapsibleSection title="Notes" tone="amber" defaultOpen={false}>
              <ul className="space-y-1">
                {notes.map((note) => (
                  <li key={note.key} className="flex gap-1.5 text-amber-900">
                    <span aria-hidden>•</span>
                    <span>{note.text}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
        </div>
      </CollapsibleSection>

      <div className="flex items-center gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        <NflYardageReviewTeamCell abbr={row.team} />
        <span aria-hidden>vs</span>
        <NflYardageReviewTeamCell abbr={row.opponent} />
        <span>· {row.gameId}</span>
      </div>
    </div>
  );
}
