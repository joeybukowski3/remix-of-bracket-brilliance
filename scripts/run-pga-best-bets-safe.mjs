import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const FIELD_PATH = path.join(DATA_DIR, "current-field.json");
const MODEL_PATH = path.join(DATA_DIR, "current-tournament.json");
const OUTPUT_PATH = path.join(DATA_DIR, "best-bets.json");

export function normalizeEventIdentity(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function artifactMatchesCurrentTournament(artifact, field) {
  if (!artifact || !field) return false;
  if (artifact.tournamentId && field.tournamentId && artifact.tournamentId === field.tournamentId) return true;
  if (artifact.localScheduleId && field.localScheduleId && artifact.localScheduleId === field.localScheduleId) return true;
  return normalizeEventIdentity(artifact.tournament) === normalizeEventIdentity(field.tournament);
}

export function hasPublishedPicks(artifact) {
  return ["outrights", "top5", "top10", "top20"].some(
    (key) => Array.isArray(artifact?.[key]) && artifact[key].length > 0,
  );
}

export function validateBestBetsInputs(field, model) {
  if (!field?.validated || field.source !== "pga-tour-official-field") {
    throw new Error("The official current PGA field is missing or unvalidated.");
  }
  if (!Array.isArray(field.players) || field.players.length === 0) {
    throw new Error("The official current PGA field has no players.");
  }
  const idMatch = Boolean(field.localScheduleId && model?.tournamentId === field.localScheduleId);
  const nameMatch = normalizeEventIdentity(field.tournament) === normalizeEventIdentity(model?.tournamentName);
  if (!idMatch && !nameMatch) {
    throw new Error(
      `PGA best-bets field/model mismatch: field=${field.tournament ?? "unknown"}, model=${model?.tournamentName ?? "unknown"}.`,
    );
  }
  if (!Array.isArray(model?.rows) || model.rows.length === 0) {
    throw new Error("The current PGA tournament model has no publishable rows.");
  }
}

export function buildUnavailableArtifact(field, model, reason = "GROK_UNAVAILABLE", generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: 2,
    tournament: field.tournament,
    tournamentId: field.tournamentId ?? null,
    localScheduleId: field.localScheduleId ?? null,
    course: model.courseName ?? null,
    generatedAt,
    status: "unavailable",
    reason,
    sourceStatus: {
      model: "available",
      grok: "unavailable",
      odds: "unknown",
    },
    preview: null,
    valueBets: [],
    outrights: [],
    top5: [],
    top10: [],
    top20: [],
  };
}

export function finalizeSuccessfulArtifact(artifact, field, model) {
  if (!artifactMatchesCurrentTournament(artifact, field)) {
    throw new Error(
      `Generated PGA best bets belong to ${artifact?.tournament ?? "an unknown tournament"}; current field is ${field.tournament}.`,
    );
  }
  const counts = Object.fromEntries(
    ["outrights", "top5", "top10", "top20"].map((key) => [key, Array.isArray(artifact[key]) ? artifact[key].length : 0]),
  );
  const publishedSections = Object.values(counts).filter((count) => count > 0).length;
  return {
    ...artifact,
    schemaVersion: 2,
    tournamentId: field.tournamentId ?? artifact.tournamentId ?? null,
    localScheduleId: field.localScheduleId ?? artifact.localScheduleId ?? null,
    course: artifact.course ?? model.courseName ?? null,
    status: publishedSections === 4 ? "available" : publishedSections > 0 ? "partial" : "unavailable",
    reason: publishedSections > 0 ? null : "NO_VALID_PICKS",
    sourceStatus: {
      model: "available",
      grok: publishedSections > 0 ? "available" : "invalid-response",
      odds: artifact.valueBets?.length > 0 || ["outrights", "top5", "top10", "top20"].some(
        (key) => artifact[key]?.some?.((pick) => pick?.odds),
      ) ? "available" : "unavailable",
    },
    sectionStatus: counts,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function emitWarning(message) {
  console.warn(`::warning title=PGA best bets unavailable::${message}`);
}

function main() {
  const field = readJson(FIELD_PATH);
  const model = readJson(MODEL_PATH);
  validateBestBetsInputs(field, model);

  const previous = existsSync(OUTPUT_PATH) ? readJson(OUTPUT_PATH) : null;
  const previousIsCurrentAndUseful = artifactMatchesCurrentTournament(previous, field) && hasPublishedPicks(previous);

  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "generate-pga-best-bets.mjs"), "--force"], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    const generated = existsSync(OUTPUT_PATH) ? readJson(OUTPUT_PATH) : null;
    if (generated && artifactMatchesCurrentTournament(generated, field)) {
      writeJson(OUTPUT_PATH, finalizeSuccessfulArtifact(generated, field, model));
      return;
    }
  }

  if (previousIsCurrentAndUseful) {
    emitWarning("The provider failed, so the previous valid current-tournament picks were preserved.");
    writeJson(OUTPUT_PATH, {
      ...previous,
      schemaVersion: 2,
      tournamentId: field.tournamentId ?? previous.tournamentId ?? null,
      localScheduleId: field.localScheduleId ?? previous.localScheduleId ?? null,
      status: previous.status === "partial" ? "partial" : "available",
      reason: null,
      sourceStatus: {
        ...(previous.sourceStatus ?? {}),
        model: "available",
        grok: "temporarily-unavailable",
      },
    });
    return;
  }

  emitWarning("The provider failed and no valid current-tournament artifact existed; publishing a safe unavailable state.");
  writeJson(OUTPUT_PATH, buildUnavailableArtifact(field, model));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[pga-best-bets-safe] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
