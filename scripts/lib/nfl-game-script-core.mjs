/**
 * WU4C Part 4 research: nflverse play-by-play score-state pass/rush tendency
 * aggregation. Research-only -- not consumed by any production artifact.
 *
 * Reuses the exact same eligible-play classification as the approved
 * play-volume/EPA pipelines (`nfl-epa-core.mjs`'s `classifyPlay`) so this
 * population can never silently disagree with the production caches about
 * what counts as an offensive play.
 *
 * Score-state buckets are defined on `score_differential`, nflfastR's own
 * pre-snap (posteam perspective) score differential column -- never
 * recomputed from raw score columns. Buckets:
 *   trailing:  score_differential <= -9  (two possessions or more behind)
 *   close:     -8 <= score_differential <= 8
 *   leading:   score_differential >= 9   (two possessions or more ahead)
 * These thresholds mirror the "two possessions" boundary commonly used in
 * game-script literature and are coarser than single-score buckets, which
 * the existing `NEUTRAL_SITUATION_DEFINITION` win-probability filter already
 * covers for the "true neutral tendency" case.
 *
 * Attribution: nflverse / nflfastR.
 */

import { classifyPlay } from "./nfl-epa-core.mjs";

export const NFL_GAME_SCRIPT_SOURCE_LABEL = "nflverse (play-by-play, nflfastR score_differential)";
export const NFL_GAME_SCRIPT_ATTRIBUTION = "Game-script data: nflverse / nflfastR";

export const REQUIRED_GAME_SCRIPT_PBP_COLUMNS = Object.freeze([
  "game_id", "season", "season_type", "week", "posteam", "defteam",
  "epa", "pass", "rush", "two_point_attempt",
  "down", "half_seconds_remaining", "qtr", "score_differential",
]);

export const GAME_SCRIPT_TRAILING_THRESHOLD = -9;
export const GAME_SCRIPT_LEADING_THRESHOLD = 9;

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

export function scoreStateBucket(scoreDifferential) {
  if (scoreDifferential == null) return null;
  if (scoreDifferential <= GAME_SCRIPT_TRAILING_THRESHOLD) return "trailing";
  if (scoreDifferential >= GAME_SCRIPT_LEADING_THRESHOLD) return "leading";
  return "close";
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    gameId, season, week, team, opponent,
    firstHalf: { trailing: zeroBucket(), close: zeroBucket(), leading: zeroBucket() },
    secondHalf: { trailing: zeroBucket(), close: zeroBucket(), leading: zeroBucket() },
  };
}

function zeroBucket() {
  return { eligiblePlays: 0, passPlays: 0, rushPlays: 0 };
}

/**
 * Aggregate raw play-by-play rows into one team-game record per (game_id,
 * posteam) with pass/rush play counts split by score-state bucket and half.
 * Regular season only, mirroring `aggregatePlayVolume` in
 * `nfl-play-volume-core.mjs` exactly.
 */
