import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../public/data/pga");

export function normalizePgaModelPlayerName(value) {
  const raw = String(value ?? "").trim();
  const commaParts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const displayOrder = commaParts.length === 2 ? `${commaParts[1]} ${commaParts[0]}` : raw;
  return displayOrder
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTournamentName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function enforceCurrentPgaModelField(field, model, checkedAt = new Date().toISOString()) {
  if (!field?.validated) {
    throw new Error("Current PGA field is not validated; refusing to publish a field-restricted model.");
  }
  if (!Array.isArray(field.players) || field.players.length === 0) {
    throw new Error("Current PGA field has no players; refusing to publish the model.");
  }
  if (!Array.isArray(model?.rows)) {
    throw new Error("Current PGA model rows are missing or invalid.");
  }

  const idMatch = Boolean(field.localScheduleId && model.tournamentId === field.localScheduleId);
  const nameMatch = normalizeTournamentName(field.tournament) === normalizeTournamentName(model.tournamentName);
  if (!idMatch && !nameMatch) {
    throw new Error(
      `PGA model/field tournament mismatch: model=${model.tournamentName ?? "unknown"} (${model.tournamentId ?? "no id"}), ` +
      `field=${field.tournament ?? "unknown"} (${field.localScheduleId ?? "no id"}).`,
    );
  }
  if (field.startDate && model.startDate && field.startDate !== model.startDate) {
    throw new Error(`PGA model/field start-date mismatch: model=${model.startDate}, field=${field.startDate}.`);
  }
  if (field.endDate && model.endDate && field.endDate !== model.endDate) {
    throw new Error(`PGA model/field end-date mismatch: model=${model.endDate}, field=${field.endDate}.`);
  }

  const fieldByKey = new Map();
  for (const player of field.players) {
    const key = normalizePgaModelPlayerName(player);
    if (!key) throw new Error(`Current PGA field contains an empty player name: ${String(player)}`);
    if (fieldByKey.has(key)) {
      throw new Error(`Current PGA field contains duplicate normalized player identity: ${player}.`);
    }
    fieldByKey.set(key, player);
  }

  const matchedKeys = new Set();
  const excludedNonFieldPlayers = [];
  const filteredRows = [];
  for (const row of model.rows) {
    const key = normalizePgaModelPlayerName(row?.player);
    if (!fieldByKey.has(key)) {
      excludedNonFieldPlayers.push(String(row?.player ?? "Unknown player"));
      continue;
    }
    if (matchedKeys.has(key)) {
      throw new Error(`Current PGA model contains duplicate field player: ${row.player}.`);
    }
    matchedKeys.add(key);
    filteredRows.push(row);
  }

  if (filteredRows.length === 0) {
    throw new Error(`No model rows matched the validated ${field.tournament} field.`);
  }

  const missingStatsPlayers = [...fieldByKey.entries()]
    .filter(([key]) => !matchedKeys.has(key))
    .map(([, player]) => player)
    .sort((a, b) => a.localeCompare(b));

  const rows = filteredRows.map((row, index) => ({ ...row, rank: index + 1 }));
  const output = {
    ...model,
    modelAvailable: rows.length > 0,
    rows,
    fieldIntegrity: {
      checkedAt,
      officialTournamentId: field.tournamentId ?? null,
      localScheduleId: field.localScheduleId ?? null,
      fieldTournament: field.tournament ?? null,
      fieldCount: field.players.length,
      modelRowCount: rows.length,
      excludedNonFieldPlayers: excludedNonFieldPlayers.sort((a, b) => a.localeCompare(b)),
      missingStatsPlayers,
    },
  };

  const remainingExtras = output.rows.filter((row) => !fieldByKey.has(normalizePgaModelPlayerName(row.player)));
  if (remainingExtras.length > 0) {
    throw new Error(`PGA model field enforcement failed; ${remainingExtras.length} non-field rows remain.`);
  }

  return output;
}

function runCli() {
  const fieldPath = path.join(DATA_DIR, "current-field.json");
  const modelPath = path.join(DATA_DIR, "current-tournament.json");
  const field = JSON.parse(readFileSync(fieldPath, "utf8"));
  const model = JSON.parse(readFileSync(modelPath, "utf8"));
  const output = enforceCurrentPgaModelField(field, model);
  writeFileSync(modelPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `[pga-model-field] ${output.tournamentName}: ${output.fieldIntegrity.modelRowCount}/${output.fieldIntegrity.fieldCount} field players ranked; ` +
    `${output.fieldIntegrity.excludedNonFieldPlayers.length} non-field rows removed; ` +
    `${output.fieldIntegrity.missingStatsPlayers.length} field players missing usable stats.`,
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    runCli();
  } catch (error) {
    console.error(`[pga-model-field] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
