/**
 * Walk-forward backtest of the V1 board's projection (baseline v0) against naive baselines, on the private hoopR import.
 *
 *   npx tsx scripts/nba-v1-backtest.ts [--input=data/nba/props-v1/player-games.json] [--out=data/nba/props-v1/backtest]
 *
 * Offline: no network, no provider, no credential. Reads the strict player-game import written by
 * scripts/nba-hoopr-import.ts and writes backtest-report.json under data/nba/ (gitignored). The data is ESPN-derived and
 * private to the owner (docs/nba-props-v1.md): the report is never committed or published. The console prints aggregate
 * error figures only, never a player or a team.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inside, writeAtomically } from "../src/lib/nba/props/pipeline/boardBuildRun";
import { summarize, type BacktestSummary, type Measure } from "../src/lib/nba/props/v1/backtest/backtestMetrics";
import { biasCorrectionGains, compareVariant, VARIANTS } from "../src/lib/nba/props/v1/backtest/opportunities";
import { walkForward, METHODS } from "../src/lib/nba/props/v1/backtest/walkForward";
import { parsePlayerGameImport } from "../src/lib/nba/props/v1/playerGameImport";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join("data", "nba");
const arg = (name: string): string | undefined => process.argv.slice(2).find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const fmt = (value: number | null, digits = 3): string => (value === null ? "n/a" : value.toFixed(digits));

function printHeadline(label: string, summary: BacktestSummary): void {
  console.log(`${label}: ${summary.rows} scored player-games`);
  for (const measure of ["minutes", "pts", "reb", "ast"] as Measure[]) {
    const cells = METHODS.map((m) => `${m} ${fmt(summary.headline[m][measure].mae)}`).join("  ");
    console.log(`  ${measure.padEnd(7)} MAE  ${cells}`);
  }
}

function main(): void {
  const input = arg("input") ?? path.join(DATA, "props-v1", "player-games.json");
  const outDir = arg("out") ?? path.join(DATA, "props-v1", "backtest");
  const imported = parsePlayerGameImport(JSON.parse(readFileSync(inside(root, input, [DATA], "the player-game import"), "utf8")));
  const season = walkForward(imported.rows, { targetSeasons: ["2025-26"] });
  const forward = walkForward(imported.rows, { targetSeasons: ["2026-27"] });
  const variants = VARIANTS.map((variant) => compareVariant(variant, walkForward(imported.rows, { targetSeasons: ["2025-26"], params: variant.params }).rows, season.rows));
  const report = {
    schemaVersion: "jkb-v1-backtest-report-v1",
    private: "hoopR/ESPN-derived; private research only; never commit or publish",
    source: { sourceId: imported.sourceId, retrievedAtUtc: imported.retrievedAtUtc },
    method: "baseline v0 (frozen public defaults) and naive L5, L10 and season-to-date, walk-forward: features from games strictly before each target, league rates from an expanding window",
    opportunities: {
      note: "measured, not adopted: nothing here changes the board's projection",
      parameterVariants: variants,
      segmentBiasCorrection: biasCorrectionGains(season.rows),
    },
    seasons: {
      "2025-26": { targets: season.targets, withoutHistory: season.withoutHistory, withoutPriors: season.withoutPriors, leftOutNoBaseline: season.rows.length - summarize(season.rows).rows, ...summarize(season.rows) },
      "2026-27": { targets: forward.targets, withoutHistory: forward.withoutHistory, withoutPriors: forward.withoutPriors, leftOutNoBaseline: forward.rows.length - summarize(forward.rows).rows, note: "the season-to-date baseline does not exist for a player's first game of the season, so those rows are left out of every comparison", ...summarize(forward.rows) },
    },
  };
  mkdirSync(inside(root, outDir, [DATA], "the backtest output directory"), { recursive: true });
  writeAtomically(inside(root, path.join(outDir, "backtest-report.json"), [DATA], "the backtest report"), `${JSON.stringify(report, null, 2)}\n`);
  for (const [name, part] of [["2025-26", season], ["2026-27", forward]] as const) {
    console.log(`${name}: ${part.targets} regular-season targets, ${part.withoutHistory} without an earlier game, ${part.withoutPriors} without league rates, ${report.seasons[name].leftOutNoBaseline} projected but left out of the comparison (no season-to-date baseline yet)`);
    printHeadline(`  ${name}`, report.seasons[name]);
  }
  for (const v of variants) {
    const cell = (m: Measure) => `${m} ${fmt(v.all[m].meanDiff)} [${fmt(v.all[m].ci95?.[0] ?? null)}, ${fmt(v.all[m].ci95?.[1] ?? null)}] / 2nd half ${fmt(v.secondHalf[m].meanDiff)}`;
    console.log(`  variant ${v.id}: MAE change vs default  ${(["minutes", "pts", "reb", "ast"] as Measure[]).map(cell).join("  |  ")}`);
  }
  console.log(`Report -> ${path.join(outDir, "backtest-report.json")}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof SyntaxError ? "a data file is not valid JSON" : error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
