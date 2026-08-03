/**
 * Descriptive market profile consumption (Phase 5).
 *
 * Reads the generated public/data/nfl/matchup-market.json artifact. nflverse is
 * never called from the browser.
 *
 * Source wording matters here. nfldata publishes a single market line per game
 * and does not disclose the underlying sportsbook composition, so this module
 * never names a book and never claims a multi-book consensus. Completed-game
 * values are described as the settled historical market line, not an
 * independently verified sportsbook closing line.
 *
 * Two concepts are kept strictly separate:
 *   CURRENT MARKET  this matchup's line, moneyline and total
 *   TEAM PROFILE    how each team has performed against past market lines
 *
 * The team profile never feeds the current line, and the current line is never
 * used to grade history.
 *
 * Nothing here computes a projected spread, fair spread, model edge, win
 * probability, pick, confidence, expected value or stake size.
 *
 * Attribution: nflverse / nfldata.
 */

import type { NflMatchupMetricResolver, NflMatchupMetricValue } from "@/lib/nfl/matchupMetrics";

export const MARKET_ARTIFACT_PATH = "/data/nfl/matchup-market.json";

export type MarketPeriodKey = "2025-season" | "2025-last8" | "2026-season" | "2026-last5";

export type AtsRecord = { W: number; L: number; P: number };
export type OuRecord = { O: number; U: number; P: number };
export type WinRecord = { W: number; L: number; T: number };

export type MarketTeamProfile = {
  games: number;
  gameIds: string[];
  record: WinRecord;
  pointDifferential: number | null;
  ats: AtsRecord;
  atsDifferential: number | null;
  overUnder: OuRecord;
  homeAts: AtsRecord;
  awayAts: AtsRecord;
  homeAtsDifferential: number | null;
  awayAtsDifferential: number | null;
  homeGames: number;
  awayGames: number;
  neutralGames: number;
  favoriteAts: AtsRecord;
  underdogAts: AtsRecord;
  favoriteGames: number;
  underdogGames: number;
  pickemGames: number;
  ranks?: { atsDifferential: number | null; pointDifferential: number | null };
};

export type MarketCurrentGame = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  neutralSite: boolean;
  spread: { home: number | null; away: number | null };
  moneyline: { home: number | null; away: number | null };
  total: number | null;
  rawSpreadLine: number | null;
};

export type MarketArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string };
  schemaVersion: string;
  attribution: string;
  currentSeason: number;
  priorSeason: number;
  completedGames: Record<string, Record<string, number>>;
  periods: Record<string, { season: number; lastN: number | null; teams: Record<string, MarketTeamProfile> }>;
  currentMarket: Record<string, MarketCurrentGame>;
  provenance: {
    retrievedAt: string;
    sourceUrl: string;
    upstreamCommitSha: string | null;
    upstreamCommitAt: string | null;
    perRowTimestampAvailable: boolean;
  };
};

export const MARKET_PERIOD_LABELS: Record<MarketPeriodKey, { label: string; short: string }> = {
  "2025-season": { label: "2025 Season", short: "2025" },
  "2025-last8": { label: "2025 Last 8", short: "2025 L8" },
  "2026-season": { label: "2026 Season", short: "2026 Szn" },
  "2026-last5": { label: "2026 Last 5", short: "2026 L5" },
};

/** Completed 2026 games each team needs before the profile switches windows. */
export const MARKET_TRANSITION_GAME_COUNT = 6;

/**
 * Which periods the market profile shows.
 *
 *   both 0 completed 2026 games  -> 2025 Season + 2025 Last 8
 *   any completed, either < 6    -> 2025 Last 8 + 2026 Season
 *   both >= 6                    -> 2026 Season + 2026 Last 5
 *
 * The matchup transitions as one unit, matching Phase 3A and 3B: 6 games vs 5
 * keeps both sides in the developing state, so a bye can never leave one team
 * on a different window from its opponent. Counts are completed games, never
 * calendar week numbers.
 */
export function resolveMarketPeriods(
  awayCompleted: number,
  homeCompleted: number
): MarketPeriodKey[] {
  const away = Number.isFinite(awayCompleted) && awayCompleted > 0 ? Math.floor(awayCompleted) : 0;
  const home = Number.isFinite(homeCompleted) && homeCompleted > 0 ? Math.floor(homeCompleted) : 0;

  if (Math.max(away, home) === 0) return ["2025-season", "2025-last8"];
  if (Math.min(away, home) < MARKET_TRANSITION_GAME_COUNT) return ["2025-last8", "2026-season"];
  return ["2026-season", "2026-last5"];
}

/** Completed regular-season games for one team in one season, from the artifact. */
export function completedGamesFor(
  artifact: MarketArtifact | null,
  season: number,
  teamAbbr: string
): number {
  return artifact?.completedGames?.[String(season)]?.[teamAbbr] ?? 0;
}

const NA = "N/A";

/** "12-5-0" — pushes are always shown and never folded into wins or losses. */
export function formatAtsRecord(record: AtsRecord | null | undefined): string {
  if (!record) return NA;
  return `${record.W}-${record.L}-${record.P}`;
}

