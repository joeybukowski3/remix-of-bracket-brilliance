/**
 * nflverse play-by-play first-down and third-down aggregation for the matchup
 * analyzer.
 *
 * Source: the same nflverse play-by-play release the EPA pipeline reads
 * (nflversePbpUrl in nfl-epa-core.mjs), consumed through the same eligible-play
 * classifier (classifyPlay) and the same canonical team map. Nothing here
 * re-models a play: nflfastR's own `first_down`, `third_down_converted` and
 * `third_down_failed` indicators are authoritative.
 *
 * Definitions (regular season only):
 *
 *   Eligible play  = classifyPlay(row) !== null            (pass/rush indicator,
 *                    epa present, posteam present, not a two-point try; kneels,
 *                    spikes and special teams fall out through the indicators)
 *                    AND play_type != "no_play"
 *                    AND first_down is present (0/1).
 *   First down     = eligible play with first_down == 1. `first_down` is the
 *                    single authoritative indicator; the rush/pass/penalty
 *                    components can overlap on one play (101 plays in 2025) so
 *                    they are never summed.
 *   3rd-down try   = eligible play with down == 3 AND
 *                    (third_down_converted == 1 OR third_down_failed == 1).
 *   3rd-down conv  = eligible play with third_down_converted == 1.
 *
 * Nullified plays: nflfastR labels replayed downs (offside, offsetting or
 * declined-result penalties) play_type "no_play". The down is replayed, so no
 * scrimmage play happened: they are excluded from BOTH numerator and
 * denominator of every metric, which keeps the exclusion free of selection
 * bias. The consequence is that an automatic first down awarded on a no_play
 * row (646 of 10,344 first downs in 2025) is not counted. A penalty first down
 * on a play that stands (e.g. defensive pass interference on a live pass) IS
 * counted, because the play resulted in a first down.
 *
 * Third-down penalty handling follows the native flags: a live play that gains
 * a first down through a penalty is flagged converted by nflfastR and counts as
 * a conversion; a no_play row is never an attempt, even when it awards a first
 * down. Where nflfastR sets neither flag the play is not an attempt.
 *
 * Attribution: nflverse / nflfastR.
 */

import { classifyPlay } from "./nfl-epa-core.mjs";

export const NFL_DOWNS_SOURCE_LABEL = "nflverse (play-by-play, nflfastR first-down and third-down indicators)";
export const NFL_DOWNS_ATTRIBUTION = "Down data: nflverse / nflfastR";

/** The only play-by-play columns this pipeline reads. */
export const REQUIRED_DOWNS_PBP_COLUMNS = Object.freeze([
  "game_id",
  "season",
  "season_type",
  "week",
  "posteam",
  "defteam",
  "epa",
  "pass",
  "rush",
  "two_point_attempt",
  "play_type",
  "down",
  "first_down",
  "third_down_converted",
  "third_down_failed",
]);

export const DOWNS_ELIGIBLE_PLAY_FILTER =
  "REG season AND (pass == 1 OR rush == 1) AND epa is present AND posteam is present AND two_point_attempt != 1 " +
  "AND play_type != no_play AND first_down is present";

function toInt(raw) {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "NA") return null;
  const value = Number(text);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * Classify one play row.
 *
 * Returns null when the play is not eligible, otherwise
 * `{ firstDown, thirdAttempt, thirdConversion }` as 0/1 flags.
 */
export function classifyDownsPlay(row) {
  if (classifyPlay(row) === null) return null;
  if (String(row.play_type ?? "").trim() === "no_play") return null;

  const firstDown = toInt(row.first_down);
  if (firstDown !== 0 && firstDown !== 1) return null;

  const converted = toInt(row.third_down_converted) === 1;
  const failed = toInt(row.third_down_failed) === 1;
  const thirdAttempt = toInt(row.down) === 3 && (converted || failed) ? 1 : 0;

  return {
    firstDown,
    thirdAttempt,
    thirdConversion: thirdAttempt === 1 && converted ? 1 : 0,
  };
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return { gameId, season, week, team, opponent, plays: 0, firstDowns: 0, thirdAttempts: 0, thirdConversions: 0 };
}

