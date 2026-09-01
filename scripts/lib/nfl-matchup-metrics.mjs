/**
 * Conventional team metrics for the NFL matchup analyzer (Phase 2).
 *
 * Pure aggregation: no I/O, no network. The generator script supplies parsed
 * inputs; everything here is deterministic so it can be unit tested directly.
 *
 * Source: the nflverse stats_team weekly release already cached in this repo at
 * data/nfl/nflverse/stats-team-week/stats_team_week_<season>.csv, parsed through
 * the existing, validated parseAdvancedTeamStatRows() helper. Points come from
 * public/data/nfl/<season>/results.json. TeamRankings is deliberately not used:
 * its stat pages sit behind an AWS WAF challenge and it exposes no cross-season
 * game-level window, which this phase requires.
 *
 * Definitional conventions (kept identical to the existing v0.2 pipeline in
 * scripts/lib/nfl-advanced-stats.mjs so the analyzer never disagrees with the
 * power model about the same quantity):
 *   offensive plays = pass attempts + sacks taken + carries
 *   passing plays   = pass attempts + sacks taken
 *   offensive yards = passing yards + rushing yards
 *
 * Note that passing yards are GROSS of sack yardage (nflverse `passing_yards`
 * excludes sack losses, which are carried separately in `sack_yards_lost`).
 * Sack cost is therefore surfaced through Sacks Allowed / Game rather than being
 * netted out of yardage. This matches Pro-Football-Reference's Y/A convention
 * and the NFL passer-rating definition; it will read slightly higher than sites
 * that publish net passing yards.
 */

// ---------------------------------------------------------------------------
// Metric catalogue (generator side)
// ---------------------------------------------------------------------------

/**
 * Ranking direction and display precision per metric.
 *
 * `context-only` metrics describe play-style or volume: being first in pass
 * attempts is not "elite", so the UI renders their rank without quality tier
 * colouring. Direction here is asserted against the UI catalogue in
 * src/lib/nfl/matchupMetricsData.test.ts so the two can never drift.
 */
export const MATCHUP_METRIC_DEFS = Object.freeze({
  // Offense — overall
  "off.yardsPerPlay": { direction: "higher-is-better", decimals: 2 },
  "off.pointsPerGame": { direction: "higher-is-better", decimals: 1 },
  "off.turnoversPerGame": { direction: "lower-is-better", decimals: 2 },
  // Offense — passing
  "off.passPlayRate": { direction: "context-only", decimals: 1 },
  "off.passAttemptsPerGame": { direction: "context-only", decimals: 1 },
  "off.yardsPerPassAttempt": { direction: "higher-is-better", decimals: 2 },
  "off.passYardsPerGame": { direction: "higher-is-better", decimals: 1 },
  "off.sacksAllowedPerGame": { direction: "lower-is-better", decimals: 2 },
  // Offense — rushing
  "off.rushPlayRate": { direction: "context-only", decimals: 1 },
  "off.rushAttemptsPerGame": { direction: "context-only", decimals: 1 },
  "off.yardsPerRushAttempt": { direction: "higher-is-better", decimals: 2 },
  "off.rushYardsPerGame": { direction: "higher-is-better", decimals: 1 },
  // Defense — overall
  "def.yardsPerPlayAllowed": { direction: "lower-is-better", decimals: 2 },
  "def.pointsAllowedPerGame": { direction: "lower-is-better", decimals: 1 },
  "def.takeawaysPerGame": { direction: "higher-is-better", decimals: 2 },
  // Defense — pass
  "def.opponentPasserRating": { direction: "lower-is-better", decimals: 1 },
  "def.opponentYardsPerPassAttempt": { direction: "lower-is-better", decimals: 2 },
  "def.opponentPassYardsPerGame": { direction: "lower-is-better", decimals: 1 },
  "def.sacksPerGame": { direction: "higher-is-better", decimals: 2 },
  // Defense — run
  "def.opponentYardsPerRushAttempt": { direction: "lower-is-better", decimals: 2 },
  "def.opponentRushAttemptsPerGame": { direction: "context-only", decimals: 1 },
  "def.opponentRushYardsPerGame": { direction: "lower-is-better", decimals: 1 },
});

export const MATCHUP_METRIC_KEYS = Object.freeze(Object.keys(MATCHUP_METRIC_DEFS));

