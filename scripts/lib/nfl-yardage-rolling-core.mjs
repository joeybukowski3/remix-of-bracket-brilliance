/**
 * Generic leakage-safe trailing-window rolling-average helpers shared by the
 * Yardage Props Review Last-10 history pipeline. Every function here takes
 * only already-normalized per-game numeric observations and returns a
 * pregame (strictly-prior-games-only) rolling average keyed by the same
 * `${key}|${season}|${week}` convention `nfl-epa-week-rank-core.mjs` uses --
 * never the game itself, never a future game.
 *
 * Pure, dependency-free.
 */

export const DEFAULT_TRAILING_GAMES = 10;

/**
 * @param {Map<string, number>} perGameByKey - key `${entity}|${season}|${week}` -> one game's value.
 * @param {number} [windowSize]
 * @returns {Map<string, { avg: number | null, gamesIncluded: number }>} same keys -> pregame trailing average.
 */
export function buildTrailingPregameAverage(perGameByKey, windowSize = DEFAULT_TRAILING_GAMES) {
  const byEntity = new Map();
  for (const [key, value] of perGameByKey) {
    const [entity, seasonStr, weekStr] = key.split("|");
    const season = Number(seasonStr);
    const week = Number(weekStr);
    const list = byEntity.get(entity) ?? [];
    list.push({ season, week, value });
    byEntity.set(entity, list);
  }

  const out = new Map();
  for (const [entity, games] of byEntity) {
    const sorted = [...games].sort((a, b) => a.season - b.season || a.week - b.week);
    sorted.forEach((game, index) => {
      const prior = sorted.slice(Math.max(0, index - windowSize), index);
      const avg = prior.length > 0 ? prior.reduce((sum, g) => sum + g.value, 0) / prior.length : null;
      out.set(`${entity}|${game.season}|${game.week}`, { avg, gamesIncluded: prior.length });
    });
  }
  return out;
}

/** True when a player-week stat row's position belongs to the requested market/position slice -- mirrors `nfl-production-allowed-core.mjs`'s position rules exactly. */
export function statRowMatchesPosition(market, position, rowPosition) {
  if (market === "passing") return rowPosition === "QB";
  if (market === "rushing") return position === "ALL" ? true : rowPosition === position;
  return rowPosition === position; // receiving: position-specific only, no ALL slice.
}

/** Literal yards for one market from a normalized stat row. */
export function yardsForMarket(market, row) {
  if (market === "passing") return row.passingYards;
  if (market === "rushing") return row.rushingYards;
  return row.receivingYards;
}

/**
 * Sum one market/position's yards allowed per (defense team, season, week)
 * game, from every stat row whose position matches. Multiple opposing
 * players in the same game contributing to one position slice (e.g. two
 * WRs) are summed, matching the existing season/last5 production-allowed
 * artifact's methodology.
 *
 * @param {ReadonlyArray<{season:number, week:number, opponentTeam:string, position:string, passingYards:number, rushingYards:number, receivingYards:number}>} rows
 * @returns {Map<string, number>} key `${defenseTeam}|${season}|${week}` -> total yards allowed that game.
 */
export function buildYardsAllowedPerGame(rows, market, position) {
  const perGame = new Map();
  for (const row of rows) {
    if (!statRowMatchesPosition(market, position, row.position)) continue;
    const key = `${row.opponentTeam}|${row.season}|${row.week}`;
    perGame.set(key, (perGame.get(key) ?? 0) + yardsForMarket(market, row));
  }
  return perGame;
}

/**
 * A single player's own per-game yards for one market, keyed by
 * `${playerId}|${season}|${week}` -- feeds {@link buildTrailingPregameAverage}
 * to produce "this player's pregame trailing YPG entering game G".
 *
 * @param {ReadonlyArray<{season:number, week:number, playerId:string, position:string, passingYards:number, rushingYards:number, receivingYards:number}>} rows
 */
export function buildPlayerYardsPerGame(rows, market) {
  const perGame = new Map();
  for (const row of rows) {
    const key = `${row.playerId}|${row.season}|${row.week}`;
    perGame.set(key, yardsForMarket(market, row));
  }
  return perGame;
}
