/**
 * pga-post-open-angles.mjs
 *
 * Pure, side-effect-free classification of the post-Open-Championship
 * angles (Open Championship result tier, Scottish Open participation,
 * two-week workload, FedExCup motivation status) for one player, from
 * already-fetched data:
 *   - public/data/pga/round-history-pga.json (per-round actual results,
 *     finishPosition/finishText/status/eventName/eventDate -- see
 *     fetch-pga-player-history.mjs)
 *   - public/data/pga/fedex-standings.json (see fetch-pga-fedex-
 *     standings.mjs)
 *
 * Every classification is derived strictly from these inputs -- there is
 * no fallback that invents a finish, a participation status, or a FedExCup
 * rank. A player absent from the relevant data resolves to an explicit
 * "unavailable" classification (DID_NOT_PLAY / SKIPPED / UNRANKED), never
 * a guess, so callers (the Grok prompt builder) can honestly say "no data"
 * instead of fabricating an angle.
 */

export const OpenResultTier = Object.freeze({
  TOP_5: "top5",
  TOP_10: "top10",
  T11_20: "11-20",
  T21_40: "21-40",
  T41_PLUS: "41+",
  MISSED_CUT: "missed_cut",
  DID_NOT_PLAY: "did_not_play",
});

/**
 * Precise Open finish buckets. Split from OpenResultTier, which merges 21-40
 * into a single T21_40 value. OpenResultTier is retained unchanged because the
 * shipped prompt builder and existing artifacts depend on its exact values --
 * this is an additive companion, not a replacement.
 */
export const OpenFinishBucket = Object.freeze({
  TOP_5: "TOP_5",
  TOP_10: "TOP_10",
  T11_20: "T11_20",
  T21_30: "T21_30",
  T31_40: "T31_40",
  T41_PLUS: "T41_PLUS",
  MISSED_CUT: "MISSED_CUT",
  DID_NOT_PLAY: "DID_NOT_PLAY",
});

export const ScottishOpenParticipation = Object.freeze({
  PLAYED_MADE_CUT: "played_made_cut",
  PLAYED_MISSED_CUT: "played_missed_cut",
  SKIPPED: "skipped",
});

export const FedExCupStatus = Object.freeze({
  SAFE: "safe",
  BUBBLE: "bubble",
  CHASING: "chasing",
  UNRANKED: "unranked",
});

/** Explicit FedExCup buckets with their thresholds encoded in the name. */
export const FedExCupBucket = Object.freeze({
  SAFE_TOP_50: "SAFE_TOP_50",
  BUBBLE_51_80: "BUBBLE_51_80",
  CHASING_81_PLUS: "CHASING_81_PLUS",
  UNRANKED: "UNRANKED",
});

/**
 * Workload buckets for the major-swing window.
 *
 * NO_TRACKED_ROUNDS deliberately does NOT mean "rested". round-history-pga.json
 * records only a subset of the season (27 events for 2026, with a 21-day hole
 * immediately before the Scottish Open), and the DP World Tour and LIV round
 * histories are empty. Opposite-field events opposite The Open and the Scottish
 * Open -- exactly where non-qualifiers play -- are absent, so for most of a
 * given field "no tracked rounds" means "not observed", not "did not play".
 */
export const MajorSwingWorkloadBucket = Object.freeze({
  EIGHT_ROUNDS: "EIGHT_ROUNDS",
  SIX_ROUNDS: "SIX_ROUNDS",
  FOUR_ROUNDS: "FOUR_ROUNDS",
  TWO_ROUNDS: "TWO_ROUNDS",
  NO_TRACKED_ROUNDS: "NO_TRACKED_ROUNDS",
  OTHER_TRACKED_ROUNDS: "OTHER_TRACKED_ROUNDS",
  UNKNOWN: "UNKNOWN",
});

export const MAJOR_SWING_TRACKED_EVENTS = Object.freeze([
  "The Open Championship",
  "Genesis Scottish Open",
]);

export const MAJOR_SWING_WORKLOAD_LIMITATION =
  "Workload coverage includes only recorded rounds from The Open Championship and Genesis Scottish Open. Opposite-field, DP World Tour, LIV, and other events may be missing, so “No tracked rounds” does not necessarily mean the player rested.";

