import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NflTableScroller } from "@/components/nfl/ui/NflTable";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { cn } from "@/lib/utils";
import {
  FANTASY_POSITION_RESEARCH_BOARDS,
  PAR_POSITION_LIMITS,
  PAR_POSITIONS,
  type FantasyResearchBoardRow,
} from "@/lib/fantasy/parRankings";
import {
  FANTASY_RANKINGS,
  getFantasyMetricValues,
  type FantasyPosition,
  type FantasyRankingRow,
} from "@/lib/fantasy/rankings";
import {
  getQuantileRankTone,
  getRankQuantileThresholds,
  getSosRankTone,
  type RankQuantileThresholds,
  type RankTone,
} from "@/lib/fantasy/rankingPresentation";

type PositionFilter = "ALL" | FantasyPosition;
type MobileGroup = "Metrics" | "Model" | "Context" | "Playoffs";
type RankColumnKey = "metric0" | "metric1" | "metric2" | "late" | "projection" | "vegas" | "average" | "sos" | "oline";

const POSITION_FILTERS: readonly PositionFilter[] = ["ALL", ...PAR_POSITIONS];
const MOBILE_GROUPS: readonly MobileGroup[] = ["Metrics", "Model", "Context", "Playoffs"];
const POSITION_NAMES: Record<FantasyPosition, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};
const BASELINE_LABELS: Record<FantasyPosition, string> = { QB: "QB13", RB: "RB25", WR: "WR37", TE: "TE13" };
const METRIC_LABELS: Record<FantasyPosition, readonly [string, string, string]> = {
  QB: ["Passer Rating Rk", "Rush Yds/Game Rk", "Pass TD/Attempt Rk"],
  RB: ["Touches Rk", "Red Zone Touches Rk", "YPC Rk"],
  WR: ["Target % Rk", "Air Yds/Game Rk", "Targets/Game Rk"],
  TE: ["Target Share Rk", "Targets/Route Run Rk", "YPRR Rk"],
};

export default function FantasyParBoard() {
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [query, setQuery] = useState("");
  const [mobileGroup, setMobileGroup] = useState<MobileGroup>("Metrics");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const positionCounts = useMemo(
    () => Object.fromEntries(PAR_POSITIONS.map((item) => [item, FANTASY_POSITION_RESEARCH_BOARDS[item].jkbRowCount])),
    [],
  ) as Record<FantasyPosition, number>;

  return (
    <section aria-labelledby="fantasy-board-title" className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="fantasy-board-title" className="text-base font-bold tracking-tight sm:text-lg">2026 fantasy research board</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300 sm:text-[13px]">
              JKB rankings and position evidence, with draft-pool tiers derived from approved projected PAR/G.
            </p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-slate-200">{FANTASY_RANKINGS.rows.length} JKB-ranked players</span>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <NflFilterChips
            label="Position"
            options={POSITION_FILTERS}
            value={position}
            onChange={setPosition}
            className="[&>button]:min-h-11 lg:[&>button]:min-h-0"
            formatOption={(item) => item === "ALL" ? `Overall ${FANTASY_RANKINGS.rows.length}` : `${item} ${positionCounts[item]}`}
          />
          <div className="relative w-full lg:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search fantasy rankings"
              placeholder="Search player or team"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 lg:h-10 lg:text-sm"
            />
          </div>
        </div>
        {position !== "ALL" && (
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-slate-200 p-1 md:hidden" aria-label="Mobile table columns">
            {MOBILE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={mobileGroup === group}
                onClick={() => setMobileGroup(group)}
                className={cn("min-h-11 rounded-md px-1 text-[11px] font-semibold", mobileGroup === group ? "bg-white text-slate-950 shadow-sm" : "text-slate-600")}
              >
                {group}
              </button>
            ))}
          </div>
        )}
      </div>

      {position === "ALL" ? (
        <OverallBoard query={deferredQuery} />
      ) : (
        <PositionBoard position={position} query={deferredQuery} mobileGroup={mobileGroup} />
      )}
    </section>
  );
}

function OverallBoard({ query }: { query: string }) {
  const rows = FANTASY_RANKINGS.rows.filter((row) => matchesQuery(row.player, row.team, query));
  if (rows.length === 0) return <EmptyState query={query} />;

  return (
    <NflTableScroller label="Overall fantasy rankings" className="max-h-[72vh]">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-20 bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          <tr>
            <th className="sticky left-0 z-30 w-14 bg-slate-100 px-3 py-2 text-center">Rank</th>
            <th className="sticky left-14 z-30 min-w-64 bg-slate-100 px-3 py-2">Player</th>
            <th className="px-3 py-2 text-center">Pos</th>
            <th className="px-3 py-2 text-center">Pos Rk</th>
            <th className="px-3 py-2 text-center">Rd / Pick</th>
            <th className="px-3 py-2 text-center">AVG Rk</th>
            <th className="w-12 px-3 py-2"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <OverallRow key={row.overallRank} row={row} />)}
        </tbody>
      </table>
    </NflTableScroller>
  );
}

