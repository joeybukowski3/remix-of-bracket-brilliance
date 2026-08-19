/**
 * Season-long opponent-rank summary — the NFL running strength-of-schedule read.
 *
 * For each team this answers one question: across the games this team has
 * actually played so far this season, how good were the opponents, measured by
 * the model's own power, offense and defense ranks.
 *
 * Pattern reused from the MLB Current SOS implementation in
 * `scripts/generate-mlb-power-rankings.mjs` (`calcSos`), and the behaviours its
 * tests fix are preserved exactly:
 *
 *   - the average is taken per GAME, not per unique opponent, so a division
 *     rival played twice counts twice (MlbPowerRankings.test.ts case 15)
 *   - the divisor is the number of games counted, so the figure is weighted by
 *     games played (case 22)
 *   - no games -> null, never 0 and never a placeholder
 *
 * Two properties of this figure that a consumer must not get backwards:
 *
 *  1. DIRECTION IS INVERTED relative to MLB SOS. These are ranks, where 1 is
 *     the best team in the league, so a LOWER average opponent rank means a
 *     TOUGHER schedule. The MLB composite runs the other way (higher = tougher).
 *     Nothing here converts, inverts or ranks the result — a consumer that wants
 *     "schedule difficulty rank" must decide that ordering deliberately.
 *  2. RATINGS ARE CURRENT, NOT POINT-IN-TIME. An opponent contributes the rank
 *     it holds today, not the rank it held on the day the game was played, which
 *     is what the MLB implementation does. See `opponentRankSummary` docs below
 *     for why that choice is not neutral.
 *
 * Nothing is estimated. An opponent the rating resolver cannot answer for is
 * excluded from the average rather than being substituted with a league-average
 * placeholder, and `ratedGames` reports how many games actually backed the
 * figure so a caller can tell a full sample from a partial one.
 */

import type { HeroModelRatingResolver } from "@/lib/nfl/heroModelRatings";
import type { NflResultRecord } from "@/lib/nfl/standings";

/**
 * One team's running opponent-rank averages.
 *
 * `gamesPlayed` counts completed regular-season games. `ratedGames` counts the
 * subset whose opponent the rating resolver could answer for — the two differ
 * only when the power board is missing a team, and the averages are always over
 * `ratedGames`.
 */
export type OpponentRankSummary = {
  teamAbbr: string;
  /** Completed regular-season games played by this team this season. */
  gamesPlayed: number;
  /** Games whose opponent had a resolvable rating; the divisor of the averages. */
  ratedGames: number;
  /** Mean league power rank of opponents faced. Lower = tougher schedule. */
  avgOpponentPowerRank: number | null;
  /** Mean league offense rank of opponents faced. Lower = tougher schedule. */
  avgOpponentOffenseRank: number | null;
  /** Mean league defense rank of opponents faced. Lower = tougher schedule. */
  avgOpponentDefenseRank: number | null;
};

/** Summary for a team with nothing played yet: zero games, no fabricated figures. */
export function emptyOpponentRankSummary(teamAbbr: string): OpponentRankSummary {
  return {
    teamAbbr,
    gamesPlayed: 0,
    ratedGames: 0,
    avgOpponentPowerRank: null,
    avgOpponentOffenseRank: null,
    avgOpponentDefenseRank: null,
  };
}

/** Decimal places on a returned average. Matches the MLB SOS presentation. */
const AVERAGE_PRECISION = 1;

function mean(total: number, count: number): number | null {
  if (count <= 0) return null;
  return parseFloat((total / count).toFixed(AVERAGE_PRECISION));
}

/**
 * The opponents a team has already faced, one entry per game played.
 *
 * Completed regular-season games only, matching `countCompletedGames` in
 * trenchMetricsData.ts: `final === true` and `seasonType === "REG"`. Future and
 * in-progress games are excluded, so the list grows week by week as results
 * land. Repeats are preserved — this is a game log, not an opponent set.
 */
