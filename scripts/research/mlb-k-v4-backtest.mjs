/**
 * mlb-k-v4-backtest.mjs -- RESEARCH ONLY.
 *
 * Scores V2, V3 and V4 on the SAME leakage-safe rows the v3 study used, so a
 * difference between them is a model difference and never a sample difference.
 *
 * ROW SOURCE. `buildEvaluationRows` from the v3 research lib: the archive's
 * pregame rows, filtered for leakage safety and outcome validity, joined to
 * pregame season batters faced, the pregame venue split, that pitcher's own
 * start log, and EXPANDING league anchors (means over starts strictly before
 * each slate).
 *
 * CANDIDATES
 *   V2  production v2: alpha 0.55, v2 workload            -> archive v2ProjectedKs
 *   V3  shipped v3:    alpha BF/(BF+125), v3 workload     -> recomputed here
 *   V4  this study:    projected IP x projected K/IP      -> recomputed here
 *
 * V4 HISTORICAL FEATURE NOTES, stated rather than hidden:
 *   - Season anchors come from the pregame VENUE SPLIT (true whole-season
 *     workload and strikeouts), recent windows from the start log. This
 *     mirrors production exactly.
 *   - Opponent observations come from the start log, which covers roughly half
 *     of all league starts (it is harvested from archived detail artifacts).
 *     "The opponent's last 10" is therefore the last 10 LOGGED starts against
 *     that team. Production uses the complete opponentLastFiveVsStartersSummary,
 *     so this backtest if anything UNDERSTATES the opponent signal.
 *   - wRC+ ranks have no pregame history in this repo, so the wRC+ term is
 *     NEUTRAL for every historical row. It is capped at +/-3% (IP) and +/-2%
 *     (K/IP) in production for exactly this reason.
 *
 * The market line is read only in the scoring section, never by a projection.
 *
 * Usage: node scripts/research/mlb-k-v4-backtest.mjs [--json=out.json]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  loadSources,
  buildEvaluationRows,
  buildLeagueCentreIndex,
  attachV3Workload,
} from "./lib/mlb-k-v3-dataset.mjs";
import { V3_PRODUCTION_CONFIG, V3_PRODUCTION_OPPONENT_CONFIG } from "../lib/mlb-k-v3-production-adapter.mjs";
import { sampleSizeAlpha, SAMPLE_SIZE_ALPHA_K } from "../lib/mlb-k-projection-v3.mjs";
import { computeKProjectionV4 } from "../mlb-k/compute-k-projection-v4.mjs";
import { createStartLogBaselineResolver, normalizePitcherKey } from "../mlb-k/mlb-k-opponent-starter-context.mjs";
import { V4_DEFAULTS } from "../mlb-k/mlb-k-projection-v4-core.mjs";
import { buildLeagueStarterIndex, leagueStarterLevelsAsOf } from "../mlb-k/mlb-k-league-starter-index.mjs";

const ROOT = process.cwd();
const arg = (prefix, fallback = null) =>
  process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;

/**
 * Temporal split, identical to the v3 study's. The K/IP calibration constant
 * is estimated on DEV only; VALIDATION is reported but never used to choose it.
 */
const DEV_WINDOW_END = "2026-08-17";
const CALIBRATE_MODE = process.argv.slice(2).includes("--calibrate");

const MIN_K_RATE = 0.1;
const MAX_K_RATE = 0.4;
const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// ---------------------------------------------------------------- load
const sources = loadSources(ROOT);
const { rows, logByPitcher, leagueIndex, startLog } = buildEvaluationRows(sources);
const leagueCentreIndex = buildLeagueCentreIndex({ rows, startLog, logByPitcher, leagueIndex });
const withV3 = attachV3Workload(rows, {
  startLog,
  logByPitcher,
  config: V3_PRODUCTION_CONFIG,
  opponentConfig: V3_PRODUCTION_OPPONENT_CONFIG,
  leagueCentreIndex,
});

