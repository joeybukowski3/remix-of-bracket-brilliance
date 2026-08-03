/**
 * nflverse play-by-play EPA: eligible-play filter, team-game aggregation and
 * window math (Phase 6).
 *
 * Source: nflverse play-by-play releases. EPA is nflfastR's own play-level
 * `epa` column, consumed as authoritative — expected points are never
 * recomputed or re-modelled here.
 *
 * This pipeline is deliberately SEPARATE from scripts/lib/nfl-advanced-stats.mjs,
 * which derives EPA from stats_team_week for the internal power ratings. The
 * two definitions differ materially: measured across all 544 2025 regular-season
 * team-games, only 25 agreed exactly, and the league EPA/play came out at
 * +0.00747 (stats_team_week) against +0.01496 (play-by-play) — roughly a factor
 * of two. The cause is classification: stats_team_week books QB scrambles as
 * rushing, while nflfastR counts them as pass. Reconciling the power model
 * belongs in a dedicated recalibration phase, never silently inside a display
 * change, so Phase 6 leaves nfl-advanced-stats.mjs untouched.
 *
 * Attribution: nflverse / nflfastR.
 */

export const NFL_EPA_SOURCE_LABEL = "nflverse (play-by-play, nflfastR EPA)";
export const NFL_EPA_ATTRIBUTION = "EPA data: nflverse / nflfastR";

export function nflversePbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}

/** The only play-by-play columns this pipeline reads. */
export const REQUIRED_PBP_COLUMNS = Object.freeze([
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
]);

/**
 * The approved eligible-play filter, stated once for code and provenance.
 *
 * nflfastR's own `pass` / `rush` indicators are authoritative; `play_type` is
 * never reinterpreted. Verified against the 2025 season:
 *
 *   sacks        1,352 plays, all pass=1  -> counted as PASS
 *   scrambles    1,221 plays, all pass=1  -> counted as PASS (play_type is "run")
 *   kneels         453 plays, pass=0 rush=0 -> excluded by the indicators alone
 *   spikes          82 plays, pass=0 rush=0 -> excluded by the indicators alone
 *   special teams 7,424 plays, pass=0 rush=0 -> excluded by the indicators alone
 *   aborted rushes  90 plays, rush=1      -> included
 *   penalty plays 1,999 of 3,559 carry a pass/rush indicator -> INCLUDED
 *   two-point      130 plays               -> explicitly excluded
 *
 * Penalty inclusion is counter-intuitive but correct: dropping those plays
 * moved the league figures 470x further from RBSDM's published values.
 * Excluding two-point tries moved them 55x closer, which is how that one
 * explicit exclusion was identified.
 */
export const EPA_ELIGIBLE_PLAY_FILTER =
  "(pass == 1 OR rush == 1) AND epa is present AND posteam is present AND two_point_attempt != 1";

function toInt(raw) {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "NA") return null;
  const value = Number(text);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function toFloat(raw) {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "NA") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Which unit a play belongs to, or null when it is not an eligible play.
 *
 * A play can never be both: nflfastR sets exactly one of the two indicators on
 * every play it classifies, and pass is checked first so a scramble (pass=1,
 * play_type="run") lands on pass as nflfastR intends.
 */
export function classifyPlay(row) {
  if (toInt(row.two_point_attempt) === 1) return null;
  if (String(row.posteam ?? "").trim() === "") return null;
  if (toFloat(row.epa) === null) return null;
  if (toInt(row.pass) === 1) return "pass";
  if (toInt(row.rush) === 1) return "rush";
  return null;
}

export function isEligiblePlay(row) {
  return classifyPlay(row) !== null;
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    gameId,
    season,
    week,
    team,
    opponent,
    offEpa: 0,
    offPlays: 0,
    passEpa: 0,
    passPlays: 0,
    rushEpa: 0,
    rushPlays: 0,
  };
}