export function opponentsFaced(
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string
): string[] {
  if (!results) return [];
  const opponents: string[] = [];
  for (const result of results) {
    if (result.season !== season) continue;
    if (result.seasonType !== "REG" || result.final !== true) continue;
    if (result.homeAbbr === teamAbbr) opponents.push(result.awayAbbr);
    else if (result.awayAbbr === teamAbbr) opponents.push(result.homeAbbr);
  }
  return opponents;
}

/**
 * One team's running opponent-rank averages over the games it has played.
 *
 * Each opponent contributes its CURRENT rank, not the rank it held when the
 * game was played — the same choice the MLB implementation makes, and the reason
 * this figure can move in a week the team did not play: an opponent's own form
 * re-rates the schedule retroactively.
 *
 * That choice is defensible ("how good were these teams, as best we now know")
 * but it is not the only reading. A point-in-time version would answer a
 * different question — "how hard did this game look at the time" — and would
 * diverge most in exactly the situations a reader is likely to ask about: an
 * opponent that collapsed or surged after week 3. Implementing it would require
 * a weekly rank history the repository does not currently publish; the power
 * board is a single current snapshot. This is flagged rather than silently
 * settled, per the brief.
 */
export function opponentRankSummary(
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string,
  resolveRating: HeroModelRatingResolver
): OpponentRankSummary {
  const opponents = opponentsFaced(results, season, teamAbbr);
  if (opponents.length === 0) return emptyOpponentRankSummary(teamAbbr);

  let ratedGames = 0;
  let powerTotal = 0;
  // OFF/DEF can be unavailable for an opponent independently of its overall
  // rank (the two source boards can fail independently -- see
  // heroModelRatings.ts), so offense/defense keep their own divisors rather
  // than sharing `ratedGames` with the always-present overall rank.
  let offenseRatedGames = 0;
  let offenseTotal = 0;
  let defenseRatedGames = 0;
  let defenseTotal = 0;

  // One iteration per GAME, so an opponent faced twice is added twice.
  for (const opponentAbbr of opponents) {
    const rating = resolveRating(opponentAbbr);
    if (!rating) continue;
    ratedGames += 1;
    powerTotal += rating.rank;
    if (rating.offenseRank != null) {
      offenseRatedGames += 1;
      offenseTotal += rating.offenseRank;
    }
    if (rating.defenseRank != null) {
      defenseRatedGames += 1;
      defenseTotal += rating.defenseRank;
    }
  }

  return {
    teamAbbr,
    gamesPlayed: opponents.length,
    ratedGames,
    avgOpponentPowerRank: mean(powerTotal, ratedGames),
    avgOpponentOffenseRank: mean(offenseTotal, offenseRatedGames),
    avgOpponentDefenseRank: mean(defenseTotal, defenseRatedGames),
  };
}

/**
 * Opponent-rank summaries for every team named in the season's results, keyed by
 * canonical abbreviation — the same key the metric, injury, market and power-board
 * artifacts use.
 *
 * Teams are discovered from the results themselves, so a team that has not yet
 * played appears only if the caller asks for it by name via `teamAbbrs`. Those
 * teams get a zero-game summary rather than being absent, which keeps a
 * pre-Week-1 board complete without inventing figures for it.
 */
export function buildOpponentRankSummaries(
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  resolveRating: HeroModelRatingResolver,
  teamAbbrs?: readonly string[]
): Map<string, OpponentRankSummary> {
  const teams = new Set<string>(teamAbbrs ?? []);
  for (const result of results ?? []) {
    if (result.season !== season) continue;
    if (result.seasonType !== "REG" || result.final !== true) continue;
    teams.add(result.homeAbbr);
    teams.add(result.awayAbbr);
  }

  const summaries = new Map<string, OpponentRankSummary>();
  for (const teamAbbr of teams) {
    summaries.set(teamAbbr, opponentRankSummary(results, season, teamAbbr, resolveRating));
  }
  return summaries;
}