function OverallRow({ row }: { row: FantasyRankingRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold tabular-nums text-slate-800">{row.overallRank}</td>
        <td className="sticky left-14 z-10 bg-white px-3 py-2"><PlayerIdentity player={row.player} team={row.team} /></td>
        <td className="px-3 py-2 text-center font-semibold text-slate-700">{row.position}</td>
        <td className="px-3 py-2 text-center tabular-nums">{formatRank(row.positionRank)}</td>
        <td className="px-3 py-2 text-center tabular-nums">{row.draftRound && row.roundPick ? `${row.draftRound}.${row.roundPick}` : "—"}</td>
        <td className="px-3 py-2 text-center font-bold tabular-nums">{formatRank(row.averageRank)}</td>
        <td className="px-3 py-2 text-center"><ExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} /></td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-4 py-3 text-xs text-slate-600">
            Late / Last 8: <strong>{formatRank(row.lateSeasonRank)}</strong> · Projection: <strong>{formatRank(row.projectionRank)}</strong> · SOS: <strong>{formatRank(row.strengthOfSchedule)}</strong> · O-Line: <strong>{formatRank(row.offensiveLineRank)}</strong>
          </td>
        </tr>
      )}
    </>
  );
}

function PositionBoard({ position, query, mobileGroup }: { position: FantasyPosition; query: string; mobileGroup: MobileGroup }) {
  const board = FANTASY_POSITION_RESEARCH_BOARDS[position];
  const allJkbRows = useMemo(
    () => FANTASY_RANKINGS.rows.filter((row) => row.position === position),
    [position],
  );
  const thresholds = useMemo(() => buildThresholds(allJkbRows), [allJkbRows]);
  const tierGroups = board.tierGroups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchesQuery(row.player, row.team, query)) }))
    .filter((group) => group.rows.length > 0);
  const outsideRows = board.outsideDraftPool.filter((row) => matchesQuery(row.player, row.team, query));
  const visibleCount = tierGroups.reduce((total, group) => total + group.rows.length, 0) + outsideRows.length;
  const baseline = board.tierGroups[0]?.rows[0]?.par?.replacementPpg;
  const hasVegas = position === "QB" || position === "RB";
  const columnCount = 2 + 3 + 3 + Number(hasVegas) + 3 + 3;

  if (visibleCount === 0) return <EmptyState query={query} />;

  return (
    <section aria-labelledby={`${position.toLowerCase()}-board-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h3 id={`${position.toLowerCase()}-board-heading`} className="text-sm font-bold text-slate-950 sm:text-base">{POSITION_NAMES[position]}</h3>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">
            PAR baseline: {BASELINE_LABELS[position]} = {baseline?.toFixed(2)} PPG · Draft tiers derived from projected PAR/G
          </p>
        </div>
        <span className="text-xs tabular-nums text-slate-500">{visibleCount} visible · {PAR_POSITION_LIMITS[position]} tier eligible</span>
      </div>

      <NflTableScroller label={`${POSITION_NAMES[position]} research board`} className="max-h-[72vh]">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs md:min-w-[1320px]">
          <PositionTableHeader position={position} mobileGroup={mobileGroup} hasVegas={hasVegas} />
          <tbody>
            {tierGroups.map((group) => (
              <TierSection
                key={group.tier}
                tier={group.tier}
                rows={group.rows}
                columnCount={columnCount}
                position={position}
                mobileGroup={mobileGroup}
                thresholds={thresholds}
                hasVegas={hasVegas}
              />
            ))}
            {outsideRows.length > 0 && (
              <>
                <tr className="bg-slate-200/80">
                  <th colSpan={columnCount} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">Outside Draft Pool</th>
                </tr>
                {outsideRows.map((row) => (
                  <ResearchRow key={row.key} row={row} position={position} mobileGroup={mobileGroup} thresholds={thresholds} hasVegas={hasVegas} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </NflTableScroller>
    </section>
  );
}

function PositionTableHeader({ position, mobileGroup, hasVegas }: { position: FantasyPosition; mobileGroup: MobileGroup; hasVegas: boolean }) {
  const metricLabels = METRIC_LABELS[position];
  return (
    <thead className="sticky top-0 z-30 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
      <tr className="bg-slate-200">
        <th rowSpan={2} className="sticky left-0 z-40 w-14 border-b border-r border-slate-300 bg-slate-200 px-2 py-2 text-center">JKB Rk</th>
        <th rowSpan={2} className="sticky left-14 z-40 min-w-64 border-b border-r border-slate-300 bg-slate-200 px-3 py-2">Player</th>
        <GroupHeader label="Position Evidence" span={3} active={mobileGroup === "Metrics"} />
        <GroupHeader label="Model" span={hasVegas ? 4 : 3} active={mobileGroup === "Model"} />
        <GroupHeader label="Team Context" span={2} active={mobileGroup === "Context"} />
        <GroupHeader label="Fantasy Playoffs" span={3} active={mobileGroup === "Playoffs"} />
      </tr>
      <tr className="bg-slate-100">
        {metricLabels.map((label) => <ColumnHeader key={label} label={label} group="Metrics" active={mobileGroup} />)}
        <ColumnHeader label="Late / Last 8 Rk" group="Model" active={mobileGroup} />
        <ColumnHeader label="Projection Rk" group="Model" active={mobileGroup} />
        {hasVegas && <ColumnHeader label="Vegas Rk" group="Model" active={mobileGroup} />}
        <ColumnHeader label="AVG Rk" group="always" active={mobileGroup} emphasis />
        <ColumnHeader label="Strength of Schedule" group="Context" active={mobileGroup} />
        <ColumnHeader label="O-Line Rk" group="Context" active={mobileGroup} />
        <ColumnHeader label="W15" group="Playoffs" active={mobileGroup} />
        <ColumnHeader label="W16" group="Playoffs" active={mobileGroup} />
        <ColumnHeader label="W17" group="Playoffs" active={mobileGroup} />
      </tr>
    </thead>
  );
}

function GroupHeader({ label, span, active }: { label: string; span: number; active: boolean }) {
  return <th colSpan={span} className={cn("border-b border-r border-slate-300 px-3 py-1.5 text-center", !active && "max-md:hidden")}>{label}</th>;
}

function ColumnHeader({ label, group, active, emphasis = false }: { label: string; group: MobileGroup | "always"; active: MobileGroup; emphasis?: boolean }) {
  return <th className={cn("min-w-20 border-b border-r border-slate-200 px-2 py-2 text-center leading-4", group !== "always" && group !== active && "max-md:hidden", emphasis && "bg-slate-200 text-slate-800")}>{label}</th>;
}

function TierSection({ tier, rows, columnCount, position, mobileGroup, thresholds, hasVegas }: { tier: number; rows: readonly FantasyResearchBoardRow[]; columnCount: number; position: FantasyPosition; mobileGroup: MobileGroup; thresholds: Record<RankColumnKey, RankQuantileThresholds | null>; hasVegas: boolean }) {
  const parValues = rows.flatMap((row) => row.par ? [row.par.parPerGame] : []);
  const high = Math.max(...parValues);
  const low = Math.min(...parValues);
  return (
    <>
      <tr className="bg-slate-100">
        <th colSpan={columnCount} className="border-b border-slate-200 px-4 py-2 text-left">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800">Tier {tier}</span>
          <span className="ml-3 text-[10px] font-medium normal-case tracking-normal text-slate-500">PAR/G {formatSigned(high, 2)} to {formatSigned(low, 2)}</span>
        </th>
      </tr>
      {rows.map((row) => <ResearchRow key={row.key} row={row} position={position} mobileGroup={mobileGroup} thresholds={thresholds} hasVegas={hasVegas} />)}
    </>
  );
}

function ResearchRow({ row, position, mobileGroup, thresholds, hasVegas }: { row: FantasyResearchBoardRow; position: FantasyPosition; mobileGroup: MobileGroup; thresholds: Record<RankColumnKey, RankQuantileThresholds | null>; hasVegas: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const jkb = row.jkb;
  const metrics = jkb ? getFantasyMetricValues(jkb) : [undefined, undefined, undefined];
  return (
    <>
      <tr className="group border-b border-slate-100 hover:bg-slate-50">
        <td className="sticky left-0 z-10 w-14 border-b border-r border-slate-100 bg-white px-2 py-2 text-center font-bold tabular-nums text-slate-700 group-hover:bg-slate-50">{formatRank(jkb?.positionRank)}</td>
        <td className="sticky left-14 z-10 min-w-64 border-b border-r border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <PlayerIdentity player={row.player} team={row.team} />
            {row.tier && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-700 md:hidden">T{row.tier}</span>}
            <ExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} />
          </div>
        </td>
        {metrics.map((value, index) => <RankCell key={index} value={value} tone={getQuantileRankTone(value, thresholds[`metric${index}` as RankColumnKey])} group="Metrics" active={mobileGroup} />)}
        <RankCell value={jkb?.lateSeasonRank} tone={getQuantileRankTone(jkb?.lateSeasonRank, thresholds.late)} group="Model" active={mobileGroup} />
        <RankCell value={jkb?.projectionRank} tone={getQuantileRankTone(jkb?.projectionRank, thresholds.projection)} group="Model" active={mobileGroup} />
        {hasVegas && <RankCell value={jkb?.vegasRank} tone={getQuantileRankTone(jkb?.vegasRank, thresholds.vegas)} group="Model" active={mobileGroup} />}
        <RankCell value={jkb?.averageRank} tone={getQuantileRankTone(jkb?.averageRank, thresholds.average)} group="always" active={mobileGroup} emphasis />
        <RankCell value={jkb?.strengthOfSchedule} tone={getSosRankTone(jkb?.strengthOfSchedule)} group="Context" active={mobileGroup} />
        <RankCell value={jkb?.offensiveLineRank} tone={getQuantileRankTone(jkb?.offensiveLineRank, thresholds.oline)} group="Context" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek15Opponent} group="Playoffs" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek16Opponent} group="Playoffs" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek17Opponent} group="Playoffs" active={mobileGroup} />
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={20} className="px-4 py-3 text-[11px] leading-5 text-slate-600">
            {row.par ? (
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span>PAR rank <strong className="text-slate-900">#{row.par.parRank}</strong></span>
                <span>PAR/G <strong className="text-slate-900">{formatSigned(row.par.parPerGame, 2)}</strong></span>
                <span>Projected PPG <strong className="text-slate-900">{row.par.projectedPpg.toFixed(2)}</strong></span>
                <span>Historical replacement <strong className="text-slate-900">{row.par.replacementPpg.toFixed(2)}</strong></span>
                <span>Season PAR <strong className="text-slate-900">{formatSigned(row.par.projectedSeasonPar, 1)}</strong></span>
                <span>Projected points <strong className="text-slate-900">{row.par.projectedFantasyPoints.toFixed(1)}</strong></span>
              </div>
            ) : (
              <span>{position} player remains in JKB position-rank order and is outside the approved PAR tier universe.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PlayerIdentity({ player, team }: { player: string; team?: string }) {
  const normalizedTeam = team?.toUpperCase();
  const hasTeam = Boolean(normalizedTeam && normalizedTeam !== "FA");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamLogo name={normalizedTeam ?? "FA"} logo={hasTeam ? nflLogoUrl(normalizedTeam!) : undefined} className="h-6 w-6" />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-950 sm:text-[13px]">{player}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{normalizedTeam ?? "FA"}</div>
      </div>
    </div>
  );
}

function ExpandControl({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} aria-expanded={expanded} onClick={onClick} className="ml-auto inline-flex min-h-8 min-w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
    </button>
  );
}

function RankCell({ value, tone, group, active, emphasis = false }: { value?: number; tone: RankTone; group: MobileGroup | "always"; active: MobileGroup; emphasis?: boolean }) {
  return (
    <td className={cn("border-b border-r border-slate-100 px-2 py-2 text-center font-semibold tabular-nums", toneClass(tone), group !== "always" && group !== active && "max-md:hidden", emphasis && "font-bold ring-1 ring-inset ring-slate-200/70")}>
      {formatRank(value)}
    </td>
  );
}

function TextCell({ value, group, active }: { value?: string; group: MobileGroup; active: MobileGroup }) {
  return <td className={cn("border-b border-r border-slate-100 bg-white px-2 py-2 text-center font-semibold text-slate-700", group !== active && "max-md:hidden")}>{value || "—"}</td>;
}

function EmptyState({ query }: { query: string }) {
  return <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">No players match “{query}”</div>;
}

function buildThresholds(rows: readonly FantasyRankingRow[]): Record<RankColumnKey, RankQuantileThresholds | null> {
  const metrics = rows.map(getFantasyMetricValues);
  return {
    metric0: getRankQuantileThresholds(metrics.map((values) => values[0])),
    metric1: getRankQuantileThresholds(metrics.map((values) => values[1])),
    metric2: getRankQuantileThresholds(metrics.map((values) => values[2])),
    late: getRankQuantileThresholds(rows.map((row) => row.lateSeasonRank)),
    projection: getRankQuantileThresholds(rows.map((row) => row.projectionRank)),
    vegas: getRankQuantileThresholds(rows.map((row) => row.vegasRank)),
    average: getRankQuantileThresholds(rows.map((row) => row.averageRank)),
    sos: null,
    oline: getRankQuantileThresholds(rows.map((row) => row.offensiveLineRank)),
  };
}

function matchesQuery(player: string, team: string | undefined, query: string): boolean {
  return !query || player.toLowerCase().includes(query) || team?.toLowerCase().includes(query) === true;
}

function toneClass(tone: RankTone): string {
  if (tone === "favorable") return "bg-emerald-50 text-emerald-900";
  if (tone === "unfavorable") return "bg-rose-50 text-rose-900";
  if (tone === "neutral") return "bg-slate-50/70 text-slate-700";
  return "bg-white text-slate-400";
}

function formatRank(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : "—";
}

function formatSigned(value: number, digits: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}