const OPEN_CHAMPIONSHIP_PATTERN = /\bopen championship\b/i;
const SCOTTISH_OPEN_PATTERN = /\bscottish open\b/i;
const FEDEX_SAFE_MAX_RANK = 50;
const FEDEX_BUBBLE_MAX_RANK = 80;

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Rounds for one player at one event (by name pattern), no earlier than `sinceDate` (YYYY-MM-DD). */
function findEventRounds(rounds, playerName, eventNamePattern, sinceDate) {
  const key = normalizeName(playerName);
  return rounds.filter(
    (round) =>
      normalizeName(round.player) === key &&
      eventNamePattern.test(round.eventName ?? "") &&
      (!sinceDate || (round.eventDate ?? "") >= sinceDate),
  );
}

/** Classify from an already-filtered set of a player's rounds at one event. Empty input -> "did not play" is the caller's responsibility to interpret per-event. */
function classifyMajorResult(playerRounds) {
  if (!playerRounds.length) return OpenResultTier.DID_NOT_PLAY;
  if (playerRounds.some((round) => round.status === "missed_cut")) return OpenResultTier.MISSED_CUT;
  const finished = playerRounds.find((round) => round.status === "finished" && Number.isFinite(round.finishPosition));
  // A round exists but there's no usable finished result (e.g. WD/DQ) --
  // never guessed at; treated the same as "no data" for this angle.
  if (!finished) return OpenResultTier.DID_NOT_PLAY;
  const position = finished.finishPosition;
  if (position <= 5) return OpenResultTier.TOP_5;
  if (position <= 10) return OpenResultTier.TOP_10;
  if (position <= 20) return OpenResultTier.T11_20;
  if (position <= 40) return OpenResultTier.T21_40;
  return OpenResultTier.T41_PLUS;
}

/** Precise Open bucket from the same rounds classifyMajorResult uses. Never guesses. */
function classifyOpenFinishBucket(playerRounds) {
  if (!playerRounds.length) return OpenFinishBucket.DID_NOT_PLAY;
  if (playerRounds.some((round) => round.status === "missed_cut")) return OpenFinishBucket.MISSED_CUT;
  const finished = playerRounds.find((round) => round.status === "finished" && Number.isFinite(round.finishPosition));
  if (!finished) return OpenFinishBucket.DID_NOT_PLAY;
  const position = finished.finishPosition;
  if (position <= 5) return OpenFinishBucket.TOP_5;
  if (position <= 10) return OpenFinishBucket.TOP_10;
  if (position <= 20) return OpenFinishBucket.T11_20;
  if (position <= 30) return OpenFinishBucket.T21_30;
  if (position <= 40) return OpenFinishBucket.T31_40;
  return OpenFinishBucket.T41_PLUS;
}

/**
 * Scottish Open detail. finishPosition/finishText/status are present in the
 * source but were previously discarded by the made-cut/missed-cut collapse.
 * Anything not present resolves to null -- never inferred.
 */
function buildScottishDetail(playerRounds) {
  const participation = classifyScottishParticipation(playerRounds);
  const resolved = playerRounds.find((round) => Number.isFinite(round.finishPosition))
    ?? playerRounds.find((round) => round.finishText || round.status)
    ?? null;
  return {
    participation,
    finishPosition: Number.isFinite(resolved?.finishPosition) ? resolved.finishPosition : null,
    finishText: typeof resolved?.finishText === "string" && resolved.finishText ? resolved.finishText : null,
    status: typeof resolved?.status === "string" && resolved.status ? resolved.status : null,
    roundsPlayed: playerRounds.length,
  };
}

function bucketMajorSwingRounds(rounds) {
  if (rounds === 0) return MajorSwingWorkloadBucket.NO_TRACKED_ROUNDS;
  if (rounds === 8) return MajorSwingWorkloadBucket.EIGHT_ROUNDS;
  if (rounds === 6) return MajorSwingWorkloadBucket.SIX_ROUNDS;
  if (rounds === 4) return MajorSwingWorkloadBucket.FOUR_ROUNDS;
  if (rounds === 2) return MajorSwingWorkloadBucket.TWO_ROUNDS;
  return MajorSwingWorkloadBucket.OTHER_TRACKED_ROUNDS;
}

/**
 * Workload across the two tracked championships only.
 *
 * Deliberately NOT named "two-week workload": a genuine date-bounded all-event
 * count is not derivable from the current sources (see MajorSwingWorkloadBucket).
 * windowStart/windowEnd are still recorded so consumers know which period the
 * tracked rounds were drawn from, but `scope` and `coverage` state plainly that
 * this is a partial view.
 */
