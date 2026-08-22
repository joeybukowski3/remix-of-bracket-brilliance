/**
 * Selected-week fantasy matchup context — V1 data layer.
 *
 * This module does NOT provide true weekly rankings. `projectedPpg` and the
 * resulting order are season baselines. The Weekly Rankings route deliberately
 * does not render these rows until a canonical player-level weekly projection
 * or deterministic weekly score exists.
 *
 * BASELINE ORDER ONLY: projected PPG, and nothing else. Rows are sorted by the
 * approved `2026 Projected PPG` already published through
 * `src/lib/fantasy/parRankings.ts`. No projection is created, adjusted or
 * re-derived here, and PAR arithmetic is untouched. The matchup grade and the
 * fantasy-points-allowed columns are informational context rendered beside the
 * row — `weeklyRankings.test.ts` asserts that removing them leaves the order
 * identical.
 *
 * Because a position's PAR replacement baseline is a single constant (verified:
 * one distinct `replacementPpg` per position across the whole board), ordering
 * by projected PPG and ordering by PAR/G are the same ordering within a
 * position. This page therefore agrees with the PAR research board by
 * construction rather than by coincidence.
 *
 * Every join reuses an existing canonical source:
 *   - player universe, name, team, PPG  -> FANTASY_POSITION_RESEARCH_BOARDS
 *   - selected opponent + home/away     -> public/data/nfl/<season>/games.json
 *   - opponent fantasy points allowed   -> pointsAllowed2025.ts (2025 actual)
 *   - team offensive context stats      -> the generated NFL matchup artifacts
 *
 * Nothing here fetches. Callers pass already-loaded artifacts in, matching how
 * every other NFL surface in this repo is built.
 */

import { getMatchupGrade, type MatchupGrade } from "@/lib/fantasy/matchupGrade";
import { FANTASY_POSITION_RESEARCH_BOARDS } from "@/lib/fantasy/parRankings";
import {
  getPointsAllowedTeam,
  normalizeOpponentCode,
  type PointsAllowedEntry,
} from "@/lib/fantasy/pointsAllowed2025";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { NflMetricDirection } from "@/lib/nfl/matchupMetrics";
import type { NflGameRecord } from "@/lib/nfl/standings";

/** The season this V1 page ranks. */
export const WEEKLY_RANKINGS_SEASON = 2026;
/** Preseason and invalid-query fallback week. */
export const WEEKLY_RANKINGS_WEEK = 1;

/** Positions this page supports. K and DST are deliberately out of V1. */
export const WEEKLY_RANKING_POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];
/** QB opens the page. */
export const DEFAULT_WEEKLY_RANKING_POSITION: FantasyPosition = "QB";

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type WeeklyOpponent = {
  gameId: string;
  /** Canonical lowercase opponent abbreviation. */
  opponentAbbr: string;
  isHome: boolean;
  neutralSite: boolean;
};

/**
 * One week of the canonical schedule as a team -> opponent lookup.
 *
 * Regular season only, and a team that somehow appears twice in a week keeps
 * its first game rather than being silently overwritten — a duplicate is a
 * schedule defect, not something to resolve by guessing.
 */
export function buildWeekOpponentMap(
  games: readonly NflGameRecord[],
  week: number,
): Map<string, WeeklyOpponent> {
  const map = new Map<string, WeeklyOpponent>();
  for (const game of games) {
    if (game.seasonType !== "REG" || game.week !== week) continue;
    if (!game.homeAbbr || !game.awayAbbr) continue;
    if (!map.has(game.homeAbbr)) {
      map.set(game.homeAbbr, {
        gameId: game.gameId,
        opponentAbbr: game.awayAbbr,
        isHome: true,
        neutralSite: game.neutralSite === true,
      });
    }
    if (!map.has(game.awayAbbr)) {
      map.set(game.awayAbbr, {
        gameId: game.gameId,
        opponentAbbr: game.homeAbbr,
        isHome: false,
        neutralSite: game.neutralSite === true,
      });
    }
  }
  return map;
}

/**
 * Opponent notation: `vs TB` at home, `@ CLE` away, `N TB` at a neutral site.
 * Neutral is called out rather than folded into "vs" because neither team is
 * actually hosting.
 */
export function formatOpponentLabel(opponent: WeeklyOpponent | null): string {
  if (!opponent) return "—";
  const code = opponent.opponentAbbr.toUpperCase();
  if (opponent.neutralSite) return `N ${code}`;
  return opponent.isHome ? `vs ${code}` : `@ ${code}`;
}

