/**
 * mlb-ml-grading.mjs
 *
 * Pure grading logic for Moneyline predictions, mirroring the resolution
 * pattern in mlb-hr-grading.mjs but adapted to game-level win/loss outcomes
 * plus sportsbook and Polymarket closing-line-value (CLV) proxies.
 *
 * Result statuses:
 *   pending     - game has not started / not yet final
 *   win         - the picked team won
 *   loss        - the picked team lost
 *   push        - game finished level (e.g. an official suspended/tie
 *                 declaration) -- rare for baseball but handled defensively
 *   postponed   - game was postponed
 *   cancelled   - game was cancelled
 *   unresolved  - game is final but a winner could not be determined from
 *                 the schedule data (e.g. missing scores)
 *
 * ── CLV proxy documentation (IMPORTANT — read before using these numbers) ──
 *
 * Sportsbook CLV is NOT computed against a true, continuously-updated
 * closing-line feed. It uses `latestPriceSeen` -- the last sportsbook price
 * this pipeline happened to capture before first pitch (refreshed on each
 * same-day rerun of generate-mlb-ml-picks.mjs / build-mlb-ml-archive.mjs).
 * If the pipeline's last run for a given game was hours before first pitch,
 * `latestPriceSeen` will NOT reflect genuine closing odds. This is a proxy,
 * not verified closing-line data. See computeSportsbookClv().
 *
 * Polymarket CLV uses the LAST snapshot entry in that day's
 * public/data/polymarket/snapshots-{date}.json time-series whose timestamp
 * is at or before the game's scheduled first-pitch time. Because snapshots
 * are fetched multiple times per day, this is a much closer proxy to a true
 * closing line than the sportsbook one -- but it is still bounded by
 * whatever the last pregame snapshot happened to be, not a guaranteed
 * final-second price. See computePolymarketClv().
 */

export const RESULT_STATUSES = ["pending", "win", "loss", "push", "postponed", "cancelled", "unresolved"];

export function classifyGameState(game) {
  const abstract = game?.status?.abstractGameState ?? "";
  const detail = game?.status?.detailedState ?? "";
  if (detail === "Postponed") return "postponed";
  if (detail === "Cancelled") return "cancelled";
  if (abstract === "Final") return "final";
  if (abstract === "Live") return "in_progress";
  return "scheduled";
}

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @param {object} game  A schedule game entry (StatsAPI shape) for a single gamePk
 * @returns {{awayAbbr:string, homeAbbr:string, awayScore:number, homeScore:number}|null}
 */
export function extractFinalScore(game) {
  const awayAbbr = game?.teams?.away?.team?.abbreviation ?? null;
  const homeAbbr = game?.teams?.home?.team?.abbreviation ?? null;
  const awayScore = game?.teams?.away?.score;
  const homeScore = game?.teams?.home?.score;
  if (!awayAbbr || !homeAbbr || awayScore == null || homeScore == null) return null;
  const away = Number(awayScore);
  const home = Number(homeScore);
  if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
  return { awayAbbr, homeAbbr, awayScore: away, homeScore: home };
}

/**
 * Sportsbook CLV proxy -- see file header for the documented limitation.
 * Uses implied probability so the delta is comparable regardless of the
 * american-odds format on either side of the line move.
 *
 * @returns {object|null}
 */
export function computeSportsbookClv(priceAtPick, latestPriceSeen) {
  if (priceAtPick?.implied == null || latestPriceSeen?.implied == null) return null;
  const impliedProbabilityDelta = round(latestPriceSeen.implied - priceAtPick.implied, 4);
  if (impliedProbabilityDelta == null) return null;
  return {
    method: "latestPriceSeen_proxy",
    methodNote: "Proxy based on the last sportsbook price this pipeline captured pregame -- NOT a verified continuous closing-line feed.",
    impliedProbabilityAtPick: priceAtPick.implied,
    impliedProbabilityAtClose: latestPriceSeen.implied,
    impliedProbabilityDelta,
    // Positive delta = the market's implied probability rose after the pick
    // was made, i.e. the line moved toward the picked side -- the bettor
    // locked in a better number than the closing price ("beat the close").
    beatClose: impliedProbabilityDelta > 0,
  };
}

