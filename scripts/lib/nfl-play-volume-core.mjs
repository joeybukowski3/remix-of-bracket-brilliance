/**
 * nflverse play-by-play team play-volume and pass-tendency aggregation
 * (NFL yardage-prop Phase 2). Reuses the exact same eligible-play
 * classification as the approved EPA pipeline (`nfl-epa-core.mjs`) so the
 * play-volume/tendency population and the EPA population can never
 * silently disagree about what counts as an offensive play.
 *
 * Source: nflverse play-by-play releases. `xpass` / `pass_oe` are
 * nflfastR's own trained expected-pass-probability model output, consumed
 * as authoritative -- never recomputed or re-modelled here. This is the
 * same trust tier this repository already gives nflfastR's `epa` column
 * (see `nfl-epa-core.mjs` header comment). Provenance: nflfastR publishes
 * `xpass` as a play-level estimated probability the play call is a pass,
 * conditioned on down/distance/score/time/field position; `pass_oe` is
 * `(actual_pass_indicator - xpass) * 100`, verified empirically against the
 * 2022 and 2025 seasons in this audit (see docs/nfl-play-by-play-audit.md).
 *
 * Attribution: nflverse / nflfastR.
 */

import { classifyPlay, nflversePbpUrl } from "./nfl-epa-core.mjs";

export { nflversePbpUrl };

export const NFL_PLAY_VOLUME_SOURCE_LABEL = "nflverse (play-by-play, nflfastR xpass/pass_oe)";
export const NFL_PLAY_VOLUME_ATTRIBUTION = "Play-volume and pass-tendency data: nflverse / nflfastR";

/** The only play-by-play columns this pipeline reads, beyond what `classifyPlay` needs. */
export const REQUIRED_PLAY_VOLUME_PBP_COLUMNS = Object.freeze([
  "game_id", "season", "season_type", "week", "posteam", "defteam",
  "epa", "pass", "rush", "two_point_attempt",
  "down", "wp", "half_seconds_remaining", "pass_oe",
]);

/**
 * Neutral-situation definition, stated once for code and provenance.
 *
 * `down` 1 or 2: excludes 3rd/4th down, where play-calling is dictated by
 * yards-to-go rather than a team's free tendency.
 * `wp` (posteam win probability, nflfastR's own composite situational
 * model -- same provenance tier as `xpass`) between 0.20 and 0.80:
 * excludes clock-killing leads and garbage-time trailing situations.
 * `half_seconds_remaining` > 120: excludes two-minute-drill situations,
 * where pass rate spikes for clock-management reasons unrelated to a
 * team's normal identity.
 *
 * This is deliberately NOT the only situational filter a later phase might
 * want (e.g. no distance restriction), but every threshold here is named
 * and justified rather than copied from a public site's convention. See
 * docs/nfl-play-by-play-audit.md for the alternatives considered.
 */
export const NEUTRAL_SITUATION_DEFINITION =
  "down IN (1,2) AND wp BETWEEN 0.20 AND 0.80 (posteam win probability) AND half_seconds_remaining > 120";

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

export function isNeutralSituation(row) {
  const down = toInt(row.down);
  if (down !== 1 && down !== 2) return false;
  const wp = toFloat(row.wp);
  if (wp === null || wp < 0.2 || wp > 0.8) return false;
  const halfSecondsRemaining = toFloat(row.half_seconds_remaining);
  if (halfSecondsRemaining === null || halfSecondsRemaining <= 120) return false;
  return true;
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    gameId, season, week, team, opponent,
    eligiblePlays: 0, passPlays: 0, rushPlays: 0,
    neutralEligiblePlays: 0, neutralPassPlays: 0,
    passOeSum: 0, passOeCount: 0,
  };
}

/**
 * Aggregate play rows into one play-volume/tendency record per (game_id, posteam).
 * Regular-season only, mirroring `aggregatePlays` in `nfl-epa-core.mjs` exactly
 * (same season-type filter, same team-code resolution policy, same
 * duplicate-key accumulation).
 */
export function aggregatePlayVolume(rows, { season, teamMap = null }) {
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

    eligiblePlays += 1;
    record.eligiblePlays += 1;
    if (unit === "pass") record.passPlays += 1;
    else record.rushPlays += 1;

    if (isNeutralSituation(row)) {
      record.neutralEligiblePlays += 1;
      if (unit === "pass") record.neutralPassPlays += 1;
    }

    const passOe = toFloat(row.pass_oe);
    if (passOe !== null) {
      record.passOeSum += passOe;
      record.passOeCount += 1;
    }
  }

  return { teamGames: [...byTeamGame.values()], sourceRows, eligiblePlays };
}

/** Structural validation, mirroring `validateTeamGames` in `nfl-epa-core.mjs`. */
export function validatePlayVolumeTeamGames(teamGames, { teamMap = null } = {}) {
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
    if (!(record.eligiblePlays > 0)) problems.push(`${key}: no eligible plays`);
    if (record.passPlays + record.rushPlays !== record.eligiblePlays) {
      problems.push(`${key}: pass ${record.passPlays} + rush ${record.rushPlays} != eligible ${record.eligiblePlays}`);
    }
    if (record.neutralPassPlays > record.neutralEligiblePlays) {
      problems.push(`${key}: neutral pass plays exceed neutral eligible plays`);
    }
    if (record.neutralEligiblePlays > record.eligiblePlays) {
      problems.push(`${key}: neutral eligible plays exceed total eligible plays`);
    }
    if (record.passOeCount > record.eligiblePlays) {
      problems.push(`${key}: pass_oe sample exceeds eligible plays`);
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
export const PLAY_VOLUME_COMPACT_COLUMNS = Object.freeze([
  "game_id", "season", "week", "team", "opponent",
  "eligible_plays", "pass_plays", "rush_plays",
  "neutral_eligible_plays", "neutral_pass_plays",
  "pass_oe_sum", "pass_oe_count",
]);

export function serializePlayVolumeCompact(teamGames) {
  const ordered = [...teamGames].sort(
    (a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team),
  );
  const lines = [PLAY_VOLUME_COMPACT_COLUMNS.join(",")];
  for (const r of ordered) {
    lines.push(
      [
        r.gameId, r.season, r.week, r.team, r.opponent,
        r.eligiblePlays, r.passPlays, r.rushPlays,
        r.neutralEligiblePlays, r.neutralPassPlays,
        r.passOeSum, r.passOeCount,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Parse one compact cache row, rejecting anything malformed. */
export function parsePlayVolumeCompactRow(row) {
  const gameId = String(row.game_id ?? "").trim();
  if (gameId === "") throw new Error("compact play-volume cache row without game_id");

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
    eligiblePlays: num("eligible_plays", true),
    passPlays: num("pass_plays", true),
    rushPlays: num("rush_plays", true),
    neutralEligiblePlays: num("neutral_eligible_plays", true),
    neutralPassPlays: num("neutral_pass_plays", true),
    passOeSum: num("pass_oe_sum", false),
    passOeCount: num("pass_oe_count", true),
  };
}
