/**
 * RETIRED FROM PRODUCTION (2026-08-19). This is the nfl-spread-v0.1.0
 * composite (opponent-adjusted EPA + point differential, its own fitted
 * beta) that used to generate the public matchup-projections.json artifact.
 *
 * It no longer generates the authoritative public JKB spread — that's now
 * scripts/generate-nfl-matchup-projections.mts, driven by the canonical
 * Current OVR board (src/lib/nfl/currentRating2026.ts) and Power Number
 * (src/lib/nfl/jkbPowerNumber2026.ts), per the approved 2026-08-19
 * methodology.
 *
 * Kept here, unmodified in logic, ONLY for historical/model comparison and
 * backtesting (see scripts/analysis/nfl-current-ovr-spread-calibration/,
 * which already reuses scripts/lib/nfl-spread-model.mjs and
 * nfl-spread-dataset.mjs directly for exactly this purpose). Writes to an
 * analysis-only output path — it can never again overwrite the production
 * public/data/nfl/matchup-projections.json artifact.
 *
 * Reads only the committed Phase 6 EPA cache and the repository's own
 * schedule/results; the network is never touched.
 *
 * NO MARKET DATA IS IMPORTED HERE. This file does not read the market artifact,
 * and no spread, moneyline, total or ATS value participates in any feature, the
 * beta fit or the prediction. Market comparison belongs to the consumer layer,
 * strictly after a projection exists.
 *
 * Usage:
 *   node scripts/analysis/nfl-spread-v0.1.0-legacy/generate-legacy-projections.mjs
 *   node scripts/analysis/nfl-spread-v0.1.0-legacy/generate-legacy-projections.mjs --dry-run
 *   node scripts/analysis/nfl-spread-v0.1.0-legacy/generate-legacy-projections.mjs --backtest
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "../../lib/nfl-data-meta.mjs";
import {
  BACKTEST_SEASONS,
  HISTORY_SEASONS,
  assertNoLeakage,
  loadSeason,
  loadSpreadDataset,
  runBacktest,
} from "../../lib/nfl-spread-dataset.mjs";
import {
  GAME_COMPLETION_MS,
  NFL_SPREAD_MODEL_VERSION,
  SPREAD_EPA_DEFINITION,
  SPREAD_EPA_SOURCE,
  SPREAD_HFA_POINTS,
  SPREAD_PRIOR_K,
  SPREAD_WEIGHTS,
  projectGame,
  toConventionalSpread,
} from "../../lib/nfl-spread-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_FILE = join(ROOT, "scripts", "analysis", "nfl-spread-v0.1.0-legacy", "out", "legacy-matchup-projections.json");

export const PROJECTIONS_SCHEMA_VERSION = "nfl-matchup-projections-v1";

const CURRENT_SEASON = 2026;

/**
 * Sanity band for the fitted beta, around the ~4.6 the Phase 8B audit measured
 * entering 2026. Deliberately a guard rail rather than a hard-coded value: the
 * fit stays deterministic from the committed data, and a beta drifting outside
 * this range means something upstream has changed and must be looked at before
 * anything is published.
 */
const BETA_EXPECTED = { min: 3.5, max: 5.5 };

