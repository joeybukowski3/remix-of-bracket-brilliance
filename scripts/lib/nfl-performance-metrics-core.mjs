/**
 * Production Performance Rating metric engine (Phase 6).
 *
 * This is the production copy of the play/drive aggregation engine validated
 * during the 2026 Performance Model Backtest
 * (scripts/analysis/nfl-performance-backtest/lib/metrics-engine.mjs, which
 * stays frozen there for historical backtest reproducibility — this file is
 * the one the live refresh pipeline depends on, so the two are intentionally
 * NOT the same module reference). Logic is unchanged from the
 * backtest-approved version; only the doc header differs.
 *
 * Computes the 9 offense + 9 defense candidate metrics per team-game, in two
 * game-state variants (unfiltered / garbage-time-filtered), from trimmed
 * nflverse play-by-play (see REQUIRED_PERFORMANCE_PBP_COLUMNS below).
 *
 * EPA-eligible play definition mirrors scripts/lib/nfl-epa-core.mjs exactly:
 * (pass==1 OR rush==1) AND epa present AND posteam present AND
 * two_point_attempt != 1. `pass==1` already includes sacks and scrambles
 * (nflfastR convention), so "dropbacks" == count of pass==1 eligible plays.
 *
 * SUCCESS RATE (canonical): traditional down-and-distance definition, NOT
 * nflfastR's own `success` (EPA>0) field:
 *   1st down: yards_gained >= 0.4 * ydstogo
 *   2nd down: yards_gained >= 0.6 * ydstogo
 *   3rd/4th down: yards_gained >= 1.0 * ydstogo
 * nflfastR `success` (EPA>0) is also tallied per play, kept ONLY as an
 * `epaPosNum/Den` diagnostic — never the canonical Success Rate.
 *
 * GARBAGE-TIME FILTER: exclude a play when offensive pre-play win
 * probability (wp) < 0.05 or > 0.95, OR (qtr == 4 AND
 * abs(score_differential) > 16). Overtime (qtr >= 5) is not "fourth
 * quarter", so only the wp leg can exclude an OT play.
 *
 * EXPLOSIVE PLAY: pass play with yards_gained >= 15, or rush play with
 * yards_gained >= 10.
 *
 * THIRD-DOWN PERFORMANCE: down==3 eligible plays only (4th down excluded).
 *
 * SACK RATE: OFF = sacks taken / dropbacks. DEF (generated) is read by
 * symmetry from the opponent's OFF sack numbers for the same game.
 *
 * POINTS PER DRIVE: grouped by (game_id, fixed_drive, posteam). Drive point
 * value is read off the actual scoreboard delta (total_home_score /
 * total_away_score). "Opp touchdown" (defensive/return TD) and "Safety"
 * drive results are excluded from both sides' PPD numerator (tracked only as
 * diagnostics); kneel-only drives are excluded from the PPD denominator.
 * See the backtest module's docblock for the full rationale — unchanged here.
 */

export const REQUIRED_PERFORMANCE_PBP_COLUMNS = Object.freeze([
  "game_id", "season", "season_type", "week", "posteam", "defteam", "posteam_type",
  "home_team", "away_team", "qtr", "down", "ydstogo", "yards_gained", "play_type",
  "pass", "rush", "sack", "two_point_attempt", "epa", "success", "wp",
  "score_differential", "posteam_score", "defteam_score", "drive", "fixed_drive",
  "fixed_drive_result", "touchdown", "td_team", "safety", "home_score", "away_score",
  "total_home_score", "total_away_score",
]);

export const GARBAGE_TIME_WP_LOW = 0.05;
export const GARBAGE_TIME_WP_HIGH = 0.95;
export const GARBAGE_TIME_BLOWOUT_MARGIN = 16;

