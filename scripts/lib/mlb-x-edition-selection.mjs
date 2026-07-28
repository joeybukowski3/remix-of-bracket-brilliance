/**
 * Per-market selection for the four MLB X editions.
 *
 * Morning editions are model-first and do not require sportsbook markets or
 * confirmed lineups. Confirmed editions retain the existing market-value and
 * lineup-confirmation rules.
 */
import { classifyHitterConfirmation, ConfirmationStatus } from "./mlb-x-confirmation.mjs";
import { selectConfirmedKRows } from "./mlb-k-x-selection-core.mjs";
import { selectHrPropsAnyLineupStatus } from "./mlb-hr-x-selection-core.mjs";
import { buildSelectedLineupStatus } from "./mlb-x-edition-plan.mjs";
import { hrCategoryOf } from "./mlb-x-artifact-caption.mjs";

const K_MAX_TABLE_SIZE = 5;
const HR_MAX_TABLE_SIZE = 5;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareDescendingNullsLast(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

/**
 * Morning K board: today's current starters ranked by the existing K Score,
 * then model projection. A betting line, side and price are intentionally
 * optional because morning markets may not exist yet.
 */
export function buildKMorningSelection({ rows = [], maxTableSize = K_MAX_TABLE_SIZE } = {}) {
  const eligible = rows.filter((row) => {
    const pitcher = normalizeText(row?.pitcher);
    const strikeoutScore = toFiniteNumber(row?.strikeoutScore);
    const projectedKs = toFiniteNumber(row?.projectedKs);
    const projectedIP = toFiniteNumber(row?.projectedIP);
    return Boolean(pitcher) && strikeoutScore != null && projectedKs != null && projectedIP != null && projectedIP > 3 && row?.isCurrentStarter === true && row?.gameStarted !== true;
  });

  eligible.sort((left, right) => {
    const scoreDelta = compareDescendingNullsLast(toFiniteNumber(left?.strikeoutScore), toFiniteNumber(right?.strikeoutScore));
    if (scoreDelta !== 0) return scoreDelta;
    const projectionDelta = compareDescendingNullsLast(toFiniteNumber(left?.projectedKs), toFiniteNumber(right?.projectedKs));
    if (projectionDelta !== 0) return projectionDelta;
    const ipDelta = compareDescendingNullsLast(toFiniteNumber(left?.projectedIP), toFiniteNumber(right?.projectedIP));
    if (ipDelta !== 0) return ipDelta;
    return normalizeText(left?.pitcher).localeCompare(normalizeText(right?.pitcher), "en");
  });

  const selectedRows = eligible.slice(0, maxTableSize);
  return {
    selectedRows,
    selectedLineupStatus: buildSelectedLineupStatus({
      selectedRows,
      isConfirmed: (row) => row?.opposingLineupConfirmed === true,
      getGameId: (row) => row?.gameId,
    }),
    selection: { eligibleCount: eligible.length },
  };
}

/** Confirmed K board: existing market-value rules plus confirmed opponents. */
export function buildKConfirmedSelection({ rows = [], maxTableSize = K_MAX_TABLE_SIZE } = {}) {
  const selection = selectConfirmedKRows({ rows, atCutoff: false, maxTableSize });
  const selectedRows = selection.selected;
  return {
    selectedRows,
    selectedLineupStatus: buildSelectedLineupStatus({
      selectedRows,
      isConfirmed: (row) => row?.opposingLineupConfirmed === true,
      getGameId: (row) => row?.gameId,
    }),
    selection,
  };
}

/**
 * Morning HR board: highest HR Score among today's unstarted projected hitters.
 * A price is optional and lineup confirmation is deliberately not consulted.
 */
export function buildHrMorningSelection({ batters = [], isGameStarted = () => false, maxTableSize = HR_MAX_TABLE_SIZE } = {}) {
  const eligible = batters.filter((row) => normalizeText(row?.player) && toFiniteNumber(row?.hrScore) != null && !isGameStarted(row));
  eligible.sort((left, right) => {
    const scoreDelta = compareDescendingNullsLast(toFiniteNumber(left?.hrScore), toFiniteNumber(right?.hrScore));
    if (scoreDelta !== 0) return scoreDelta;
    const rankDelta = (toFiniteNumber(left?.hrScoreRank) ?? Infinity) - (toFiniteNumber(right?.hrScoreRank) ?? Infinity);
    if (rankDelta !== 0) return rankDelta;
    return normalizeText(left?.player).localeCompare(normalizeText(right?.player), "en");
  });

  const selectedRows = eligible.slice(0, maxTableSize).map((row) => ({ ...row, category: "model" }));
  return {
    selectedRows,
    selectedLineupStatus: buildSelectedLineupStatus({ selectedRows, isConfirmed: () => false, getGameId: (row) => row?.gameId }),
    selection: { eligibleCount: eligible.length },
  };
}

/** Confirmed HR board: existing priced pool, then selected-player confirmation. */
export function buildHrConfirmedSelection({ batters = [], isGameStarted, liveConfirm, maxTableSize = HR_MAX_TABLE_SIZE } = {}) {
  const selection = selectHrPropsAnyLineupStatus({ batters, isGameStarted, maxTableSize });
  const selectedRows = selection.selected.map((row) => ({ ...row, category: hrCategoryOf(row).category }));

  let promotedFromLiveCount = 0;
  const isConfirmed = (row) => {
    let status = classifyHitterConfirmation(row);
    const live = liveConfirm ? liveConfirm(row) : null;
    if (status === ConfirmationStatus.PROJECTED && live === true) {
      status = ConfirmationStatus.CONFIRMED_LINEUP;
      promotedFromLiveCount += 1;
    }
    if (status !== ConfirmationStatus.CONFIRMED_LINEUP) return false;
    return live !== false;
  };

  const base = buildSelectedLineupStatus({ selectedRows, isConfirmed, getGameId: (row) => row?.gameId });
  return {
    selectedRows,
    selectedLineupStatus: { ...base, promotedFromLiveCount },
    selection,
  };
}

// Backward-compatible aliases for existing tests and callers.
export const buildKEditionSelection = buildKConfirmedSelection;
export const buildHrEditionSelection = buildHrConfirmedSelection;
