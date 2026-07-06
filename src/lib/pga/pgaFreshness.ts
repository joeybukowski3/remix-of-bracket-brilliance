export const PGA_FRESHNESS_THRESHOLDS = {
  fieldMaxAgeDays: 7,
  modelMaxAgeDays: 7,
  bestBetsMaxAgeDays: 7,
  playerStatsMaxAgeDays: 14,
} as const;

export type PgaFreshnessPayloadType =
  | "current-field"
  | "current-tournament"
  | "next-tournament"
  | "best-bets"
  | "player-stats-meta";

export type PgaFreshnessStatus =
  | "current"
  | "upcoming"
  | "stale"
  | "mismatched"
  | "empty"
  | "missing-timestamp"
  | "missing-rows"
  | "unavailable"
  | "unknown";

export type PgaFreshnessSeverity = "ok" | "info" | "warning" | "error";

export type PgaFreshnessScheduleEvent = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  shortName?: string | null;
  tournamentName?: string | null;
  courseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
};

export type PgaFreshnessThresholds = Partial<typeof PGA_FRESHNESS_THRESHOLDS>;

export type PgaFreshnessOptions = {
  payloadType: PgaFreshnessPayloadType;
  expectedEvent?: PgaFreshnessScheduleEvent | null;
  asOf?: Date | string;
  thresholds?: PgaFreshnessThresholds;
};

export type PgaFreshnessResult = {
  status: PgaFreshnessStatus;
  severity: PgaFreshnessSeverity;
  isUsable: boolean;
  isCurrent: boolean;
  isEmpty: boolean;
  isStale: boolean;
  isMismatched: boolean;
  reason: string;
  expectedTournament: string | null;
  actualTournament: string | null;
  generatedAt: string | null;
  fetchedAt: string | null;
  rowCount: number | null;
  daysOld: number | null;
  source: string | null;
};

type PayloadSummary = {
  actualTournament: string | null;
  generatedAt: string | null;
  fetchedAt: string | null;
  rowCount: number | null;
  source: string | null;
  modelAvailable: boolean | null;
  hasRowsField: boolean;
};

export function assessPgaFreshness(payload: unknown, options: PgaFreshnessOptions): PgaFreshnessResult {
  const expectedTournament = getExpectedTournament(options.expectedEvent);
  const summary = summarizePayload(payload, options.payloadType);
  const asOf = normalizeAsOf(options.asOf);
  const maxAgeDays = getMaxAgeDays(options.payloadType, options.thresholds);
  const timestamp = summary.fetchedAt ?? summary.generatedAt;
  const daysOld = timestamp ? calculateDaysOld(timestamp, asOf) : null;
  const isMismatched = Boolean(
    expectedTournament
    && summary.actualTournament
    && !tournamentMatches(summary.actualTournament, options.expectedEvent),
  );
  const isScheduleComplete = isCompletedEvent(options.expectedEvent, asOf);
  const isTimestampMissing = !timestamp;
  const isStaleByAge = daysOld != null && daysOld > maxAgeDays;
  const isStale = isStaleByAge || isScheduleComplete;
  const isEmpty = summary.rowCount != null && summary.rowCount <= 0;
  const base = {
    expectedTournament,
    actualTournament: summary.actualTournament,
    generatedAt: summary.generatedAt,
    fetchedAt: summary.fetchedAt,
    rowCount: summary.rowCount,
    daysOld,
    source: summary.source,
  };

  if (!isRecord(payload)) {
    return buildResult({
      ...base,
      status: "unknown",
      severity: "error",
      isUsable: false,
      isCurrent: false,
      isEmpty: false,
      isStale: false,
      isMismatched: false,
      reason: "Payload is unavailable or malformed.",
    });
  }

  if (summary.modelAvailable === false) {
    return buildResult({
      ...base,
      status: "unavailable",
      severity: "warning",
      isUsable: false,
      isCurrent: false,
      isEmpty,
      isStale,
      isMismatched,
      reason: readString(payload.modelNote) ?? "Payload is explicitly marked unavailable.",
    });
  }

  if (isMismatched) {
    return buildResult({
      ...base,
      status: "mismatched",
      severity: "error",
      isUsable: false,
      isCurrent: false,
      isEmpty,
      isStale,
      isMismatched: true,
      reason: `Payload tournament does not match expected tournament${expectedTournament ? ` (${expectedTournament})` : ""}.`,
    });
  }

  if (isEmpty) {
    return buildResult({
      ...base,
      status: summary.hasRowsField ? "missing-rows" : "empty",
      severity: "warning",
      isUsable: false,
      isCurrent: false,
      isEmpty: true,
      isStale,
      isMismatched: false,
      reason: summary.hasRowsField ? "Payload has no rows." : "Payload has no recommendation entries.",
    });
  }

  if (isTimestampMissing) {
    return buildResult({
      ...base,
      status: "missing-timestamp",
      severity: "warning",
      isUsable: false,
      isCurrent: false,
      isEmpty,
      isStale: false,
      isMismatched: false,
      reason: "Payload is missing generatedAt/fetchedAt freshness metadata.",
    });
  }

  if (isStale) {
    return buildResult({
      ...base,
      status: "stale",
      severity: "warning",
      isUsable: false,
      isCurrent: false,
      isEmpty,
      isStale: true,
      isMismatched: false,
      reason: isScheduleComplete
        ? "Expected tournament is already complete."
        : `Payload is older than ${maxAgeDays} days.`,
    });
  }

  const eventTiming = getEventTiming(options.expectedEvent, asOf);
  return buildResult({
    ...base,
    status: eventTiming === "upcoming" ? "upcoming" : "current",
    severity: eventTiming === "upcoming" ? "info" : "ok",
    isUsable: true,
    isCurrent: eventTiming !== "upcoming",
    isEmpty: false,
    isStale: false,
    isMismatched: false,
    reason: eventTiming === "upcoming"
      ? "Payload matches an upcoming tournament and is within freshness thresholds."
      : "Payload matches the expected tournament and is within freshness thresholds.",
  });
}

