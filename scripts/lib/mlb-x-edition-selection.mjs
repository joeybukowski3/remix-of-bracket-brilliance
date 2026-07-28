/**
 * Per-market selection for the four MLB X editions.
 * Morning editions are model-first with odds optional. Confirmed editions are
 * rebuilt from confirmed participants with usable market data.
 */
import { selectConfirmedKRows } from "./mlb-k-x-selection-core.mjs";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";
import { buildSelectedLineupStatus } from "./mlb-x-edition-plan.mjs";
import { hrCategoryOf } from "./mlb-x-artifact-caption.mjs";

const K_MAX_TABLE_SIZE = 5;
const HR_MAX_TABLE_SIZE = 5;

function normalizeText(value) { return typeof value === "string" ? value.trim() : ""; }
function toFiniteNumber(value) { const parsed = Number(value); return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed; }
function compareDescendingNullsLast(left, right) { if (left == null && right == null) return 0; if (left == null) return 1; if (right == null) return -1; return right - left; }

export function buildKMorningSelection({ rows = [], maxTableSize = K_MAX_TABLE_SIZE } = {}) {
  const eligible = rows.filter((row) => {
    const projectedIP = toFiniteNumber(row?.projectedIP);
    return normalizeText(row?.pitcher) && toFiniteNumber(row?.strikeoutScore) != null && toFiniteNumber(row?.projectedKs) != null && projectedIP != null && projectedIP > 3 && row?.isCurrentStarter === true && row?.gameStarted !== true;
  });
  eligible.sort((left, right) => {
    const score = compareDescendingNullsLast(toFiniteNumber(left?.strikeoutScore), toFiniteNumber(right?.strikeoutScore));
    if (score !== 0) return score;
    const projection = compareDescendingNullsLast(toFiniteNumber(left?.projectedKs), toFiniteNumber(right?.projectedKs));
    if (projection !== 0) return projection;
    const innings = compareDescendingNullsLast(toFiniteNumber(left?.projectedIP), toFiniteNumber(right?.projectedIP));
    if (innings !== 0) return innings;
    return normalizeText(left?.pitcher).localeCompare(normalizeText(right?.pitcher), "en");
  });
  const selectedRows = eligible.slice(0, maxTableSize);
  return { selectedRows, selectedLineupStatus: buildSelectedLineupStatus({ selectedRows, isConfirmed: (row) => row?.opposingLineupConfirmed === true, getGameId: (row) => row?.gameId }), selection: { eligibleCount: eligible.length } };
}

export function buildKConfirmedSelection({ rows = [], maxTableSize = K_MAX_TABLE_SIZE } = {}) {
  const selection = selectConfirmedKRows({ rows, atCutoff: false, maxTableSize });
  const selectedRows = selection.selected;
  return { selectedRows, selectedLineupStatus: buildSelectedLineupStatus({ selectedRows, isConfirmed: (row) => row?.opposingLineupConfirmed === true, getGameId: (row) => row?.gameId }), selection };
}

export function buildHrMorningSelection({ batters = [], isGameStarted = () => false, maxTableSize = HR_MAX_TABLE_SIZE } = {}) {
  const eligible = batters.filter((row) => normalizeText(row?.player) && toFiniteNumber(row?.hrScore) != null && !isGameStarted(row));
  eligible.sort((left, right) => {
    const score = compareDescendingNullsLast(toFiniteNumber(left?.hrScore), toFiniteNumber(right?.hrScore));
    if (score !== 0) return score;
    const rank = (toFiniteNumber(left?.hrScoreRank) ?? Infinity) - (toFiniteNumber(right?.hrScoreRank) ?? Infinity);
    if (rank !== 0) return rank;
    return normalizeText(left?.player).localeCompare(normalizeText(right?.player), "en");
  });
  const selectedRows = eligible.slice(0, maxTableSize).map((row) => ({ ...row, category: "model" }));
  return { selectedRows, selectedLineupStatus: buildSelectedLineupStatus({ selectedRows, isConfirmed: () => false, getGameId: (row) => row?.gameId }), selection: { eligibleCount: eligible.length } };
}

export function buildHrConfirmedSelection({ batters = [], isGameStarted, liveConfirm, maxTableSize = HR_MAX_TABLE_SIZE } = {}) {
  const selection = selectConfirmedHrProps({ batters, isGameStarted, liveConfirm, maxTableSize });
  const selectedRows = selection.selected.map((row) => ({ ...row, category: hrCategoryOf(row).category }));
  const selectedLineupStatus = buildSelectedLineupStatus({ selectedRows, isConfirmed: () => true, getGameId: (row) => row?.gameId, promotedFromLiveCount: selection.promotedFromLiveCount ?? 0 });
  return { selectedRows, selectedLineupStatus, selection };
}

export const buildKEditionSelection = buildKConfirmedSelection;
export const buildHrEditionSelection = buildHrConfirmedSelection;