// Start log indexed for V4: normalized-name rows, plus per-opponent buckets.
const v4StartLog = startLog
  .map((start) => ({
    date: String(start.date),
    pitcherKey: normalizePitcherKey(start.pitcher),
    outs: finite(start.outs),
    strikeouts: finite(start.strikeouts),
    opponent: start.opponent ?? null,
    battersFaced: finite(start.bf),
  }))
  .filter((s) => s.date && s.pitcherKey && s.outs !== null && s.strikeouts !== null);

const byOpponent = new Map();
for (const start of v4StartLog) {
  if (!start.opponent) continue;
  const bucket = byOpponent.get(start.opponent);
  if (bucket) bucket.push(start);
  else byOpponent.set(start.opponent, [start]);
}
for (const bucket of byOpponent.values()) bucket.sort((a, b) => b.date.localeCompare(a.date));

// Starters-only league levels, expanding and leakage-safe. The all-pitcher
// league K rate V2/V3 carry is NOT a valid regression target for a starter's
// strikeouts per inning; see mlb-k-league-starter-index.mjs.
const leagueStarterIndex = buildLeagueStarterIndex(startLog);

// One resolver per opponent (each excludes starts against that same opponent).
const resolverByOpponent = new Map();
const resolverFor = (opponent) => {
  if (!resolverByOpponent.has(opponent)) {
    resolverByOpponent.set(opponent, createStartLogBaselineResolver(v4StartLog, { excludeOpponent: opponent }));
  }
  return resolverByOpponent.get(opponent);
};

/** True season anchor from the pregame venue split (never the partial log). */
function seasonOverrideFromSplit(split) {
  if (!split) return null;
  const games = finite(split.seasonGamesStarted);
  const outs = finite(split.seasonOuts);
  if (games === null || outs === null || games <= 0 || outs <= 0) return null;
  const innings = outs / 3;
  const strikeouts = (finite(split?.home?.strikeouts) ?? 0) + (finite(split?.away?.strikeouts) ?? 0);
  const bf = finite(split.seasonBattersFaced);
  return {
    starts: games,
    innings,
    ipPerStart: innings / games,
    kPerIP: strikeouts > 0 ? strikeouts / innings : null,
    bfPerIP: bf !== null && bf > 0 ? bf / innings : null,
  };
}

