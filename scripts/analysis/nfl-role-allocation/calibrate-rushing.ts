/**
 * WU4B S5A — rushing calibration search for the two demonstrated biases:
 *   (1) dominant/workhorse RB1 ~ -2 carry bias
 *   (2) rookie / no-history RB ~ +2 carry bias
 *
 * Selection protocol: fit on 2022+2023, choose the calibration on the 2024
 * SELECTION fold, then report the frozen choice on the untouched 2025
 * holdout. Parameters are never chosen on 2025.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/calibrate-rushing.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NflRoleAllocationDataset } from "../../../src/lib/nfl/props/roleAllocation/types";
import { buildShareObservations, evaluateAllocation, type NflAllocationEvalResult } from "../../../src/lib/nfl/props/roleAllocation/walkForward";
import type { NflDominantAnchorConfig } from "../../../src/lib/nfl/props/roleAllocation/allocate";
import type { NflNoHistoryCalibration } from "../../../src/lib/nfl/props/roleAllocation/shareModels";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const OUT = join(ROOT, "data", "nfl", "props", "role-allocation-calibrate-rushing.json");

const TRAIN = [2022, 2023];
const SELECT = 2024;
const HOLDOUT = 2025;
const K = 1;

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw e;
  }
}

if (!existsSync(DATASET)) throw new Error("Run build-dataset.ts first.");
const dataset = JSON.parse(readFileSync(DATASET, "utf8")) as NflRoleAllocationDataset;
const { rush: rushAll, poolRows } = buildShareObservations(dataset);
// RB + WR-TE only; QB designed rushing is retained on production v1 (see week1-candidate.ts).
const rush = rushAll.filter((o) => o.poolKey !== "qb");
const trainObs = rush.filter((o) => TRAIN.includes(o.season));
const trainPools = poolRows.filter((p) => TRAIN.includes(p.season));
const leagueEfficiency = (() => {
  const v = trainObs.reduce((s, r) => s + r.actualVolume, 0);
  const y = trainObs.reduce((s, r) => s + r.actualYards, 0);
  return v > 0 ? y / v : 0;
})();

type Candidate = {
  name: string;
  dominantAnchor: NflDominantAnchorConfig | null;
  noHistoryCal: NflNoHistoryCalibration | null;
  rbPoolShareBoost: number;
};

const candidates: Candidate[] = [{ name: "S4-baseline", dominantAnchor: null, noHistoryCal: null, rbPoolShareBoost: 0 }];

for (const minPriorGamesPlayed of [4, 6]) {
  for (const minConcentration of [0.6, 0.7]) {
    for (const shareCap of [0.88, 0.95]) {
      for (const usePriorShare of [false, true]) {
        candidates.push({
          name: `anchor(g${minPriorGamesPlayed},c${minConcentration},cap${shareCap}${usePriorShare ? ",prior" : ""})`,
          dominantAnchor: { minPriorGamesPlayed, minConcentration, minRawShare: 0.5, shareCap, usePriorShare },
          noHistoryCal: null,
          rbPoolShareBoost: 0,
        });
      }
    }
  }
}
for (const shareMultiplier of [0.55, 0.7, 0.85]) {
  for (const rankBackoff of [0, 1]) {
    for (const rosterCompetitionRef of [null, 5] as (number | null)[]) {
      candidates.push({
        name: `noHist(m${shareMultiplier},b${rankBackoff},rc${rosterCompetitionRef ?? "-"})`,
        dominantAnchor: null,
        noHistoryCal: { shareMultiplier, rankBackoff, rosterCompetitionRef },
        rbPoolShareBoost: 0,
      });
    }
  }
}
for (const rbPoolShareBoost of [0.015, 0.03, 0.05]) {
  candidates.push({ name: `rbBoost(${rbPoolShareBoost})`, dominantAnchor: null, noHistoryCal: null, rbPoolShareBoost });
}

function evalOn(validateSeason: number, c: Candidate): NflAllocationEvalResult {
  return evaluateAllocation({
    leg: "rush",
    trainObs,
    validateObs: rush.filter((o) => o.season === validateSeason),
    trainPoolRows: trainPools,
    allPoolRows: poolRows,
    config: { model: "shrinkageBlend", poolSource: "projected", targetableApproach: "calibratedRatio" },
    shrinkageK: K,
    leagueEfficiency,
    dominantAnchor: c.dominantAnchor,
    noHistoryCal: c.noHistoryCal,
    rbPoolShareBoost: c.rbPoolShareBoost,
  });
}

function digest(r: NflAllocationEvalResult) {
  return {
    volMAE: +(r.overall.volume?.mae ?? 0).toFixed(3),
    volBias: +(r.overall.volume?.bias ?? 0).toFixed(3),
    ydsMAE: +(r.overall.yards?.mae ?? 0).toFixed(2),
    dominantRb1Bias: +(r.byCohort.dominantRb1?.volume?.bias ?? 0).toFixed(3),
    dominantRb1MAE: +(r.byCohort.dominantRb1?.volume?.mae ?? 0).toFixed(3),
    rookieNoHistoryBias: +(r.byCohort.rookieNoHistory?.volume?.bias ?? 0).toFixed(3),
    rookieNoHistoryMAE: +(r.byCohort.rookieNoHistory?.volume?.mae ?? 0).toFixed(3),
    committee1A1BMAE: +(r.byCohort.committee1A1B?.volume?.mae ?? 0).toFixed(3),
    lowVolumeBackupMAE: +(r.byCohort.lowVolumeBackup?.volume?.mae ?? 0).toFixed(3),
    volResidualAbs: Math.abs(r.coherence.meanVolumeResidual),
    poolsNegOrOver: r.coherence.poolsWithNegativeShare + r.coherence.poolsWithShareOverOne,
  };
}

const baseSel = digest(evalOn(SELECT, candidates[0]));
const rows = candidates.map((c) => {
  const sel = digest(evalOn(SELECT, c));
  // acceptance vs S4 baseline, on the SELECTION fold only
  const accept =
    Math.abs(sel.dominantRb1Bias) <= Math.abs(baseSel.dominantRb1Bias) - 0.4 &&
    Math.abs(sel.rookieNoHistoryBias) <= Math.abs(baseSel.rookieNoHistoryBias) - 0.4 &&
    sel.committee1A1BMAE <= baseSel.committee1A1BMAE + 0.05 &&
    sel.lowVolumeBackupMAE <= baseSel.lowVolumeBackupMAE + 0.05 &&
    sel.volMAE <= baseSel.volMAE + 0.03 &&
    sel.ydsMAE <= baseSel.ydsMAE + 0.2 &&
    sel.volResidualAbs < 1e-9 &&
    sel.poolsNegOrOver === 0;
  return { name: c.name, candidate: c, selection2024: sel, meetsAcceptance: accept };
});

// combined: best anchor + best noHistory + best rbBoost among candidates that
// individually pass the non-regression guardrails (committee, backup, pooled MAE, coherence).
function passesGuardrails(sel: ReturnType<typeof digest>): boolean {
  return (
    sel.committee1A1BMAE <= baseSel.committee1A1BMAE + 0.05 &&
    sel.lowVolumeBackupMAE <= baseSel.lowVolumeBackupMAE + 0.05 &&
    sel.volMAE <= baseSel.volMAE + 0.03 &&
    sel.ydsMAE <= baseSel.ydsMAE + 0.2 &&
    sel.volResidualAbs < 1e-9 &&
    sel.poolsNegOrOver === 0
  );
}
function bestOf(prefix: string, metricKey: "dominantRb1Bias" | "rookieNoHistoryBias"): Candidate | null {
  const pool = rows.filter((r) => r.name.startsWith(prefix) && passesGuardrails(r.selection2024));
  if (pool.length === 0) return null;
  const byTarget = [...pool].sort((a, b) => Math.abs(a.selection2024[metricKey]) - Math.abs(b.selection2024[metricKey]));
  const bestBias = Math.abs(byTarget[0].selection2024[metricKey]);
  // among candidates within 0.15 of the best target-bias, take the one that least disturbs committees.
  const nearBest = byTarget.filter((r) => Math.abs(r.selection2024[metricKey]) <= bestBias + 0.15);
  return nearBest.sort((a, b) => a.selection2024.committee1A1BMAE - b.selection2024.committee1A1BMAE)[0].candidate;
}
const bestAnchor = bestOf("anchor(", "dominantRb1Bias");
const bestNoHist = bestOf("noHist(", "rookieNoHistoryBias");
// rbPoolShareBoost is evaluated as an individual candidate only — it trades committee/backup
// accuracy for a small RB1-bias gain the anchor already delivers, so it is not composed in.
const combined: Candidate = {
  name: `combined[${bestAnchor?.name ?? "-"} + ${bestNoHist?.name ?? "-"}]`,
  dominantAnchor: bestAnchor?.dominantAnchor ?? null,
  noHistoryCal: bestNoHist?.noHistoryCal ?? null,
  rbPoolShareBoost: 0,
};
const combinedSel = digest(evalOn(SELECT, combined));
const combinedAccept =
  Math.abs(combinedSel.dominantRb1Bias) <= Math.abs(baseSel.dominantRb1Bias) - 0.4 &&
  Math.abs(combinedSel.rookieNoHistoryBias) <= Math.abs(baseSel.rookieNoHistoryBias) - 0.4 &&
  combinedSel.committee1A1BMAE <= baseSel.committee1A1BMAE + 0.05 &&
  combinedSel.lowVolumeBackupMAE <= baseSel.lowVolumeBackupMAE + 0.05 &&
  combinedSel.volMAE <= baseSel.volMAE + 0.03 &&
  combinedSel.ydsMAE <= baseSel.ydsMAE + 0.2 &&
  combinedSel.volResidualAbs < 1e-9 &&
  combinedSel.poolsNegOrOver === 0;

const chosen = combinedAccept ? combined : { name: "S4-baseline (retain)", dominantAnchor: null, noHistoryCal: null, rbPoolShareBoost: 0 };

const report = {
  _meta: {
    schemaVersion: "nfl-role-allocation-calibrate-rushing-v1",
    generatedAt: new Date().toISOString(),
    protocol: { trainSeasons: TRAIN, selectionFold: SELECT, untouchedHoldout: HOLDOUT, model: "shrinkageBlend", shrinkageK: K, poolSource: "projected" },
    s4BaselineSelectionFold: baseSel,
  },
  candidatesOnSelectionFold: rows,
  combined: { candidate: combined, selection2024: combinedSel, meetsAcceptance: combinedAccept },
  chosen: {
    candidate: chosen,
    selectionFold2024: digest(evalOn(SELECT, chosen as Candidate)),
    untouchedHoldout2025: digest(evalOn(HOLDOUT, chosen as Candidate)),
    s4BaselineHoldout2025: digest(evalOn(HOLDOUT, candidates[0])),
  },
};

writeAtomic(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log("S4 baseline (2024 selection fold):", baseSel);
console.log("\nCandidates on 2024 selection fold:");
for (const r of rows) console.log(`  ${r.meetsAcceptance ? "✓" : " "} ${r.name.padEnd(34)} volMAE ${r.selection2024.volMAE}  RB1bias ${r.selection2024.dominantRb1Bias}  rookiebias ${r.selection2024.rookieNoHistoryBias}  cmteMAE ${r.selection2024.committee1A1BMAE}  bkupMAE ${r.selection2024.lowVolumeBackupMAE}`);
console.log(`\ncombined ${combined.name}\n  2024:`, combinedSel, "\n  accept:", combinedAccept);
console.log(`\nCHOSEN: ${chosen.name}`);
console.log("  2024 selection:", report.chosen.selectionFold2024);
console.log("  2025 UNTOUCHED:", report.chosen.untouchedHoldout2025);
console.log("  2025 S4 baseline:", report.chosen.s4BaselineHoldout2025);
console.log(`\nWrote ${OUT}`);
