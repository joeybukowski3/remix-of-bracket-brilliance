import type { WeeklyRankingRow } from "@/lib/fantasy/weeklyRankings";
import { WEEKLY_RANKING_POSITIONS } from "@/lib/fantasy/weeklyRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import {
  currentMarketFor,
  formatMarketFavoriteSpread,
  type MarketArtifact,
} from "@/lib/nfl/marketData";
import { buildMatchupSlug } from "@/lib/nfl/matchups";
import {
  compareToMarket,
  formatModelVsMarketDifference,
  formatProjectedSpread,
  projectionFor,
  type ModelVsMarket,
  type ProjectionsArtifact,
} from "@/lib/nfl/projectionData";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
import { NFL_PRESENTATION_TIME_ZONE } from "@/lib/nfl/weekSelection";

export type WeeklyDashboardPosition = (typeof WEEKLY_RANKING_POSITIONS)[number];

export type WeeklyDashboardRating = {
  ovr: number;
  ovrRank: number;
  offense: number;
  offenseRank: number;
  defense: number;
  defenseRank: number;
};

export type WeeklyDashboardTeam = {
  id: string;
  slug: string;
  abbr: string;
  name: string;
  shortName: string;
  logoUrl: string;
  primaryColor: string;
  rating: WeeklyDashboardRating | null;
};

export type WeeklyDashboardGame = {
  gameId: string;
  week: number;
  kickoffUtc: string | null;
  stadium: string | null;
  neutralSite: boolean;
  away: WeeklyDashboardTeam;
  home: WeeklyDashboardTeam;
  matchupSlug: string;
  matchupHref: string;
  market: {
    homeSpread: number | null;
    awaySpread: number | null;
    total: number | null;
    formattedSpread: string;
  } | null;
  projection: {
    projectedHomeMargin: number;
    formattedSpread: string;
  } | null;
  comparison: ModelVsMarket | null;
  formattedComparison: string;
  modelLeanTeam: WeeklyDashboardTeam | null;
  absoluteModelMarketGap: number | null;
};

export type WeeklyDashboardFantasyLeader = {
  key: string;
  rank: number;
  player: string;
  position: WeeklyDashboardPosition;
  teamAbbr: string | null;
  projectedPpg: number;
  opponentLabel: string;
};

export type WeeklyDashboardDiagnostics = {
  duplicateGameIds: string[];
  malformedGameCount: number;
  unresolvedTeamGameIds: string[];
  missingMarketGameIds: string[];
  missingProjectionGameIds: string[];
  missingRatingTeamAbbrs: string[];
};

export type WeeklyDashboard = {
  season: number;
  week: number;
  dateRange: { startUtc: string; endUtc: string; label: string } | null;
  games: WeeklyDashboardGame[];
  largestModelMarketGaps: WeeklyDashboardGame[];
  fantasyLeaders: Record<WeeklyDashboardPosition, WeeklyDashboardFantasyLeader[]>;
  powerWatch: WeeklyDashboardTeam[];
  highlights: {
    largestGap: WeeklyDashboardGame | null;
    highestMarketTotal: WeeklyDashboardGame | null;
    topFantasyProjection: WeeklyDashboardFantasyLeader | null;
  };
  diagnostics: WeeklyDashboardDiagnostics;
};

export type BuildWeeklyDashboardInput = {
  season: number;
  week: number;
  games: readonly NflGameRecord[];
  teams: readonly CanonicalNflTeam[];
  marketArtifact?: MarketArtifact | null;
  projectionsArtifact?: ProjectionsArtifact | null;
  currentRatings?: readonly CurrentRatingRow[] | null;
  fantasyRows?: Partial<Record<WeeklyDashboardPosition, readonly WeeklyRankingRow[]>>;
};

function finiteDateValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function dateLabel(date: Date, includeYear: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NFL_PRESENTATION_TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function buildDateRange(games: readonly WeeklyDashboardGame[]) {
  const dated = games
    .map((game) => ({ value: finiteDateValue(game.kickoffUtc), iso: game.kickoffUtc }))
    .filter((entry): entry is { value: number; iso: string } => Number.isFinite(entry.value) && entry.iso !== null)
    .sort((a, b) => a.value - b.value);
  if (dated.length === 0) return null;

  const start = new Date(dated[0].iso);
  const end = new Date(dated.at(-1)!.iso);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const label = dated.length === 1
    ? dateLabel(start, true)
    : `${dateLabel(start, !sameYear)}–${dateLabel(end, true)}`;
  return { startUtc: dated[0].iso, endUtc: dated.at(-1)!.iso, label };
}

function toRating(row: CurrentRatingRow | undefined): WeeklyDashboardRating | null {
  if (!row) return null;
  return {
    ovr: row.rating,
    ovrRank: row.rank,
    offense: row.offenseRating,
    offenseRank: row.offenseRank,
    defense: row.defenseRating,
    defenseRank: row.defenseRank,
  };
}

function toTeam(team: CanonicalNflTeam, rating: CurrentRatingRow | undefined): WeeklyDashboardTeam {
  return {
    id: team.id,
    slug: team.slug,
    abbr: team.abbr,
    name: team.name,
    shortName: team.shortName,
    logoUrl: team.logoUrl,
    primaryColor: team.primaryColor,
    rating: toRating(rating),
  };
}

function buildFantasyLeaders(
  rows: BuildWeeklyDashboardInput["fantasyRows"],
): Record<WeeklyDashboardPosition, WeeklyDashboardFantasyLeader[]> {
  return Object.fromEntries(
    WEEKLY_RANKING_POSITIONS.map((position) => [
      position,
      (rows?.[position] ?? []).slice(0, 5).map((row) => ({
        key: row.key,
        rank: row.rank,
        player: row.player,
        position,
        teamAbbr: row.teamAbbr,
        projectedPpg: row.projectedPpg,
        opponentLabel: row.opponentLabel,
      })),
    ]),
  ) as Record<WeeklyDashboardPosition, WeeklyDashboardFantasyLeader[]>;
}

export function buildWeeklyDashboard(input: BuildWeeklyDashboardInput): WeeklyDashboard {
  const teamByAbbr = new Map(input.teams.map((team) => [team.abbr, team]));
  const ratingByAbbr = new Map((input.currentRatings ?? []).map((rating) => [rating.abbr, rating]));
  const seenGameIds = new Set<string>();
  const duplicateGameIds = new Set<string>();
  const unresolvedTeamGameIds: string[] = [];
  const missingMarketGameIds: string[] = [];
  const missingProjectionGameIds: string[] = [];
  const missingRatingTeamAbbrs = new Set<string>();
  let malformedGameCount = 0;
  const dashboardGames: WeeklyDashboardGame[] = [];

  for (const game of input.games) {
    if (game.seasonType !== "REG" || game.season !== input.season || game.week !== input.week) continue;
    if (!game.gameId || !game.awayAbbr || !game.homeAbbr) {
      malformedGameCount += 1;
      continue;
    }
    if (seenGameIds.has(game.gameId)) {
      duplicateGameIds.add(game.gameId);
      continue;
    }
    seenGameIds.add(game.gameId);

    const awayIdentity = teamByAbbr.get(game.awayAbbr);
    const homeIdentity = teamByAbbr.get(game.homeAbbr);
    if (!awayIdentity || !homeIdentity) {
      unresolvedTeamGameIds.push(game.gameId);
      continue;
    }

    const awayRating = ratingByAbbr.get(game.awayAbbr);
    const homeRating = ratingByAbbr.get(game.homeAbbr);
    if (!awayRating) missingRatingTeamAbbrs.add(game.awayAbbr);
    if (!homeRating) missingRatingTeamAbbrs.add(game.homeAbbr);
    const away = toTeam(awayIdentity, awayRating);
    const home = toTeam(homeIdentity, homeRating);
    const market = currentMarketFor(input.marketArtifact ?? null, game.gameId);
    const projection = projectionFor(input.projectionsArtifact ?? null, game.gameId);
    if (!market) missingMarketGameIds.push(game.gameId);
    if (!projection) missingProjectionGameIds.push(game.gameId);
    const comparison = compareToMarket(projection, market);
    const leanAbbr = comparison?.leansToward?.toLowerCase() ?? null;
    const modelLeanTeam = leanAbbr === away.abbr ? away : leanAbbr === home.abbr ? home : null;
    const matchupSlug = buildMatchupSlug(away.slug, home.slug, game.neutralSite === true);

    dashboardGames.push({
      gameId: game.gameId,
      week: game.week,
      kickoffUtc: game.dateUtc,
      stadium: game.stadium,
      neutralSite: game.neutralSite === true,
      away,
      home,
      matchupSlug,
      matchupHref: `/nfl/matchups/${matchupSlug}`,
      market: market
        ? {
            homeSpread: market.spread.home,
            awaySpread: market.spread.away,
            total: market.total,
            formattedSpread: formatMarketFavoriteSpread(market),
          }
        : null,
      projection: projection
        ? {
            projectedHomeMargin: projection.projectedHomeMargin,
            formattedSpread: formatProjectedSpread(projection),
          }
        : null,
      comparison,
      formattedComparison: formatModelVsMarketDifference(comparison),
      modelLeanTeam,
      absoluteModelMarketGap:
        comparison?.difference != null && Number.isFinite(comparison.difference)
          ? Math.abs(comparison.difference)
          : null,
    });
  }

  dashboardGames.sort(
    (a, b) => finiteDateValue(a.kickoffUtc) - finiteDateValue(b.kickoffUtc) || a.gameId.localeCompare(b.gameId),
  );
  const largestModelMarketGaps = dashboardGames
    .filter((game) => game.absoluteModelMarketGap !== null)
    .sort(
      (a, b) =>
        (b.absoluteModelMarketGap ?? 0) - (a.absoluteModelMarketGap ?? 0) || a.gameId.localeCompare(b.gameId),
    );
  const fantasyLeaders = buildFantasyLeaders(input.fantasyRows);
  const powerWatch = [...ratingByAbbr.values()]
    .sort((a, b) => a.rank - b.rank || a.abbr.localeCompare(b.abbr))
    .flatMap((rating) => {
      const identity = teamByAbbr.get(rating.abbr);
      return identity ? [toTeam(identity, rating)] : [];
    })
    .slice(0, 5);
  const highestMarketTotal = dashboardGames
    .filter((game) => game.market?.total != null && Number.isFinite(game.market.total))
    .sort((a, b) => b.market!.total! - a.market!.total! || a.gameId.localeCompare(b.gameId))[0] ?? null;
  const topFantasyProjection = WEEKLY_RANKING_POSITIONS
    .flatMap((position) => fantasyLeaders[position])
    .sort((a, b) => b.projectedPpg - a.projectedPpg || a.position.localeCompare(b.position) || a.rank - b.rank)[0] ?? null;

  return {
    season: input.season,
    week: input.week,
    dateRange: buildDateRange(dashboardGames),
    games: dashboardGames,
    largestModelMarketGaps,
    fantasyLeaders,
    powerWatch,
    highlights: {
      largestGap: largestModelMarketGaps[0] ?? null,
      highestMarketTotal,
      topFantasyProjection,
    },
    diagnostics: {
      duplicateGameIds: [...duplicateGameIds].sort(),
      malformedGameCount,
      unresolvedTeamGameIds: unresolvedTeamGameIds.sort(),
      missingMarketGameIds: missingMarketGameIds.sort(),
      missingProjectionGameIds: missingProjectionGameIds.sort(),
      missingRatingTeamAbbrs: [...missingRatingTeamAbbrs].sort(),
    },
  };
}

export function isWeeklyDashboardPosition(value: FantasyPosition): value is WeeklyDashboardPosition {
  return WEEKLY_RANKING_POSITIONS.includes(value);
}