// ---------------------------------------------------------------------------
// Per-position context stats
// ---------------------------------------------------------------------------

/** Which generated artifact a context stat is read from. */
export type WeeklyStatSource = "epa" | "metrics" | "success";

export type WeeklyStatColumn = {
  id: string;
  /** Column header. Kept short — these columns are secondary to PPG. */
  label: string;
  /** Longer form for the header `title` and the mobile label. */
  description: string;
  source: WeeklyStatSource;
  /** Metric key inside that artifact. */
  metricKey: string;
  /**
   * Orientation, stated explicitly per column rather than assumed.
   *
   * Percentile and gradient both read this, so a future lower-is-better metric
   * (sacks allowed, turnovers) can be added to any position below without
   * touching the percentile engine. `weeklyRankings.test.ts` asserts every
   * value here matches the canonical declaration in `matchupMetrics.ts`, so the
   * two cannot drift apart silently.
   */
  direction: NflMetricDirection;
};

/** One resolved context stat. `rank` is the team's 1-32 league rank, when ranked. */
export type TeamStatValue = {
  /** Pre-formatted raw value, e.g. "+0.119" / "5.42" / "43.0%". */
  display: string;
  /** Unformatted raw value — what sorting compares, so no precision is lost. */
  raw: number;
  rank: number | null;
  /** 0-100 against the 32-team population for this metric; null when missing. */
  percentile: number | null;
};

/**
 * Resolves one team's context stat. The page supplies this from the loaded
 * artifacts; tests supply a stub. Returning null renders "N/A" — a missing
 * artifact never blocks the page.
 */
export type TeamStatResolver = (
  teamAbbr: string,
  column: WeeklyStatColumn,
) => TeamStatValue | null;

/**
 * The context columns for each position, chosen from stats that already exist
 * in the generated artifacts for all 32 teams. Every one is the PLAYER'S OWN
 * TEAM offensive environment, not the opponent — opponent context is carried by
 * the FPA columns and the matchup grade.
 *
 * Positions deliberately do not share a column set. There is no player-level
 * usage data in this repo (no target share, no carry share, no snap share), so
 * nothing here pretends to describe individual usage; these are team signals
 * and are labelled as such in the UI.
 *
 * TE is the shortest set on purpose. Team passing metrics cannot separate a
 * tight end from a wide receiver, so TE-specific fantasy points allowed stays
 * the primary matchup distinction for the position and is not diluted by extra
 * columns that would say the same thing as the WR board.
 */
