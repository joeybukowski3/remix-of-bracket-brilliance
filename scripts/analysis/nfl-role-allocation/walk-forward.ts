/**
 * WU4B S4 — strict walk-forward evaluation of the share/allocation
 * architecture. Research only; writes
 * `data/nfl/props/role-allocation-walk-forward.json`.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/walk-forward.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NflRoleAllocationDataset, NflTeamPositionalPoolRow } from "../../../src/lib/nfl/props/roleAllocation/types";
import { buildShareObservations, evaluateAllocation } from "../../../src/lib/nfl/props/roleAllocation/walkForward";
import { NFL_SHARE_MODEL_KEYS, SHARE_SHRINKAGE_K_GRID, type NflShareObservation } from "../../../src/lib/nfl/props/roleAllocation/shareModels";
import type { NflTargetablePassApproach } from "../../../src/lib/nfl/props/roleAllocation/poolModels";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const OUT = join(ROOT, "data", "nfl", "props", "role-allocation-walk-forward.json");

const FOLDS = [
  { name: "fold1_train2022-2023_validate2024", train: [2022, 2023], validate: 2024 },
  { name: "fold2_train2022-2024_validate2025", train: [2022, 2023, 2024], validate: 2025 },
] as const;

type Obs = NflShareObservation;

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}
function leagueEff(rows: readonly Obs[]): number {
  const v = rows.reduce((s, r) => s + r.actualVolume, 0);
  const y = rows.reduce((s, r) => s + r.actualYards, 0);
  return v > 0 ? y / v : 0;
}
function poolRowsForSeasons(all: readonly NflTeamPositionalPoolRow[], seasons: readonly number[]): NflTeamPositionalPoolRow[] {
  return all.filter((p) => seasons.includes(p.season));
}

if (!existsSync(DATASET)) throw new Error("Run build-dataset.ts first.");
const dataset = JSON.parse(readFileSync(DATASET, "utf8")) as NflRoleAllocationDataset;
const { rush: rushAll, receiving, poolRows } = buildShareObservations(dataset);
// QB designed rushing stays on production v1 (WU4A pool excludes scrambles, which are ~40-50% of a mobile QB's rush volume). WU4B rush covers RB + WR-TE only.
const rush = rushAll.filter((o) => o.poolKey !== "qb");

// --- K selection: pick the shrinkage prior strength on fold1 only, freeze for fold2 ---
function kSelection(obs: readonly Obs[], leg: "rush" | "receiving"): { chosenK: number; curve: { k: number; shareMae: number; volumeMae: number }[] } {
  const train = obs.filter((o) => FOLDS[0].train.includes(o.season));
  const validate = obs.filter((o) => o.season === FOLDS[0].validate);
  const trainPools = poolRowsForSeasons(poolRows, FOLDS[0].train);
  const curve = SHARE_SHRINKAGE_K_GRID.map((k) => {
    const r = evaluateAllocation({
      leg,
      trainObs: train,
      validateObs: validate,
      trainPoolRows: trainPools,
      allPoolRows: poolRows,
      config: { model: "shrinkageBlend", poolSource: "actual", targetableApproach: "calibratedRatio" },
      shrinkageK: k,
      leagueEfficiency: leagueEff(train),
    });
    return { k, shareMae: r.overall.share?.mae ?? Infinity, volumeMae: r.overall.volume?.mae ?? Infinity };
  });
  const chosenK = [...curve].sort((a, b) => a.volumeMae - b.volumeMae)[0].k;
  return { chosenK, curve };
}
const rushK = kSelection(rush, "rush");
const receivingK = kSelection(receiving, "receiving");

// --- full grid over folds ---
const APPROACHES: NflTargetablePassApproach[] = ["calibratedRatio", "sacksScrambles"];
const POOL_SOURCES = ["actual", "projected"] as const;

function runLeg(leg: "rush" | "receiving", obs: readonly Obs[], chosenK: number) {
  return FOLDS.map((fold) => {
    const train = obs.filter((o) => fold.train.includes(o.season));
    const validate = obs.filter((o) => o.season === fold.validate);
    const trainPools = poolRowsForSeasons(poolRows, fold.train);
    const eff = leagueEff(train);
    const results = [];
    for (const model of NFL_SHARE_MODEL_KEYS) {
      for (const poolSource of POOL_SOURCES) {
        const approaches = leg === "receiving" ? APPROACHES : (["calibratedRatio"] as NflTargetablePassApproach[]);
        for (const targetableApproach of approaches) {
          if (leg === "rush" && targetableApproach !== "calibratedRatio") continue;
          results.push(
            evaluateAllocation({
              leg,
              trainObs: train,
              validateObs: validate,
              trainPoolRows: trainPools,
              allPoolRows: poolRows,
              config: { model, poolSource, targetableApproach },
              shrinkageK: chosenK,
              leagueEfficiency: eff,
            }),
          );
        }
      }
    }
    return { fold: fold.name, validateRows: validate.length, results };
  });
}

const report = {
  _meta: {
    schemaVersion: "nfl-role-allocation-walk-forward-v1",
    generatedAt: new Date().toISOString(),
    datasetGeneratedAt: dataset.generatedAt,
    folds: FOLDS,
    note:
      "poolSource=actual isolates the share model (feeds the realised team pool); poolSource=projected injects the S2 pool tendency model. Efficiency leg is production-equivalent (prior YPC/YPT shrunk toward league, 4-game prior). Normalisation coherence is an accounting check, NOT evidence of predictiveness.",
    shrinkageKSelection: { rush: rushK, receiving: receivingK },
  },
  rush: runLeg("rush", rush, rushK.chosenK),
  receiving: runLeg("receiving", receiving, receivingK.chosenK),
};

writeAtomic(OUT, `${JSON.stringify(report, null, 2)}\n`);

// --- console digest ---
function digest(leg: "rush" | "receiving") {
  const legReport = report[leg];
  console.log(`\n=== ${leg.toUpperCase()} (K=${leg === "rush" ? rushK.chosenK : receivingK.chosenK}) ===`);
  for (const fold of legReport) {
    console.log(`\n${fold.fold}  (${fold.validateRows} rows)`);
    for (const r of fold.results) {
      const c = r.config;
      const tag = `${c.model}/${c.poolSource}${leg === "receiving" ? "/" + c.targetableApproach : ""}`.padEnd(42);
      console.log(
        `  ${tag} shareMAE ${r.overall.share?.mae.toFixed(4)}  volMAE ${r.overall.volume?.mae.toFixed(2)}  volBias ${r.overall.volume?.bias.toFixed(2)}  ydsMAE ${r.overall.yards?.mae.toFixed(1)}  concord ${r.rankQuality.concordantPairRate.toFixed(3)}  |resid| ${Math.abs(r.coherence.meanVolumeResidual).toExponential(1)}`,
      );
    }
  }
}
digest("rush");
digest("receiving");
console.log(`\nWrote ${OUT}`);