/**
 * Aggregate play rows into one record per (game_id, posteam).
 *
 * Regular season only. Team codes resolve through `teamMap` to canonical
 * abbreviations; an unresolvable code is a hard failure, never a passthrough.
 *
 * @param {Iterable<object>} rows raw play-by-play records
 * @param {{ season: number, teamMap?: Map<string, {abbr: string}> }} options
 */
export function aggregateDownsPlays(rows, { season, teamMap = null }) {
  const resolve = (code, gameId, field) => {
    if (!teamMap) return code;
    const team = teamMap.get(code);
    if (!team) throw new Error(`Unknown nflverse ${field} "${code}" in game ${gameId} — not present in teams.json`);
    return team.abbr;
  };

  const byTeamGame = new Map();
  let sourceRows = 0;
  let eligiblePlays = 0;

  for (const row of rows) {
    sourceRows += 1;
    if (String(row.season_type ?? "").trim() !== "REG") continue;

    const play = classifyDownsPlay(row);
    if (play === null) continue;

    const rowSeason = toInt(row.season);
    if (rowSeason !== season) {
      throw new Error(`play-by-play row season ${rowSeason} does not match requested ${season}`);
    }
    const gameId = String(row.game_id ?? "").trim();
    if (gameId === "") throw new Error("play-by-play row without game_id");
    const week = toInt(row.week);
    if (!Number.isInteger(week) || week < 1) throw new Error(`Malformed week "${row.week}" in game ${gameId}`);
    const rawOpponent = String(row.defteam ?? "").trim();
    if (rawOpponent === "") throw new Error(`Missing defteam on an eligible play in game ${gameId}`);

    const team = resolve(String(row.posteam).trim(), gameId, "posteam");
    const opponent = resolve(rawOpponent, gameId, "defteam");
    const key = `${gameId}|${team}`;
    let record = byTeamGame.get(key);
    if (!record) {
      record = emptyTeamGame(gameId, season, week, team, opponent);
      byTeamGame.set(key, record);
    }

    eligiblePlays += 1;
    record.plays += 1;
    record.firstDowns += play.firstDown;
    record.thirdAttempts += play.thirdAttempt;
    record.thirdConversions += play.thirdConversion;
  }

  return { teamGames: [...byTeamGame.values()], sourceRows, eligiblePlays };
}

/** Structural validation of aggregated team-game records; empty result means sound. */
export function validateDownsTeamGames(teamGames, { teamMap = null } = {}) {
  const problems = [];
  const seen = new Set();
  const byGame = new Map();

  for (const record of teamGames) {
    const key = `${record.gameId}|${record.team}`;
    if (seen.has(key)) problems.push(`duplicate team-game row ${key}`);
    seen.add(key);
    if (!byGame.has(record.gameId)) byGame.set(record.gameId, []);
    byGame.get(record.gameId).push(record);

    if (teamMap) {
      if (!teamMap.has(record.team)) problems.push(`${key}: unknown team code "${record.team}"`);
      if (!teamMap.has(record.opponent)) problems.push(`${key}: unknown opponent code "${record.opponent}"`);
    }
    if (!(record.plays > 0)) problems.push(`${key}: no eligible plays`);
    if (record.firstDowns < 0 || record.firstDowns > record.plays) {
      problems.push(`${key}: first downs ${record.firstDowns} outside 0..${record.plays}`);
    }
    if (record.thirdAttempts < 0 || record.thirdAttempts > record.plays) {
      problems.push(`${key}: third-down attempts ${record.thirdAttempts} outside 0..${record.plays}`);
    }
    if (record.thirdConversions < 0 || record.thirdConversions > record.thirdAttempts) {
      problems.push(`${key}: third-down conversions ${record.thirdConversions} exceed attempts ${record.thirdAttempts}`);
    }
  }

  for (const [gameId, sides] of byGame) {
    if (sides.length !== 2) {
      problems.push(`game ${gameId}: expected exactly 2 team rows, got ${sides.length}`);
      continue;
    }
    const [a, b] = sides;
    if (a.opponent !== b.team || b.opponent !== a.team) {
      problems.push(`game ${gameId}: opponents are not reciprocal (${a.team}/${a.opponent} vs ${b.team}/${b.opponent})`);
    }
  }
  return problems;
}