export const SPORTSBOOK_CLV_SKIP_REASONS = {
  MISSING_CAPTURE_TIME: "missing_capture_time",
  INVALID_CAPTURE_TIME: "invalid_capture_time",
  CAPTURED_AFTER_FIRST_PITCH: "captured_after_first_pitch",
};

/**
 * Structural pregame guard for the sportsbook CLV proxy. `latestPriceSeen`
 * is whatever price this pipeline last happened to capture -- there is no
 * guarantee that capture happened before first pitch (see file header).
 * This function is the enforcement point: sportsbook CLV is only computed
 * when `capturedAt` is present, parseable, and at or before the game's
 * official `gameDate` (first pitch). No substitute price is ever used in
 * place of a disqualified one -- CLV is simply withheld with a
 * machine-readable reason.
 *
 * @param {string|null|undefined} capturedAtIso  record.latestPriceSeen?.capturedAt
 * @param {string|null|undefined} gameDateIso     the game's official first-pitch time
 * @returns {{eligible: boolean, reason: string|null}}
 */
export function evaluateSportsbookClvEligibility(capturedAtIso, gameDateIso) {
  if (!capturedAtIso) {
    return { eligible: false, reason: SPORTSBOOK_CLV_SKIP_REASONS.MISSING_CAPTURE_TIME };
  }
  const capturedAt = new Date(capturedAtIso).getTime();
  if (!Number.isFinite(capturedAt)) {
    return { eligible: false, reason: SPORTSBOOK_CLV_SKIP_REASONS.INVALID_CAPTURE_TIME };
  }
  const gameDate = gameDateIso ? new Date(gameDateIso).getTime() : NaN;
  if (!Number.isFinite(gameDate)) {
    // Cannot verify the pregame cutoff without a valid reference gameDate --
    // fail closed. Reuses invalid_capture_time since the spec defines no
    // separate reason code for an invalid/missing gameDate, and the root
    // cause (the comparison timestamp can't be validated) is the same shape
    // of problem.
    return { eligible: false, reason: SPORTSBOOK_CLV_SKIP_REASONS.INVALID_CAPTURE_TIME };
  }
  if (capturedAt > gameDate) {
    return { eligible: false, reason: SPORTSBOOK_CLV_SKIP_REASONS.CAPTURED_AFTER_FIRST_PITCH };
  }
  return { eligible: true, reason: null };
}

/**
 * Finds the last Polymarket snapshot entry at or before a cutoff time
 * (first pitch) from a single game's snapshot time-series.
 *
 * @param {object} pmGame      one entry from a day's snapshots-*.json `games[]`
 * @param {string} cutoffIso   ISO timestamp to cut off at (game start time)
 * @returns {object|null}      the snapshot entry, or null if none qualify
 */
export function findFinalPregameSnapshot(pmGame, cutoffIso) {
  if (!pmGame || !Array.isArray(pmGame.snapshots) || !cutoffIso) return null;
  const cutoff = new Date(cutoffIso).getTime();
  if (!Number.isFinite(cutoff)) return null;

  let latest = null;
  let latestTime = -Infinity;
  for (const snap of pmGame.snapshots) {
    const t = new Date(snap?.time).getTime();
    if (!Number.isFinite(t) || t > cutoff) continue;
    if (t > latestTime) {
      latestTime = t;
      latest = snap;
    }
  }
  return latest;
}

/**
 * Polymarket CLV using the exact snapshot time-series (see
 * findFinalPregameSnapshot) rather than a single "last seen" value.
 *
 * @param {boolean} pickIsAway
 * @param {object} polymarketAtPick   { yesPrice, capturedAt } -- price for the PICKED side at pick time
 * @param {object|null} finalPregameSnapshot  from findFinalPregameSnapshot()
 * @returns {object|null}
 */