export const WEEKLY_STAT_COLUMNS: Record<FantasyPosition, readonly WeeklyStatColumn[]> = {
  QB: [
    {
      id: "passEpa",
      label: "Pass EPA",
      description: "Team offensive EPA per pass play",
      source: "epa",
      metricKey: "off.epaPerPass",
      direction: "higher-is-better",
    },
    {
      id: "rushEpa",
      label: "Rush EPA",
      description: "Team offensive EPA per rush play",
      source: "epa",
      metricKey: "off.epaPerRush",
      direction: "higher-is-better",
    },
    {
      id: "ypa",
      label: "YPA",
      description: "Team passing yards per attempt",
      source: "metrics",
      metricKey: "off.yardsPerPassAttempt",
      direction: "higher-is-better",
    },
  ],
  RB: [
    {
      id: "rushEpa",
      label: "Rush EPA",
      description: "Team offensive EPA per rush play",
      source: "epa",
      metricKey: "off.epaPerRush",
      direction: "higher-is-better",
    },
    {
      id: "ypc",
      label: "Y/C",
      description: "Team rushing yards per carry",
      source: "metrics",
      metricKey: "off.yardsPerRushAttempt",
      direction: "higher-is-better",
    },
    {
      id: "rushSuccess",
      label: "Rush Succ%",
      description: "Team rushing success rate",
      source: "success",
      metricKey: "off.rushSuccessRate",
      direction: "higher-is-better",
    },
  ],
  WR: [
    {
      id: "passEpa",
      label: "Pass EPA",
      description: "Team offensive EPA per pass play",
      source: "epa",
      metricKey: "off.epaPerPass",
      direction: "higher-is-better",
    },
    {
      id: "ypa",
      label: "YPA",
      description: "Team passing yards per attempt",
      source: "metrics",
      metricKey: "off.yardsPerPassAttempt",
      direction: "higher-is-better",
    },
    {
      id: "passYards",
      label: "Pass Y/G",
      description: "Team passing yards per game",
      source: "metrics",
      metricKey: "off.passYardsPerGame",
      direction: "higher-is-better",
    },
  ],
  TE: [
    {
      id: "passEpa",
      label: "Pass EPA",
      description: "Team offensive EPA per pass play",
      source: "epa",
      metricKey: "off.epaPerPass",
      direction: "higher-is-better",
    },
    {
      id: "ypa",
      label: "YPA",
      description: "Team passing yards per attempt",
      source: "metrics",
      metricKey: "off.yardsPerPassAttempt",
      direction: "higher-is-better",
    },
  ],
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Why a row has no opponent. Rendered explicitly rather than left blank. */
export type WeeklyUnresolvedReason = "no-team" | "no-game";

export type WeeklyRankingRow = {
  /** Stable key from the PAR source id. */
  key: string;
  /** 1-based season-baseline rank within the position, never a weekly rank. */
  rank: number;
  player: string;
  position: FantasyPosition;
  /** Canonical lowercase abbreviation, or null for a teamless player. */
  teamAbbr: string | null;
  projectedPpg: number;
  opponent: WeeklyOpponent | null;
  /** `vs TB` / `@ CLE` / `N TB`, or an em dash when unresolved. */
  opponentLabel: string;
  /** The opponent's 2025 fantasy points allowed to THIS row's position. */
  fpa: PointsAllowedEntry | null;
  grade: MatchupGrade | null;
  /** Aligned 1:1 with `WEEKLY_STAT_COLUMNS[position]`. */
  stats: readonly (TeamStatValue | null)[];
  /** Set only when there is no opponent, naming which link failed. */
  unresolvedReason?: WeeklyUnresolvedReason;
};

/**
 * Season-baseline player context at one position, ordered by projected PPG.
 * This deterministic order supports research/tests but is not weekly authority
 * and must not be published as the Weekly Rankings order.
 *
 * A player with no resolvable team, or whose team has no game that week (a bye
 * in a later week, or a schedule gap), still appears — projected PPG is the
 * ranking authority and it is known for them. Their opponent, FPA and grade
 * render as dashes and `unresolvedReason` names the missing link, so the row
 * fails visibly instead of showing a guessed matchup.
 */
export function buildWeeklyRankingRows(
  position: FantasyPosition,
  opponentMap: ReadonlyMap<string, WeeklyOpponent>,
  resolveStat: TeamStatResolver,
): WeeklyRankingRow[] {
  const columns = WEEKLY_STAT_COLUMNS[position];

  const ranked = FANTASY_POSITION_RESEARCH_BOARDS[position].tierGroups
    .flatMap((group) => group.rows)
    .filter((row) => row.par != null)
    // Projected PPG descending is the only ordering. PAR rank breaks exact
    // ties so the list is deterministic across renders.
    .sort((a, b) => b.par!.projectedPpg - a.par!.projectedPpg || a.par!.parRank - b.par!.parRank);

  return ranked.map((row, index): WeeklyRankingRow => {
    // A code that does not resolve to one of the 32 canonical defenses (the
    // PAR source's "FA", or anything malformed) is treated as no team at all
    // rather than as a team with no game — the two failures read differently.
    const normalized = normalizeOpponentCode(row.team);
    const teamAbbr = normalized && getPointsAllowedTeam(normalized) ? normalized : null;
    const opponent = teamAbbr ? (opponentMap.get(teamAbbr) ?? null) : null;

    const opponentTeam = opponent ? getPointsAllowedTeam(opponent.opponentAbbr) : undefined;
    const fpa = opponentTeam ? opponentTeam.byPosition[position] : null;

    const unresolvedReason: WeeklyUnresolvedReason | undefined = teamAbbr
      ? opponent
        ? undefined
        : "no-game"
      : "no-team";

    return {
      key: row.key,
      rank: index + 1,
      player: row.player,
      position,
      teamAbbr,
      projectedPpg: row.par!.projectedPpg,
      opponent,
      opponentLabel: formatOpponentLabel(opponent),
      fpa,
      grade: getMatchupGrade(fpa?.rank),
      stats: columns.map((column) => (teamAbbr ? resolveStat(teamAbbr, column) : null)),
      ...(unresolvedReason ? { unresolvedReason } : {}),
    };
  });
}