export function buildMajorSwingWorkload(trackedRoundCount, { windowStart = null, windowEnd = null, identityResolved = true } = {}) {
  const resolved = identityResolved && Number.isFinite(trackedRoundCount) && trackedRoundCount >= 0;
  return {
    rounds: resolved ? trackedRoundCount : null,
    bucket: resolved ? bucketMajorSwingRounds(trackedRoundCount) : MajorSwingWorkloadBucket.UNKNOWN,
    scope: "open_and_scottish_only",
    windowStart,
    windowEnd,
    coverage: "partial",
    trackedEvents: [...MAJOR_SWING_TRACKED_EVENTS],
  };
}

function classifyScottishParticipation(playerRounds) {
  if (!playerRounds.length) return ScottishOpenParticipation.SKIPPED;
  if (playerRounds.some((round) => round.status === "missed_cut")) return ScottishOpenParticipation.PLAYED_MISSED_CUT;
  const madeCut = playerRounds.some((round) => round.status === "finished" && Number.isFinite(round.finishPosition));
  return madeCut ? ScottishOpenParticipation.PLAYED_MADE_CUT : ScottishOpenParticipation.PLAYED_MISSED_CUT;
}

/** @param {Array<object>} fedexRows public/data/pga/fedex-standings.json's `rows` (already rank-ordered). */
export function classifyFedExCupStatus(fedexRows, playerName) {
  const rows = Array.isArray(fedexRows) ? fedexRows : [];
  const key = normalizeName(playerName);
  const entry = rows.find((row) => normalizeName(row.player) === key);
  if (!entry || !Number.isFinite(entry.rank)) {
    return { status: FedExCupStatus.UNRANKED, bucket: FedExCupBucket.UNRANKED, rank: null, points: null };
  }
  const status =
    entry.rank <= FEDEX_SAFE_MAX_RANK ? FedExCupStatus.SAFE : entry.rank <= FEDEX_BUBBLE_MAX_RANK ? FedExCupStatus.BUBBLE : FedExCupStatus.CHASING;
  const bucket =
    entry.rank <= FEDEX_SAFE_MAX_RANK
      ? FedExCupBucket.SAFE_TOP_50
      : entry.rank <= FEDEX_BUBBLE_MAX_RANK
        ? FedExCupBucket.BUBBLE_51_80
        : FedExCupBucket.CHASING_81_PLUS;
  return { status, bucket, rank: entry.rank, points: entry.points ?? null };
}

/**
 * Is the current tournament the one immediately following The Open
 * Championship (e.g. the 3M Open)? Determined from round-history-pga.json
 * directly (does it contain a recent Open Championship round within
 * `windowDays` before the current tournament's start) rather than
 * schedule.json's startDate/endDate/status fields, which are refreshed by a
 * separate, less frequently-run process and have been observed stale/
 * incorrect for just-completed events (see pga-workflow-gotchas: "two
 * separate systems must agree").
 *
 * @param {Array<object>} rounds                round-history-pga.json's `rounds`
 * @param {string} currentTournamentStartDate   current-field.json's `startDate` (YYYY-MM-DD)
 * @param {number} [windowDays]                 how many days after the Open still counts as "post-Open" (default 21)
 */
