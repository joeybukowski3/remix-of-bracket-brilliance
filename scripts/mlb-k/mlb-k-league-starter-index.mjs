/**
 * mlb-k-league-starter-index.mjs
 *
 * Expanding, leakage-safe league STARTER levels from a completed-start log.
 *
 * WHY THIS EXISTS
 * ---------------
 * V4 regresses a thin pitcher's strikeouts-per-inning toward a league level.
 * The obvious anchor -- the league K rate per batter faced that V2/V3 already
 * carry, times batters faced per inning -- is wrong for this purpose, and
 * measurably so:
 *
 *   recovered league K rate (all pitchers) 0.2210 /BF x 4.2386 BF/IP = 0.9369 K/IP
 *   actual STARTER K rate                  0.2163 /BF x 4.2061 BF/IP = 0.9098 K/IP
 *
 * The V2/V3 anchor is an all-pitcher rate, and relievers strike out at a
 * markedly higher rate than starters. Regressing starters toward it pushes
 * every thin-sample starter upward by about 0.027 K/IP, which at a league
 * average of 5.3 innings is roughly +0.14 projected strikeouts per start --
 * almost exactly the residual over-projection the first V4 candidate showed.
 *
 * So the anchor is computed here from starters only, from the same start log
 * the rest of V4 uses.
 *
 * LEAKAGE. Each date maps to the mean over every start STRICTLY BEFORE it, so
 * a projection for slate D can never see a start from D or later. This mirrors
 * `buildLeagueIpIndex` in the v3 research lib; it is reimplemented here rather
 * than imported so that production never depends on a research module.
 */

export const LEAGUE_STARTER_INDEX_VERSION = "mlb-k-league-starter-index-v1";

/** Sane season-level fallbacks for a slate earlier than the log's first date. */
export const LEAGUE_STARTER_FALLBACK = Object.freeze({
  ipPerStart: 5.0,
  kPerIP: 0.91,
  bfPerIP: 4.21,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Builds the expanding index.
 *
 * @param {object[]|{starts:object[]}} startLog entries with `date`, `outs`
 *        (or `ip`), `strikeouts` and optionally `bf`.
 */
export function buildLeagueStarterIndex(startLog = []) {
  const starts = (Array.isArray(startLog) ? startLog : (startLog?.starts ?? []))
    .map((start) => {
      const outs = finite(start?.outs) ?? (finite(start?.ip) !== null ? finite(start.ip) * 3 : null);
      return {
        date: start?.date ? String(start.date) : null,
        innings: outs === null ? null : outs / 3,
        strikeouts: finite(start?.strikeouts),
        battersFaced: finite(start?.bf ?? start?.battersFaced),
      };
    })
    .filter((start) => start.date && start.innings !== null && start.innings > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dates = [...new Set(starts.map((start) => start.date))];
  const byDate = new Map();

  let games = 0;
  let innings = 0;
  let strikeouts = 0;
  let kInnings = 0;
  let battersFaced = 0;
  let bfInnings = 0;
  let cursor = 0;

  for (const date of dates) {
    // Everything strictly before `date` has already been folded in.
    byDate.set(date, {
      ipPerStart: games > 0 ? innings / games : null,
      kPerIP: kInnings > 0 ? strikeouts / kInnings : null,
      bfPerIP: bfInnings > 0 ? battersFaced / bfInnings : null,
      startsSeen: games,
    });
    while (cursor < starts.length && starts[cursor].date === date) {
      const start = starts[cursor];
      games += 1;
      innings += start.innings;
      if (start.strikeouts !== null) {
        strikeouts += start.strikeouts;
        kInnings += start.innings;
      }
      if (start.battersFaced !== null) {
        battersFaced += start.battersFaced;
        bfInnings += start.innings;
      }
      cursor += 1;
    }
  }

  const final = {
    ipPerStart: games > 0 ? innings / games : null,
    kPerIP: kInnings > 0 ? strikeouts / kInnings : null,
    bfPerIP: bfInnings > 0 ? battersFaced / bfInnings : null,
    startsSeen: games,
  };

  return { version: LEAGUE_STARTER_INDEX_VERSION, dates, byDate, final };
}

/**
 * League starter levels as known strictly before `date`.
 *
 * A slate with no starts of its own in the log falls through to the running
 * mean at the next logged date, which still contains only earlier starts.
 * Before the log begins, the documented fallbacks are used.
 */
export function leagueStarterLevelsAsOf(index, date) {
  if (!index || !index.dates.length) return { ...LEAGUE_STARTER_FALLBACK, source: "fallback" };
  const target = String(date);
  if (index.byDate.has(target)) {
    const entry = index.byDate.get(target);
    if (entry.startsSeen > 0) return { ...entry, source: "expanding" };
    return { ...LEAGUE_STARTER_FALLBACK, source: "fallback-empty-history" };
  }
  let best = null;
  for (const logged of index.dates) {
    if (logged < target) best = logged;
    else break;
  }
  if (best === null) return { ...LEAGUE_STARTER_FALLBACK, source: "fallback-before-log" };
  const next = index.dates.find((logged) => logged > best);
  const entry = next === undefined ? index.final : index.byDate.get(next);
  return { ...entry, source: next === undefined ? "expanding-final" : "expanding-next" };
}

export default buildLeagueStarterIndex;