// ---------------------------------------------------------- projections
const scored = withV3.map((row) => {
  const leagueAnchor = row.leagueAnchor;
  const matchup = finite(row.v2MatchupAdjustment) ?? 0;
  const skill = finite(row.v2PitcherSkillRate);

  // --- V2 (production baseline: fixed alpha 0.55 on the v2 workload) ---
  const v2Ks = finite(row.v2ProjectedKs);
  const v2IP = finite(row.v2ProjectedInnings);
  const v2BF = finite(row.v2ProjectedBF);

  // --- V3 (shipped: sample-size alpha on the v3 workload) ---
  const { alpha } = sampleSizeAlpha(row.seasonBattersFaced, SAMPLE_SIZE_ALPHA_K);
  const v3BF = finite(row.v3?.battersFaced?.projectedBattersFaced);
  const v3IP = finite(row.v3?.workload?.finalProjectedIP);
  const v3Rate = skill === null || leagueAnchor === null
    ? null
    : clamp(leagueAnchor + alpha * (skill - leagueAnchor) + matchup, MIN_K_RATE, MAX_K_RATE);
  const v3Ks = v3Rate === null || v3BF === null ? null : v3Rate * v3BF;

  // --- V4 ---
  const opponentObservations = (byOpponent.get(row.opponent) ?? [])
    .filter((start) => start.date < row.slateDate)
    .slice(0, V4_DEFAULTS.opponentLookback ?? 10);

  const hand = String(row.handedness ?? "").toUpperCase().startsWith("L") ? "L" : "R";
  const vsHand = hand === "L" ? finite(row.inOppVsLhpKRate) : finite(row.inOppVsRhpKRate);
  const lineup = finite(row.inOppLineupKRate);
  const lineupFraction = lineup === null ? null : (lineup > 1 ? lineup / 100 : lineup);

  const v4 = computeKProjectionV4({
    pitcherStarts: (logByPitcher.get(row.pitcherId) ?? []).map((s) => ({
      date: String(s.date),
      outs: finite(s.outs),
      strikeouts: finite(s.strikeouts),
      battersFaced: finite(s.bf),
    })),
    opponentObservations,
    baselineFor: resolverFor(row.opponent),
    asOfDate: row.slateDate,
    role: "starter",
    seasonOverride: seasonOverrideFromSplit(row.seasonSplit),
    // --calibrate re-derives the constant, so it must run with it disabled.
    config: CALIBRATE_MODE ? { ...V4_DEFAULTS, kPerIpCalibration: 1 } : V4_DEFAULTS,
    leagueContext: {
      ipPerStart: row.leagueIpPerStart,
      bfPerIP: row.leagueBfPerIp,
      kRate: leagueAnchor,
      kPerIP: leagueStarterLevelsAsOf(leagueStarterIndex, row.slateDate).kPerIP,
    },
    opponentSplits: {
      kRateVsHand: vsHand !== null && vsHand > 0 ? vsHand : lineupFraction,
      recentKRate: finite(row.inOppRecentKRate),
      // No pregame wRC+ history exists in this repo; neutral by design.
      wrcRankRecent: null,
      wrcRankSeason: null,
    },
  });

  return {
    slateDate: row.slateDate,
    pitcher: row.pitcher,
    opponent: row.opponent,
    kLine: finite(row.kLine),
    actualKs: finite(row.actualKs),
    actualIP: finite(row.actualIP) ?? (finite(row.actualOuts) !== null ? row.actualOuts / 3 : null),
    actualBF: finite(row.actualBF),
    v2: { ks: v2Ks, ip: v2IP, bf: v2BF },
    v3: { ks: v3Ks, ip: v3IP, bf: v3BF },
    v4diag: {
      leagueKPerIP: leagueStarterLevelsAsOf(leagueStarterIndex, row.slateDate).kPerIP,
      leagueSource: leagueStarterLevelsAsOf(leagueStarterIndex, row.slateDate).source,
      seasonKPerIP: finite(v4.seasonKPerIP),
      neutralKPerIP: finite(v4.neutralPitcherKPerIP),
      regressedKPerIP: finite(v4.leagueRegressedKPerIP),
      kTrust: finite(v4.kRateLeagueTrust),
      env: finite(v4.opponentKEnvironment),
    },
    v4: {
      ks: finite(v4.projectedKs),
      ip: finite(v4.finalProjectedIP),
      bf: finite(v4.projectedBattersFaced),
      kPerIP: finite(v4.finalProjectedKPerIP),
      oppIPFactor: finite(v4.shrunkOpponentIPFactor),
      oppKFactor: finite(v4.shrunkOpponentKFactor),
      oppGames: v4.opponentUsableGames ?? 0,
      warnings: v4.warnings ?? [],
    },
    inOppRecentKRate: finite(row.inOppRecentKRate),
    seasonGamesStarted: finite(row.seasonGamesStarted),
  };
});

// ------------------------------------------------------------- scoring
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const r3 = (v) => (v === null || v === undefined ? null : Number(v.toFixed(4)));