/** "11-6-0" overs-unders-pushes. */
export function formatOuRecord(record: OuRecord | null | undefined): string {
  if (!record) return NA;
  return `${record.O}-${record.U}-${record.P}`;
}

/** "12-5", or "12-4-1" when the season actually contains a tie. */
export function formatWinRecord(record: WinRecord | null | undefined): string {
  if (!record) return NA;
  return record.T > 0 ? `${record.W}-${record.L}-${record.T}` : `${record.W}-${record.L}`;
}

/** Signed one-decimal value, e.g. "+6.2" / "-1.0". */
export function formatSignedDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

/** Conventional spread, e.g. "-3.5" / "+3.5" / "PK". */
export function formatSpread(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  if (value === 0) return "PK";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

/** American odds, e.g. "-198" / "+164". */
export function formatMoneyline(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

export function formatTotal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return String(value);
}

/** Current market for one game. Absent or unpriced games return null. */
export function currentMarketFor(
  artifact: MarketArtifact | null,
  gameId: string
): MarketCurrentGame | null {
  return artifact?.currentMarket?.[gameId] ?? null;
}

/** True when at least one market field is priced. */
export function hasAnyMarket(market: MarketCurrentGame | null): boolean {
  if (!market) return false;
  return (
    market.spread.home != null ||
    market.total != null ||
    market.moneyline.home != null ||
    market.moneyline.away != null
  );
}

function profileFor(
  artifact: MarketArtifact | null,
  period: MarketPeriodKey,
  teamAbbr: string
): MarketTeamProfile | null {
  return artifact?.periods?.[period]?.teams?.[teamAbbr] ?? null;
}

/**
 * Metric values for one team/period.
 *
 * Only ATS differential and point differential carry a rank — they are the two
 * metrics where "higher is better" is meaningful. Raw ATS records, over/under
 * records, spreads, moneylines and totals are deliberately unranked, so a
 * team's over-heavy profile is never coloured as though it were good.
 */
function buildMetricValue(
  key: string,
  profile: MarketTeamProfile | null
): NflMatchupMetricValue | null {
  if (!profile) return null;

  switch (key) {
    case "mkt.record":
      return { key, value: null, rank: null, formattedValue: formatWinRecord(profile.record) };
    case "mkt.atsRecord":
      return { key, value: null, rank: null, formattedValue: formatAtsRecord(profile.ats) };
    case "mkt.overUnderRecord":
      return { key, value: null, rank: null, formattedValue: formatOuRecord(profile.overUnder) };
    case "mkt.homeAtsRecord":
      return {
        key,
        value: null,
        rank: null,
        formattedValue: profile.homeGames > 0 ? formatAtsRecord(profile.homeAts) : NA,
      };
    case "mkt.awayAtsRecord":
      return {
        key,
        value: null,
        rank: null,
        formattedValue: profile.awayGames > 0 ? formatAtsRecord(profile.awayAts) : NA,
      };
    case "mkt.pointDifferential":
      return {
        key,
        value: profile.pointDifferential,
        rank: profile.ranks?.pointDifferential ?? null,
        formattedValue: formatSignedDecimal(profile.pointDifferential),
      };
    case "mkt.atsDifferential":
      return {
        key,
        value: profile.atsDifferential,
        rank: profile.ranks?.atsDifferential ?? null,
        formattedValue: formatSignedDecimal(profile.atsDifferential),
      };
    case "mkt.atsDifferentialSplit": {
      const home = profile.homeGames > 0 ? formatSignedDecimal(profile.homeAtsDifferential) : NA;
      const away = profile.awayGames > 0 ? formatSignedDecimal(profile.awayAtsDifferential) : NA;
      return { key, value: null, rank: null, formattedValue: `${home} / ${away}` };
    }
    default:
      return null;
  }
}

/**
 * Build a team-slug resolver for one period.
 *
 * @param slugToAbbr maps the UI's guide slug to the canonical site abbreviation
 *                   the artifact is keyed by
 */
export function createMarketResolver(
  artifact: MarketArtifact | null,
  slugToAbbr: ReadonlyMap<string, string>,
  period: MarketPeriodKey
): NflMatchupMetricResolver {
  if (!artifact?.periods) return () => null;
  return (teamSlug: string, metricKey: string) => {
    const abbr = slugToAbbr.get(teamSlug);
    if (!abbr) return null;
    return buildMetricValue(metricKey, profileFor(artifact, period, abbr));
  };
}

/** One compact section-level explanation of the visible windows. */
export function describeMarketPeriods(periods: readonly MarketPeriodKey[]): string {
  if (periods.includes("2025-season")) {
    return "Market profile shows the completed 2025 regular season while 2026 has not started.";
  }
  if (periods.includes("2025-last8")) {
    return "Market profile shows 2025's closing stretch alongside the developing 2026 season.";
  }
  return "Market profile shows the 2026 regular season and its most recent five games.";
}