export function isPostOpenWindow(rounds, currentTournamentStartDate, windowDays = 21) {
  if (!currentTournamentStartDate) return false;
  const currentStart = new Date(`${currentTournamentStartDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(currentStart)) return false;
  return rounds.some((round) => {
    if (!OPEN_CHAMPIONSHIP_PATTERN.test(round.eventName ?? "")) return false;
    const roundDate = new Date(`${round.eventDate}T12:00:00Z`).getTime();
    if (!Number.isFinite(roundDate)) return false;
    const daysSince = (currentStart - roundDate) / 86_400_000;
    return daysSince >= 0 && daysSince <= windowDays;
  });
}

/**
 * Full post-Open angle set for one player.
 *
 * @param {string} playerName
 * @param {object} params
 * @param {Array<object>} params.rounds     public/data/pga/round-history-pga.json's `rounds`
 * @param {Array<object>} params.fedexRows  public/data/pga/fedex-standings.json's `rows`
 * @param {string} [params.sinceDate]       YYYY-MM-DD lower bound for "this year's" Open/Scottish Open rounds
 *   (defensive against a historical namesake event without a year suffix; the round-history source already
 *   disambiguates most historical entries with an explicit "(YYYY)" suffix, this is a belt-and-suspenders filter)
 */
export function buildPostOpenAngles(playerName, { rounds = [], fedexRows = [], sinceDate, windowStart = null, windowEnd = null } = {}) {
  const identityResolved = Boolean(normalizeName(playerName)) && Array.isArray(rounds);
  const openRounds = findEventRounds(rounds, playerName, OPEN_CHAMPIONSHIP_PATTERN, sinceDate);
  const scottishRounds = findEventRounds(rounds, playerName, SCOTTISH_OPEN_PATTERN, sinceDate);
  const trackedRoundCount = openRounds.length + scottishRounds.length;

  return {
    // ── Existing contract, unchanged ──────────────────────────────────────
    openResult: classifyMajorResult(openRounds),
    scottishOpen: classifyScottishParticipation(scottishRounds),
    // Legacy: retained for compatibility. Covers ONLY tracked Open/Scottish
    // rounds -- never a general two-week workload. New consumers must read
    // majorSwingWorkload instead.
    workloadRoundCount: trackedRoundCount,
    fedex: classifyFedExCupStatus(fedexRows, playerName),
    // ── Additive precise classifications ──────────────────────────────────
    openFinishBucket: classifyOpenFinishBucket(openRounds),
    scottish: buildScottishDetail(scottishRounds),
    majorSwingWorkload: buildMajorSwingWorkload(trackedRoundCount, { windowStart, windowEnd, identityResolved }),
  };
}

/**
 * Deterministic crossover angles, derived only from already-persisted
 * classifications plus model context. Emits nothing it cannot support, and
 * never forces a player into a group -- an empty array is a valid result.
 *
 * Kept here (not in React) so the frontend renders stored facts rather than
 * inventing classifications at display time.
 *
 * @param {object} context a per-player researchContext entry
 */
export function buildCrossoverAngles(context) {
  if (!context) return [];
  const open = context.openFinishBucket;
  const workload = context.majorSwingWorkload?.bucket;
  const fedexBucket = context.fedex?.bucket;
  const rank = Number.isFinite(context.model?.tournamentRank) ? context.model.tournamentRank : null;
  const powerRank = Number.isFinite(context.model?.powerRank) ? context.model.powerRank : null;
  const differential = rank != null && powerRank != null ? powerRank - rank : null;
  const scottishSkipped = context.scottish?.participation === ScottishOpenParticipation.SKIPPED;

  const topModel = rank != null && rank <= 10;
  const strongOpen = open === OpenFinishBucket.TOP_5 || open === OpenFinishBucket.TOP_10 || open === OpenFinishBucket.T11_20;
  const heavyWorkload = workload === MajorSwingWorkloadBucket.EIGHT_ROUNDS;
  const lightWorkload = workload === MajorSwingWorkloadBucket.TWO_ROUNDS || workload === MajorSwingWorkloadBucket.FOUR_ROUNDS;

  const rules = [
    {
      id: "strong_open_bubble_top_model",
      label: "Top-20 Open finish + FedExCup bubble + top-10 model rank",
      when: strongOpen && fedexBucket === FedExCupBucket.BUBBLE_51_80 && topModel,
    },
    {
      id: "missed_open_light_reps_model_fit",
      label: "Missed the Open cut + limited tracked reps + strong model rank",
      when: open === OpenFinishBucket.MISSED_CUT && lightWorkload && topModel,
    },
    {
      id: "skipped_scottish_top_model",
      label: "Skipped the Scottish Open + top-10 model rank",
      when: scottishSkipped && topModel,
    },
    {
      id: "heavy_workload_motivated",
      label: "Full eight tracked rounds + FedExCup points incentive",
      when: heavyWorkload && (fedexBucket === FedExCupBucket.BUBBLE_51_80 || fedexBucket === FedExCupBucket.CHASING_81_PLUS),
    },
    {
      id: "safe_fedex_heavy_workload",
      label: "Safe FedExCup position carrying a heavy tracked workload",
      when: heavyWorkload && fedexBucket === FedExCupBucket.SAFE_TOP_50,
    },
    {
      id: "model_outruns_power_rank",
      label: "Tournament model rank well ahead of power rank",
      when: differential != null && differential >= 10,
    },
    {
      id: "chasing_with_strong_open",
      label: "Chasing FedExCup position with a strong Open result",
      when: strongOpen && fedexBucket === FedExCupBucket.CHASING_81_PLUS,
    },
  ];

  return rules.filter((rule) => rule.when).map(({ id, label }) => ({ id, label }));
}
