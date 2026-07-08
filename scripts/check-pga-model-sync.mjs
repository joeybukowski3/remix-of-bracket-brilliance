/**
 * Guard: the generated PGA model must match the current official field and
 * must come from a fresh, labeled source.
 *
 * This is intentionally stricter than the page. It is for CI/Actions so the
 * Monday workflow cannot silently pass with a stale tournament model.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectLocalTarget } from "./lib/pga-field-selection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCHEDULE_PATH = path.join(ROOT, "public", "data", "pga", "schedule.json");
const FIELD_PATH = path.join(ROOT, "public", "data", "pga", "current-field.json");
const CURRENT_MODEL_PATH = path.join(ROOT, "public", "data", "pga", "current-tournament.json");
const MODEL_META_PATH = path.join(ROOT, "public", "data", "pga", "model-source-meta.json");
const MAX_STATS_STALE_DAYS = parseInt(process.env.PGA_STATS_MAX_STALE_DAYS || "10", 10);
const MIN_MODEL_ROWS = parseInt(process.env.PGA_MIN_CURRENT_MODEL_PLAYERS || "20", 10);
const ALLOWED_MODEL_SOURCES = new Set(["sheet", "online-api", "mixed", "fallback"]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/^the\s+/, "")
    .replace(/\b(presented by|championship|tournament|2026)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function daysSince(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return (Date.now() - parsed.getTime()) / 86_400_000;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const schedule = readJson(SCHEDULE_PATH);
  const field = readJson(FIELD_PATH);
  const currentModel = readJson(CURRENT_MODEL_PATH);
  const modelMeta = readJson(MODEL_META_PATH);
  const asOfDate = process.env.PGA_MODEL_AS_OF ?? new Date().toISOString().slice(0, 10);
  const target = selectLocalTarget(schedule, asOfDate);

  const activeDataPath = path.join(ROOT, "public", "data", "pga", target.dataFile ?? "");
  assert(target.dataFile, `Scheduled current PGA tournament ${target.name} has no dataFile.`);
  assert(existsSync(activeDataPath), `Missing current tournament data file: ${path.relative(ROOT, activeDataPath)}`);

  const activeData = readJson(activeDataPath);
  assert(Array.isArray(activeData), `${path.relative(ROOT, activeDataPath)} must contain a player array.`);
  assert(activeData.length >= MIN_MODEL_ROWS, `${path.relative(ROOT, activeDataPath)} has only ${activeData.length} players.`);

  const fieldMatchesTarget = field.localScheduleId === target.id || normalizeName(field.tournament) === normalizeName(target.name);
  assert(
    fieldMatchesTarget,
    `Field/schedule mismatch: field=${field.tournament} (${field.localScheduleId ?? "no id"}) target=${target.name} (${target.id}).`,
  );

  assert(currentModel.section === "current-tournament", "current-tournament.json has the wrong section.");
  assert(normalizeName(currentModel.tournamentName) === normalizeName(target.name), `Model tournament ${currentModel.tournamentName} does not match scheduled current tournament ${target.name}.`);
  assert(normalizeName(modelMeta.modelTournament) === normalizeName(target.name), `Model metadata tournament ${modelMeta.modelTournament} does not match scheduled current tournament ${target.name}.`);
  assert(normalizeName(modelMeta.fieldTournament) === normalizeName(field.tournament), `Model metadata field ${modelMeta.fieldTournament} does not match current field ${field.tournament}.`);

  assert(ALLOWED_MODEL_SOURCES.has(currentModel.modelSource), `Invalid current modelSource: ${currentModel.modelSource}`);
  assert(ALLOWED_MODEL_SOURCES.has(modelMeta.modelSource), `Invalid metadata modelSource: ${modelMeta.modelSource}`);
  assert(currentModel.modelAvailable === true, "current-tournament.json is not marked modelAvailable=true.");
  assert(currentModel.sourceValidated === true, "current-tournament.json is not sourceValidated=true.");
  assert(currentModel.safeForCurrentTournament === true, "current-tournament.json is not safeForCurrentTournament=true.");
  assert(Array.isArray(currentModel.rows) && currentModel.rows.length >= MIN_MODEL_ROWS, `current-tournament.json has only ${currentModel.rows?.length ?? 0} rows.`);

  const sourceDate = modelMeta.statsExportDate ?? modelMeta.statsSyncedAt ?? modelMeta.generatedAt;
  const ageDays = daysSince(sourceDate);
  assert(ageDays != null, "Model metadata has no valid source date.");
  assert(ageDays <= MAX_STATS_STALE_DAYS, `Model source is stale: ${ageDays.toFixed(1)} days old, max ${MAX_STATS_STALE_DAYS}.`);

  if (modelMeta.modelSource === "sheet") {
    assert(modelMeta.sheetIsStale !== true, "Refusing to publish stale Google Sheet data as current model data.");
  }

  if (modelMeta.sheetIsStale === true) {
    assert(
      modelMeta.modelSource === "fallback" || modelMeta.modelSource === "online-api" || modelMeta.primaryDataSource === "online-api",
      "Sheet is stale but model is not clearly labeled as online/API fallback.",
    );
  }

  console.log(`[pga-model-sync] OK: ${target.name}`);
  console.log(`[pga-model-sync] modelSource=${modelMeta.modelSource} sourceAge=${ageDays.toFixed(1)}d rows=${currentModel.rows.length}`);
  console.log(`[pga-model-sync] active data file ${path.relative(ROOT, activeDataPath)} rows=${activeData.length}`);
}

try {
  main();
} catch (error) {
  console.error(`[pga-model-sync] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
