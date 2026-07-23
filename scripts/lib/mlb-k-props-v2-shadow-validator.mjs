import { K_PROPS_V2_SHADOW_MODE, K_PROPS_V2_SHADOW_SCHEMA_VERSION } from "./mlb-k-props-v2-shadow-core.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_V2_INPUT_KEYS = new Set([
  "book",
  "kLine",
  "line",
  "market",
  "odds",
  "oddsOver",
  "oddsUnder",
  "price",
  "sportsbook",
]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compareRows(a, b) {
  const aGameId = toFiniteNumber(a?.game?.gameId, Number.MAX_SAFE_INTEGER);
  const bGameId = toFiniteNumber(b?.game?.gameId, Number.MAX_SAFE_INTEGER);
  if (aGameId !== bGameId) return aGameId - bGameId;

  const aPitcherId = toFiniteNumber(a?.pitcher?.id, Number.MAX_SAFE_INTEGER);
  const bPitcherId = toFiniteNumber(b?.pitcher?.id, Number.MAX_SAFE_INTEGER);
  if (aPitcherId !== bPitcherId) return aPitcherId - bPitcherId;

  return String(a?.key ?? "").localeCompare(String(b?.key ?? ""));
}

function walk(value, path, visitor) {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, visitor));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, path ? `${path}.${key}` : key, visitor);
    }
  }
}

function add(errors, message) {
  errors.push(message);
}

function validateNoInvalidJsonValues(payload, errors) {
  walk(payload, "artifact", (value, path) => {
    if (value === undefined) add(errors, `${path} is undefined; use null for unavailable values.`);
    if (typeof value === "number" && !Number.isFinite(value)) add(errors, `${path} is not finite.`);
  });
}

function validateNoForbiddenV2InputKeys(row, rowIndex, errors) {
  walk(row?.inputs?.v2Input, `rows[${rowIndex}].inputs.v2Input`, (_value, path) => {
    const key = path.split(".").at(-1)?.replace(/\[\d+\]$/, "");
    if (key && FORBIDDEN_V2_INPUT_KEYS.has(key)) {
      add(errors, `rows[${rowIndex}].inputs.v2Input contains sportsbook/market field "${key}".`);
    }
  });
}

function validateUnavailableInputsAreNull(row, rowIndex, errors) {
  const pitcherAvailability = row?.inputs?.availability?.pitcher ?? {};
  const pitcherInput = row?.inputs?.v2Input?.pitcher ?? {};
  const opponentAvailability = row?.inputs?.availability?.opponent ?? {};
  const opponentInput = row?.inputs?.v2Input?.opponent ?? {};

  for (const [field, available] of Object.entries(pitcherAvailability)) {
    if (field === "lastFiveStarts" || field === "lastFiveBattersFaced" || field === "lastFivePitchCount") continue;
    if (available === false && pitcherInput[field] !== null && pitcherInput[field] !== undefined) {
      add(errors, `rows[${rowIndex}].inputs.v2Input.pitcher.${field} must be null when unavailable.`);
    }
  }

  for (const [field, available] of Object.entries(opponentAvailability)) {
    if (
      field === "projectedLineupWhiffRate"
      || field === "recentVsStarters"
      || field === "recentVsStartersPlateAppearances"
    ) {
      continue;
    }
    if (available === false && opponentInput[field] !== null && opponentInput[field] !== undefined) {
      add(errors, `rows[${rowIndex}].inputs.v2Input.opponent.${field} must be null when unavailable.`);
    }
  }
}

function validateFiniteOrNull(value, path, errors) {
  if (value !== null && !isFiniteNumber(value)) add(errors, `${path} must be finite number or null.`);
}

