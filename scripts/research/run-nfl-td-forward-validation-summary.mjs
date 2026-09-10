/**
 * RESEARCH ONLY — weekly prospective-2026 forward-validation summary for the
 * JKB TD Score calibration study.
 *
 * Joins the append-only forward archive to its grades (latest pregame
 * observation per player-game + its actualTd), then writes
 * `data/nfl/research/td-calibration/forward-validation-summary.json`:
 *   - overall n / TD rate / Brier / Log Loss / ECE / AUC for
 *       A production-window calibrated probability
 *       B trailing8 calibrated probability
 *       C Novig no-vig probability
 *       D sportsbook raw implied probability
 *   - calibration by probability bin
 *   - strata: weeks 2-4, weeks 5+, team changers / non, QB/RB/WR/TE, P>.40, P>.50
 *   - model-vs-market edge distributions + realized flat-stake ROI by threshold
 *   - REPORTED (never enforced) promotion-gate status
 *
 * Nothing here is promoted to production. Usage:
 *   node scripts/research/run-nfl-td-forward-validation-summary.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseJsonl, resolveCandidateCalibrator } from "./lib/nfl-td-forward-core.mjs";
import { buildForwardValidationSummary } from "./lib/nfl-td-forward-summary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SEASON = 2026;
const DIR = path.join(ROOT, "data/nfl/research/td-calibration");
const ARCHIVE = path.join(DIR, "forward-archive", `nfl-td-forward-archive-${SEASON}.jsonl`);
const GRADES = path.join(DIR, "forward-archive", `nfl-td-forward-grades-${SEASON}.jsonl`);
const CANDIDATE_MODEL = path.join(DIR, "candidate-model.json");
const OUT = path.join(DIR, "forward-validation-summary.json");

function latestObservationPerPlayerGame(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.playerId}|${row.gameId}`;
    const prev = byKey.get(key);
    if (!prev || String(row.observedAt) > String(prev.observedAt)) byKey.set(key, row);
  }
  return byKey;
}

function main() {
  if (!existsSync(ARCHIVE)) {
    console.error(`[td-forward-summary] no archive at ${path.relative(ROOT, ARCHIVE)} — nothing to summarize`);
    process.exit(0);
  }
  const archiveRows = parseJsonl(readFileSync(ARCHIVE, "utf8"));
  const grades = existsSync(GRADES) ? parseJsonl(readFileSync(GRADES, "utf8")) : [];
  const gradeByKey = new Map(grades.map((g) => [`${g.playerId}|${g.gameId}`, g]));

  const latest = latestObservationPerPlayerGame(archiveRows);
  const joined = [...latest.values()].map((row) => {
    const grade = gradeByKey.get(`${row.playerId}|${row.gameId}`) ?? null;
    return {
      ...row,
      actualTd: grade ? grade.actualTd : null,
      gradedAt: grade ? grade.gradedAt : null,
    };
  });

  let historicalStudy = null;
  let calibratorVersion = null;
  try {
    const artifact = JSON.parse(readFileSync(CANDIDATE_MODEL, "utf8"));
    calibratorVersion = resolveCandidateCalibrator(artifact).version;
    const held = artifact.heldOut2025?.full ?? null;
    if (held) {
      historicalStudy = {
        source: "candidate-model.json heldOut2025.full (trailing8, 2022-2024 fit)",
        ece: held.ece ?? null,
        brier: held.brier ?? null,
        auc: held.auc ?? null,
      };
    }
  } catch (err) {
    console.error(`[td-forward-summary] candidate model unavailable (${err.message}) — baseline omitted`);
  }

  const summary = buildForwardValidationSummary(joined, { calibratorVersion, historicalStudy });

  mkdirSync(DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(summary, null, 2) + "\n", "utf8");

  const o = summary.overall.series;
  console.log(`[td-forward-summary] player-games=${joined.length}, graded=${summary.coverage.gradedObservations}, weeks=${summary.coverage.completedWeeks.join(",") || "none"}`);
  for (const [k, v] of Object.entries(o)) {
    console.log(`  ${k.padEnd(30)} n=${v.n ?? 0} tdRate=${v.tdRate ?? "-"} Brier=${v.brier ?? "-"} LogLoss=${v.logLoss ?? "-"} ECE=${v.ece ?? "-"} AUC=${v.auc ?? "-"}`);
  }
  console.log(`  promotion gates: allPass=${summary.promotionGates.allGatesPass} anyFail=${summary.promotionGates.anyGateFails} notEvaluable=${summary.promotionGates.gatesNotYetEvaluable} (autoPromote=${summary.promotionGates.autoPromote})`);
  console.log(`[td-forward-summary] wrote ${path.relative(ROOT, OUT)}`);
}

main();
