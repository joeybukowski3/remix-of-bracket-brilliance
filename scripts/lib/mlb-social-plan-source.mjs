/**
 * mlb-social-plan-source.mjs
 *
 * Shared candidate-pool / plan-building helpers for manual, network-free (or
 * local-data) SocialPostPlan construction. Extracted from
 * dry-run-mlb-social-post-plan.mjs (Phase 3) so the Phase 5 canonical
 * publisher CLI (post-mlb-social-canonical.mjs) can build the exact same kind
 * of plan without duplicating the fixture pools or the local HR loader.
 *
 * --source=fixture: deterministic, network-free, hand-authored candidate rows
 *   (includes a doubleheader example) fed through the real
 *   composeSocialPostPlan builder. Always available, always deterministic.
 * --source=local (HR only): reads public/data/mlb/hr-props-raw.json and runs
 *   it through the real getHrCandidatePool -> composeSocialPostPlan pipeline,
 *   same as the live HR posting script's own composition would. K has no
 *   local raw-data source in this phase (the live K pipeline sources from a
 *   live page scrape); --source=local for K falls back to fixture with a
 *   warning.
 * --source=production (Phase 7, scheduled canonical publisher ONLY): HR
 *   behaves identically to --source=local (the same committed, hourly-
 *   refreshed hr-props-raw.json IS the production HR data -- there is no
 *   separate "more production than local" source for HR). K reads the
 *   canonical K candidate pool written by
 *   scripts/generate-mlb-k-production-candidates.ts (the union of the
 *   Strikeout Props page's Top Over Plays / Top Under Plays, via
 *   buildCanonicalKCandidatePool -- see src/lib/mlb/kPropCanonicalCandidates.ts)
 *   at `productionKCandidatesPath`. Unlike --source=local, K NEVER falls
 *   back to fixture under --source=production: a missing/invalid candidates
 *   file throws instead, so a scheduled live run can never silently post
 *   fixture placeholder data as if it were real.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { composeSocialPostPlan, getHrCandidatePoolWithPendingConfirmation, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import { isDoubleheaderCode } from "./mlb-x-confirmation.mjs";
import { loadProductionKCandidatePool } from "./mlb-k-production-candidates.mjs";

export function kFixturePool() {
  return [
    { pitcher: "Zack Wheeler", pitcherId: 1001, team: "PHI", opponent: "ATL", gameId: 9001, kLine: 6.5, projectedKs: 7.4, direction: "OVER", projectionEdge: 0.9, oddsOver: "+105", oddsUnder: "-125", projectedIP: 6.1 },
    { pitcher: "Tarik Skubal", pitcherId: 1002, team: "DET", opponent: "CLE", gameId: 9002, kLine: 7.5, projectedKs: 8.1, direction: "OVER", projectionEdge: 0.6, oddsOver: "-110", oddsUnder: "-115", projectedIP: 6.4 },
    { pitcher: "Marcus Reyes", pitcherId: 1003, team: "NYY", opponent: "BOS", gameId: 9003, gameNumber: 1, isDoubleheader: true, kLine: 5.5, projectedKs: 4.2, direction: "UNDER", projectionEdge: -1.3, oddsOver: "+120", oddsUnder: "-140", projectedIP: 5.2 },
    { pitcher: "Marcus Reyes", pitcherId: 1003, team: "NYY", opponent: "BOS", gameId: 9004, gameNumber: 2, isDoubleheader: true, kLine: 5.0, projectedKs: 6.1, direction: "OVER", projectionEdge: 1.1, oddsOver: "-105", oddsUnder: "-115", projectedIP: 5.8 },
    { pitcher: "George Kirby", pitcherId: 1005, team: "SEA", opponent: "HOU", gameId: 9005, kLine: 5.5, projectedKs: 6.0, direction: "OVER", projectionEdge: 0.5, oddsOver: "-115", oddsUnder: "-105", projectedIP: 6.0 },
  ];
}

export function hrFixturePool() {
  return [
    { player: "Aaron Judge", playerId: 2001, team: "NYY", opponent: "BOS", gameId: 9003, gameNumber: 1, isDoubleheader: true, hrScore: 87.1, hrOddsYes: "+230", opposingPitcher: "Brayan Bello", barrelRate: 22.4, hardHitRate: 58.1, last7HR: 4, last30HR: 11 },
    { player: "Shohei Ohtani", playerId: 2002, team: "LAD", opponent: "SF", gameId: 9006, hrScore: 84.3, hrOddsYes: "+202", opposingPitcher: "Logan Webb", barrelRate: 20.9, hardHitRate: 55.3, last7HR: 3, last30HR: 9 },
    { player: "Aaron Judge", playerId: 2001, team: "NYY", opponent: "BOS", gameId: 9004, gameNumber: 2, isDoubleheader: true, hrScore: 79.8, hrOddsYes: "+260", opposingPitcher: "Kutter Crawford", barrelRate: 22.4, hardHitRate: 58.1, last7HR: 4, last30HR: 11 },
    { player: "Kyle Schwarber", playerId: 2004, team: "PHI", opponent: "ATL", gameId: 9001, hrScore: 75.8, hrOddsYes: "+350", opposingPitcher: "Spencer Strider", barrelRate: 18.6, hardHitRate: 52.7, last7HR: 2, last30HR: 8 },
    { player: "Marcell Ozuna", playerId: 2005, team: "ATL", opponent: "PHI", gameId: 9001, hrScore: 73.4, hrOddsYes: "+320", opposingPitcher: "Zack Wheeler", barrelRate: 17.1, hardHitRate: 50.2, last7HR: 1, last30HR: 6 },
  ];
}

export function slicePool(pool, count) {
  if (!count) return pool;
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * Mirrors post-mlb-hr-props-to-x.mjs's own local normalizer, but is a
 * standalone read-only copy here -- it never imports from or calls that
 * posting script, so this tool can never accidentally share state, receipts,
 * or side effects with it.
 */