/**
 * Window id for the full prior regular season (currentSeason - 1).
 *
 * Added for the /nfl/power-ratings period selector: its "2025" tab means the
 * whole 2025 regular season, which is neither a rolling-8 blend nor a Last 5.
 * The matchup analyzer itself does not surface this window; it exists only so
 * the power-ratings efficiency layer has a real full-season sample to
 * normalize against rather than approximating one from the rolling blend.
 */
export const PRIOR_SEASON_FULL_WINDOW_ID = "prior-season-full";

/**
 * Every window the EPA and conventional-metrics artifacts precompute.
 *
 * The first four are the matchup analyzer's control states; the fifth is the
 * power-ratings full-prior-season window. `mode` is consumed by
 * `selectWindowGames`.
 */
export const WINDOW_SPECS = Object.freeze([
  { id: "season-blend", mode: "season", includePriorSeason: true },
  { id: "season-current", mode: "season", includePriorSeason: false },
  { id: "last5-blend", mode: "last5", includePriorSeason: true },
  { id: "last5-current", mode: "last5", includePriorSeason: false },
  { id: PRIOR_SEASON_FULL_WINDOW_ID, mode: "priorSeasonFull", includePriorSeason: true },
]);

/** Every precomputed window id, in artifact order. */
export const WINDOW_IDS = Object.freeze(WINDOW_SPECS.map((spec) => spec.id));

export const ROLLING_BLEND_GAME_COUNT = 8;
export const LAST_N_GAME_COUNT = 5;

export function windowId(mode, includePriorSeason) {
  if (mode === "priorSeasonFull") return PRIOR_SEASON_FULL_WINDOW_ID;
  return `${mode}-${includePriorSeason ? "blend" : "current"}`;
}

// ---------------------------------------------------------------------------
// Game ordering / completion
// ---------------------------------------------------------------------------

/**
 * Chronological key for a game. Mirrors the existing Stage-1 convention:
 * dateUtc ascending, then week, then gameId — so byes, flexed games and
 * postponements order correctly without relying on week numbers.
 */
function orderKey(game) {
  const t = game.dateUtc ? Date.parse(game.dateUtc) : Number.NaN;
  return [Number.isFinite(t) ? t : Number.POSITIVE_INFINITY, game.week, game.gameId];
}

function compareGames(a, b) {
  const ka = orderKey(a);
  const kb = orderKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return String(ka[2]).localeCompare(String(kb[2]));
}

/**
 * Completed regular-season games per team, oldest first.
 *
 * A game counts only when the schedule row and the results row agree that it is
 * final, so postponed or not-yet-played games can never enter a sample. The
 * postseason is excluded entirely.
 */
export function buildCompletedGameIndex(seasons) {
  /** @type {Map<string, Array<object>>} */
  const byTeam = new Map();

  for (const { season, games = [], results = [] } of seasons) {
    const finalResults = new Map();
    for (const r of results) {
      if (r.seasonType === "REG" && r.final === true) finalResults.set(r.gameId, r);
    }

    for (const g of games) {
      if (g.seasonType !== "REG") continue;
      const result = finalResults.get(g.gameId);
      if (!result) continue; // not played / not final / postponed

      for (const side of ["home", "away"]) {
        const team = side === "home" ? result.homeAbbr : result.awayAbbr;
        const opponent = side === "home" ? result.awayAbbr : result.homeAbbr;
        const pointsFor = side === "home" ? result.homeScore : result.awayScore;
        const pointsAgainst = side === "home" ? result.awayScore : result.homeScore;
        if (!byTeam.has(team)) byTeam.set(team, []);
        byTeam.get(team).push({
          gameId: g.gameId,
          season,
          week: g.week,
          dateUtc: g.dateUtc ?? null,
          team,
          opponent,
          pointsFor,
          pointsAgainst,
        });
      }
    }
  }

  for (const list of byTeam.values()) list.sort(compareGames);
  return byTeam;
}

// ---------------------------------------------------------------------------
// Window selection
// ---------------------------------------------------------------------------

/**
 * Select the games making up one control state for one team.
 *
 * Selection is always over *completed games*, never week numbers, so a bye week
 * simply does not appear in the list and the window reaches further back
 * automatically.
 *
 * season + blend ON  — rolling eight: each completed current-season game
 *                      displaces one late prior-season game.
 * season + blend OFF — every completed current-season game (uncapped).
 * last5  + blend ON  — five most recent completed games, crossing the season
 *                      boundary while the current season is young.
 * last5  + blend OFF — up to five most recent completed current-season games.
 * priorSeasonFull    — every completed prior-season game (the /nfl/power-ratings
 *                      "2025" tab); `includePriorSeason` is ignored.
 */
