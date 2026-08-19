import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { NFL_DIVISION_ORDER, nflLogoUrl } from "@/data/nflPreseason2026";
import LastUpdated from "@/components/nfl/LastUpdated";
import StaleWarning from "@/components/nfl/StaleWarning";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflSeasonPicker } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflV04Projection } from "@/hooks/useNflV04Projection";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import type { NflPublicProjectionTeam } from "@/lib/nfl/publicProjection2026";
import { deriveStandings, sortStandings, formatStandingRecord, type TeamStanding } from "@/lib/nfl/standings";
import {
  deltaTone,
  formatRating2025Adjusted,
  formatRating2026,
  formatSignedDelta,
  resolveDivisionBoardMode,
  sortTeamsByProjectedRating,
  sosTone,
  type DivisionViewMode,
} from "@/lib/nfl/divisionBoard2026";
import { buildSosBoard, type SosBoardRow, type SosMetric } from "@/lib/nfl/sosMetrics2026";

const SEASONS = [2026, 2025, 2024, 2023, 2022];
const CURRENT_SEASON = 2026;

function TeamLogo({ abbr, color }: { abbr: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex h-7 w-7 items-center justify-center rounded-full text-[8px] font-black text-white" style={{ background: color }}>{abbr.toUpperCase()}</span>;
  return <img src={nflLogoUrl(abbr)} alt="" className="h-7 w-7 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

function TeamLink({ row, color, children }: { row: TeamStanding; color: string; children?: ReactNode }) {
  return (
    <Link
      to={`/nfl/guide/team/${row.slug}`}
      className="flex items-center gap-2 px-2 py-1.5 font-semibold text-slate-800 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      aria-label={`Open ${row.name} team dashboard`}
    >
      <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <TeamLogo abbr={row.abbr} color={color} />
      <span className="min-w-0 truncate whitespace-nowrap">{row.name}</span>
      {children}
    </Link>
  );
}

const DELTA_CLASSES: Record<"positive" | "negative" | "neutral", string> = {
  positive: "text-emerald-700",
  negative: "text-red-700",
  neutral: "text-slate-500",
};

const SOS_BADGE_CLASSES: Record<"hard" | "middle" | "easy", string> = {
  hard: "bg-red-50 text-red-700",
  middle: "bg-slate-100 text-slate-600",
  easy: "bg-emerald-50 text-emerald-700",
};

function DeltaValue({ value }: { value: number }) {
  const tone = deltaTone(value);
  const arrow = tone === "positive" ? "↑" : tone === "negative" ? "↓" : "—";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${DELTA_CLASSES[tone]}`}>
      <span aria-hidden>{arrow}</span>
      {formatSignedDelta(value)}
    </span>
  );
}

function SosBadge({ sosRank, sosAvgOpponentRating }: { sosRank: number; sosAvgOpponentRating: number }) {
  const tone = sosTone(sosRank);
  return (
    <span
      className={`inline-flex flex-col items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${SOS_BADGE_CLASSES[tone]}`}
      title={`Strength of schedule rank ${sosRank} of 32 (1 = hardest). Average projected opponent rating ${sosAvgOpponentRating.toFixed(1)}.`}
    >
      #{sosRank}
      <span className="text-[9px] font-medium text-slate-400">Avg {sosAvgOpponentRating.toFixed(1)}</span>
    </span>
  );
}

/** "1st" / "2nd" / "3rd" / "4th"... for the SOS cell's accessible title. */
function ordinalLabel(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

type InSeasonOvr = {
  rating: number;
  rank: number;
  offenseRating: number;
  offenseRank: number;
  defenseRating: number;
  defenseRank: number;
};

/** Power Ranking OVR cell: league rank primary, current rating secondary. Never the preseason rank once live. */
function OvrCell({ ovr }: { ovr: InSeasonOvr | null }) {
  if (!ovr) return <span className="text-slate-400">{"—"}</span>;
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-sm font-bold tabular-nums text-slate-900">#{ovr.rank}</span>
      <span className="text-[10px] font-medium text-slate-500 tabular-nums">{ovr.rating.toFixed(1)}</span>
    </span>
  );
}

/** OFF/DEF cell, same rank-primary/rating-secondary shape as OvrCell -- both from the Current Power Board. */
function UnitRatingCell({ rating, rank }: { rating: number | null; rank: number | null }) {
  if (rating === null || rank === null) return <span className="text-slate-400">{"—"}</span>;
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-sm font-bold tabular-nums text-slate-900">#{rank}</span>
      <span className="text-[10px] font-medium text-slate-500 tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}

/** SOS To Date / Future SOS cell: league rank primary, average opponent OVR secondary. N/A renders as plain text, never a fabricated rank. */
function InSeasonSosCell({
  metric,
  rank,
  scheduleLabel,
}: {
  metric: SosMetric | null;
  rank: number | null;
  /** e.g. "schedule to date" or "remaining schedule", for the accessible title. */
  scheduleLabel: string;
}) {
  if (!metric || rank === null) {
    return <span className="text-slate-400">N/A</span>;
  }
  const tone = sosTone(rank);
  return (
    <span
      className={`inline-flex flex-col items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${SOS_BADGE_CLASSES[tone]}`}
      title={`${ordinalLabel(rank)}-hardest ${scheduleLabel} · average opponent rating ${metric.value.toFixed(1)}`}
    >
      #{rank}
      <span className="text-[9px] font-medium text-slate-400">Avg {metric.value.toFixed(1)}</span>
    </span>
  );
}

/** Permanent Auto / Preseason / In Season control. Auto is the default and the only data-driven option. */
function DivisionViewPicker({
  value,
  onChange,
}: {
  value: DivisionViewMode;
  onChange: (mode: DivisionViewMode) => void;
}) {
  const options: { id: DivisionViewMode; label: string }[] = [
    { id: "auto", label: "Auto" },
    { id: "preseason", label: "Preseason" },
    { id: "inSeason", label: "In Season" },
  ];
  return (
    <div className="inline-flex gap-1.5 rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Division board view">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === option.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Projected-preseason division card: Team | 2025 Adj | Δ26 | 2026 PR | SOS, sorted by rating2026 descending. */
function PreseasonDivisionCard({
  name,
  rows,
  projectionByAbbr,
  colorByAbbr,
}: {
  name: string;
  rows: TeamStanding[];
  projectionByAbbr: Map<string, NflPublicProjectionTeam>;
  colorByAbbr: Map<string, string>;
}) {
  const sorted = sortTeamsByProjectedRating(rows, projectionByAbbr);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{name}</h2>

      {/* Mobile: compact two-line card rows. Team + 2026 PR are always visible; 2025 Adj / Δ26 / SOS sit in a secondary line. */}
      <ul className="sm:hidden">
        {sorted.map((row) => {
          const projection = projectionByAbbr.get(row.abbr) ?? null;
          const color = colorByAbbr.get(row.abbr) ?? "#334155";
          return (
            <li key={row.abbr} className="border-t border-slate-100 first:border-t-0">
              <TeamLink row={row} color={color}>
                <span className="ml-auto flex shrink-0 flex-col items-end pl-2">
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {projection ? formatRating2026(projection.rating2026) : "—"}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {projection ? `#${projection.rank} NFL` : "—"}
                  </span>
                </span>
              </TeamLink>
              <div className="flex items-center gap-3 px-2 pb-2 pl-[46px] text-[11px] text-slate-500">
                <span>
                  2025 <span className="font-semibold tabular-nums text-slate-700">{projection ? formatRating2025Adjusted(projection.rating2025Adjusted) : "—"}</span>
                </span>
                <span>
                  Δ26 {projection ? <DeltaValue value={projection.projectionAdjustment2026} /> : <span className="font-semibold text-slate-400">{"—"}</span>}
                </span>
                <span className="ml-auto">
                  SOS {projection ? <SosBadge sosRank={projection.sosRank} sosAvgOpponentRating={projection.sosAvgOpponentRating} /> : <span className="font-semibold text-slate-400">{"—"}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop/tablet: real table, no horizontal scroll needed at these column widths. */}
      <NflTableScroller label={`${name} 2026 preseason projection`} className="hidden sm:block">
        <table className="w-full min-w-[460px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="px-2 py-2 text-left">Team</th>
              <th scope="col" className="px-1 py-2">2025 Adj</th>
              <th scope="col" className="px-1 py-2">Δ26</th>
              <th scope="col" className="px-1 py-2">2026 PR</th>
              <th scope="col" className="px-1 py-2">SOS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const projection = projectionByAbbr.get(row.abbr) ?? null;
              const color = colorByAbbr.get(row.abbr) ?? "#334155";
              return (
                <tr key={row.abbr} className={NFL_TABLE_ROW}>
                  <td className="p-0">
                    <TeamLink row={row} color={color} />
                  </td>
                  <td className="px-1 text-center tabular-nums text-slate-500">
                    {projection ? formatRating2025Adjusted(projection.rating2025Adjusted) : "—"}
                  </td>
                  <td className="px-1 text-center tabular-nums">
                    {projection ? <DeltaValue value={projection.projectionAdjustment2026} /> : <span className="text-slate-400">{"—"}</span>}
                  </td>
                  <td className="px-1 text-center">
                    {projection ? (
                      <span className="flex flex-col items-center leading-tight">
                        <span className="text-sm font-bold tabular-nums text-slate-900">{formatRating2026(projection.rating2026)}</span>
                        <span className="text-[9px] font-medium text-slate-400">#{projection.rank} NFL</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">{"—"}</span>
                    )}
                  </td>
                  <td className="px-1 text-center">
                    {projection ? (
                      <SosBadge sosRank={projection.sosRank} sosAvgOpponentRating={projection.sosAvgOpponentRating} />
                    ) : (
                      <span className="text-slate-400">{"—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
    </article>
  );
}

/** Actual-standings division card: Team | W-L | PF | PA | Diff, sorted by the real results. Used for historical seasons and for 2026 once games are completed. */
function ActualStandingsDivisionCard({
  name,
  rows,
  colorByAbbr,
}: {
  name: string;
  rows: TeamStanding[];
  colorByAbbr: Map<string, string>;
}) {
  const sorted = sortStandings(rows);
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{name}</h2>
      <NflTableScroller label={`${name} standings`}>
        <table className="w-full min-w-[430px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="px-2 py-2 text-left">Team</th>
              <th scope="col" className="px-1 py-2">W-L</th>
              <th scope="col" className="px-1 py-2">PF</th>
              <th scope="col" className="px-1 py-2">PA</th>
              <th scope="col" className="px-1 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const color = colorByAbbr.get(row.abbr) ?? "#334155";
              return (
                <tr key={row.abbr} className={NFL_TABLE_ROW}>
                  <td className="p-0">
                    <TeamLink row={row} color={color} />
                  </td>
                  <td className="px-1 text-center font-semibold tabular-nums text-slate-800">{formatStandingRecord(row)}</td>
                  <td className="px-1 text-center tabular-nums text-slate-500">{row.pointsFor}</td>
                  <td className="px-1 text-center tabular-nums text-slate-500">{row.pointsAgainst}</td>
                  <td className={`px-1 text-center font-semibold tabular-nums ${row.pointDiff > 0 ? "text-emerald-700" : row.pointDiff < 0 ? "text-red-700" : "text-slate-500"}`}>
                    {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
    </article>
  );
}

/**
 * In-season division card: Team | Record | OVR | OFF | DEF | SOS To Date | Future SOS.
 *
 * Sorted by `sortStandings` -- actual record/standings logic, completely
 * unchanged from `ActualStandingsDivisionCard`. OVR and SOS are display
 * columns only and never enter that comparator; this is a hard invariant.
 */
function InSeasonDivisionCard({
  name,
  rows,
  colorByAbbr,
  ovrByAbbr,
  sosByAbbr,
}: {
  name: string;
  rows: TeamStanding[];
  colorByAbbr: Map<string, string>;
  ovrByAbbr: Map<string, InSeasonOvr>;
  sosByAbbr: Map<string, SosBoardRow>;
}) {
  const sorted = sortStandings(rows);
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{name}</h2>

      {/* Mobile: compact card rows keep Team + Record + OVR primary, both SOS metrics on a secondary line -- no horizontal scroll required. */}
      <ul className="sm:hidden">
        {sorted.map((row) => {
          const ovr = ovrByAbbr.get(row.abbr) ?? null;
          const sos = sosByAbbr.get(row.abbr);
          const color = colorByAbbr.get(row.abbr) ?? "#334155";
          return (
            <li key={row.abbr} className="border-t border-slate-100 first:border-t-0">
              <TeamLink row={row} color={color}>
                <span className="ml-auto flex shrink-0 items-center gap-3 pl-2">
                  <span className="text-sm font-bold tabular-nums text-slate-800">{formatStandingRecord(row)}</span>
                  <OvrCell ovr={ovr} />
                </span>
              </TeamLink>
              <div className="flex items-center gap-3 px-2 pb-2 pl-[46px] text-[11px] text-slate-500">
                <span>
                  OFF <UnitRatingCell rating={ovr?.offenseRating ?? null} rank={ovr?.offenseRank ?? null} />
                </span>
                <span>
                  DEF <UnitRatingCell rating={ovr?.defenseRating ?? null} rank={ovr?.defenseRank ?? null} />
                </span>
              </div>
              <div className="flex items-center gap-3 px-2 pb-2 pl-[46px] text-[11px] text-slate-500">
                <span>
                  SOS <InSeasonSosCell metric={sos?.sosToDate ?? null} rank={sos?.sosToDateRank ?? null} scheduleLabel="schedule to date" />
                </span>
                <span className="ml-auto">
                  Future <InSeasonSosCell metric={sos?.futureSos ?? null} rank={sos?.futureSosRank ?? null} scheduleLabel="remaining schedule" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop/tablet: real table. */}
      <NflTableScroller label={`${name} in-season standings`} className="hidden sm:block">
        <table className="w-full min-w-[460px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="px-2 py-2 text-left">Team</th>
              <th scope="col" className="px-1 py-2">Record</th>
              <th scope="col" className="px-1 py-2">OVR</th>
              <th scope="col" className="px-1 py-2">OFF</th>
              <th scope="col" className="px-1 py-2">DEF</th>
              <th scope="col" className="px-1 py-2">SOS To Date</th>
              <th scope="col" className="px-1 py-2">Future SOS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const ovr = ovrByAbbr.get(row.abbr) ?? null;
              const sos = sosByAbbr.get(row.abbr);
              const color = colorByAbbr.get(row.abbr) ?? "#334155";
              return (
                <tr key={row.abbr} className={NFL_TABLE_ROW}>
                  <td className="p-0">
                    <TeamLink row={row} color={color} />
                  </td>
                  <td className="px-1 text-center font-semibold tabular-nums text-slate-800">{formatStandingRecord(row)}</td>
                  <td className="px-1 text-center">
                    <OvrCell ovr={ovr} />
                  </td>
                  <td className="px-1 text-center">
                    <UnitRatingCell rating={ovr?.offenseRating ?? null} rank={ovr?.offenseRank ?? null} />
                  </td>
                  <td className="px-1 text-center">
                    <UnitRatingCell rating={ovr?.defenseRating ?? null} rank={ovr?.defenseRank ?? null} />
                  </td>
                  <td className="px-1 text-center">
                    <InSeasonSosCell metric={sos?.sosToDate ?? null} rank={sos?.sosToDateRank ?? null} scheduleLabel="schedule to date" />
                  </td>
                  <td className="px-1 text-center">
                    <InSeasonSosCell metric={sos?.futureSos ?? null} rank={sos?.futureSosRank ?? null} scheduleLabel="remaining schedule" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
    </article>
  );
}

export default function NFLStandings() {
  const seo = getSeoMeta("nfl");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [viewMode, setViewMode] = useState<DivisionViewMode>("auto");
  const { loading, error, data } = useNflSeasonData(season);
  const isCurrent = season === CURRENT_SEASON;
  const hasResults = (data?.results.length ?? 0) > 0;
  const mode = resolveDivisionBoardMode(viewMode, isCurrent, hasResults);
  const showProjection = mode === "preseasonProjection";
  const showInSeason = mode === "inSeasonCurrent";

  const projection = useNflV04Projection();
  const currentRating = useNflCurrentRating2026();

  usePageSeo({
    title: "2026 NFL Standings by Division | Joe Knows Ball",
    description: "NFL standings by division derived from final game results, with clickable team dashboards and preseason projected power ratings.",
    path: "/nfl/standings",
    noindex: seo.noindex ?? false,
  });

  const standings = useMemo(
    () => (data ? deriveStandings(data.results, data.teams) : []),
    [data]
  );
  const byDivision = useMemo(() => {
    const map = new Map<string, TeamStanding[]>();
    for (const row of standings) {
      const list = map.get(row.division) ?? [];
      list.push(row);
      map.set(row.division, list);
    }
    return map;
  }, [standings]);

  const colorByAbbr = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of data?.teams ?? []) map.set(team.abbr, team.primaryColor);
    return map;
  }, [data]);

  const projectionByAbbr = useMemo(() => {
    const map = new Map<string, NflPublicProjectionTeam>();
    for (const team of projection.data?.teams ?? []) map.set(team.abbr, team);
    return map;
  }, [projection.data]);

  const ovrByAbbr = useMemo(() => {
    const map = new Map<string, InSeasonOvr>();
    for (const team of currentRating.data?.teams ?? []) {
      map.set(team.abbr, {
        rating: team.rating,
        rank: team.rank,
        offenseRating: team.offenseRating,
        offenseRank: team.offenseRank,
        defenseRating: team.defenseRating,
        defenseRank: team.defenseRank,
      });
    }
    return map;
  }, [currentRating.data]);

  // League-wide (all 32 teams), not just the teams in one division card --
  // SOS rank direction (#1 = hardest) is only meaningful computed across the
  // full league, matching the preseason board's own sosRank semantics.
  const sosByAbbr = useMemo(() => {
    if (!showInSeason || !data) return new Map<string, SosBoardRow>();
    const allAbbrs = data.teams.map((team) => team.abbr);
    return buildSosBoard(allAbbrs, data.games, data.results, CURRENT_SEASON, currentRating.data);
  }, [showInSeason, data, currentRating.data]);

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Standings"
        title={`${season} NFL Standings by Division`}
        description={
          showProjection
            ? "2026 preseason view — teams are ordered by projected Power Rating until regular-season results are available."
            : showInSeason
              ? "Standings are sorted by record. OVR reflects the current Joe Knows Ball Power Ranking. SOS uses current opponent Power Ratings."
              : "Derived automatically from final game results. Select a team for its full dashboard."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <NflSeasonPicker seasons={SEASONS} value={season} onChange={setSeason} />
          {isCurrent && <DivisionViewPicker value={viewMode} onChange={setViewMode} />}
        </div>
      </NflPageHeader>

      {isCurrent && !loading && !error && !hasResults && !showInSeason && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          No final 2026 NFL results are available yet. Standings will update automatically once games are completed.
        </p>
      )}
      {isCurrent && showInSeason && !hasResults && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Previewing the in-season view before any 2026 games are final. Records show 0-0 and SOS To Date shows N/A
          until results land; Future SOS is already live from the 2026 schedule.
        </p>
      )}
      {showProjection && !projection.loading && projection.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
          Unable to load 2026 projected power ratings: {projection.error}
        </p>
      )}
      {showInSeason && !currentRating.loading && currentRating.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
          Unable to load current 2026 power ratings: {currentRating.error}. Record-based standings still reflect final results.
        </p>
      )}
      <StaleWarning meta={data?.resultsMeta} maxAgeHours={72} enabled={isCurrent && hasResults} />

      {loading && <p className="text-sm text-slate-500">Loading standings…</p>}
      {error && <p className="text-sm font-semibold text-red-700">Could not load standings data for {season}. Please try again later.</p>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {NFL_DIVISION_ORDER.filter((division) => byDivision.has(division)).map((division) =>
            showProjection ? (
              <PreseasonDivisionCard
                key={division}
                name={division}
                rows={byDivision.get(division)!}
                projectionByAbbr={projectionByAbbr}
                colorByAbbr={colorByAbbr}
              />
            ) : showInSeason ? (
              <InSeasonDivisionCard
                key={division}
                name={division}
                rows={byDivision.get(division)!}
                colorByAbbr={colorByAbbr}
                ovrByAbbr={ovrByAbbr}
                sosByAbbr={sosByAbbr}
              />
            ) : (
              <ActualStandingsDivisionCard
                key={division}
                name={division}
                rows={byDivision.get(division)!}
                colorByAbbr={colorByAbbr}
              />
            )
          )}
        </div>
      )}

      {showProjection ? (
        <p className="text-[11px] leading-5 text-slate-500">
          2025 Adj = schedule/luck-adjusted 2025 strength · Δ26 = projected offseason adjustment · 2026 PR = projected
          neutral-field team strength · SOS = 2026 schedule difficulty, 1 hardest. SOS is schedule context only and
          does not affect Power Rating.
        </p>
      ) : showInSeason ? (
        <p className="text-[11px] leading-5 text-slate-500">
          Standings are sorted by a simplified regular-season ranking formula (win% → wins → point differential → points
          for); OVR and SOS are never part of that sort. SOS To Date = average current OVR of opponents already played.
          Future SOS = average current OVR of remaining scheduled opponents. #1 = hardest. Both update automatically as
          Power Ratings change.
        </p>
      ) : (
        <p className="text-[11px] leading-5 text-slate-500">
          Standings are sorted by a simplified regular-season ranking formula (win% → wins → point differential → points for) and do not yet apply the full NFL playoff tiebreaker sequence.
        </p>
      )}
      <LastUpdated meta={data?.resultsMeta} />
    </>
  );
}
