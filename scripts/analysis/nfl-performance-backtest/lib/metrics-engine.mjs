/**
 * Performance Rating backtest — pure historical metric engine (analysis-only).
 *
 * Computes the 9 offense + 9 defense candidate metrics per team-game, in two
 * game-state variants (unfiltered / garbage-time-filtered), from trimmed
 * nflverse play-by-play (see fetch-pbp.mjs + lib/columns.mjs).
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
 * Requires down in {1,2,3,4} and ydstogo > 0. nflfastR `success` (EPA>0) is
 * also tallied per play, kept ONLY as `offEpaPosNum/Den` diagnostics.
 *
 * GARBAGE-TIME FILTER (variant B): exclude a play when
 *   offensive pre-play win probability (wp) < 0.05 or > 0.95
 *   OR (qtr == 4 AND abs(score_differential) > 16)
 * Overtime (qtr >= 5) is not "fourth quarter", so only the wp leg of the
 * filter can exclude an OT play; the blowout-score leg never fires in OT.
 *
 * EXPLOSIVE PLAY: pass play with yards_gained >= 15, or rush play with
 * yards_gained >= 10. Rate = explosive eligible plays / eligible plays.
 *
 * THIRD-DOWN PERFORMANCE: computed on down==3 eligible plays only (4th down
 * excluded from the primary metric). EPA/play and traditional
 * distance-relative success (100% threshold, same rule as 3rd/4th down
 * above) are the analytical candidates. A raw conversion-rate diagnostic is
 * also tallied as yards_gained >= ydstogo, which is the traditional-SR
 * threshold on 3rd down and a reasonable proxy for "moved the sticks";
 * it will not separately credit defensive-penalty automatic first downs,
 * since those are not present in trimmed columns — documented limitation.
 *
 * SACK RATE: OFF = sacks taken / dropbacks (pass==1 play count, sacks
 * included per the pass definition above). DEF (generated) is read by
 * symmetry from the opponent's OFF sack numbers for the same game.
 *
 * POINTS PER DRIVE: grouped by (game_id, fixed_drive, posteam) using
 * fixed_drive_result. Drive point value is read off the *actual scoreboard*
 * delta (total_home_score/total_away_score) across the drive's plays, keyed
 * to the offense's home/away side, so real PAT/2-pt results are captured
 * automatically for "Touchdown" / "Field goal" drives. Special handling:
 *   - fixed_drive_result == "Opp touchdown" (defensive/return TD): the score
 *     is NOT credited to the offense's PPD, and is excluded entirely from
 *     the opponent's normal PPD-allowed numerator too (tracked only as a
 *     separate `oppTouchdownAgainst` diagnostic count) — a single
 *     interception/fumble return TD is not the product of either team's
 *     offensive-drive or defensive-stop performance in the way PPD is meant
 *     to measure, and letting it land in either side's per-drive average
 *     would distort it disproportionately given how rare these events are.
 *   - fixed_drive_result == "Safety": 0 offensive points (the 2 points
 *     belong to the defense; tracked as a `safetyAgainst` diagnostic, not
 *     folded into the opponent's PPD numerator for the same reason as above).
 *   - Kneel-only drives (every play in the drive has play_type=="qb_kneel")
 *     are excluded from the PPD *denominator* entirely (both sides) — they
 *     are clock-killing victory-formation possessions with no offensive or
 *     defensive signal, and including them mechanically deflates PPD.
 *   - End-of-half drives that are not kneel-only are counted normally; their
 *     real point value (almost always 0, occasionally a Hail Mary TD or a
 *     field goal) already comes through the scoreboard-delta method.
 */

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

/** Group rows into per-drive buckets to compute points-per-drive. */
function processDrives(rowsByGame, resolve) {
  const driveTotals = new Map(); // key: gameId|team -> {drives, points, oppTd, safety}

  for (const [gameId, rows] of rowsByGame) {
    const byDrive = new Map(); // fixed_drive -> rows[]
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

      if (allKneel) continue; // excluded from denominator per documented rule

      bucket.drives += 1;

      if (result === "Opp touchdown") {
        bucket.oppTd += 1;
        continue; // excluded from PPD numerator entirely, both sides
      }
      if (result === "Safety") {
        bucket.safety += 1;
        continue; // 0 offensive points; not folded into opponent PPD numerator
      }

      if (scoreBefore !== null && scoreAfter !== null && scoreAfter >= scoreBefore) {
        bucket.points += scoreAfter - scoreBefore;
      }
    }
  }
  return driveTotals;
}

/**
 * Aggregate one season's trimmed play rows into per-team-per-game metric
 * bundles (both filter variants) plus drive-based points-per-drive.
 */
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