const num = (v) => {
  const t = String(v ?? "").trim();
  if (t === "" || t === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

export function isEligiblePlay(row) {
  if (int(row.two_point_attempt) === 1) return null;
  if (String(row.posteam ?? "").trim() === "") return null;
  if (num(row.epa) === null) return null;
  if (int(row.pass) === 1) return "pass";
  if (int(row.rush) === 1) return "rush";
  return null;
}

export function isGarbageTime(row) {
  const wp = num(row.wp);
  if (wp !== null && (wp < GARBAGE_TIME_WP_LOW || wp > GARBAGE_TIME_WP_HIGH)) return true;
  const qtr = int(row.qtr);
  const diff = num(row.score_differential);
  if (qtr === 4 && diff !== null && Math.abs(diff) > GARBAGE_TIME_BLOWOUT_MARGIN) return true;
  return false;
}

export function traditionalSuccess(down, ydstogo, yardsGained) {
  if (!(ydstogo > 0) || yardsGained === null) return null;
  if (down === 1) return yardsGained >= 0.4 * ydstogo;
  if (down === 2) return yardsGained >= 0.6 * ydstogo;
  if (down === 3 || down === 4) return yardsGained >= ydstogo;
  return null;
}

function emptySide() {
  return {
    offEpa: 0, offPlays: 0,
    successNum: 0, successDen: 0,
    epaPosNum: 0, epaPosDen: 0,
    earlyEpa: 0, earlyPlays: 0, earlySuccessNum: 0, earlySuccessDen: 0,
    passEpa: 0, passPlays: 0, passSuccessNum: 0, passSuccessDen: 0,
    rushEpa: 0, rushPlays: 0, rushSuccessNum: 0, rushSuccessDen: 0,
    explosivePass: 0, explosiveRush: 0,
    thirdEpa: 0, thirdPlays: 0, thirdSuccessNum: 0, thirdSuccessDen: 0,
    thirdRawConvNum: 0, thirdRawConvDen: 0,
    sacks: 0, dropbacks: 0,
  };
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    gameId, season, week, team, opponent,
    all: emptySide(),
    filtered: emptySide(),
    drivesOff: 0, drivePointsOff: 0,
    oppTouchdownAgainst: 0, safetyAgainst: 0,
  };
}

function accumulatePlay(side, row, unit) {
  const epa = num(row.epa);
  const down = int(row.down);
  const ydstogo = num(row.ydstogo);
  const yardsGained = num(row.yards_gained);

  side.offEpa += epa;
  side.offPlays += 1;
  side.epaPosDen += 1;
  if (epa > 0) side.epaPosNum += 1;

  const success = traditionalSuccess(down, ydstogo, yardsGained);
  if (success !== null) {
    side.successDen += 1;
    if (success) side.successNum += 1;
  }

  if (down === 1 || down === 2) {
    side.earlyEpa += epa;
    side.earlyPlays += 1;
    if (success !== null) {
      side.earlySuccessDen += 1;
      if (success) side.earlySuccessNum += 1;
    }
  }

  if (unit === "pass") {
    side.passEpa += epa;
    side.passPlays += 1;
    side.dropbacks += 1;
    if (int(row.sack) === 1) side.sacks += 1;
    if (success !== null) {
      side.passSuccessDen += 1;
      if (success) side.passSuccessNum += 1;
    }
    if (yardsGained !== null && yardsGained >= 15) side.explosivePass += 1;
  } else {
    side.rushEpa += epa;
    side.rushPlays += 1;
    if (success !== null) {
      side.rushSuccessDen += 1;
      if (success) side.rushSuccessNum += 1;
    }
    if (yardsGained !== null && yardsGained >= 10) side.explosiveRush += 1;
  }

  if (down === 3) {
    side.thirdEpa += epa;
    side.thirdPlays += 1;
    if (success !== null) {
      side.thirdSuccessDen += 1;
      if (success) side.thirdSuccessNum += 1;
    }
    if (ydstogo > 0 && yardsGained !== null) {
      side.thirdRawConvDen += 1;
      if (yardsGained >= ydstogo) side.thirdRawConvNum += 1;
    }
  }
}

function processDrives(rowsByGame, resolve) {
  const driveTotals = new Map();

  for (const [gameId, rows] of rowsByGame) {
    const byDrive = new Map();
    for (const row of rows) {
      const posteam = String(row.posteam ?? "").trim();
      if (posteam === "") continue;
      const fd = row.fixed_drive;
      if (fd === undefined || fd === "" || fd === null) continue;
      const key = `${fd}`;
      if (!byDrive.has(key)) byDrive.set(key, []);
      byDrive.get(key).push(row);
    }

    for (const [, driveRows] of byDrive) {
      const first = driveRows[0];
      const last = driveRows[driveRows.length - 1];
      const posteamRaw = String(first.posteam ?? "").trim();
      if (posteamRaw === "") continue;
      const team = resolve(posteamRaw, gameId, "posteam");
      const homeRaw = String(first.home_team ?? "").trim();
      const isHome = posteamRaw === homeRaw;

      const allKneel = driveRows.every((r) => String(r.play_type ?? "").trim() === "qb_kneel");

      const scoreBefore = isHome ? num(first.total_home_score) : num(first.total_away_score);
      const scoreAfter = isHome ? num(last.total_home_score) : num(last.total_away_score);

      const key = `${gameId}|${team}`;
      if (!driveTotals.has(key)) driveTotals.set(key, { drives: 0, points: 0, oppTd: 0, safety: 0 });
      const bucket = driveTotals.get(key);

      const result = String(first.fixed_drive_result ?? last.fixed_drive_result ?? "").trim();

      if (allKneel) continue;

      bucket.drives += 1;

      if (result === "Opp touchdown") {
        bucket.oppTd += 1;
        continue;
      }
      if (result === "Safety") {
        bucket.safety += 1;
        continue;
      }

      if (scoreBefore !== null && scoreAfter !== null && scoreAfter >= scoreBefore) {
        bucket.points += scoreAfter - scoreBefore;
      }
    }
  }
  return driveTotals;
}

/** Aggregate one season's trimmed play rows into per-team-per-game metric bundles. */
export function aggregateSeason(rows, { season, teamMap }) {
  const resolve = (code, gameId, field) => {
    const team = teamMap.get(code);
    if (!team) throw new Error(`Unknown nflverse ${field} "${code}" in game ${gameId}`);
    return team.abbr;
  };

  const byTeamGame = new Map();
  const rowsByGame = new Map();

  for (const row of rows) {
    const gameId = String(row.game_id ?? "").trim();
    if (gameId === "") continue;
    if (!rowsByGame.has(gameId)) rowsByGame.set(gameId, []);
    rowsByGame.get(gameId).push(row);

    const unit = isEligiblePlay(row);
    if (unit === null) continue;

    const week = int(row.week);
    const posteamRaw = String(row.posteam).trim();
    const defteamRaw = String(row.defteam ?? "").trim();
    if (defteamRaw === "") continue;
    const team = resolve(posteamRaw, gameId, "posteam");
    const opponent = resolve(defteamRaw, gameId, "defteam");

    const key = `${gameId}|${team}`;
    if (!byTeamGame.has(key)) byTeamGame.set(key, emptyTeamGame(gameId, season, week, team, opponent));
    const record = byTeamGame.get(key);

    accumulatePlay(record.all, row, unit);
    if (!isGarbageTime(row)) accumulatePlay(record.filtered, row, unit);
  }

  const driveTotals = processDrives(rowsByGame, resolve);
  for (const [key, record] of byTeamGame) {
    const d = driveTotals.get(key);
    if (d) {
      record.drivesOff = d.drives;
      record.drivePointsOff = d.points;
      record.oppTouchdownAgainst = d.oppTd;
      record.safetyAgainst = d.safety;
    }
  }

  return [...byTeamGame.values()];
}

/** Compact-cache column order (matches the CSV written by refresh-nfl-performance-source-cache.mjs). */
export const PERFORMANCE_COMPACT_COLUMNS = Object.freeze([
  "game_id", "season", "week", "team", "opponent",
  ...["all", "filtered"].flatMap((v) => [
    `${v}_offEpa`, `${v}_offPlays`, `${v}_successNum`, `${v}_successDen`,
    `${v}_epaPosNum`, `${v}_epaPosDen`,
    `${v}_earlyEpa`, `${v}_earlyPlays`, `${v}_earlySuccessNum`, `${v}_earlySuccessDen`,
    `${v}_passEpa`, `${v}_passPlays`, `${v}_passSuccessNum`, `${v}_passSuccessDen`,
    `${v}_rushEpa`, `${v}_rushPlays`, `${v}_rushSuccessNum`, `${v}_rushSuccessDen`,
    `${v}_explosivePass`, `${v}_explosiveRush`,
    `${v}_thirdEpa`, `${v}_thirdPlays`, `${v}_thirdSuccessNum`, `${v}_thirdSuccessDen`,
    `${v}_thirdRawConvNum`, `${v}_thirdRawConvDen`,
    `${v}_sacks`, `${v}_dropbacks`,
  ]),
  "drivesOff", "drivePointsOff", "oppTouchdownAgainst", "safetyAgainst",
]);

export function serializePerformanceCompact(teamGames) {
  const ordered = [...teamGames].sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
  const lines = [PERFORMANCE_COMPACT_COLUMNS.join(",")];
  for (const r of ordered) {
    const row = [r.gameId, r.season, r.week, r.team, r.opponent];
    for (const v of ["all", "filtered"]) {
      const s = r[v];
      row.push(
        s.offEpa, s.offPlays, s.successNum, s.successDen, s.epaPosNum, s.epaPosDen,
        s.earlyEpa, s.earlyPlays, s.earlySuccessNum, s.earlySuccessDen,
        s.passEpa, s.passPlays, s.passSuccessNum, s.passSuccessDen,
        s.rushEpa, s.rushPlays, s.rushSuccessNum, s.rushSuccessDen,
        s.explosivePass, s.explosiveRush,
        s.thirdEpa, s.thirdPlays, s.thirdSuccessNum, s.thirdSuccessDen,
        s.thirdRawConvNum, s.thirdRawConvDen,
        s.sacks, s.dropbacks
      );
    }
    row.push(r.drivesOff, r.drivePointsOff, r.oppTouchdownAgainst, r.safetyAgainst);
    lines.push(row.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function parsePerformanceCompactRow(row) {
  const num = (field) => Number(row[field]);
  const side = (v) => ({
    offEpa: num(`${v}_offEpa`), offPlays: num(`${v}_offPlays`),
    successNum: num(`${v}_successNum`), successDen: num(`${v}_successDen`),
    epaPosNum: num(`${v}_epaPosNum`), epaPosDen: num(`${v}_epaPosDen`),
    earlyEpa: num(`${v}_earlyEpa`), earlyPlays: num(`${v}_earlyPlays`),
    earlySuccessNum: num(`${v}_earlySuccessNum`), earlySuccessDen: num(`${v}_earlySuccessDen`),
    passEpa: num(`${v}_passEpa`), passPlays: num(`${v}_passPlays`),
    passSuccessNum: num(`${v}_passSuccessNum`), passSuccessDen: num(`${v}_passSuccessDen`),
    rushEpa: num(`${v}_rushEpa`), rushPlays: num(`${v}_rushPlays`),
    rushSuccessNum: num(`${v}_rushSuccessNum`), rushSuccessDen: num(`${v}_rushSuccessDen`),
    explosivePass: num(`${v}_explosivePass`), explosiveRush: num(`${v}_explosiveRush`),
    thirdEpa: num(`${v}_thirdEpa`), thirdPlays: num(`${v}_thirdPlays`),
    thirdSuccessNum: num(`${v}_thirdSuccessNum`), thirdSuccessDen: num(`${v}_thirdSuccessDen`),
    thirdRawConvNum: num(`${v}_thirdRawConvNum`), thirdRawConvDen: num(`${v}_thirdRawConvDen`),
    sacks: num(`${v}_sacks`), dropbacks: num(`${v}_dropbacks`),
  });
  return {
    gameId: String(row.game_id), season: num("season"), week: num("week"),
    team: String(row.team), opponent: String(row.opponent),
    all: side("all"), filtered: side("filtered"),
    drivesOff: num("drivesOff"), drivePointsOff: num("drivePointsOff"),
    oppTouchdownAgainst: num("oppTouchdownAgainst"), safetyAgainst: num("safetyAgainst"),
  };
}
