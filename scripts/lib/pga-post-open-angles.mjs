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
  if (!entry || !Number.isFinite(entry.rank)) return { status: FedExCupStatus.UNRANKED, rank: null, points: null };
  const status =
    entry.rank <= FEDEX_SAFE_MAX_RANK ? FedExCupStatus.SAFE : entry.rank <= FEDEX_BUBBLE_MAX_RANK ? FedExCupStatus.BUBBLE : FedExCupStatus.CHASING;
  return { status, rank: entry.rank, points: entry.points ?? null };
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
export function buildPostOpenAngles(playerName, { rounds = [], fedexRows = [], sinceDate } = {}) {
  const openRounds = findEventRounds(rounds, playerName, OPEN_CHAMPIONSHIP_PATTERN, sinceDate);
  const scottishRounds = findEventRounds(rounds, playerName, SCOTTISH_OPEN_PATTERN, sinceDate);

  return {
    openResult: classifyMajorResult(openRounds),
    scottishOpen: classifyScottishParticipation(scottishRounds),
    workloadRoundCount: openRounds.length + scottishRounds.length,
    fedex: classifyFedExCupStatus(fedexRows, playerName),
  };
}