function normalizeHrBatterForSelection(value) {
  const player = String(value?.player ?? "").trim();
  const team = String(value?.team ?? "").trim().toUpperCase();
  if (!player || !team) return null;
  const num = (v) => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
  };
  return {
    player,
    playerId: value?.playerId ?? null,
    gameId: value?.gameId ?? null,
    // Authoritative timing/doubleheader fields, propagated (never invented)
    // from the raw row -- Phase 6's readiness evaluator fails closed on a
    // missing gameStartTime, so this normalizer must not silently drop it.
    gameStartTime: value?.gameStartTime ?? null,
    gameNumber: Number.isInteger(value?.gameNumber) ? value.gameNumber : null,
    isDoubleheader: isDoubleheaderCode(value?.doubleHeader),
    team,
    opponent: String(value?.opponent ?? "").trim().toUpperCase(),
    opposingPitcher: String(value?.opposingPitcher ?? "").trim() || "TBD",
    hrScore: num(value?.hrScore),
    hrOddsYes: String(value?.hrOddsYes ?? "").trim() || null,
    barrelRate: num(value?.barrelRate),
    hardHitRate: num(value?.hardHitRate),
    last7HR: num(value?.last7HR),
    last30HR: num(value?.last30HR),
    lineupStatus: value?.lineupStatus ?? "unknown",
    battingOrder: value?.battingOrder ?? null,
  };
}

/**
 * @returns {{ candidatePool: Array<object>, pendingConfirmationCount: number }}
 */
export function loadLocalHrCandidatePool(root = process.cwd()) {
  const rawPath = path.join(root, "public", "data", "mlb", "hr-props-raw.json");
  if (!existsSync(rawPath)) throw new Error(`--source=local requires ${rawPath}, which does not exist.`);
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const batters = (Array.isArray(raw?.batters) ? raw.batters : Array.isArray(raw) ? raw : [])
    .map(normalizeHrBatterForSelection)
    .filter(Boolean);
  // Treat every lineup status as confirmed for preview purposes only -- this
  // helper never posts, so it is not subject to the live confirmation gate.
  // selectConfirmedHrProps only promotes a PROJECTED row on an explicit
  // `=== true` from liveConfirm (see mlb-hr-x-selection-core.mjs), so this
  // must return the literal boolean, not a truthy object. Because every row
  // is force-confirmed here, pendingConfirmationCount is always 0 for this
  // preview path -- an accurate reflection of "nothing withheld," not an
  // invented value.
  return getHrCandidatePoolWithPendingConfirmation({ batters, isGameStarted: () => false, liveConfirm: () => true });
}

/**
 * Builds a SocialPostPlan for one product from fixture or local data,
 * alongside the pendingConfirmationCount canonical readiness needs (see
 * deriveConfirmationCompleteness in mlb-x-canonical-readiness.mjs). The
 * fixture pools are hand-authored/deterministic with no real "still
 * unconfirmed" candidates behind them, so pendingConfirmationCount is
 * always 0 for --source=fixture -- an accurate statement about that source,
 * not an invented value.
 * @param {"k"|"hr"} productKey
 * @param {object} params
 * @param {"fixture"|"local"|"production"} params.source
 * @param {string} params.slateDate
 * @param {number|null} [params.rows]
 * @param {string} [params.root]
 * @param {(message: string) => void} [params.warn]
 * @param {string|null} [params.productionKCandidatesPath]  required when productKey==="k" and source==="production"
 * @returns {{ plan: import("./mlb-social-post-plan.mjs").SocialPostPlan|null, pendingConfirmationCount: number }}
 */
export function buildPlanFromSource(productKey, { source, slateDate, rows = null, root = process.cwd(), warn = console.warn, productionKCandidatesPath = null }) {
  const isK = productKey === "k";
  if (isK && source === "local") {
    warn("[social-plan-source] --source=local is not supported for K in this phase (no local raw K data source yet); falling back to fixture.");
  }

  let candidatePool;
  let pendingConfirmationCount;
  let sourceLabel;

  if (isK && source === "production") {
    // Fails closed (throws) rather than falling back to fixture -- see the
    // module doc above. A scheduled live run must never silently post
    // placeholder data.
    ({ candidatePool, pendingConfirmationCount } = loadProductionKCandidatePool({ path: productionKCandidatesPath }));
    sourceLabel = "production (Top Over/Under Plays)";
  } else if (!isK && (source === "local" || source === "production")) {
    ({ candidatePool, pendingConfirmationCount } = loadLocalHrCandidatePool(root));
    sourceLabel = source === "production" ? "production hr-props-raw.json" : "local hr-props-raw.json";
  } else {
    candidatePool = slicePool(isK ? kFixturePool() : hrFixturePool(), rows);
    pendingConfirmationCount = 0;
    sourceLabel = "fixture";
  }

  const plan = composeSocialPostPlan({
    product: isK ? SOCIAL_PRODUCT.K : SOCIAL_PRODUCT.HR,
    slateDate,
    candidatePool,
    title: isK ? "MLB STRIKEOUT PROPS" : "MLB HOME RUN TARGETS",
    generatedAt: new Date().toISOString(),
    sourceSummary: [sourceLabel],
  });

  return { plan, pendingConfirmationCount };
}
