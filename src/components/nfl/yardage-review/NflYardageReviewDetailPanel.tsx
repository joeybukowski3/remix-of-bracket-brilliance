/**
 * Expandable player-level detail panel for the Yardage Props Review table
 * (desktop row expansion) and card list (mobile card expansion). Pure
 * presentation over `playerDetailView.ts`'s selectors -- no model input is
 * ever recomputed here; every value rendered is read directly from the
 * projection row, the sportsbook join, or the opponent-context join.
 */
import { formatYardsAllowed } from "@/lib/nfl/productionAllowedData";
import type { NflCurrentWeekProjectionRow } from "@/lib/nfl/props/types/currentWeekProjection";
import type { NflWindowedRate } from "@/lib/nfl/props/types/qbPassingFeatures";
import type { NflYardageReviewMarketInfo } from "@/lib/nfl/props/review/yardageMarketJoin";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import {
  buildProjectionSummary,
  buildDetailComponents,
  buildRoleProvenance,
  buildSportsbookDetail,
  buildDetailNotes,
  resolveWindowSource,
  WINDOW_SOURCE_LABEL,
  type NflYardageDetailMarketContext,
} from "@/lib/nfl/props/review/playerDetailView";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";

function fmt1(value: number | null): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}
function fmtPct(value: number | null): string {
  return value != null && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
}

