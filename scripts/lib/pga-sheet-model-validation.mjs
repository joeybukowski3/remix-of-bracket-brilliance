const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeModelKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseEmbeddedReferenceDate(rows) {
  const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, 12)) {
    for (const cell of Array.isArray(row) ? row : []) {
      const match = String(cell ?? "").match(datePattern);
      if (!match) continue;
      const month = match[1].padStart(2, "0");
      const day = match[2].padStart(2, "0");
      const year = match[3];
      const candidate = `${year}-${month}-${day}`;
      const date = new Date(`${candidate}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return candidate;
    }
  }
  return null;
}

export function sortSchedule(schedule) {
  return [...(Array.isArray(schedule) ? schedule : [])]
    .filter((entry) => entry && entry.startDate && entry.name)
    .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)));
}

export function buildScheduleContext(schedule, referenceDate) {
  const rows = sortSchedule(schedule);
  const active = rows.find(
    (entry) => entry.startDate <= referenceDate && String(entry.endDate ?? entry.startDate) >= referenceDate,
  );
  const currentUpcoming = active ?? rows.find((entry) => entry.startDate >= referenceDate) ?? rows.at(-1) ?? null;
  const nextWeek = currentUpcoming
    ? rows.find((entry) => entry.startDate > currentUpcoming.startDate) ?? null
    : null;
  return { currentUpcoming, nextWeek };
}

export function daysBetween(laterDate, earlierDate) {
  const later = new Date(`${laterDate}T00:00:00Z`).getTime();
  const earlier = new Date(`${earlierDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return Number.POSITIVE_INFINITY;
  return Math.floor((later - earlier) / DAY_MS);
}

export function expectedEntryForSection(section, context) {
  if (section === "current-tournament") return context.currentUpcoming;
  if (section === "next-tournament") return context.nextWeek;
  return null;
}

export function calculateFieldDiagnostics(modelRows, officialPlayers) {
  const modelNames = new Set(
    (Array.isArray(modelRows) ? modelRows : [])
      .map((row) => normalizeModelKey(row?.player))
      .filter(Boolean),
  );
  const fieldNames = new Set(
    (Array.isArray(officialPlayers) ? officialPlayers : [])
      .map((name) => normalizeModelKey(name))
      .filter(Boolean),
  );

  let matched = 0;
  modelNames.forEach((name) => {
    if (fieldNames.has(name)) matched += 1;
  });

  const unmatched = Math.max(0, modelNames.size - matched);
  const missing = Math.max(0, fieldNames.size - matched);
  const severeMismatch =
    fieldNames.size >= 20 &&
    modelNames.size >= 20 &&
    matched < Math.min(10, Math.ceil(fieldNames.size * 0.25));

  return {
    modelPlayerCount: modelNames.size,
    officialFieldCount: fieldNames.size,
    matchedPlayerCount: matched,
    unmatchedModelPlayerCount: unmatched,
    missingOfficialPlayerCount: missing,
    severeMismatch,
  };
}

export function validateSheetSource({
  section,
  expectedContext,
  sourceContext,
  sourceReferenceDate,
  today,
  maxSourceAgeDays = 14,
  maxDaysBeforeCurrentStart = 7,
  maxDaysAfterCurrentEnd = 4,
}) {
  const expected = expectedEntryForSection(section, expectedContext);
  const source = expectedEntryForSection(section, sourceContext);
  const expectedCurrent = expectedContext.currentUpcoming;
  const errors = [];

  if (!expected) errors.push(`No expected schedule entry exists for ${section}.`);
  if (!sourceReferenceDate) errors.push("The Google Sheet does not contain a trustworthy embedded reference date.");
  if (!source) errors.push(`The Google Sheet reference date could not be mapped to a ${section} schedule entry.`);

  if (sourceReferenceDate) {
    const age = daysBetween(today, sourceReferenceDate);
    if (age > maxSourceAgeDays) {
      errors.push(`The Google Sheet reference date ${sourceReferenceDate} is ${age} days old (maximum ${maxSourceAgeDays}).`);
    }

    if (expectedCurrent) {
      const daysBeforeStart = daysBetween(expectedCurrent.startDate, sourceReferenceDate);
      const daysAfterEnd = daysBetween(sourceReferenceDate, expectedCurrent.endDate ?? expectedCurrent.startDate);
      if (daysBeforeStart > maxDaysBeforeCurrentStart) {
        errors.push(`The Google Sheet reference date ${sourceReferenceDate} is too early for ${expectedCurrent.name}.`);
      }
      if (daysAfterEnd > maxDaysAfterCurrentEnd) {
        errors.push(`The Google Sheet reference date ${sourceReferenceDate} is too late for ${expectedCurrent.name}.`);
      }
    }
  }

  if (expected && source && normalizeModelKey(expected.name) !== normalizeModelKey(source.name)) {
    errors.push(`Expected ${expected.name}, but the Google Sheet reference date maps to ${source.name}.`);
  }

  if (expected && source && expected.courseName && source.courseName && normalizeModelKey(expected.courseName) !== normalizeModelKey(source.courseName)) {
    errors.push(`Expected course ${expected.courseName}, but the Google Sheet source maps to ${source.courseName}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    expected,
    source,
    sourceReferenceDate: sourceReferenceDate ?? null,
  };
}

export function buildValidatedModelPayload({
  section,
  rawPayload,
  validation,
  generatedAt,
  fieldDiagnostics = null,
}) {
  const expected = validation.expected;
  if (!expected) throw new Error(`Cannot build ${section} payload without an expected schedule entry.`);

  const sourceValidated = validation.valid && !fieldDiagnostics?.severeMismatch;
  const rows = sourceValidated && Array.isArray(rawPayload?.rows) ? rawPayload.rows : [];
  const modelAvailable = sourceValidated && rows.length > 0;
  const rejectionReasons = [...validation.errors];
  if (fieldDiagnostics?.severeMismatch) rejectionReasons.push("Official-field overlap is too low to trust this model output.");

  return {
    section,
    title: rawPayload?.title ?? (section === "current-tournament" ? "CURRENT TOURNAMENT MODEL" : "NEXT WEEK TOURNAMENT MODEL"),
    tournamentName: expected.name,
    tournamentId: expected.id ?? expected.slug ?? null,
    courseName: expected.courseName ?? "",
    startDate: expected.startDate,
    endDate: expected.endDate,
    generatedAt,
    modelAvailable,
    modelSource: "google-sheet",
    sourceTournamentName: validation.source?.name ?? null,
    sourceReferenceDate: validation.sourceReferenceDate,
    sourceValidated,
    sourceValidationErrors: rejectionReasons,
    fieldDiagnostics,
    modelNote: modelAvailable
      ? null
      : rejectionReasons.length > 0
        ? `Model rows were withheld: ${rejectionReasons.join(" ")}`
        : `The Google Sheet does not contain a validated ${expected.name} model.`,
    rows: modelAvailable ? rows : [],
  };
}

export function assertModelPayload(payload) {
  const required = [
    "section",
    "tournamentName",
    "tournamentId",
    "startDate",
    "endDate",
    "modelAvailable",
    "modelSource",
    "sourceValidated",
    "rows",
  ];
  for (const key of required) {
    if (!(key in payload)) throw new Error(`Missing required model metadata: ${key}`);
  }

  for (const key of ["section", "tournamentName", "tournamentId", "startDate", "endDate", "modelSource"]) {
    if (typeof payload[key] !== "string" || payload[key].trim() === "") {
      throw new Error(`Invalid required model metadata: ${key}`);
    }
  }
  if (typeof payload.modelAvailable !== "boolean") throw new Error("modelAvailable must be boolean.");
  if (typeof payload.sourceValidated !== "boolean") throw new Error("sourceValidated must be boolean.");
  if (!Array.isArray(payload.rows)) throw new Error("Model rows must be an array.");
  if (payload.modelAvailable === false && payload.rows.length > 0) {
    throw new Error("Unavailable models must have zero rows.");
  }
  if (payload.modelAvailable === true && payload.sourceValidated !== true) {
    throw new Error("Available models require independently validated source data.");
  }
  if (payload.modelAvailable === true && payload.rows.length === 0) {
    throw new Error("Available models require at least one row.");
  }
  return true;
}

export function assertNoUnsafeRegression(previousPayload, nextPayload) {
  const previousWasSafeUnavailable = previousPayload?.modelAvailable === false && Array.isArray(previousPayload?.rows) && previousPayload.rows.length === 0;
  const nextIsUnsafePopulated =
    Array.isArray(nextPayload?.rows) &&
    nextPayload.rows.length > 0 &&
    (nextPayload.modelAvailable !== true || nextPayload.sourceValidated !== true);
  if (previousWasSafeUnavailable && nextIsUnsafePopulated) {
    throw new Error("Refusing unsafe regression from a safe unavailable model to unvalidated populated rows.");
  }
  return true;
}