function validateRow(row, rowIndex, identitySet, errors) {
  if (!isPlainObject(row)) {
    add(errors, `rows[${rowIndex}] must be an object.`);
    return;
  }

  const identity = `${row?.game?.gameId ?? "missing-game"}|${row?.pitcher?.id ?? "missing-pitcher"}|${row?.key ?? "missing-key"}`;
  if (identitySet.has(identity)) add(errors, `rows[${rowIndex}] duplicate pitcher/game identity: ${identity}.`);
  identitySet.add(identity);

  if (typeof row.key !== "string" || !row.key) add(errors, `rows[${rowIndex}].key is required.`);
  if (row.slateDate !== undefined && !isValidDate(row.slateDate)) add(errors, `rows[${rowIndex}].slateDate must be YYYY-MM-DD.`);
  if (!isPlainObject(row.game)) add(errors, `rows[${rowIndex}].game is required.`);
  if (!isPlainObject(row.pitcher)) add(errors, `rows[${rowIndex}].pitcher is required.`);
  if (!isPlainObject(row.market)) add(errors, `rows[${rowIndex}].market is required.`);
  if (!isPlainObject(row.legacy)) add(errors, `rows[${rowIndex}].legacy is required.`);
  if (!isPlainObject(row.v2)) add(errors, `rows[${rowIndex}].v2 is required.`);
  if (!isPlainObject(row.comparison)) add(errors, `rows[${rowIndex}].comparison is required.`);
  if (!isPlainObject(row.inputs)) add(errors, `rows[${rowIndex}].inputs is required.`);

  validateFiniteOrNull(row?.legacy?.projectedIP, `rows[${rowIndex}].legacy.projectedIP`, errors);
  validateFiniteOrNull(row?.legacy?.projectedK9, `rows[${rowIndex}].legacy.projectedK9`, errors);
  validateFiniteOrNull(row?.legacy?.projectedKs, `rows[${rowIndex}].legacy.projectedKs`, errors);
  if (row?.legacy?.projectedKs == null) add(errors, `rows[${rowIndex}].legacy.projectedKs must retain the legacy projection.`);

  validateFiniteOrNull(row?.v2?.projectedStrikeouts, `rows[${rowIndex}].v2.projectedStrikeouts`, errors);
  validateFiniteOrNull(row?.v2?.projectedKRate, `rows[${rowIndex}].v2.projectedKRate`, errors);
  validateFiniteOrNull(row?.v2?.projectedBattersFaced, `rows[${rowIndex}].v2.projectedBattersFaced`, errors);
  validateFiniteOrNull(row?.v2?.projectedInnings, `rows[${rowIndex}].v2.projectedInnings`, errors);
  if (typeof row?.v2?.modelVersion !== "string" || !row.v2.modelVersion) {
    add(errors, `rows[${rowIndex}].v2.modelVersion is required.`);
  }
  if (!Array.isArray(row?.v2?.components)) add(errors, `rows[${rowIndex}].v2.components must be an array.`);
  if (!Array.isArray(row?.v2?.fallbacks)) add(errors, `rows[${rowIndex}].v2.fallbacks must be an array.`);
  if (!Array.isArray(row?.v2?.warnings)) add(errors, `rows[${rowIndex}].v2.warnings must be an array.`);

  validateNoForbiddenV2InputKeys(row, rowIndex, errors);
  validateUnavailableInputsAreNull(row, rowIndex, errors);
}

function validateDiagnostics(payload, errors) {
  const rows = payload?.rows ?? [];
  const diagnostics = payload?.diagnostics;
  if (!isPlainObject(diagnostics)) {
    add(errors, "diagnostics is required.");
    return;
  }

  const actual = {
    totalRows: rows.length,
    v2ComputedRows: rows.filter((row) => row?.v2?.projectedStrikeouts != null).length,
    legacyOnlyRows: rows.filter((row) => row?.v2?.projectedStrikeouts == null && row?.legacy?.projectedKs != null).length,
    missingWorkloadRows: rows.filter((row) => row?.inputs?.workload == null).length,
    missingOpponentRows: rows.filter((row) => row?.inputs?.opponent == null || row?.inputs?.opponent?.seasonKRate == null).length,
    missingLineupRows: rows.filter((row) => row?.inputs?.lineup?.hitterCount === 0).length,
  };

  for (const [field, value] of Object.entries(actual)) {
    if (diagnostics[field] !== value) {
      add(errors, `diagnostics.${field}=${diagnostics[field]} does not reconcile with actual ${value}.`);
    }
  }

  if (!Array.isArray(diagnostics.warnings)) add(errors, "diagnostics.warnings must be an array.");
}

function validateOrdering(rows, errors) {
  const sorted = [...rows].sort(compareRows);
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index] !== sorted[index]) {
      add(errors, `rows must be sorted deterministically by gameId, pitcherId, key; first mismatch at index ${index}.`);
      return;
    }
  }
}

export function validateKPropsV2ShadowArtifact(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ["Artifact must be an object."] };
  }

  validateNoInvalidJsonValues(payload, errors);

  if (payload.schemaVersion !== K_PROPS_V2_SHADOW_SCHEMA_VERSION) {
    add(errors, `schemaVersion must be ${K_PROPS_V2_SHADOW_SCHEMA_VERSION}.`);
  }
  if (payload.projectionMode !== K_PROPS_V2_SHADOW_MODE) {
    add(errors, 'projectionMode must be "shadow".');
  }
  if (typeof payload.modelVersion !== "string" || !payload.modelVersion) add(errors, "modelVersion is required.");
  if (!isValidDate(payload.slateDate)) add(errors, "slateDate must be valid YYYY-MM-DD.");
  if (!isValidIsoTimestamp(payload.generatedAt)) add(errors, "generatedAt must be a valid ISO timestamp.");
  if (!Array.isArray(payload.rows)) {
    add(errors, "rows must be an array.");
  } else {
    validateOrdering(payload.rows, errors);
    const identitySet = new Set();
    payload.rows.forEach((row, index) => validateRow(row, index, identitySet, errors));
  }

  validateDiagnostics(payload, errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function assertValidKPropsV2ShadowArtifact(payload) {
  const result = validateKPropsV2ShadowArtifact(payload);
  if (!result.ok) {
    throw new Error(`Invalid K props V2 shadow artifact: ${result.errors.join("; ")}`);
  }
  return payload;
}