/**
 * Aggregate play rows into one record per (game_id, posteam).
 *
 * Only regular-season plays are aggregated: postseason must never contaminate a
 * regular-season window, and preseason does not exist in this source at all.
 *
 * Sums are accumulated at play level and divided only later, in the window
 * math. No per-play or per-game rate is ever averaged.
 *
 * Team codes are resolved to the repository's canonical abbreviations via
 * `teamMap` (nflverse code -> teams.json entry). The compact cache is a derived
 * aggregate, not verbatim upstream bytes, so it follows the repo-wide rule that
 * generated NFL files reference teams by canonical codes; `game_id` still ties
 * every row back to the upstream source unambiguously. An unresolvable code is
 * a hard failure, never a passthrough.
 *
 * @param {Iterable<object>} rows raw play-by-play records
 * @param {{ season: number, teamMap?: Map<string, {abbr: string}> }} options
 */
export function aggregatePlays(rows, { season, teamMap = null }) {
  const resolve = (code, gameId, field) => {
    if (!teamMap) return code;
    const team = teamMap.get(code);
    if (!team) {
      throw new Error(`Unknown nflverse ${field} "${code}" in game ${gameId} — not present in teams.json`);
    }
    return team.abbr;
  };

  const byTeamGame = new Map();
  let sourceRows = 0;
  let eligiblePlays = 0;

  for (const row of rows) {
    sourceRows += 1;
    if (String(row.season_type ?? "").trim() !== "REG") continue;

    const unit = classifyPlay(row);
    if (unit === null) continue;

    const rowSeason = toInt(row.season);
    if (rowSeason !== season) {
      throw new Error(`play-by-play row season ${rowSeason} does not match requested ${season}`);
    }
    const gameId = String(row.game_id ?? "").trim();
    if (gameId === "") throw new Error("play-by-play row without game_id");
    const week = toInt(row.week);
    if (!Number.isInteger(week) || week < 1) {
      throw new Error(`Malformed week "${row.week}" in game ${gameId}`);
    }
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

    const epa = toFloat(row.epa);
    eligiblePlays += 1;
    record.offEpa += epa;
    record.offPlays += 1;
    if (unit === "pass") {
      record.passEpa += epa;
      record.passPlays += 1;
    } else {
      record.rushEpa += epa;
      record.rushPlays += 1;
    }
  }

  return { teamGames: [...byTeamGame.values()], sourceRows, eligiblePlays };
}

/**
 * Structural validation of aggregated team-game records.
 *
 * Returns a list of human-readable problems; empty means the set is sound.
 * Every check here is a hard failure upstream — a partially-formed cache must
 * never replace a known-good one.
 */