function metrics(rowsIn, model) {
  const graded = rowsIn.filter((r) => r.actualKs !== null && r[model].ks !== null);
  const err = graded.map((r) => r[model].ks - r.actualKs);
  const abs = err.map(Math.abs);

  const ipRows = graded.filter((r) => r.actualIP !== null && r[model].ip !== null);
  const ipErr = ipRows.map((r) => r[model].ip - r.actualIP);
  const bfRows = graded.filter((r) => r.actualBF !== null && r[model].bf !== null);
  const bfErr = bfRows.map((r) => r[model].bf - r.actualBF);

  const lined = graded.filter((r) => r.kLine !== null);
  const edges = lined.map((r) => r[model].ks - r.kLine);
  // Directional: model side vs the line, graded against the actual result.
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const r of lined) {
    const side = r[model].ks - r.kLine;
    if (side === 0) { pushes += 1; continue; }
    const actualOver = r.actualKs > r.kLine;
    const modelOver = side > 0;
    if (r.actualKs === r.kLine) pushes += 1;
    else if (actualOver === modelOver) wins += 1;
    else losses += 1;
  }

  return {
    n: graded.length,
    mae: r3(mean(abs)),
    rmse: r3(Math.sqrt(mean(err.map((e) => e * e)))),
    signedError: r3(mean(err)),
    medianSignedError: r3(median(err)),
    pctAboveActual: r3((100 * err.filter((e) => e > 0).length) / (err.length || 1)),
    ipN: ipRows.length,
    ipMae: r3(mean(ipErr.map(Math.abs))),
    ipSignedError: r3(mean(ipErr)),
    bfN: bfRows.length,
    bfMae: r3(mean(bfErr.map(Math.abs))),
    bfSignedError: r3(mean(bfErr)),
    linedN: lined.length,
    pctAboveLine: r3((100 * edges.filter((e) => e > 0).length) / (edges.length || 1)),
    meanProjMinusLine: r3(mean(edges)),
    directionalHitRate: r3((100 * wins) / (wins + losses || 1)),
    directionalRecord: `${wins}-${losses}-${pushes}`,
  };
}

const MODELS = ["v2", "v3", "v4"];
const overall = Object.fromEntries(MODELS.map((m) => [m, metrics(scored, m)]));

const dev = scored.filter((r) => r.slateDate <= DEV_WINDOW_END);
const validation = scored.filter((r) => r.slateDate > DEV_WINDOW_END);

if (CALIBRATE_MODE) {
  const usable = dev.filter((r) => r.actualKs !== null && r.v4.ks !== null);
  const projected = usable.reduce((s, r) => s + r.v4.ks, 0);
  const actual = usable.reduce((s, r) => s + r.actualKs, 0);
  const factor = actual / projected;
  console.log("== K/IP CALIBRATION (development window only) ==");
  console.log("dev window   :", `<= ${DEV_WINDOW_END}`, "n =", usable.length);
  console.log("sum projected:", projected.toFixed(2));
  console.log("sum actual   :", actual.toFixed(2));
  console.log("kPerIpCalibration =", factor.toFixed(4));
  console.log("(validation window n =", validation.length, "- reported, never used to choose)");
  process.exit(0);
}

// ------------------------------------------------------------- buckets
const lineOf = (r) => r.kLine;
const buckets = {
  "low line (<=4.5)": (r) => lineOf(r) !== null && lineOf(r) <= 4.5,
  "high line (>=6.5)": (r) => lineOf(r) !== null && lineOf(r) >= 6.5,
  "low-K opponent": (r) => r.inOppRecentKRate !== null && r.inOppRecentKRate < 0.21,
  "high-K opponent": (r) => r.inOppRecentKRate !== null && r.inOppRecentKRate >= 0.23,
  "thin sample (GS<=8)": (r) => r.seasonGamesStarted !== null && r.seasonGamesStarted <= 8,
  "opponent ctx >=6 games": (r) => r.v4.oppGames >= 6,
  "opponent ctx <6 games": (r) => r.v4.oppGames < 6,
};
const bucketed = {};
for (const [label, predicate] of Object.entries(buckets)) {
  const subset = scored.filter(predicate);
  bucketed[label] = Object.fromEntries(MODELS.map((m) => [m, metrics(subset, m)]));
}

// -------------------------------------------------------------- report
console.log(`\nRows scored: ${scored.length} (graded K: ${overall.v2.n})\n`);
console.table(
  MODELS.map((m) => ({
    model: m.toUpperCase(),
    n: overall[m].n,
    MAE: overall[m].mae,
    RMSE: overall[m].rmse,
    "signed K": overall[m].signedError,
    "med signed": overall[m].medianSignedError,
    "%>actual": overall[m].pctAboveActual,
    "IP MAE": overall[m].ipMae,
    "IP signed": overall[m].ipSignedError,
    "BF MAE": overall[m].bfMae,
    "BF signed": overall[m].bfSignedError,
    "%>line": overall[m].pctAboveLine,
    "mean-line": overall[m].meanProjMinusLine,
    "dir%": overall[m].directionalHitRate,
    record: overall[m].directionalRecord,
  })),
);