export function computePolymarketClv(pickIsAway, polymarketAtPick, finalPregameSnapshot) {
  if (polymarketAtPick?.yesPrice == null || !finalPregameSnapshot) return null;
  const closePrice = pickIsAway ? finalPregameSnapshot.awayPrice : finalPregameSnapshot.homePrice;
  if (closePrice == null) return null;
  const priceDelta = round(closePrice - polymarketAtPick.yesPrice, 4);
  if (priceDelta == null) return null;
  return {
    method: "final_pregame_snapshot",
    methodNote: "Last Polymarket snapshot at or before scheduled first pitch, from that day's snapshot time-series.",
    priceAtPick: polymarketAtPick.yesPrice,
    priceAtClose: closePrice,
    priceDelta,
    beatClose: priceDelta > 0,
    closeSnapshotTime: finalPregameSnapshot.time ?? null,
  };
}

/**
 * @param {object} record        archive record (must have pick, pickAbbr,
 *                                priceAtPick, latestPriceSeen, polymarketAtPick)
 * @param {object} gameSummary   { gameState, game, pmGame }
 *   - game:   StatsAPI schedule game entry for record.gameId (or null)
 *   - pmGame: that day's Polymarket snapshot entry for this matchup (or null)
 * @returns {object}  the result object to merge into record.result
 */
export function gradePrediction(record, gameSummary) {
  const { gameState, game, pmGame } = gameSummary;
  const gradedAt = new Date().toISOString();

  if (gameState === "postponed") {
    return { status: "postponed", actualWinnerAbbr: null, finalScore: null, gameFinalStatus: "Postponed", closingLine: null, clv: null, gradedAt };
  }
  if (gameState === "cancelled") {
    return { status: "cancelled", actualWinnerAbbr: null, finalScore: null, gameFinalStatus: "Cancelled", closingLine: null, clv: null, gradedAt };
  }
  if (gameState !== "final") {
    return { status: "pending", actualWinnerAbbr: null, finalScore: null, gameFinalStatus: null, closingLine: null, clv: null, gradedAt: null };
  }

  const finalScore = extractFinalScore(game);
  if (!finalScore) {
    return { status: "unresolved", actualWinnerAbbr: null, finalScore: null, gameFinalStatus: "Final", closingLine: null, clv: null, gradedAt };
  }

  const sportsbookClvEligibility = evaluateSportsbookClvEligibility(record.latestPriceSeen?.capturedAt, game?.gameDate);
  const sportsbookClv = sportsbookClvEligibility.eligible
    ? computeSportsbookClv(record.priceAtPick, record.latestPriceSeen)
    : null;
  const sportsbookClvSkipReason = sportsbookClvEligibility.eligible ? null : sportsbookClvEligibility.reason;
  const pickIsAway = record.pick === "away";
  const finalPregameSnapshot = pmGame ? findFinalPregameSnapshot(pmGame, game?.gameDate) : null;
  const polymarketClv = computePolymarketClv(pickIsAway, record.polymarketAtPick, finalPregameSnapshot);

  const closingLine = {
    sportsbook: record.latestPriceSeen ?? null,
    polymarket: finalPregameSnapshot
      ? { awayPrice: finalPregameSnapshot.awayPrice ?? null, homePrice: finalPregameSnapshot.homePrice ?? null, time: finalPregameSnapshot.time ?? null }
      : null,
  };
  const clv = { sportsbook: sportsbookClv, sportsbookClvSkipReason, polymarket: polymarketClv };

  if (finalScore.awayScore === finalScore.homeScore) {
    return { status: "push", actualWinnerAbbr: null, finalScore, gameFinalStatus: "Final", closingLine, clv, gradedAt };
  }

  const winnerAbbr = finalScore.awayScore > finalScore.homeScore ? finalScore.awayAbbr : finalScore.homeAbbr;
  const status = winnerAbbr === record.pickAbbr ? "win" : "loss";
  return { status, actualWinnerAbbr: winnerAbbr, finalScore, gameFinalStatus: "Final", closingLine, clv, gradedAt };
}

export function isGradeable(record) {
  return record?.result?.status === "pending";
}

/**
 * Regrading a completed game against the same inputs must produce the same
 * outcome status (idempotency check), mirroring isRegradeIdempotent in
 * mlb-hr-grading.mjs.
 */
export function isRegradeIdempotent(record, gameSummary) {
  if (record.result.status === "pending") return true;
  const fresh = gradePrediction({ ...record, result: { status: "pending" } }, gameSummary);
  return fresh.status === record.result.status && fresh.actualWinnerAbbr === record.result.actualWinnerAbbr;
}