function parseArgs(argv) {
  const args = { dryRun: false, backtest: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--backtest") args.backtest = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const dataset = loadSpreadDataset(ROOT);

  if (args.backtest) {
    printBacktest(dataset);
    return;
  }

  const current = loadSeason(ROOT, CURRENT_SEASON);
  if (!current) throw new Error(`Missing schedule for ${CURRENT_SEASON}`);

  const { beta, observations: fitObservations, fitSeasons } = dataset.betaFor(CURRENT_SEASON);
  if (beta < BETA_EXPECTED.min || beta > BETA_EXPECTED.max) {
    throw new Error(
      `fitted beta ${beta.toFixed(4)} is outside the validated band ` +
        `${BETA_EXPECTED.min}-${BETA_EXPECTED.max}; refusing to publish`
    );
  }
  const betaFitThrough = fitSeasons[fitSeasons.length - 1];

  const side = (s) => ({
    offAdj: s.offAdj,
    defAdj: s.defAdj,
    pdgAdj: s.pdgAdj,
    compositeZ: s.compositeZ,
    sampleGames: s.sampleGames,
    lastSampleGameId: s.sampleGameIds[s.sampleGameIds.length - 1] ?? null,
    priorSeason: s.priorSeason,
    priorWeight: s.priorWeight,
    currentSeasonGames: s.currentGames,
    priorSeasonGames: s.priorGames,
  });

  const projections = {};
  let projected = 0;
  for (const g of current.games) {
    if (g.seasonType !== "REG") continue;
    const kickoff = g.dateUtc ? Date.parse(g.dateUtc) : Number.NaN;
    if (!Number.isFinite(kickoff)) continue;
    const strength = dataset.strengthAt(kickoff, CURRENT_SEASON);
    if (!strength) continue;
    const home = strength.get(g.homeAbbr);
    const away = strength.get(g.awayAbbr);
    if (!home || !away) continue;
    assertNoLeakage(g.gameId, home, away);

    const neutralSite = g.neutralSite === true;
    const p = projectGame({
      homeStrength: home.compositeZ,
      awayStrength: away.compositeZ,
      neutralSite,
      beta,
    });

    projections[g.gameId] = {
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      kickoff: g.dateUtc,
      awayTeam: g.awayAbbr,
      homeTeam: g.homeAbbr,
      neutralSite,
      beta,
      away: side(away),
      home: side(home),
      strengthDiff: p.strengthDiff,
      neutralMargin: p.neutralMargin,
      homeFieldAdvantage: p.homeFieldAdvantage,
      projectedHomeMargin: p.projectedHomeMargin,
      projectedSpread: toConventionalSpread(p.projectedHomeMargin, {
        homeTeam: g.homeAbbr,
        awayTeam: g.awayAbbr,
      }),
    };
    projected += 1;
  }

  if (projected === 0) throw new Error("no games projected; refusing to overwrite a known-good artifact");

  const artifact = {
    _meta: buildNflMeta({
      source: `${SPREAD_EPA_SOURCE} + repository schedule/results`,
      season: CURRENT_SEASON,
      week: null,
      modelVersion: NFL_SPREAD_MODEL_VERSION,
      notes: [
        "RETIRED FROM PRODUCTION 2026-08-19 — analysis/comparison artifact only, never consumed by the public site.",
        "Independent football-performance model. No sportsbook spread, moneyline, total, ATS or over/under value is used as a predictive input, in the sample, the opponent adjustment, the composite or the beta fit.",
        "Separate from nfl-power-v0.3.1: that model is a balanced descriptive team rating (40/40/20, 1-99 scale); this one is calibrated for future scoring margin (45/35/20, points) and found offence modestly more predictive.",
        "EPA is the Phase 6 nflfastR play-by-play definition (matchup-epa-v1); the legacy stats_team_week EPA is never used.",
        "Sample is fixed: all completed regular-season games finished before kickoff.",
        "Prior season is the full previous regular season, weighted K/(K + completed current-season games).",
        "Home-field advantage is a fixed 2.0 points, 0.0 at neutral sites, and is never fitted. Beta is the model's only fitted parameter.",
        "Positive projectedHomeMargin means the home team is favoured by that many points.",
        "Backtesting has NOT demonstrated a consistent edge against the market: 2025 model MAE ~10.3 against market ~9.7, and an ATS diagnostic near 48.7%. No betting recommendation is produced.",
      ],
    }),
    schemaVersion: PROJECTIONS_SCHEMA_VERSION,
    modelVersion: NFL_SPREAD_MODEL_VERSION,
    currentSeason: CURRENT_SEASON,
    model: {
      weights: SPREAD_WEIGHTS,
      priorK: SPREAD_PRIOR_K,
      homeFieldAdvantage: SPREAD_HFA_POINTS,
      neutralSiteHomeFieldAdvantage: 0,
      recency: "flat — every completed game weighted equally, no decay",
      opponentAdjustment: "one-pass",
      epaSource: SPREAD_EPA_SOURCE,
      epaDefinition: SPREAD_EPA_DEFINITION,
      completionRuleMs: GAME_COMPLETION_MS,
      beta,
      betaFitSeasons: fitSeasons,
      betaFitObservations: fitObservations,
      betaFitThrough,
      fittedParameters: ["beta"],
      marketInputUsed: false,
    },
    projections,
    provenance: {
      generatedAt: new Date().toISOString(),
      dataCutoff: `all completed regular-season games through ${betaFitThrough}`,
      historySeasons: HISTORY_SEASONS,
      gamesProjected: projected,
      epaCacheDir: "data/nfl/nflverse/epa-team-game",
      rawPlayByPlayCommitted: false,
    },
  };

  console.log(
    `[nfl:legacy-projections] ${NFL_SPREAD_MODEL_VERSION} beta=${beta.toFixed(4)} ` +
      `(fit on ${fitSeasons.join(",")}, ${fitObservations} games)  projected ${projected} ${CURRENT_SEASON} games`
  );

  if (args.dryRun) {
    console.log("[nfl:legacy-projections] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort — the known-good artifact is what matters */
      }
    }
    throw err;
  }
  console.log(`[nfl:legacy-projections] wrote ${OUT_FILE}`);
}

/** Developer-facing walk-forward report. Never part of artifact generation. */
function printBacktest(dataset) {
  const { bySeason, pooled } = runBacktest(dataset);
  const pct = (v) => `${(100 * v).toFixed(1)}%`;
  console.log(`=== ${NFL_SPREAD_MODEL_VERSION} walk-forward backtest ===`);
  console.log("season | beta   | n    | MAE    | RMSE   | bias   | winner");
  for (const season of BACKTEST_SEASONS) {
    const m = bySeason.get(season);
    console.log(
      `  ${season} | ${m.beta.toFixed(3)} | ${String(m.n).padStart(4)} | ${m.mae.toFixed(3)} | ` +
        `${m.rmse.toFixed(3)} | ${m.bias.toFixed(3).padStart(6)} | ${pct(m.winnerAccuracy)}`
    );
  }
  console.log(
    `  POOL |   -    | ${pooled.n} | ${pooled.mae.toFixed(3)} | ${pooled.rmse.toFixed(3)} | ` +
      `${pooled.bias.toFixed(3).padStart(6)} | ${pct(pooled.winnerAccuracy)}`
  );
  console.log(
    `  calibration slope ${pooled.calibrationSlope.toFixed(3)} ` +
      `intercept ${pooled.calibrationIntercept.toFixed(3)}`
  );
}

try {
  main();
} catch (err) {
  console.error(`[nfl:legacy-projections] FAILED: ${err.message}`);
  console.error("[nfl:legacy-projections] existing artifact left untouched");
  process.exit(1);
}
