/**
 * mlb-x-confirmation.mjs
 *
 * Shared, standardized lineup/starter confirmation for MLB X-post
 * eligibility. Every content type (HR, K, Numerology) classifies a
 * selection into ONE of these statuses rather than inventing its own
 * vocabulary:
 *
 *   CONFIRMED_LINEUP   hitter appears in today's official batting order (1-9)
 *   CONFIRMED_STARTER  pitcher is today's *currently listed* starter
 *   PROJECTED          recent-lineup / probable fallback -- NEVER X-eligible
 *   UNCONFIRMED        no confirmation data available yet
 *   OUT                explicitly scratched / removed
 *
 * Fail-closed everywhere: anything not positively confirmed is ineligible
 * for a live X post. The recent-lineup fallback the HR generator writes
 * (lineupStatus "projected") stays visible on the website but is filtered
 * out here.
 *
 * Pure predicates + a pure per-game index builder (fully unit-testable),
 * plus thin StatsAPI fetch wrappers (schedule for current starters,
 * boxscore for confirmed batting orders). The authoritative sources:
 *   - official batting orders: StatsAPI game/{gamePk}/boxscore
 *       teams.{side}.battingOrder (array of playerIds, populated only once
 *       the lineup is posted).
 *   - current starters:        StatsAPI schedule ...hydrate=probablePitcher
 *       teams.{side}.probablePitcher (reflects scratches / opener changes).
 */

export const ConfirmationStatus = {
  CONFIRMED_LINEUP: "CONFIRMED_LINEUP",
  CONFIRMED_STARTER: "CONFIRMED_STARTER",
  PROJECTED: "PROJECTED",
  UNCONFIRMED: "UNCONFIRMED",
  OUT: "OUT",
};

const MIN_BATTING_ORDER = 1;
const MAX_BATTING_ORDER = 9;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Case-insensitive normalization of a `lineupStatus` field from generated data. */
export function normalizeLineupStatus(value) {
  return normalizeText(value).toLowerCase();
}

/** A batting-order slot is valid only when it's an integer 1-9. */
export function isValidBattingOrder(battingOrder) {
  const order = toFiniteNumber(battingOrder);
  return order != null && Number.isInteger(order) && order >= MIN_BATTING_ORDER && order <= MAX_BATTING_ORDER;
}

/**
 * Classify a hitter row (from HR raw data or a numerology play) into a
 * confirmation status using its generated `lineupStatus`/`battingOrder`.
 * "out"/"scratched" wins; a real confirmed batting-order slot → CONFIRMED_
 * LINEUP; "projected" → PROJECTED; anything else → UNCONFIRMED.
 */
export function classifyHitterConfirmation(row) {
  const status = normalizeLineupStatus(row?.lineupStatus);
  if (status === "out" || status === "scratched") return ConfirmationStatus.OUT;
  if (status === "confirmed" && isValidBattingOrder(row?.battingOrder)) {
    return ConfirmationStatus.CONFIRMED_LINEUP;
  }
  if (status === "projected") return ConfirmationStatus.PROJECTED;
  return ConfirmationStatus.UNCONFIRMED;
}

/**
 * A hitter is X-eligible only when confirmed in today's official order (1-9)
 * and the game has not started. `gameStarted` is looked up from live
 * schedule status by the caller.
 */
export function isHitterXEligible(row, { gameStarted = false } = {}) {
  if (gameStarted) return false;
  return classifyHitterConfirmation(row) === ConfirmationStatus.CONFIRMED_LINEUP;
}

/**
 * Classify a pitcher. `isCurrentStarter` must come from a live comparison of
 * the row's pitcher against the schedule's current probablePitcher (see
 * matchesCurrentStarter) -- a replaced/scratched/opener-changed pitcher is
 * NOT the current starter and must not post.
 */
export function classifyPitcherConfirmation({ isCurrentStarter = false, gameStarted = false } = {}) {
  if (gameStarted) return ConfirmationStatus.OUT;
  return isCurrentStarter ? ConfirmationStatus.CONFIRMED_STARTER : ConfirmationStatus.UNCONFIRMED;
}

