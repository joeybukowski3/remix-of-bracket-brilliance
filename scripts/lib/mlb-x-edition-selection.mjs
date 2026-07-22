/**
 * Per-market selection for the edition planner.
 *
 * Wraps the EXISTING, unmodified selection cores (selectConfirmedKRows,
 * selectHrPropsAnyLineupStatus) and turns their output into the shape
 * buildEditionPlans expects: one frozen selectedRows array plus a
 * selectedLineupStatus built with buildSelectedLineupStatus. No model
 * calculation, ranking, or threshold is changed or reimplemented here.
 *
 * Both editions of a market share the SAME selectedRows returned here --
 * the planner calls this once per market, not once per edition.
 */
import { classifyHitterConfirmation, ConfirmationStatus } from "./mlb-x-confirmation.mjs";
import { selectConfirmedKRows } from "./mlb-k-x-selection-core.mjs";
import { selectHrPropsAnyLineupStatus } from "./mlb-hr-x-selection-core.mjs";
import { buildSelectedLineupStatus } from "./mlb-x-edition-plan.mjs";
import { hrCategoryOf } from "./mlb-x-artifact-caption.mjs";

const K_MAX_TABLE_SIZE = 5;
const HR_MAX_TABLE_SIZE = 5;

/**
 * K: reuses selectConfirmedKRows with atCutoff=true, which is the EXISTING
 * flag that relaxes the opposing-lineup requirement (previously used only at
 * the final cutoff). Requesting it unconditionally is what gives the morning
 * edition every own-starter-confirmed, market-valid pitcher regardless of
 * opposing-lineup status -- the exact "no opposing lineup requirement" the
 * morning edition needs -- while confirmed-edition readiness is judged
 * afterward from each row's own opposingLineupConfirmed flag, already present
 * on the enriched row from resolveKRowFacts.
 */
export function buildKEditionSelection({ rows, maxTableSize = K_MAX_TABLE_SIZE }) {
  const selection = selectConfirmedKRows({ rows, atCutoff: true, maxTableSize });
  const selectedRows = selection.selected;
  const selectedLineupStatus = buildSelectedLineupStatus({
    selectedRows,
    isConfirmed: (row) => row.opposingLineupConfirmed === true,
    getGameId: (row) => row.gameId,
  });
  return { selectedRows, selectedLineupStatus, selection };
}

/**
 * HR: reuses selectHrPropsAnyLineupStatus for the pool (any lineup status),
 * then determines each selected row's confirmation with the identical
 * classify-then-live-promote rule selectConfirmedHrProps uses, so the
 * confirmed edition sees the same promoted-from-live confirmation the fixed
 * 2026-07-21 defect relies on.
 *
 * Every selected row is stamped with its canonical model/longshot category
 * here, via hrCategoryOf (the SAME +350 price threshold the website's HR
 * Best Bets cards use in hrPropBestBets.ts -- not a second, independently
 * maintained copy of that rule). The production hr-props-raw.json artifact
 * carries no category field today, so this is the only place a category is
 * ever assigned; the frozen row is the single downstream carrier of it, and
 * buildHrEditionCaption's own heuristic branch exists only for a legacy row
 * that predates this and never reaches this function. Selection and ranking
 * are untouched -- this only stamps a field onto rows already chosen by
 * selectHrPropsAnyLineupStatus, in the same order.
 */
export function buildHrEditionSelection({ batters, isGameStarted, liveConfirm, maxTableSize = HR_MAX_TABLE_SIZE }) {
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
    if (live === false) return false;
    return true;
  };

  const base = buildSelectedLineupStatus({ selectedRows, isConfirmed, getGameId: (row) => row.gameId });
  // isConfirmed's closure over promotedFromLiveCount is only fully updated
  // once buildSelectedLineupStatus has finished calling it for every row, so
  // the final count is read here, after that call returns, not passed in.
  const selectedLineupStatus = { ...base, promotedFromLiveCount };
  return { selectedRows, selectedLineupStatus, selection };
}