export function validateTeamGames(teamGames, { teamMap = null } = {}) {
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
    if (!(record.offPlays > 0)) problems.push(`${key}: no eligible plays`);
    if (record.passPlays < 0 || record.rushPlays < 0) problems.push(`${key}: negative play count`);
    if (record.passPlays + record.rushPlays !== record.offPlays) {
      problems.push(
        `${key}: pass ${record.passPlays} + rush ${record.rushPlays} != off ${record.offPlays}`
      );
    }
    for (const field of ["offEpa", "passEpa", "rushEpa"]) {
      if (!Number.isFinite(record[field])) problems.push(`${key}: ${field} is not finite`);
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
export const COMPACT_COLUMNS = Object.freeze([
  "game_id",
  "season",
  "week",
  "team",
  "opponent",
  "off_epa",
  "off_plays",
  "pass_epa",
  "pass_plays",
  "rush_epa",
  "rush_plays",
]);

/** Compact cache CSV. Values are written unrounded. */
export function serializeCompact(teamGames) {
  const ordered = [...teamGames].sort(
    (a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team)
  );
  const lines = [COMPACT_COLUMNS.join(",")];
  for (const r of ordered) {
    lines.push(
      [
        r.gameId, r.season, r.week, r.team, r.opponent,
        r.offEpa, r.offPlays, r.passEpa, r.passPlays, r.rushEpa, r.rushPlays,
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Parse one compact cache row, rejecting anything malformed. */
export function parseCompactRow(row) {
  const gameId = String(row.game_id ?? "").trim();
  if (gameId === "") throw new Error("compact cache row without game_id");

  const num = (field, integer) => {
    const text = String(row[field] ?? "").trim();
    if (text === "") throw new Error(`${gameId}: missing ${field}`);
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`${gameId}: ${field} "${row[field]}" is not finite`);
    if (integer && !Number.isInteger(value)) throw new Error(`${gameId}: ${field} must be an integer`);
    return value;
  };

  return {
    gameId,
    season: num("season", true),
    week: num("week", true),
    team: String(row.team ?? "").trim(),
    opponent: String(row.opponent ?? "").trim(),
    offEpa: num("off_epa", false),
    offPlays: num("off_plays", true),
    passEpa: num("pass_epa", false),
    passPlays: num("pass_plays", true),
    rushEpa: num("rush_epa", false),
    rushPlays: num("rush_plays", true),
  };
}

/**
 * Sum a set of team-game records into window totals.
 *
 * Deliberately returns sums, not rates. Dividing happens once, in
 * windowMetrics(), because an equal-weight mean of per-game rates is a
 * different number: for Kansas City's 2025 Last 5 the two differ by 0.0099,
 * which is visible at the three decimals this metric displays.
 */
export function sumWindow(records) {
  const totals = { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 };
  for (const r of records) {
    totals.offEpa += r.offEpa;
    totals.offPlays += r.offPlays;
    totals.passEpa += r.passEpa;
    totals.passPlays += r.passPlays;
    totals.rushEpa += r.rushEpa;
    totals.rushPlays += r.rushPlays;
  }
  return totals;
}

const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

/**
 * The six metric values for one team over one window.
 *
 * `offense` totals are the team's own; `defense` totals are the opponents'
 * offensive production in those same games, so the two are internally
 * consistent by construction.
 */
export function windowMetrics(offenseTotals, defenseTotals) {
  return {
    "off.epaPerPlay": ratio(offenseTotals.offEpa, offenseTotals.offPlays),
    "off.epaPerPass": ratio(offenseTotals.passEpa, offenseTotals.passPlays),
    "off.epaPerRush": ratio(offenseTotals.rushEpa, offenseTotals.rushPlays),
    "def.epaPerPlayAllowed": ratio(defenseTotals.offEpa, defenseTotals.offPlays),
    "def.epaPerPassAllowed": ratio(defenseTotals.passEpa, defenseTotals.passPlays),
    "def.epaPerRushAllowed": ratio(defenseTotals.rushEpa, defenseTotals.rushPlays),
  };
}

/** Ranking direction per metric. Offense higher-is-better, defense lower. */
export const EPA_METRIC_DIRECTIONS = Object.freeze({
  "off.epaPerPlay": "higher-is-better",
  "off.epaPerPass": "higher-is-better",
  "off.epaPerRush": "higher-is-better",
  "def.epaPerPlayAllowed": "lower-is-better",
  "def.epaPerPassAllowed": "lower-is-better",
  "def.epaPerRushAllowed": "lower-is-better",
});

export const EPA_METRIC_KEYS = Object.freeze(Object.keys(EPA_METRIC_DIRECTIONS));

/** EPA is displayed to three decimals; ranking always uses the raw double. */
export const EPA_DISPLAY_DECIMALS = 3;

/**
 * Index compact records by `${gameId}|${team}` for exact opponent joins.
 * Defence is never derived from team names or schedule order.
 */
export function indexTeamGames(records) {
  const index = new Map();
  for (const r of records) index.set(`${r.gameId}|${r.team}`, r);
  return index;
}

/**
 * The opponent's offensive record for one of a team's games.
 * Throws rather than returning partial defence when the row is absent.
 */
export function opponentRecord(index, record) {
  const opponent = index.get(`${record.gameId}|${record.opponent}`);
  if (!opponent) {
    throw new Error(
      `No opponent row for ${record.team} in ${record.gameId} (expected ${record.opponent}) — refusing to produce partial defensive EPA`
    );
  }
  return opponent;
}