/** One windowed rolling rate: value + which window backs it. Never claims a window it doesn't have. */
function WindowedStat({ label, rate, formatter = fmt1 }: { label: string; rate: NflWindowedRate; formatter?: (v: number | null) => string }) {
  const source = resolveWindowSource(rate);
  const value = source ? rate[source] : null;
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-slate-500">{label}</span>
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
      <div className="flex items-baseline justify-between"><span className="text-slate-500">Spread</span><span className="tabular-nums text-slate-800">{market.spread != null ? market.spread.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="text-slate-500">Total</span><span className="tabular-nums text-slate-800">{market.total != null ? market.total.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="text-slate-500">Implied Team Total</span><span className="tabular-nums text-slate-800">{market.impliedTeamTotal != null ? market.impliedTeamTotal.toFixed(1) : "N/A"}</span></div>
      <div className="flex items-baseline justify-between"><span className="text-slate-500">Home/Away</span><span className="text-slate-800">{market.homeAway}</span></div>
      <div className="flex items-baseline justify-between"><span className="text-slate-500">Dome</span><span className="text-slate-800">{market.isDome == null ? "N/A" : market.isDome ? "Yes" : "No"}</span></div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

export default function NflYardageReviewDetailPanel({
  row,
  marketInfo,
  opponentContext,
}: {
  row: NflCurrentWeekProjectionRow;
  marketInfo: NflYardageReviewMarketInfo;
  opponentContext: NflYardageOpponentContext | undefined;
}) {
  const projection = buildProjectionSummary(row);
  const components = buildDetailComponents(row);
  const role = buildRoleProvenance(row);
  const sportsbook = buildSportsbookDetail(marketInfo);
  const notes = buildDetailNotes(row, marketInfo);

  return (
    <div className="grid grid-cols-1 gap-4 border-y-2 border-slate-200 bg-slate-50 p-3 text-[11px] shadow-inner sm:grid-cols-2 lg:grid-cols-4">
      <Section title="Projection">
        <div className="space-y-0.5">
          <div className="flex items-baseline justify-between"><span className="text-slate-500">Projected Yards</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(projection.projectedYards)}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-slate-500">Estimated Range</span><span className="tabular-nums text-slate-800">{projection.estimatedRange ? `${projection.estimatedRange.estimatedLow.toFixed(0)}–${projection.estimatedRange.estimatedHigh.toFixed(0)}` : "N/A"}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-slate-500">Market</span><span className="text-slate-800 capitalize">{projection.market}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-slate-500">History Status</span><span className="text-slate-800">{projection.historyStatus}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-slate-500">Model Version</span><span className="max-w-[140px] truncate text-right text-slate-800" title={projection.modelVersion}>{projection.modelVersion}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-slate-500">Generated</span><span className="text-slate-800">{new Date(projection.generatedAt).toLocaleString()}</span></div>
        </div>
      </Section>

      <Section title="Projection Components">
        {components.market === "passing" && (
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
        )}
        {components.market === "rushing" && (
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Projected Carries</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedCarries)}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Shrunk YPC</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedYardsPerCarry)}</span></div>
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
        )}
        {components.market === "receiving" && (
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Projected Targets</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedTargets)}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Shrunk YPT</span><span className="font-semibold tabular-nums text-slate-900">{fmt1(components.data.projectedYardsPerTarget)}</span></div>
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
        )}
      </Section>

      <Section title="Opponent Context">
        {opponentContext ? (
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Opp Yds Allowed (Season)</span><span className="tabular-nums text-slate-800">{formatYardsAllowed(opponentContext.productionAllowed.season)}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Opp Yds Allowed (L5)</span><span className="tabular-nums text-slate-800">{formatYardsAllowed(opponentContext.productionAllowed.last5)}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">EPA Allowed</span><span className="tabular-nums text-slate-800">{opponentContext.epaEdge.defense ? `${opponentContext.epaEdge.defense.formattedValue} (Rk ${opponentContext.epaEdge.defense.rank})` : "N/A"}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Success Allowed</span><span className="tabular-nums text-slate-800">{opponentContext.successEdge.defense ? `${opponentContext.successEdge.defense.formattedValue} (${opponentContext.successPeriodLabel})` : "N/A"}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Matchup Edge</span><span className="tabular-nums text-slate-800">{opponentContext.epaEdge.rankDifference != null ? (opponentContext.epaEdge.rankDifference > 0 ? `+${opponentContext.epaEdge.rankDifference}` : opponentContext.epaEdge.rankDifference) : "N/A"}</span></div>
          </div>
        ) : (
          <p className="text-slate-400">No opponent context available.</p>
        )}
      </Section>

      <div className="space-y-3">
        <Section title="Role / Provenance">
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Depth Rank</span><span className="text-slate-800">{role.depthRank ?? "N/A"}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Starter</span><span className="text-slate-800">{role.starterFlag ? "Yes" : "No"}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Role Source</span><span className="max-w-[140px] truncate text-right text-slate-800" title={role.roleSource}>{role.roleSource}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Role Confidence</span><span className="text-slate-800">{role.roleConfidence}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Fallback Provenance</span><span className="text-slate-800">{role.fallbackProvenance}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Games w/ Prior Usage</span><span className="tabular-nums text-slate-800">{role.gamesWithPriorUsage}</span></div>
            <div className="flex items-baseline justify-between"><span className="text-slate-500">Team Changed</span><span className="text-slate-800">{role.teamChanged ? "Yes" : "No"}</span></div>
          </div>
        </Section>

        <Section title="Sportsbook">
          {sportsbook.available ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline justify-between"><span className="text-slate-500">Book</span><span className="text-slate-800">{sportsbook.book}</span></div>
              <div className="flex items-baseline justify-between"><span className="text-slate-500">Line</span><span className="tabular-nums text-slate-800">{sportsbook.line.toFixed(1)}</span></div>
              <div className="flex items-baseline justify-between"><span className="text-slate-500">Over / Under</span><span className="tabular-nums text-slate-800">{sportsbook.overPrice} / {sportsbook.underPrice}</span></div>
              <div className="flex items-baseline justify-between"><span className="text-slate-500">Observed</span><span className="text-slate-800">{new Date(sportsbook.lastUpdate).toLocaleString()}</span></div>
              {/* Research context only -- neutral color, never EV/pick language. */}
              <div className="flex items-baseline justify-between" title="Projection minus sportsbook line -- research context only, not a recommendation">
                <span className="text-slate-500">Proj − Line</span>
                <span className="tabular-nums text-slate-800">{sportsbook.rawDifference >= 0 ? "+" : ""}{sportsbook.rawDifference.toFixed(1)}</span>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">No approved sportsbook line available.</p>
          )}
        </Section>
      </div>

      {notes.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-4">
          <Section title="Notes">
            <ul className="space-y-1">
              {notes.map((note) => (
                <li key={note.key} className="flex gap-1.5 text-amber-900">
                  <span aria-hidden>•</span>
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        <NflYardageReviewTeamCell abbr={row.team} />
        <span aria-hidden>vs</span>
        <NflYardageReviewTeamCell abbr={row.opponent} />
        <span>· {row.gameId}</span>
      </div>
    </div>
  );
}