export function selectWindowGames(teamGames, { mode, includePriorSeason, currentSeason, priorSeason }) {
  const current = teamGames.filter((g) => g.season === currentSeason);
  const prior = teamGames.filter((g) => g.season === priorSeason);

  if (mode === "priorSeasonFull") return prior.slice();

  if (mode === "last5") {
    if (!includePriorSeason) return current.slice(-LAST_N_GAME_COUNT);
    return prior.concat(current).slice(-LAST_N_GAME_COUNT);
  }

  if (mode === "season") {
    if (!includePriorSeason) return current.slice();
    const takeCurrent = Math.min(current.length, ROLLING_BLEND_GAME_COUNT);
    const takePrior = ROLLING_BLEND_GAME_COUNT - takeCurrent;
    return prior
      .slice(prior.length - takePrior < 0 ? 0 : prior.length - takePrior)
      .concat(current.slice(current.length - takeCurrent));
  }

  throw new Error(`Unknown sample window mode "${mode}"`);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function strictNumber(raw, field, label) {
  if (raw === undefined || raw === null || raw === "" || raw === "NA") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Malformed numeric "${field}"="${raw}" in ${label}`);
  return n;
}

/**
 * Extra raw columns not present on the shared normalized row shape.
 * parseAdvancedTeamStatRows() preserves the untouched CSV row on `.source`,
 * so these are read from there rather than widening a contract other pipelines
 * already depend on.
 */
function extras(row) {
  const label = `${row.season} week ${row.week} ${row.team}`;
  return {
    completions: strictNumber(row.source.completions, "completions", label),
    passingTds: strictNumber(row.source.passing_tds, "passing_tds", label),
    defSacks: strictNumber(row.source.def_sacks, "def_sacks", label),
  };
}

function emptyTotals() {
  return {
    games: 0,
    offPlays: 0, offYards: 0, passPlays: 0, rushPlays: 0,
    attempts: 0, passingYards: 0, carries: 0, rushingYards: 0, sacksSuffered: 0,
    turnovers: 0, takeaways: 0, points: 0, pointsAllowed: 0,
    defPlays: 0, defYards: 0,
    oppAttempts: 0, oppPassingYards: 0, oppCarries: 0, oppRushingYards: 0,
    oppCompletions: 0, oppPassingTds: 0, oppInterceptions: 0, oppSacksSuffered: 0,
    ownDefSacks: 0,
  };
}

/**
 * Standard NFL passer rating from aggregate totals.
 * Each component is clamped to [0, 2.375]; weekly ratings are never averaged.
 */
export function passerRating(completions, attempts, yards, touchdowns, interceptions) {
  if (!attempts || attempts <= 0) return null;
  const clamp = (v) => Math.min(Math.max(v, 0), 2.375);
  const a = clamp((completions / attempts - 0.3) * 5);
  const b = clamp((yards / attempts - 3) * 0.25);
  const c = clamp((touchdowns / attempts) * 20);
  const d = clamp(2.375 - (interceptions / attempts) * 25);
  return ((a + b + c + d) / 6) * 100;
}

const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

/**
 * Aggregate one team's selected games into raw (unrounded) metric values.
 *
 * Ratios are recomputed from summed numerators and denominators — never as a
 * mean of per-game rates — so yards/play, yards/attempt and play-mix shares are
 * exact for the window. Defensive values come from the opponent's row in the
 * same games via the game-id join.
 */
export function aggregateTeamWindow(selectedGames, rowsByGameTeam) {
  const totals = emptyTotals();
  const missing = [];

  for (const game of selectedGames) {
    const own = rowsByGameTeam.get(`${game.gameId}|${game.team}`);
    const opp = rowsByGameTeam.get(`${game.gameId}|${game.opponent}`);
    if (!own || !opp) {
      missing.push({ gameId: game.gameId, team: game.team, hasOwn: !!own, hasOpponent: !!opp });
      continue;
    }

    const ownX = extras(own);
    const oppX = extras(opp);

    totals.games += 1;
    totals.offPlays += own.attempts + own.sacksSuffered + own.carries;
    totals.offYards += own.passingYards + own.rushingYards;
    totals.passPlays += own.attempts + own.sacksSuffered;
    totals.rushPlays += own.carries;
    totals.attempts += own.attempts;
    totals.passingYards += own.passingYards;
    totals.carries += own.carries;
    totals.rushingYards += own.rushingYards;
    totals.sacksSuffered += own.sacksSuffered;
    totals.turnovers +=
      own.passingInterceptions + own.sackFumblesLost + own.rushingFumblesLost + own.receivingFumblesLost;
    totals.takeaways += own.defensiveInterceptions + own.opponentFumbleRecoveries;
    totals.ownDefSacks += ownX.defSacks;
    totals.points += game.pointsFor;
    totals.pointsAllowed += game.pointsAgainst;

    totals.defPlays += opp.attempts + opp.sacksSuffered + opp.carries;
    totals.defYards += opp.passingYards + opp.rushingYards;
    totals.oppAttempts += opp.attempts;
    totals.oppPassingYards += opp.passingYards;
    totals.oppCarries += opp.carries;
    totals.oppRushingYards += opp.rushingYards;
    totals.oppCompletions += oppX.completions;
    totals.oppPassingTds += oppX.passingTds;
    totals.oppInterceptions += opp.passingInterceptions;
    totals.oppSacksSuffered += opp.sacksSuffered;
  }

  const g = totals.games;
  const values = {
    "off.yardsPerPlay": ratio(totals.offYards, totals.offPlays),
    "off.pointsPerGame": ratio(totals.points, g),
    "off.turnoversPerGame": ratio(totals.turnovers, g),
    "off.passPlayRate": totals.offPlays > 0 ? (totals.passPlays / totals.offPlays) * 100 : null,
    "off.passAttemptsPerGame": ratio(totals.attempts, g),
    "off.yardsPerPassAttempt": ratio(totals.passingYards, totals.attempts),
    "off.passYardsPerGame": ratio(totals.passingYards, g),
    "off.sacksAllowedPerGame": ratio(totals.sacksSuffered, g),
    "off.rushPlayRate": totals.offPlays > 0 ? (totals.rushPlays / totals.offPlays) * 100 : null,
    "off.rushAttemptsPerGame": ratio(totals.carries, g),
    "off.yardsPerRushAttempt": ratio(totals.rushingYards, totals.carries),
    "off.rushYardsPerGame": ratio(totals.rushingYards, g),

    "def.yardsPerPlayAllowed": ratio(totals.defYards, totals.defPlays),
    "def.pointsAllowedPerGame": ratio(totals.pointsAllowed, g),
    "def.takeawaysPerGame": ratio(totals.takeaways, g),
    "def.opponentPasserRating": passerRating(
      totals.oppCompletions,
      totals.oppAttempts,
      totals.oppPassingYards,
      totals.oppPassingTds,
      totals.oppInterceptions
    ),
    "def.opponentYardsPerPassAttempt": ratio(totals.oppPassingYards, totals.oppAttempts),
    "def.opponentPassYardsPerGame": ratio(totals.oppPassingYards, g),
    // Sacks generated are read off the opponent's sacks-taken column, which is
    // the same event from the other side of the join.
    "def.sacksPerGame": ratio(totals.oppSacksSuffered, g),
    "def.opponentYardsPerRushAttempt": ratio(totals.oppRushingYards, totals.oppCarries),
    "def.opponentRushAttemptsPerGame": ratio(totals.oppCarries, g),
    "def.opponentRushYardsPerGame": ratio(totals.oppRushingYards, g),
  };

  return { values, totals, missing };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Competition ranking (1, 2, 2, 4) over the unrounded values for one metric in
 * one window. Teams without a value get no rank rather than a worst-place rank.
 * Ties are detected on the raw double, so display rounding can never change a
 * rank. Ordering within a tie group is irrelevant because tied teams share a
 * rank; the returned map is therefore fully deterministic.
 */
export function computeRanks(valuesByTeam, direction) {
  const entries = Object.entries(valuesByTeam).filter(
    ([, v]) => v !== null && v !== undefined && Number.isFinite(v)
  );
  if (entries.length === 0) return {};

  const higherIsBetter = direction !== "lower-is-better";
  entries.sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]) || a[0].localeCompare(b[0]));

  const ranks = {};
  let previousValue = null;
  let previousRank = 0;
  entries.forEach(([team, value], index) => {
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
    ranks[team] = rank;
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

export function roundTo(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
