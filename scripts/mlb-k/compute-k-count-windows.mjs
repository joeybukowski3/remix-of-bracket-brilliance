/**
 * Season / L8 / L4 per-start count windows for the K +EV V1 model.
 *
 * Consumes the dated, real per-start rows already returned by
 * fetchPitcherWorkloadData's `allStarterAppearances` (see fetch-workload-data.mjs)
 * -- NOT the `starts` field, which upstream callers may cap below 8. All
 * innings are carried as real outs (mlbInningsToOuts on the raw "6.1"-style
 * string), never as pre-rounded decimal innings.
 */

export const K_COUNT_WINDOWS_MODEL_VERSION = "mlb-k-count-windows-v1";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * fetch-workload-data.mjs's parseInnings() produces `whole + partial/3` for
 * every MLB innings-pitched string, so the decimal value is always an exact
 * multiple of 1/3 and Math.round(ip * 3) recovers the real out count losslessly.
 */
function decimalInningsToOuts(inningsPitched) {
  const ip = finite(inningsPitched);
  return ip == null ? null : Math.round(ip * 3);
}

/**
 * @param {Array<{date:string|null, isStart:boolean, strikeouts:number|null, pitches:number|null, inningsPitched:number|null}>} starts
 *   Full-season starter appearances, sorted ascending by date. `inningsPitched`
 *   is the decimal value already produced by fetch-workload-data.mjs's
 *   parseInnings() -- an exact multiple of 1/3, converted back to real outs.
 */
export function aggregateCountWindow(starts) {
  let strikeouts = 0;
  let outs = 0;
  let pitches = 0;
  let pitchesKnown = true;
  let count = 0;
  for (const start of starts) {
    count += 1;
    strikeouts += finite(start.strikeouts) ?? 0;
    outs += decimalInningsToOuts(start.inningsPitched) ?? 0;
    const startPitches = finite(start.pitches);
    if (startPitches == null) pitchesKnown = false;
    else pitches += startPitches;
  }
  if (count === 0) return null;
  return {
    strikeouts,
    outs,
    pitches: pitchesKnown ? pitches : null,
    starts: count,
  };
}

/**
 * Build Season / L8 / L4 windows from a full-season starter appearance list.
 * Season = every eligible start this season. L8/L4 = the most recent 8/4
 * starts by date, sliced from the full list (not from any pre-capped window).
 */
export function buildKCountWindows(allStarterAppearancesThisSeason) {
  const sorted = [...allStarterAppearancesThisSeason].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  const season = aggregateCountWindow(sorted);
  const last8 = sorted.length >= 1 ? aggregateCountWindow(sorted.slice(-8)) : null;
  const last4 = sorted.length >= 1 ? aggregateCountWindow(sorted.slice(-4)) : null;
  return { season, last8, last4 };
}

export default buildKCountWindows;
