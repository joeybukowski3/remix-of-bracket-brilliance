/**
 * WU4B S5E — role-transition calibration study.
 *
 * Question: should a team-changed player's CURRENT sourced depth rank get
 * more weight than their old-team usage share?
 *
 * Path A (here): historical walk-forward. LIMITATION — pre-2026 depth rank
 * is usage-derived (no true weekly ESPN depth charts), so this UNDERSTATES
 * the value of a real current-team sourced depth chart. Run with
 * requireSourced:false so the rule can fire on the proxy at all.
 *
 * Path B: 2026 structural sanity across every team-changed RB with a
 * sourced depth chart — see week1-candidate.ts `s5eRoleTransition`.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/calibrate-role-transition.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NflRoleAllocationDataset } from "../../../src/lib/nfl/props/roleAllocation/types";
import { buildShareObservations, evaluateAllocation, type NflAllocationEvalResult } from "../../../src/lib/nfl/props/roleAllocation/walkForward";
import type { NflTeamChangeCalibration } from "../../../src/lib/nfl/props/roleAllocation/shareModels";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const OUT = join(ROOT, "data", "nfl", "props", "role-allocation-calibrate-role-transition.json");

// S5A chosen calibration (frozen)
const S5A_ANCHOR = { minPriorGamesPlayed: 4, minConcentration: 0.6, minRawShare: 0.5, shareCap: 0.95, usePriorShare: true };
const S5A_NOHIST = { shareMultiplier: 0.55, rankBackoff: 0, rosterCompetitionRef: null };
const K = 1;
const TRAIN = [2022, 2023];
const SELECT = 2024;
const HOLDOUT = 2025;

function writeAtomic(p: string, t: string): void {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  try {
    writeFileSync(tmp, t, "utf8");
    renameSync(tmp, p);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw e;
  }
}

const dataset = JSON.parse(readFileSync(DATASET, "utf8")) as NflRoleAllocationDataset;
const { rush: rushAll, poolRows } = buildShareObservations(dataset);
const rush = rushAll.filter((o) => o.poolKey !== "qb");
const trainObs = rush.filter((o) => TRAIN.includes(o.season));
const trainPools = poolRows.filter((p) => TRAIN.includes(p.season));
const eff = (() => {
  const v = trainObs.reduce((s, r) => s + r.actualVolume, 0);
  return v > 0 ? trainObs.reduce((s, r) => s + r.actualYards, 0) / v : 0;
})();

const cals: (NflTeamChangeCalibration | null)[] = [null];
for (const carryover of [0, 0.25, 0.35, 0.5]) {
  for (const rankPriorBoost of [2, 3, 4]) {
    for (const conflictThreshold of [0.06, 0.1]) {
      cals.push({ carryover, rankPriorBoost, conflictThreshold, requireSourced: false });
    }
  }
}

function evalOn(season: number, cal: NflTeamChangeCalibration | null): NflAllocationEvalResult {
  return evaluateAllocation({
    leg: "rush",
    trainObs,
    validateObs: rush.filter((o) => o.season === season),
    trainPoolRows: trainPools,
    allPoolRows: poolRows,
    config: { model: "shrinkageBlend", poolSource: "projected", targetableApproach: "calibratedRatio" },
    shrinkageK: K,
    leagueEfficiency: eff,
    dominantAnchor: S5A_ANCHOR,
    noHistoryCal: S5A_NOHIST,
    teamChangeCal: cal,
  });
}

function digest(r: NflAllocationEvalResult) {
  const tc = r.byTransitionCohort.teamChanged?.volume;
  const same = r.byTransitionCohort.sameTeam?.volume;
  return {
    volMAE: +(r.overall.volume?.mae ?? 0).toFixed(3),
    volBias: +(r.overall.volume?.bias ?? 0).toFixed(3),
    ydsMAE: +(r.overall.yards?.mae ?? 0).toFixed(2),
    teamChangedN: tc?.n ?? 0,
    teamChangedMAE: +(tc?.mae ?? 0).toFixed(3),
    teamChangedBias: +(tc?.bias ?? 0).toFixed(3),
    sameTeamMAE: +(same?.mae ?? 0).toFixed(3),
    sameTeamBias: +(same?.bias ?? 0).toFixed(3),
    committee1A1BMAE: +(r.byCohort.committee1A1B?.volume?.mae ?? 0).toFixed(3),
    lowVolumeBackupMAE: +(r.byCohort.lowVolumeBackup?.volume?.mae ?? 0).toFixed(3),
    dominantRb1Bias: +(r.byCohort.dominantRb1?.volume?.bias ?? 0).toFixed(3),
    concordant: +(r.rankQuality.concordantPairRate ?? 0).toFixed(3),
    volResidualAbs: Math.abs(r.coherence.meanVolumeResidual),
  };
}

const base = digest(evalOn(SELECT, null));
const rows = cals.map((cal) => {
  const sel = digest(evalOn(SELECT, cal));
  const accept =
    cal != null &&
    Math.abs(sel.teamChangedBias) <= Math.abs(base.teamChangedBias) + 0.05 &&
    sel.teamChangedMAE <= base.teamChangedMAE + 0.05 &&
    sel.volMAE <= base.volMAE + 0.02 &&
    sel.committee1A1BMAE <= base.committee1A1BMAE + 0.03 &&
    sel.lowVolumeBackupMAE <= base.lowVolumeBackupMAE + 0.03 &&
    Math.abs(sel.sameTeamMAE - base.sameTeamMAE) <= 0.01 &&
    sel.volResidualAbs < 1e-9;
  return { cal, selection2024: sel, meetsGuardrails: accept, improvesTeamChanged: cal != null && sel.teamChangedMAE < base.teamChangedMAE - 0.02 };
});

const winners = rows.filter((r) => r.meetsGuardrails && r.improvesTeamChanged);
const chosen = winners.sort((a, b) => a.selection2024.teamChangedMAE - b.selection2024.teamChangedMAE)[0] ?? null;

const report = {
  _meta: {
    schemaVersion: "nfl-role-allocation-calibrate-role-transition-v1",
    generatedAt: new Date().toISOString(),
    limitation: "pre-2026 depth rank is usage-derived; historical folds cannot test the value of a TRUE sourced current-team depth chart for team-change transitions. requireSourced forced false here.",
    protocol: { trainSeasons: TRAIN, selectionFold: SELECT, untouchedHoldout: HOLDOUT, base: "S5A calibrated, no role-transition rule" },
    s5aBaseSelectionFold: base,
  },
  candidatesOnSelectionFold: rows,
  chosen: chosen
    ? {
        cal: chosen.cal,
        selection2024: chosen.selection2024,
        untouchedHoldout2025: digest(evalOn(HOLDOUT, chosen.cal)),
        base2025: digest(evalOn(HOLDOUT, null)),
      }
    : null,
};
writeAtomic(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log("S5A base (2024):", base);
console.log("\ncandidates (2024 selection fold):");
for (const r of rows) {
  if (r.cal == null) continue;
  console.log(
    `  ${r.meetsGuardrails ? (r.improvesTeamChanged ? "✓" : "~") : " "} co${r.cal.carryover} boost${r.cal.rankPriorBoost} thr${r.cal.conflictThreshold}  tcMAE ${r.selection2024.teamChangedMAE} tcBias ${r.selection2024.teamChangedBias}  sameMAE ${r.selection2024.sameTeamMAE}  volMAE ${r.selection2024.volMAE}  cmte ${r.selection2024.committee1A1BMAE}`,
  );
}
console.log("\nchosen:", chosen ? JSON.stringify(report.chosen, null, 1) : "NONE — no historically-validated improvement");
console.log(`Wrote ${OUT}`);
