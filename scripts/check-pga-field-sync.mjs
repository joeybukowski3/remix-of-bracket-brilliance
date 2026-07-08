/**
 * Guard: the saved current field must match the tournament that
 * schedule.json says is current/upcoming today. Run by the sync-pga-data
 * workflow after every refresh so the field and the page's expected
 * tournament can never silently disagree again.
 *
 * Exits non-zero with a clear message on mismatch. Supports
 * PGA_FIELD_AS_OF=YYYY-MM-DD for testing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectLocalTarget } from "./lib/pga-field-selection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.resolve(__dirname, "../public/data/pga/schedule.json");
const FIELD_PATH = path.resolve(__dirname, "../public/data/pga/current-field.json");

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\[.*?\]/g, "") // strip status suffixes like "[ CANCELLED ]"
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function checkFieldSync(schedule, field, asOfDate) {
  const target = selectLocalTarget(schedule, asOfDate);
  const idMatch = field.localScheduleId != null && field.localScheduleId === target.id;
  const nameMatch = normalizeName(field.tournament) === normalizeName(target.name);
  if (!idMatch && !nameMatch) {
    throw new Error(
      `Field/schedule mismatch: saved field is "${field.tournament}" (${field.localScheduleId ?? "no id"}) ` +
        `but the scheduled current tournament for ${asOfDate} is "${target.name}" (${target.id}). ` +
        `The field sync did not roll over — refusing to pass silently.`
    );
  }
  return { target, idMatch, nameMatch };
}

export const MAX_STATS_AGE_DAYS = 14; // matches pgaFreshness playerStatsMaxAgeDays

/**
 * Guard: the published current-tournament model must belong to the scheduled
 * current tournament, be marked available with rows, and be built from
 * player stats no older than the page's own freshness budget. A stale
 * Google Sheet (or stale API stats) can therefore never ship as the current
 * tournament model without failing the workflow.
 */
export function checkModelSync(schedule, model, statsMeta, asOfDate, maxStatsAgeDays = MAX_STATS_AGE_DAYS) {
  const target = selectLocalTarget(schedule, asOfDate);
  const idMatch = model.tournamentId != null && model.tournamentId === target.id;
  const nameMatch = normalizeName(model.tournamentName) === normalizeName(target.name);
  if (!idMatch && !nameMatch) {
    throw new Error(
      `Model/schedule mismatch: current-tournament.json is "${model.tournamentName}" ` +
        `but the scheduled current tournament for ${asOfDate} is "${target.name}" (${target.id}). ` +
        `Refusing to publish another tournament's model as current.`
    );
  }
  if (model.modelAvailable === false || !Array.isArray(model.rows) || model.rows.length === 0) {
    throw new Error(
      `Model unavailable: current-tournament.json for "${target.name}" has no publishable rows ` +
        `(modelAvailable=${model.modelAvailable}, rows=${Array.isArray(model.rows) ? model.rows.length : "missing"}).`
    );
  }
  const syncedAt = Date.parse(statsMeta?.syncedAt ?? "");
  if (Number.isNaN(syncedAt)) {
    throw new Error("Player stats metadata is missing a valid syncedAt timestamp — cannot verify stats freshness.");
  }
  const ageDays = (Date.parse(`${asOfDate}T12:00:00Z`) - syncedAt) / 86_400_000;
  if (ageDays > maxStatsAgeDays) {
    throw new Error(
      `Player stats are ${ageDays.toFixed(1)} days old (max ${maxStatsAgeDays}) — the model would be built ` +
        `from stale stats. Fix the stats source instead of publishing silently.`
    );
  }
  return { target, modelSource: model.modelSource ?? null, statsAgeDays: Math.max(0, ageDays) };
}

const MODEL_PATH = path.resolve(__dirname, "../public/data/pga/current-tournament.json");
const STATS_META_PATH = path.resolve(__dirname, "../public/data/pga/player-stats-meta.json");

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8"));
    const field = JSON.parse(readFileSync(FIELD_PATH, "utf8"));
    const asOfDate = process.env.PGA_FIELD_AS_OF ?? new Date().toISOString().slice(0, 10);
    const { target } = checkFieldSync(schedule, field, asOfDate);
    console.log(`[pga-field-sync] OK: field "${field.tournament}" matches scheduled tournament "${target.name}" (fetched ${field.fetchedAt}).`);

    const model = JSON.parse(readFileSync(MODEL_PATH, "utf8"));
    const statsMeta = JSON.parse(readFileSync(STATS_META_PATH, "utf8"));
    const { modelSource, statsAgeDays } = checkModelSync(schedule, model, statsMeta, asOfDate);
    console.log(
      `[pga-model-sync] OK: model "${model.tournamentName}" (source: ${modelSource ?? "unknown"}, stats ${statsAgeDays.toFixed(1)}d old) matches the scheduled tournament.`
    );
  } catch (error) {
    console.error(`[pga-sync-check] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
