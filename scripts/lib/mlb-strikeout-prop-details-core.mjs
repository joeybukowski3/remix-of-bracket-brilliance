/**
 * Pure, browser-safe transform logic for MLB strikeout prop row-detail data
 * (test/mlb-strikeout-prop-row-details).
 *
 * No Node-only imports (no fs/path) so this module can be imported directly
 * by both the Node generator script and the Vite/React frontend — the same
 * key-building logic runs on both sides, so a prop-table row can never
 * disagree with its generated detail record about which key it maps to.
 *
 * Values that could not be reliably sourced are always null (never
 * fabricated); the UI is responsible for rendering those as "N/A".
 */

/** Normalize one key segment: lowercase, strip to alphanumerics/dashes. */
function normalizeKeySegment(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Stable key mapping a strikeout-prop table row to its detail record.
 * Uses pitcher + team + opponent + gameDate (all present on every prop
 * row) rather than an external id, so the frontend can build the same key
 * from the table row alone, with no extra identifier plumbing required.
 */
export function buildStrikeoutPropDetailKey({ pitcher, team, opponent, gameDate }) {
  return [
    normalizeKeySegment(pitcher),
    normalizeKeySegment(team),
    normalizeKeySegment(opponent),
    normalizeKeySegment(gameDate),
  ].join("|");
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Innings pitched from MLB StatsAPI arrives as a string like "6.1" — keep as-is; null when absent. */
function normalizeInningsPitched(value) {
  if (value == null || value === "") return null;
  return typeof value === "string" ? value : String(value);
}

/**
 * Build the "pitcher last 5 starts" rows from already-fetched, already
 * start-filtered, already team-abbreviation-resolved starts (most recent
 * first, already limited to 5 by the caller).
 */
export function buildPitcherLastFiveStarts(starts) {
  return (starts ?? []).map((start) => ({
    date: start?.date ?? null,
    opponent: start?.opponentAbbr ?? null,
    inningsPitched: normalizeInningsPitched(start?.inningsPitched),
    strikeouts: toFiniteNumberOrNull(start?.strikeouts),
  }));
}

/**
 * Build the "opponent last 5 games vs starting pitchers" rows from
 * already-derived per-game boxscore summaries (most recent first, already
 * limited to 5 by the caller). Each entry that could not be fully derived
 * (e.g. boxscore fetch failed, no starter identifiable) still produces a
 * row — with the unavailable fields set to null — rather than being
 * dropped, so the UI can show a clear per-game unavailable state.
 */
export function buildOpponentLastFiveGames(games) {
  return (games ?? []).map((game) => ({
    date: game?.date ?? null,
    opponent: game?.opponent ?? null,
    opposingStartingPitcher: game?.opposingStartingPitcher ?? null,
    opposingStarterInningsPitched: normalizeInningsPitched(game?.opposingStarterInningsPitched),
    opposingStarterStrikeouts: toFiniteNumberOrNull(game?.opposingStarterStrikeouts),
    teamTotalStrikeouts: toFiniteNumberOrNull(game?.teamTotalStrikeouts),
  }));
}

/** Assemble the final StrikeoutPropDetail record for one prop-table row. */
export function buildStrikeoutPropDetail({
  pitcher,
  team,
  opponent,
  gameDate,
  pitcherLastFiveStarts,
  opponentLastFiveGames,
  generatedAt,
  source,
}) {
  return {
    key: buildStrikeoutPropDetailKey({ pitcher, team, opponent, gameDate }),
    pitcher,
    team,
    opponent,
    gameDate: gameDate ?? null,
    pitcherLastFiveStarts: buildPitcherLastFiveStarts(pitcherLastFiveStarts),
    opponentLastFiveGames: buildOpponentLastFiveGames(opponentLastFiveGames),
    generatedAt,
    source,
  };
}