for (const [label, subset] of [["DEVELOPMENT (<= " + DEV_WINDOW_END + ")", dev], ["VALIDATION (> " + DEV_WINDOW_END + ")", validation]]) {
  console.log(`
===== ${label} (n=${subset.length}) =====`);
  console.table(
    MODELS.map((m) => {
      const x = metrics(subset, m);
      return {
        model: m.toUpperCase(),
        n: x.n,
        MAE: x.mae,
        "signed K": x.signedError,
        "IP signed": x.ipSignedError,
        "BF signed": x.bfSignedError,
        "%>line": x.pctAboveLine,
        "mean-line": x.meanProjMinusLine,
        "dir%": x.directionalHitRate,
      };
    }),
  );
}

for (const [label, byModel] of Object.entries(bucketed)) {
  if (byModel.v2.n === 0) continue;
  console.log(`\n-- ${label} (n=${byModel.v2.n}) --`);
  console.table(
    MODELS.map((m) => ({
      model: m.toUpperCase(),
      MAE: byModel[m].mae,
      "signed K": byModel[m].signedError,
      "IP signed": byModel[m].ipSignedError,
      "%>line": byModel[m].pctAboveLine,
      "dir%": byModel[m].directionalHitRate,
    })),
  );
}

// ---- decomposition: where does V4's residual come from? ----
{
  const g = scored.filter((r) => r.actualKs !== null && r.actualIP !== null && r.v4.ks !== null && r.actualIP > 0);
  const sum = (f) => g.reduce((s, r) => s + f(r), 0);
  const cfBias = sum((r) => r.actualIP * r.v4.kPerIP - r.actualKs) / g.length;
  const ipBias = sum((r) => r.v4.ip - r.actualIP) / g.length;
  console.log("== V4 decomposition ==");
  console.log("n", g.length);
  console.log("aggregate ACTUAL K/IP        ", (sum((r) => r.actualKs) / sum((r) => r.actualIP)).toFixed(4));
  console.log("mean PROJECTED K/IP          ", (sum((r) => r.v4.kPerIP) / g.length).toFixed(4));
  console.log("mean league starter K/IP used", (sum((r) => r.v4diag.leagueKPerIP ?? 0) / g.length).toFixed(4), "src", g[0].v4diag.leagueSource);
  console.log("mean season K/IP (anchor)    ", (sum((r) => r.v4diag.seasonKPerIP ?? 0) / g.length).toFixed(4));
  console.log("mean neutral K/IP            ", (sum((r) => r.v4diag.neutralKPerIP ?? 0) / g.length).toFixed(4));
  console.log("mean regressed K/IP          ", (sum((r) => r.v4diag.regressedKPerIP ?? 0) / g.length).toFixed(4));
  console.log("mean K trust                 ", (sum((r) => r.v4diag.kTrust ?? 0) / g.length).toFixed(4));
  console.log("mean opponent K env          ", (sum((r) => r.v4diag.env ?? 0) / g.length).toFixed(4));
  console.log("mean IP bias (proj-actual)   ", ipBias.toFixed(4));
  console.log("K bias holding IP ACTUAL     ", cfBias.toFixed(4), " <- pure K/IP model bias");
  console.log("full K bias                  ", (sum((r) => r.v4.ks - r.actualKs) / g.length).toFixed(4));
}

const jsonOut = arg("--json=");
if (jsonOut) {
  writeFileSync(
    path.resolve(ROOT, jsonOut),
    `${JSON.stringify({ generatedAtSlateCount: scored.length, overall, bucketed }, null, 2)}\n`,
  );
  console.log(`\nWrote ${jsonOut}`);
}