/** Serialization column order for the committed compact cache. */
export const DOWNS_COMPACT_COLUMNS = Object.freeze([
  "game_id",
  "season",
  "week",
  "team",
  "opponent",
  "plays",
  "first_downs",
  "third_attempts",
  "third_conversions",
]);

export function serializeDownsCompact(teamGames) {
  const ordered = [...teamGames].sort(
    (a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team)
  );
  const lines = [DOWNS_COMPACT_COLUMNS.join(",")];
  for (const r of ordered) {
    lines.push([r.gameId, r.season, r.week, r.team, r.opponent, r.plays, r.firstDowns, r.thirdAttempts, r.thirdConversions].join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Parse one compact cache row, rejecting anything malformed. */
export function parseDownsCompactRow(row) {
  const gameId = String(row.game_id ?? "").trim();
  if (gameId === "") throw new Error("downs cache row without game_id");
  const int = (field) => {
    const text = String(row[field] ?? "").trim();
    if (text === "") throw new Error(`${gameId}: missing ${field}`);
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${gameId}: ${field} "${row[field]}" must be a non-negative integer`);
    return value;
  };
  return {
    gameId,
    season: int("season"),
    week: int("week"),
    team: String(row.team ?? "").trim(),
    opponent: String(row.opponent ?? "").trim(),
    plays: int("plays"),
    firstDowns: int("first_downs"),
    thirdAttempts: int("third_attempts"),
    thirdConversions: int("third_conversions"),
  };
}

/** Index compact records by `${gameId}|${team}` for exact opponent joins. */
export function indexDownsTeamGames(records) {
  const index = new Map();
  for (const r of records) index.set(`${r.gameId}|${r.team}`, r);
  return index;
}

export function emptyDownsTotals() {
  return { plays: 0, firstDowns: 0, thirdAttempts: 0, thirdConversions: 0 };
}

export function addDownsTotals(totals, record) {
  totals.plays += record.plays;
  totals.firstDowns += record.firstDowns;
  totals.thirdAttempts += record.thirdAttempts;
  totals.thirdConversions += record.thirdConversions;
  return totals;
}

const percent = (numerator, denominator) => (denominator > 0 ? (numerator / denominator) * 100 : null);

/**
 * The four matchup metric values (percent, 0-100) for one team over one window.
 * `offense` totals are the team's own rows; `defense` totals are the opponents'
 * rows in the same games, so the two sides come from identical play rows.
 */
export function downsWindowMetrics(offense, defense) {
  return {
    "off.firstDownsPerPlay": percent(offense.firstDowns, offense.plays),
    "def.firstDownsPerPlayAllowed": percent(defense.firstDowns, defense.plays),
    "off.thirdDownConversion": percent(offense.thirdConversions, offense.thirdAttempts),
    "def.thirdDownConversionAllowed": percent(defense.thirdConversions, defense.thirdAttempts),
  };
}

/**
 * League mirror check: summed over all teams, offensive totals must equal
 * defensive totals, because each side is read from the same plays.
 */
export function mirrorProblems(offenseByTeam, defenseByTeam) {
  const sum = (byTeam) => Object.values(byTeam).reduce((acc, t) => addDownsTotals(acc, t), emptyDownsTotals());
  const off = sum(offenseByTeam);
  const def = sum(defenseByTeam);
  return Object.keys(off)
    .filter((field) => off[field] !== def[field])
    .map((field) => `league ${field}: offense ${off[field]} != defense ${def[field]}`);
}
