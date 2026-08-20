import { useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { useNflMatchupProjections } from "@/hooks/useNflMatchupProjections";
import { useNflMatchupMarket } from "@/hooks/useNflMatchupMarket";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { deriveStandings, formatStandingRecord, type CanonicalNflTeam } from "@/lib/nfl/standings";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import { buildTeamSchedule, type TeamScheduleLocation, type TeamScheduleRow } from "@/lib/nfl/teamScheduleView";
import { formatProjectedSpread, projectionFor } from "@/lib/nfl/projectionData";
import {
  currentMarketFor,
  formatMarketFavoriteSpread,
  formatTotal as formatMarketTotal,
  type MarketCurrentGame,
} from "@/lib/nfl/marketData";
import { getNflRatingHeatClass } from "@/lib/nfl/ratingPresentation";
import { kickoffLabel } from "@/pages/NFLSchedule";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import NflMetricStrip, { type NflMetric } from "@/components/nfl/ui/NflMetricStrip";
import { NFL_TABLE_HEAD_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { cn } from "@/lib/utils";

const CURRENT_SEASON = 2026;
const GUIDE = getNflSeasonGuide(CURRENT_SEASON)!;
const NA = "—";

function ratingLine(row: CurrentRatingRow | undefined | null): string {
  if (!row) return "NR";
  return `#${row.rank} · ${row.rating.toFixed(1)}`;
}

/**
 * Real betting-market spread for this matchup, in favorite notation
 * (e.g. "SEA −3.5" / "PK"). Sourced from the guide-derived market artifact
 * (public/data/nfl/matchup-market.json) — never the JKB projection. Renders
 * "—" when the guide has not priced this game yet.
 */
function formatMarketSpreadCell(market: MarketCurrentGame | null): string {
  if (!market || market.spread.home == null) return NA;
  return formatMarketFavoriteSpread(market);
}

/** Real betting-market total for this matchup. Renders "—" when unpriced. */
function formatMarketTotalCell(market: MarketCurrentGame | null): string {
  if (!market || market.total == null) return NA;
  return formatMarketTotal(market.total);
}

function LocationBadge({ location }: { location: TeamScheduleLocation }) {
  const cls =
    location === "HOME"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : location === "AWAY"
        ? "bg-sky-50 text-sky-800 border-sky-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {location}
    </span>
  );
}

/**
 * Full-row home/away tint so a user can scan the schedule and immediately
 * distinguish home vs. away. Kept to unsaturated 50-shade washes — subtle
 * enough that the Opp Power heat cell and hover state both stay legible.
 */
function rowLocationTone(location: TeamScheduleLocation): string {
  if (location === "HOME") return "bg-emerald-50/70 hover:bg-emerald-100/70";
  if (location === "AWAY") return "bg-sky-50/70 hover:bg-sky-100/70";
  return "bg-slate-50/50 hover:bg-slate-100/60";
}

/**
 * Opp Power cell color, using the NFL-calibrated score-based Power Rating
 * scale (src/lib/nfl/ratingPresentation.ts — gold "Elite" tier down through
 * a descending green/warm scale, thresholds fixed to the actual Current OVR
 * distribution) rather than a rank-only red/green split. Colors by the
 * actual rating value, not league rank.
 */
function opponentPowerCellClass(rating: number | undefined | null): string {
  return getNflRatingHeatClass(rating);
}

function ScheduleRow({
  row,
  teamAbbr,
  opponentRecord,
  opponentRating,
  marketSpread,
  marketTotal,
  jkbSpread,
}: {
  row: TeamScheduleRow;
  teamAbbr: string;
  opponentRecord: string | null;
  opponentRating: CurrentRatingRow | null;
  marketSpread: string;
  marketTotal: string;
  jkbSpread: string;
}) {
  const detailHref = `/nfl/matchups/${row.matchupSlug}`;
  const label = `Week ${row.week}: ${teamAbbr.toUpperCase()} ${row.location === "AWAY" ? "at" : "vs"} ${row.opponent.teamName} — view matchup breakdown`;

  return (
    <tr className={cn("border-t border-slate-100 transition-colors", rowLocationTone(row.location))}>
      <td className="whitespace-nowrap px-2 py-2 text-center font-semibold tabular-nums text-slate-700">
        {row.week}
      </td>
      <td className="px-2 py-2">
        <Link
          to={detailHref}
          aria-label={label}
          className="flex items-center gap-2 rounded font-semibold text-slate-900 hover:text-emerald-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
        >
          <img src={nflLogoUrl(row.opponent.abbr)} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
          <span className="min-w-0">
            <span className="block truncate text-xs sm:text-sm">{row.opponent.teamName}</span>
            {/* Secondary line: mobile-only compact context (date, site, opponent record, market total). */}
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-normal text-slate-500 sm:hidden">
              <LocationBadge location={row.location} />
              <span>{kickoffLabel(row.kickoffUtc)}</span>
              {opponentRecord && <span>{opponentRecord}</span>}
              <span>O/U {marketTotal}</span>
            </span>
          </span>
        </Link>
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-slate-500 sm:table-cell">
        {kickoffLabel(row.kickoffUtc)}
      </td>
      <td className="hidden px-2 py-2 text-center sm:table-cell">
        <LocationBadge location={row.location} />
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-700 sm:table-cell">
        {opponentRecord ?? NA}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        <span
          className={cn(
            "inline-flex min-w-[3.25rem] items-center justify-center rounded px-1.5 py-0.5 font-semibold tabular-nums",
            opponentPowerCellClass(opponentRating?.rating),
          )}
        >
          {ratingLine(opponentRating)}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center font-semibold tabular-nums text-slate-900">
        {marketSpread}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-700 sm:table-cell">
        {marketTotal}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-900">
        {jkbSpread}
      </td>
    </tr>
  );
}

export default function NFLTeamSchedules() {
  const { teamSlug = "" } = useParams();
  const navigate = useNavigate();
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);
  const currentRating = useNflCurrentRating2026();
  const { artifact: projectionsArtifact } = useNflMatchupProjections();
  const { artifact: marketArtifact } = useNflMatchupMarket();

  const teams: CanonicalNflTeam[] = useMemo(
    () => [...(data?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );
  const selectedTeam = teams.find((team) => team.slug === teamSlug) ?? null;

  const standings = useMemo(
    () => (data ? deriveStandings(data.results, data.teams) : []),
    [data]
  );
  const standingByAbbr = useMemo(
    () => new Map(standings.map((row) => [row.abbr, row])),
    [standings]
  );
  const ratingByAbbr = useMemo(() => {
    const map = new Map<string, CurrentRatingRow>();
    for (const row of currentRating.data?.teams ?? []) map.set(row.abbr, row);
    return map;
  }, [currentRating.data]);

  const scheduleRows = useMemo(
    () => (data && selectedTeam ? buildTeamSchedule(selectedTeam.abbr, data.games, GUIDE) : []),
    [data, selectedTeam]
  );

  usePageSeo({
    title: selectedTeam
      ? `${selectedTeam.name} ${CURRENT_SEASON} Schedule | Joe Knows Ball`
      : `${CURRENT_SEASON} NFL Team Schedules | Joe Knows Ball`,
    description: selectedTeam
      ? `${selectedTeam.name} full ${CURRENT_SEASON} schedule with opponent power ratings, projected spreads and projected totals.`
      : "Select any NFL team to see its full season schedule with power ratings and projections.",
    path: selectedTeam ? `/nfl/team-schedules/${selectedTeam.slug}` : "/nfl/team-schedules",
    noindex: seo.noindex ?? false,
  });

  if (!loading && !error && teams.length > 0 && !teamSlug) {
    return <Navigate to={`/nfl/team-schedules/${teams[0].slug}`} replace />;
  }

  const selectedStanding = selectedTeam ? standingByAbbr.get(selectedTeam.abbr) ?? null : null;
  const selectedRating = selectedTeam ? ratingByAbbr.get(selectedTeam.abbr) ?? null : null;

  const headerMetrics: NflMetric[] = selectedTeam
    ? [
        { label: "Record", value: selectedStanding ? formatStandingRecord(selectedStanding) : "0-0" },
        { label: "Conference", value: selectedTeam.conference },
        { label: "Division", value: selectedTeam.division },
        {
          label: "JKB Power",
          value: selectedRating ? `#${selectedRating.rank} · ${selectedRating.rating.toFixed(1)}` : "NR",
          tone: "model",
          primary: true,
        },
        {
          label: "Offense",
          value: selectedRating ? `#${selectedRating.offenseRank} · ${selectedRating.offenseRating.toFixed(1)}` : "NR",
          tone: selectedRating && selectedRating.offenseRank <= 10 ? "good" : selectedRating && selectedRating.offenseRank >= 23 ? "bad" : "neutral",
        },
        {
          label: "Defense",
          value: selectedRating ? `#${selectedRating.defenseRank} · ${selectedRating.defenseRating.toFixed(1)}` : "NR",
          tone: selectedRating && selectedRating.defenseRank <= 10 ? "good" : selectedRating && selectedRating.defenseRank >= 23 ? "bad" : "neutral",
        },
      ]
    : [];

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Season"
        title={`${CURRENT_SEASON} NFL Team Schedules`}
        description="Select a team for its full season schedule — opponent power ratings, projected spreads and projected totals. Kickoff times in Eastern Time."
      >
        <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold text-slate-600">
          Select team
          <select
            value={selectedTeam?.slug ?? ""}
            onChange={(event) => navigate(`/nfl/team-schedules/${event.target.value}`)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {teams.map((team) => (
              <option key={team.slug} value={team.slug}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      </NflPageHeader>

      {loading && <p className="text-sm text-slate-500">Loading team schedule…</p>}
      {error && (
        <p className="text-sm font-semibold text-red-700">
          Could not load the {CURRENT_SEASON} schedule. Please try again later.
        </p>
      )}

      {!loading && !error && selectedTeam && (
        <>
          <section
            aria-label={`${selectedTeam.name} overview`}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center gap-3">
              <img
                src={nflLogoUrl(selectedTeam.abbr)}
                alt={`${selectedTeam.name} logo`}
                className="h-12 w-12 shrink-0 object-contain"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">
                  {selectedTeam.name}
                </h2>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {selectedTeam.conference} · {selectedTeam.division}
                </p>
              </div>
            </div>
            <NflMetricStrip ariaLabel={`${selectedTeam.name} ratings`} columns={6} metrics={headerMetrics} className="mt-3" />
          </section>

          <article className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
              {selectedTeam.name} — {CURRENT_SEASON} Schedule
            </h3>
            {scheduleRows.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">No schedule is available for this team yet.</p>
            ) : (
              <NflTableScroller label={`${selectedTeam.name} schedule`}>
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className={NFL_TABLE_HEAD_ROW}>
                      <th scope="col" className="px-2 py-2 text-center">Wk</th>
                      <th scope="col" className="px-2 py-2 text-left">Opponent</th>
                      <th scope="col" className="hidden px-2 py-2 text-left sm:table-cell">Date</th>
                      <th scope="col" className="hidden px-2 py-2 sm:table-cell">Site</th>
                      <th scope="col" className="hidden px-2 py-2 text-center sm:table-cell">Opp Record</th>
                      <th scope="col" className="px-2 py-2 text-center">Opp Power</th>
                      <th scope="col" className="px-2 py-2 text-center">Market Spread</th>
                      <th scope="col" className="hidden px-2 py-2 text-center sm:table-cell">Market Total</th>
                      <th scope="col" className="px-2 py-2 text-center">JKB Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((row) => {
                      const projection = projectionFor(projectionsArtifact, row.gameId);
                      const market = currentMarketFor(marketArtifact, row.gameId);
                      return (
                        <ScheduleRow
                          key={row.gameId}
                          row={row}
                          teamAbbr={selectedTeam.abbr}
                          opponentRecord={
                            standingByAbbr.has(row.opponent.abbr)
                              ? formatStandingRecord(standingByAbbr.get(row.opponent.abbr)!)
                              : null
                          }
                          opponentRating={ratingByAbbr.get(row.opponent.abbr) ?? null}
                          marketSpread={formatMarketSpreadCell(market)}
                          marketTotal={formatMarketTotalCell(market)}
                          jkbSpread={formatProjectedSpread(projection)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </NflTableScroller>
            )}
          </article>

          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            <Link to="/nfl/matchups" className="font-semibold text-emerald-700 hover:underline">
              View weekly matchups →
            </Link>
          </p>
        </>
      )}

      {!loading && !error && !selectedTeam && teamSlug && (
        <p className="text-sm text-slate-500">
          Unknown team.{" "}
          <Link to="/nfl/team-schedules" className="font-semibold text-emerald-700 hover:underline">
            Choose a team
          </Link>
          .
        </p>
      )}
    </>
  );
}
