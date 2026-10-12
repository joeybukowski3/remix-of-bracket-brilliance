/**
 * Walk-forward backtest of nba-props-baseline-v0 against naive rolling averages.
 *
 *   npm run nba:backtest-baseline
 *   npm run nba:backtest-baseline -- --train=2023-24 --validation=2024-25 --holdout=2025-26
 *
 * Reads data/nba/canonical (run nba:build-dataset first). No network. Writes a
 * new run directory under data/nba/backtest/<runId>/ (gitignored):
 *   predictions-<period>.jsonl  pregame snapshots, no results
 *   outcomes-<period>.jsonl     actual results, written separately
 *   tuning.json, metrics.json, report.md
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildTargets,
  estimatePriors,
  evaluate,
  MODEL_METHOD,
  toOutcome,
  toPredictionSnapshot,
  tuneParams,
  type BacktestPeriod,
  type PeriodEvaluation,
} from "../src/lib/nba/props/backtest";
import { BASELINE_MODEL_VERSION, DEFAULT_BASELINE_PARAMS } from "../src/lib/nba/props/projection";
import { seasonStartYear } from "../src/lib/nba/props/seasonType";
import { PROJECTED_STATS, type NbaPlayerGame, type NbaTeamGame } from "../src/lib/nba/props/types";

const CANONICAL_DIR = "data/nba/canonical";
const BACKTEST_DIR = "data/nba/backtest";
const COMPARISON_METHODS = ["naive_l10", "naive_season_to_date"];

function arg(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function readJsonl<T>(file: string): T[] {
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

const toJsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const fmt = (value: number | null, digits = 2) => (value === null ? "—" : value.toFixed(digits));

function methodTable(byMethod: PeriodEvaluation["byMethod"], missingRate?: Record<string, number>): string {
  const header = `| method | ${PROJECTED_STATS.map((s) => `${s} MAE | ${s} RMSE`).join(" | ")} | n${missingRate ? " | missing" : ""} |`;
  const divider = `|${" --- |".repeat(2 * PROJECTED_STATS.length + 2 + (missingRate ? 1 : 0))}`;
  const rows = Object.entries(byMethod).map(([method, stats]) => {
    const cells = PROJECTED_STATS.map((s) => `${fmt(stats[s].mae)} | ${fmt(stats[s].rmse)}`).join(" | ");
    const missing = missingRate ? ` | ${(missingRate[method] * 100).toFixed(1)}%` : "";
    return `| ${method} | ${cells} | ${stats.minutes.n}${missing} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function segmentTables(evaluation: PeriodEvaluation): string {
  return Object.entries(evaluation.segments)
    .map(([segment, groups]) => {
      const lines = [`#### By ${segment} (common sample, MAE / bias)`, "", `| ${segment} | method | n | ${PROJECTED_STATS.join(" | ")} |`, `|${" --- |".repeat(3 + PROJECTED_STATS.length)}`];
      for (const [value, methods] of Object.entries(groups)) {
        for (const [method, stats] of Object.entries(methods)) {
          const cells = PROJECTED_STATS.map((s) => `${fmt(stats[s].mae)} / ${fmt(stats[s].bias)}`).join(" | ");
          lines.push(`| ${value} | ${method} | ${stats.minutes.n} | ${cells} |`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function main(): void {
  const train = arg("train", "2023-24");
  const validation = arg("validation", "2024-25");
  const holdout = arg("holdout", "2025-26");
  [train, validation, holdout].forEach(seasonStartYear);
  if (!(train < validation && validation < holdout)) throw new Error("Periods must be chronological: train < validation < holdout");

  const manifest = JSON.parse(readFileSync(path.join(CANONICAL_DIR, "manifest.json"), "utf8")) as { issueCounts: Record<string, number> };
  const buildErrors = Object.entries(manifest.issueCounts).filter(([key]) => key.startsWith("error:"));
  if (buildErrors.length > 0) {
    throw new Error(`Canonical build has error-severity issues (${buildErrors.map(([k, n]) => `${k}=${n}`).join(", ")}); fix them before backtesting`);
  }
  const playerGames = readJsonl<NbaPlayerGame>(path.join(CANONICAL_DIR, "player-games.jsonl"));
  const teamGames = readJsonl<NbaTeamGame>(path.join(CANONICAL_DIR, "team-games.jsonl"));
  const periods: BacktestPeriod[] = [
    { name: "train", seasons: [train], seasonTypes: ["regular"] },
    { name: "validation", seasons: [validation], seasonTypes: ["regular"] },
    { name: "holdout", seasons: [holdout], seasonTypes: ["regular"] },
    { name: "holdout_postseason", seasons: [holdout], seasonTypes: ["play_in", "playoffs"] },
  ];
  const priors = estimatePriors(playerGames, { name: "train", seasons: [train], seasonTypes: ["regular", "play_in", "playoffs"] });
  const targetsByPeriod = new Map(periods.map((period) => [period.name, buildTargets(playerGames, teamGames, period)]));
  const tuning = tuneParams(targetsByPeriod.get("validation")!, priors, DEFAULT_BASELINE_PARAMS);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(BACKTEST_DIR, runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "tuning.json"), `${JSON.stringify({ priors, defaults: DEFAULT_BASELINE_PARAMS, chosen: tuning.params, trials: tuning.trials }, null, 2)}\n`);

  const evaluations: Record<string, PeriodEvaluation> = {};
  for (const period of periods) {
    const targets = targetsByPeriod.get(period.name)!;
    const snapshots = targets.map((target) => toPredictionSnapshot(target, priors, tuning.params));
    const outcomes = targets.map((target) => toOutcome(target.row));
    writeFileSync(path.join(outDir, `predictions-${period.name}.jsonl`), toJsonl(snapshots));
    writeFileSync(path.join(outDir, `outcomes-${period.name}.jsonl`), toJsonl(outcomes));
    evaluations[period.name] = evaluate(snapshots, outcomes, [MODEL_METHOD, ...COMPARISON_METHODS]);
  }
  writeFileSync(path.join(outDir, "metrics.json"), `${JSON.stringify({ modelVersion: BASELINE_MODEL_VERSION, runId, periods, evaluations }, null, 2)}\n`);

  const report = [
    `# ${BASELINE_MODEL_VERSION} backtest ${runId}`,
    "",
    `Train ${train} (priors only) · validation ${validation} (tuning) · holdout ${holdout} (scored once). Conditional on participation; no market lines.`,
    "",
    `Chosen params: \`${JSON.stringify(tuning.params)}\``,
    "",
    ...periods.flatMap((period) => {
      const evaluation = evaluations[period.name];
      return [
        `## ${period.name} (${period.seasons.join(",")} ${period.seasonTypes.join("+")}) — ${evaluation.targets} targets`,
        "",
        "### All targets where each method is defined",
        "",
        methodTable(evaluation.byMethod, evaluation.missingRate),
        "",
        `### Common sample (every method defined) — n=${evaluation.commonSample.n}`,
        "",
        methodTable(evaluation.commonSample.byMethod),
        "",
        segmentTables(evaluation),
        "",
      ];
    }),
  ].join("\n");
  writeFileSync(path.join(outDir, "report.md"), report);

  for (const period of periods) {
    const evaluation = evaluations[period.name];
    console.log(`\n${period.name}: ${evaluation.targets} targets, common sample ${evaluation.commonSample.n}`);
    console.table(
      Object.fromEntries(
        Object.entries(evaluation.commonSample.byMethod).map(([method, stats]) => [
          method,
          Object.fromEntries(PROJECTED_STATS.map((s) => [`${s} MAE`, Number(fmt(stats[s].mae, 3))])),
        ]),
      ),
    );
  }
  console.log(`\nChosen params: ${JSON.stringify(tuning.params)}`);
  console.log(`Run written to ${outDir}`);
}

main();