export function aggregateGameScript(rows, { season, teamMap = null }) {
  const resolve = (code, gameId, field) => {
    if (!teamMap) return code;
    const team = teamMap.get(code);
    if (!team) throw new Error(`Unknown nflverse ${field} "${code}" in game ${gameId} — not present in teams.json`);
    return team.abbr;
  };

  const byTeamGame = new Map();
  let sourceRows = 0;
  let eligiblePlays = 0;
  let missingScoreDifferential = 0;

  for (const row of rows) {
    sourceRows += 1;
    if (String(row.season_type ?? "").trim() !== "REG") continue;

    const unit = classifyPlay(row);
    if (unit === null) continue;

    const rowSeason = toInt(row.season);
    if (rowSeason !== season) throw new Error(`play-by-play row season ${rowSeason} does not match requested ${season}`);
    const gameId = String(row.game_id ?? "").trim();
    if (gameId === "") throw new Error("play-by-play row without game_id");
    const week = toInt(row.week);
    if (!Number.isInteger(week) || week < 1) throw new Error(`Malformed week "${row.week}" in game ${gameId}`);
    const rawOpponent = String(row.defteam ?? "").trim();
    if (rawOpponent === "") throw new Error(`Missing defteam on an eligible play in game ${gameId}`);
    const team = resolve(String(row.posteam).trim(), gameId, "posteam");
    const opponent = resolve(rawOpponent, gameId, "defteam");

    const scoreDifferential = toFloat(row.score_differential);
    const bucket = scoreStateBucket(scoreDifferential);
    if (bucket === null) { missingScoreDifferential += 1; continue; }

    const qtr = toInt(row.qtr);
    const half = qtr !== null && qtr <= 2 ? "firstHalf" : "secondHalf";

    const key = `${gameId}|${team}`;
    let record = byTeamGame.get(key);
    if (!record) {
      record = emptyTeamGame(gameId, season, week, team, opponent);
      byTeamGame.set(key, record);
    }

    eligiblePlays += 1;
    const cell = record[half][bucket];
    cell.eligiblePlays += 1;
    if (unit === "pass") cell.passPlays += 1;
    else cell.rushPlays += 1;
  }

  return { teamGames: [...byTeamGame.values()], sourceRows, eligiblePlays, missingScoreDifferential };
}

/** Flatten a team-game record's nested buckets into a single-level summary. */
export function flattenGameScriptSummary(teamGames) {
  const totals = {
    trailing: zeroBucket(), close: zeroBucket(), leading: zeroBucket(),
    firstHalfTrailing: zeroBucket(), firstHalfClose: zeroBucket(), firstHalfLeading: zeroBucket(),
    secondHalfTrailing: zeroBucket(), secondHalfClose: zeroBucket(), secondHalfLeading: zeroBucket(),
  };
  for (const record of teamGames) {
    for (const half of ["firstHalf", "secondHalf"]) {
      for (const bucket of ["trailing", "close", "leading"]) {
        const cell = record[half][bucket];
        totals[bucket].eligiblePlays += cell.eligiblePlays;
        totals[bucket].passPlays += cell.passPlays;
        totals[bucket].rushPlays += cell.rushPlays;
        const combinedKey = `${half}${bucket[0].toUpperCase()}${bucket.slice(1)}`;
        totals[combinedKey].eligiblePlays += cell.eligiblePlays;
        totals[combinedKey].passPlays += cell.passPlays;
        totals[combinedKey].rushPlays += cell.rushPlays;
      }
    }
  }
  return totals;
}

export const GAME_SCRIPT_COMPACT_COLUMNS = Object.freeze([
  "game_id", "season", "week", "team", "opponent",
  "fh_trailing_plays", "fh_trailing_pass", "fh_trailing_rush",
  "fh_close_plays", "fh_close_pass", "fh_close_rush",
  "fh_leading_plays", "fh_leading_pass", "fh_leading_rush",
  "sh_trailing_plays", "sh_trailing_pass", "sh_trailing_rush",
  "sh_close_plays", "sh_close_pass", "sh_close_rush",
  "sh_leading_plays", "sh_leading_pass", "sh_leading_rush",
]);

export function serializeGameScriptCompact(teamGames) {
  const ordered = [...teamGames].sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
  const lines = [GAME_SCRIPT_COMPACT_COLUMNS.join(",")];
  for (const r of ordered) {
    const fh = r.firstHalf;
    const sh = r.secondHalf;
    lines.push([
      r.gameId, r.season, r.week, r.team, r.opponent,
      fh.trailing.eligiblePlays, fh.trailing.passPlays, fh.trailing.rushPlays,
      fh.close.eligiblePlays, fh.close.passPlays, fh.close.rushPlays,
      fh.leading.eligiblePlays, fh.leading.passPlays, fh.leading.rushPlays,
      sh.trailing.eligiblePlays, sh.trailing.passPlays, sh.trailing.rushPlays,
      sh.close.eligiblePlays, sh.close.passPlays, sh.close.rushPlays,
      sh.leading.eligiblePlays, sh.leading.passPlays, sh.leading.rushPlays,
    ].join(","));
  }
  return `${lines.join("\n")}\n`;
}