function summarizePayload(payload: unknown, payloadType: PgaFreshnessPayloadType): PayloadSummary {
  if (!isRecord(payload)) {
    return {
      actualTournament: null,
      generatedAt: null,
      fetchedAt: null,
      rowCount: null,
      source: null,
      modelAvailable: null,
      hasRowsField: false,
    };
  }

  if (payloadType === "player-stats-meta") {
    return {
      actualTournament: null,
      generatedAt: readString(payload.syncedAt) ?? readString(payload.exportDate),
      fetchedAt: null,
      rowCount: readNumber(payload.playerCount),
      source: readString(payload.source),
      modelAvailable: null,
      hasRowsField: false,
    };
  }

  if (payloadType === "current-field") {
    return {
      actualTournament: readString(payload.tournament),
      generatedAt: null,
      fetchedAt: readString(payload.fetchedAt),
      rowCount: readNumber(payload.fieldCount) ?? readArrayLength(payload.players),
      source: readString(payload.source),
      modelAvailable: null,
      hasRowsField: false,
    };
  }

  if (payloadType === "best-bets") {
    const pickCount =
      readArrayLength(payload.outrights)
      + readArrayLength(payload.top5)
      + readArrayLength(payload.top10)
      + readArrayLength(payload.top20)
      + readArrayLength(payload.valueBets);
    return {
      actualTournament: readString(payload.tournament),
      generatedAt: readString(payload.generatedAt),
      fetchedAt: null,
      rowCount: pickCount,
      source: readString(payload.source),
      modelAvailable: null,
      hasRowsField: false,
    };
  }

  return {
    actualTournament: readString(payload.tournamentName) ?? readString(payload.tournament),
    generatedAt: readString(payload.generatedAt),
    fetchedAt: null,
    rowCount: readArrayLength(payload.rows),
    source: readString(payload.modelSource) ?? readString(payload.source),
    modelAvailable: readBoolean(payload.modelAvailable),
    hasRowsField: true,
  };
}

function buildResult(result: PgaFreshnessResult): PgaFreshnessResult {
  return result;
}

function getMaxAgeDays(payloadType: PgaFreshnessPayloadType, overrides: PgaFreshnessThresholds = {}) {
  const thresholds = { ...PGA_FRESHNESS_THRESHOLDS, ...overrides };
  if (payloadType === "player-stats-meta") return thresholds.playerStatsMaxAgeDays;
  if (payloadType === "current-field") return thresholds.fieldMaxAgeDays;
  if (payloadType === "best-bets") return thresholds.bestBetsMaxAgeDays;
  return thresholds.modelMaxAgeDays;
}

function getExpectedTournament(event: PgaFreshnessScheduleEvent | null | undefined) {
  return readString(event?.shortName) ?? readString(event?.name) ?? readString(event?.tournamentName) ?? null;
}

function tournamentMatches(actualTournament: string, expectedEvent: PgaFreshnessScheduleEvent | null | undefined) {
  const actual = normalizeTournamentKey(actualTournament);
  const candidates = [
    expectedEvent?.id,
    expectedEvent?.slug,
    expectedEvent?.name,
    expectedEvent?.shortName,
    expectedEvent?.tournamentName,
  ].map(normalizeTournamentKey).filter(Boolean);
  return candidates.includes(actual);
}

function getEventTiming(event: PgaFreshnessScheduleEvent | null | undefined, asOf: Date) {
  const start = parseDate(event?.startDate);
  if (start && start > startOfDay(asOf)) return "upcoming";
  return "current";
}

function isCompletedEvent(event: PgaFreshnessScheduleEvent | null | undefined, asOf: Date) {
  if (readString(event?.status)?.toLowerCase() === "complete") return true;
  const end = parseDate(event?.endDate ?? event?.startDate);
  if (!end) return false;
  return end < startOfDay(asOf);
}

function calculateDaysOld(timestamp: string, asOf: Date) {
  const parsed = parseDate(timestamp);
  if (!parsed) return null;
  const difference = startOfDay(asOf).getTime() - startOfDay(parsed).getTime();
  return Math.max(0, Math.floor(difference / 86400000));
}

function normalizeAsOf(value: Date | string | undefined) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function normalizeTournamentKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament|2026|picks)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}
