export const HR_ARCHIVE_SCHEMA_VERSION = 2;

export const RETRYABLE_RESULT_STATUSES = new Set([
  "pending",
  "suspended",
  "unresolved_retryable",
]);

export const TERMINAL_RESULT_STATUSES = new Set([
  "hit",
  "miss",
  "did_not_play",
  "postponed",
  "cancelled",
  "unresolved_terminal",
]);

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function assessPredictionTiming(generatedAt, gameStartTime) {
  const generatedMs = Date.parse(generatedAt);
  const startMs = Date.parse(gameStartTime);

  if (!Number.isFinite(startMs)) {
    return {
      timingStatus: "timing_unverified",
      eligibleForEvaluation: false,
      exclusionReason: "game_start_time_unavailable",
    };
  }
  if (!Number.isFinite(generatedMs)) {
    return {
      timingStatus: "timing_unverified",
      eligibleForEvaluation: false,
      exclusionReason: "prediction_timestamp_invalid",
    };
  }
  if (generatedMs >= startMs) {
    return {
      timingStatus: "post_start",
      eligibleForEvaluation: false,
      exclusionReason: "prediction_generated_at_or_after_game_start",
    };
  }
  return {
    timingStatus: "verified_pregame",
    eligibleForEvaluation: true,
    exclusionReason: null,
  };
}

export function serializePhase2Shadow(player) {
  const shadow = player?.phase2Shadow;
  if (!shadow || typeof shadow !== "object" || Array.isArray(shadow)) {
    return {
      enabled: false,
      combinedShadowScore: null,
      rank: null,
      version: null,
      bullpenContribution: null,
      handSplitContribution: null,
      bullpenAvailable: null,
      handSplitAvailable: null,
      bullpenFreshness: null,
      handSplitFreshness: null,
    };
  }

  const bullpenEnabled = shadow.enabledComponents?.bullpen === true;
  const handSplitEnabled = shadow.enabledComponents?.handSplit === true;
  const bullpenAvailable = typeof shadow.componentAvailability?.bullpen === "boolean"
    ? shadow.componentAvailability.bullpen
    : null;
  const handSplitAvailable = typeof shadow.componentAvailability?.handSplit === "boolean"
    ? shadow.componentAvailability.handSplit
    : null;

  return {
    enabled: bullpenEnabled || handSplitEnabled,
    combinedShadowScore: finiteOrNull(shadow.combinedShadowScore),
    rank: finiteOrNull(player.phase2Rank),
    version: stringOrNull(shadow.shadowExperimentVersion),
    bullpenContribution: bullpenEnabled ? finiteOrNull(shadow.componentContributions?.bullpen) : null,
    handSplitContribution: handSplitEnabled ? finiteOrNull(shadow.componentContributions?.handSplit) : null,
    bullpenAvailable,
    handSplitAvailable,
    bullpenFreshness: stringOrNull(shadow.bullpenShadow?.freshnessStatus),
    handSplitFreshness: stringOrNull(shadow.handSplitShadow?.freshnessStatus),
  };
}

export function normalizeArchiveRecord(record) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const legacyStatus = source.result?.status === "unresolved" ? "unresolved" : null;
  const result = {
    ...(source.result ?? {}),
    status: legacyStatus ? "unresolved_retryable" : source.result?.status ?? "pending",
    ...(legacyStatus ? { legacyStatus } : {}),
  };
  const phase2Shadow = source.phase2Shadow && typeof source.phase2Shadow === "object"
    ? {
        enabled: source.phase2Shadow.enabled ?? null,
        combinedShadowScore: finiteOrNull(source.phase2Shadow.combinedShadowScore),
        rank: finiteOrNull(source.phase2Shadow.rank),
        version: stringOrNull(source.phase2Shadow.version),
        bullpenContribution: finiteOrNull(source.phase2Shadow.bullpenContribution),
        handSplitContribution: finiteOrNull(source.phase2Shadow.handSplitContribution),
        bullpenAvailable: typeof source.phase2Shadow.bullpenAvailable === "boolean" ? source.phase2Shadow.bullpenAvailable : null,
        handSplitAvailable: typeof source.phase2Shadow.handSplitAvailable === "boolean" ? source.phase2Shadow.handSplitAvailable : null,
        bullpenFreshness: stringOrNull(source.phase2Shadow.bullpenFreshness),
        handSplitFreshness: stringOrNull(source.phase2Shadow.handSplitFreshness),
      }
    : {
        enabled: null,
        combinedShadowScore: null,
        rank: null,
        version: null,
        bullpenContribution: null,
        handSplitContribution: null,
        bullpenAvailable: null,
        handSplitAvailable: null,
        bullpenFreshness: null,
        handSplitFreshness: null,
      };

  return {
    ...source,
    teamId: finiteOrNull(source.teamId),
    opponentId: finiteOrNull(source.opponentId),
    officialGameDate: stringOrNull(source.officialGameDate ?? source.date),
    gameStartTime: stringOrNull(source.gameStartTime),
    gameNumber: finiteOrNull(source.gameNumber),
    doubleHeader: stringOrNull(source.doubleHeader),
    oddsCapturedAt: stringOrNull(source.oddsCapturedAt),
    oddsSourceSlateDate: stringOrNull(source.oddsSourceSlateDate),
    timing: source.timing ?? assessPredictionTiming(source.generatedAt, source.gameStartTime),
    phase2Shadow,
    result,
  };
}

export function isCleanEvaluationRecord(record) {
  const normalized = normalizeArchiveRecord(record);
  return (
    (normalized.result.status === "hit" || normalized.result.status === "miss")
    && Number.isFinite(normalized.hrQualityScore)
    && Number.isFinite(normalized.phase2Shadow.combinedShadowScore)
    && normalized.playerId != null
    && normalized.gameId != null
    && normalized.timing.eligibleForEvaluation === true
  );
}
