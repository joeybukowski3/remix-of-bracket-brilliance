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

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8"));
    const field = JSON.parse(readFileSync(FIELD_PATH, "utf8"));
    const asOfDate = process.env.PGA_FIELD_AS_OF ?? new Date().toISOString().slice(0, 10);
    const { target } = checkFieldSync(schedule, field, asOfDate);
    console.log(`[pga-field-sync] OK: field "${field.tournament}" matches scheduled tournament "${target.name}" (fetched ${field.fetchedAt}).`);
  } catch (error) {
    console.error(`[pga-field-sync] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