export function isPitcherXEligible({ isCurrentStarter = false, gameStarted = false } = {}) {
  return classifyPitcherConfirmation({ isCurrentStarter, gameStarted }) === ConfirmationStatus.CONFIRMED_STARTER;
}

/** Loose name match so "M. Trout" / "Mike Trout" / casing/whitespace differences don't cause false starter mismatches. */
export function normalizePitcherName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[.,'']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `rowPitcher` the current listed starter for this game? Prefer an exact
 * pitcherId match when both ids are present (most robust); otherwise fall
 * back to normalized-name equality.
 */
export function matchesCurrentStarter({ rowPitcher, rowPitcherId, currentStarterName, currentStarterId }) {
  const rid = toFiniteNumber(rowPitcherId);
  const cid = toFiniteNumber(currentStarterId);
  if (rid != null && cid != null) return rid === cid;
  const rowName = normalizePitcherName(rowPitcher);
  const currentName = normalizePitcherName(currentStarterName);
  return rowName.length > 0 && rowName === currentName;
}

// ---------------------------------------------------------------------------
// Pure boxscore/schedule normalization (unit-tested; no network)
// ---------------------------------------------------------------------------

/**
 * Normalize one team side of a StatsAPI boxscore into a confirmed-lineup
 * summary. A side's lineup is "confirmed" only when a full 9-deep batting
 * order is posted -- a partial order is treated as not-yet-confirmed so we
 * never post off a half-populated lineup.
 */
export function normalizeBoxscoreLineup(boxTeam) {
  const order = Array.isArray(boxTeam?.battingOrder) ? boxTeam.battingOrder : [];
  const players = boxTeam?.players || {};
  const batters = [];
  for (const playerRef of order) {
    const id = toFiniteNumber(playerRef);
    if (id == null) continue;
    const player = players[`ID${id}`];
    const name = normalizeText(player?.person?.fullName);
    batters.push({ id, name, battingOrder: batters.length + 1 });
    if (batters.length === MAX_BATTING_ORDER) break;
  }
  return { confirmed: batters.length >= MAX_BATTING_ORDER, batters };
}

/** True when the given player (by id or name) sits in this side's confirmed order. */
export function findConfirmedBatter(lineup, { playerId, playerName } = {}) {
  if (!lineup?.confirmed) return null;
  const pid = toFiniteNumber(playerId);
  const name = normalizePitcherName(playerName);
  return (
    lineup.batters.find((b) => (pid != null && b.id === pid) || (name && normalizePitcherName(b.name) === name)) ?? null
  );
}

// ---------------------------------------------------------------------------
// Thin StatsAPI fetch wrappers
// ---------------------------------------------------------------------------

const STATS_API = "https://statsapi.mlb.com/api/v1";
const FETCH_HEADERS = { "User-Agent": "joeknowsball-x-confirmation" };

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.json();
}

/**
 * Live schedule with current listed starters. Returns a normalized array of
 * `{ gamePk, gameDate, status, away, home }` where away/home carry the
 * current probablePitcher `{ id, name }` and team abbreviation.
 */
export async function fetchScheduleWithStarters({ date, fetchImpl = fetch } = {}) {
  const url = `${STATS_API}/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher`;
  const json = await fetchJson(url, fetchImpl);
  const games = json?.dates?.[0]?.games ?? [];
  return games.map((game) => ({
    gamePk: game.gamePk ?? null,
    gameDate: game.gameDate ?? null,
    status: game.status ?? null,
    away: {
      abbreviation: game?.teams?.away?.team?.abbreviation ?? null,
      starter: {
        id: game?.teams?.away?.probablePitcher?.id ?? null,
        name: game?.teams?.away?.probablePitcher?.fullName ?? null,
      },
    },
    home: {
      abbreviation: game?.teams?.home?.team?.abbreviation ?? null,
      starter: {
        id: game?.teams?.home?.probablePitcher?.id ?? null,
        name: game?.teams?.home?.probablePitcher?.fullName ?? null,
      },
    },
  }));
}

export async function fetchBoxscore({ gamePk, fetchImpl = fetch } = {}) {
  return fetchJson(`${STATS_API}/game/${gamePk}/boxscore`, fetchImpl);
}
