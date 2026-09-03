/**
 * WU3 evaluation materializer orchestration.
 *
 * Reads immutable WU1 production predictions and WU2 outcome events, joins
 * each prediction to its latest valid resolved outcome, and writes derived
 * `jkb-football-evaluation-v1` datasets under a separate namespace. It never
 * writes to the prediction or outcome roots. Exact reruns over unchanged
 * inputs produce byte-identical output.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contentHash, validatePredictionSnapshot, type PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import { validateOutcomeEvent, type PredictionOutcomeEventV1 } from "./nfl-prediction-outcome-resolver";
import {
  buildEvaluationSummary,
  type EvaluationSummaryInput,
} from "./nfl-evaluation-metrics";
import {
  deterministicPrettyJson,
  serializeEvaluationRows,
  serializeResolutionStatusRows,
  validateEvaluationRow,
  EVALUATION_DATASET_SCHEMA_VERSION,
  type EvaluationPredictionType,
  type EvaluationRowV1,
  type ResolutionStatusRow,
} from "./nfl-evaluation-dataset";
import { buildEvaluationRow, type EvaluationRowBuildContext } from "./nfl-evaluation-rows";
import { loadArchivedPredictions } from "../resolve-nfl-prediction-outcomes";

const PREDICTION_TYPES: EvaluationPredictionType[] = ["spread", "passing", "rushing", "receiving", "team_opportunity"];

export type MaterializerOptions = {
  predictionRoot: string;
  outcomeRoot: string;
  evaluationRoot: string;
  repoRoot: string;
  season: number | null;
  week: number | null;
  predictionType: EvaluationPredictionType | null;
  dryRun: boolean;
};

export type MaterializerResult = {
  predictions_loaded: number;
  non_production_skipped: number;
  evaluable_rows: number;
  ledger_rows: number;
  ledger_by_status: Record<string, number>;
  evaluable_by_type: Record<string, number>;
  files_written: string[];
  seasons: number[];
};

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function loadOutcomeEvents(
  outcomeRoot: string,
  season: number | null,
  week: number | null,
  predictionType: EvaluationPredictionType | null,
): PredictionOutcomeEventV1[] {
  if (!existsSync(outcomeRoot)) return [];
  const seasonNames =
    season == null
      ? readdirSync(outcomeRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
          .map((entry) => entry.name)
      : [String(season)];
  const events: PredictionOutcomeEventV1[] = [];
  for (const seasonName of seasonNames) {
    const seasonDir = join(outcomeRoot, seasonName);
    if (!existsSync(seasonDir)) continue;
    const weekNames =
      week == null
        ? readdirSync(seasonDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
            .map((entry) => entry.name)
        : [String(week).padStart(2, "0")];
    for (const weekName of weekNames) {
      const weekDir = join(seasonDir, weekName);
      if (!existsSync(weekDir)) continue;
      for (const file of readdirSync(weekDir).filter((name) => name.endsWith(".jsonl")).sort()) {
        const type = file.replace(/\.jsonl$/, "") as EvaluationPredictionType;
        if (predictionType != null && type !== predictionType) continue;
        for (const line of readFileSync(join(weekDir, file), "utf8").split(/\r?\n/).filter(Boolean)) {
          const event = JSON.parse(line) as PredictionOutcomeEventV1;
          validateOutcomeEvent(event);
          events.push(event);
        }
      }
    }
  }
  return events;
}

type DivisionLookup = { table: Map<string, string>; hash: string | null };

function loadDivisions(repoRoot: string): DivisionLookup {
  const path = join(repoRoot, "public", "data", "nfl", "teams.json");
  if (!existsSync(path)) return { table: new Map(), hash: null };
  const text = readFileSync(path, "utf8");
  const parsed = JSON.parse(text) as { teams?: { abbr?: string; division?: string }[] };
  const table = new Map<string, string>();
  for (const team of parsed.teams ?? []) {
    if (typeof team.abbr === "string" && typeof team.division === "string") table.set(team.abbr, team.division);
  }
  return { table, hash: contentHash(text) };
}

function divisionGame(lookup: DivisionLookup, team: string, opponent: string): boolean | null {
  const teamDivision = lookup.table.get(team);
  const opponentDivision = lookup.table.get(opponent);
  if (teamDivision == null || opponentDivision == null) return null;
  return teamDivision === opponentDivision;
}

function bySeason<T extends { season: number }>(rows: readonly T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.season) ?? [];
    bucket.push(row);
    map.set(row.season, bucket);
  }
  return map;
}

export function materializeEvaluation(options: MaterializerOptions): MaterializerResult {
  const allLoaded = loadArchivedPredictions(options.predictionRoot, options.season, options.week);
  const scoped = allLoaded.filter(
    (prediction) => options.predictionType == null || prediction.prediction_type === options.predictionType,
  );
  const production: PredictionSnapshotV1[] = [];
  let nonProductionSkipped = 0;
  for (const prediction of scoped) {
    validatePredictionSnapshot(prediction);
    if (prediction.mode === "production") production.push(prediction);
    else nonProductionSkipped += 1;
  }

  const events = loadOutcomeEvents(options.outcomeRoot, options.season, options.week, options.predictionType);
  const eventsByPrediction = new Map<string, PredictionOutcomeEventV1[]>();
  for (const event of events) {
    const bucket = eventsByPrediction.get(event.prediction_id) ?? [];
    bucket.push(event);
    eventsByPrediction.set(event.prediction_id, bucket);
  }

  const divisions = loadDivisions(options.repoRoot);

  const evaluableRows: EvaluationRowV1[] = [];
  const ledgerRows: ResolutionStatusRow[] = [];
  const ledgerByStatus: Record<string, number> = {};
  const evaluableByType: Record<string, number> = { spread: 0, passing: 0, rushing: 0, receiving: 0, team_opportunity: 0 };

  for (const prediction of production) {
    const ctx: EvaluationRowBuildContext = {
      divisionGame: divisionGame(divisions, prediction.team, prediction.opponent),
    };
    const built = buildEvaluationRow(prediction, eventsByPrediction.get(prediction.prediction_id) ?? [], ctx);
    ledgerRows.push(built.ledger);
    ledgerByStatus[built.ledger.ledger_status] = (ledgerByStatus[built.ledger.ledger_status] ?? 0) + 1;
    if (built.row) {
      validateEvaluationRow(built.row);
      evaluableRows.push(built.row);
      evaluableByType[built.row.prediction_type] += 1;
    }
  }

  const activeTypes = options.predictionType ? [options.predictionType] : PREDICTION_TYPES;
  const seasonsTouched = new Set<number>();
  const filesWritten: string[] = [];
  const versionRoot = join(options.evaluationRoot, EVALUATION_DATASET_SCHEMA_VERSION);

  const evaluableSeasonMap = bySeason(evaluableRows);
  const ledgerSeasonMap = bySeason(ledgerRows);
  const summarySeasons =
    options.season != null ? [options.season] : [...new Set([...evaluableSeasonMap.keys(), ...ledgerSeasonMap.keys()])];

  for (const season of [...summarySeasons].sort((a, b) => a - b)) {
    seasonsTouched.add(season);
    for (const type of activeTypes) {
      const rows = (evaluableSeasonMap.get(season) ?? []).filter((row) => row.prediction_type === type);
      const path = join(versionRoot, type, `${season}.jsonl`);
      if (!options.dryRun) {
        atomicWrite(path, serializeEvaluationRows(rows));
        filesWritten.push(path);
      }
    }
    const ledgerForSeason = (ledgerSeasonMap.get(season) ?? []).filter(
      (row) => options.predictionType == null || row.prediction_type === options.predictionType,
    );
    const ledgerPath = join(versionRoot, "resolution-status", `${season}.jsonl`);
    if (!options.dryRun) {
      atomicWrite(ledgerPath, serializeResolutionStatusRows(ledgerForSeason));
      filesWritten.push(ledgerPath);
    }

    const summaryInput: EvaluationSummaryInput = {
      season,
      filters: { week: options.week, prediction_type: options.predictionType },
      rows: (evaluableSeasonMap.get(season) ?? []),
      coverage: {
        predictions_loaded: production.filter((prediction) => prediction.season === season).length,
        non_production_skipped: nonProductionSkipped,
        ledger_by_status: ledgerForSeason.reduce<Record<string, number>>((acc, row) => {
          acc[row.ledger_status] = (acc[row.ledger_status] ?? 0) + 1;
          return acc;
        }, {}),
        evaluable_by_type: activeTypes.reduce<Record<string, number>>((acc, type) => {
          acc[type] = (evaluableSeasonMap.get(season) ?? []).filter((row) => row.prediction_type === type).length;
          return acc;
        }, {}),
      },
      source_provenance: {
        prediction_schema_version: "jkb-football-prediction-v1",
        outcome_schema_version: "jkb-football-prediction-outcome-v1",
        teams_table_content_hash: divisions.hash,
      },
    };
    const summaryPath = join(versionRoot, "summary", `${season}.json`);
    if (!options.dryRun) {
      atomicWrite(summaryPath, `${deterministicPrettyJson(buildEvaluationSummary(summaryInput))}\n`);
      filesWritten.push(summaryPath);
    }
  }

  return {
    predictions_loaded: production.length,
    non_production_skipped: nonProductionSkipped,
    evaluable_rows: evaluableRows.length,
    ledger_rows: ledgerRows.length,
    ledger_by_status: ledgerByStatus,
    evaluable_by_type: evaluableByType,
    files_written: filesWritten.sort(),
    seasons: [...seasonsTouched].sort((a, b) => a - b),
  };
}
