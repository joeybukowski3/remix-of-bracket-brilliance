import { detectSameNameCollisions } from "./identity.mjs";

export const PERSONNEL_EVIDENCE_SCHEMA_VERSION = "nfl-personnel-evidence-v0.1";
export const PERSONNEL_EVIDENCE_GENERATOR_VERSION = "nfl-personnel-generator-v0.1";

export const QB_CONTINUITY_STATUSES = Object.freeze([
  "returning_starter",
  "new_starter",
  "open_competition",
  "rookie_candidate",
  "veteran_acquisition",
  "unknown",
]);

export const COACHING_STATUSES = Object.freeze([
  "returning",
  "new",
  "changed_role",
  "vacancy",
  "unknown",
]);

export const COACHING_ROLES = Object.freeze([
  "headCoach",
  "offensiveCoordinator",
  "defensiveCoordinator",
]);

export const TRANSACTION_TYPES = Object.freeze([
  "free_agent_signing",
  "trade_addition",
  "trade_departure",
  "release",
  "waiver_claim",
  "retirement",
  "draft_selection",
  "re_signing",
  "unsigned_departure",
  "other",
]);

export const EVIDENCE_STATUSES = Object.freeze([
  "verified",
  "partially_verified",
  "unverified",
  "conflicted",
]);

export const EXPECTED_ROLES = Object.freeze([
  "starter",
  "rotation",
  "depth",
  "developmental",
  "unknown",
]);

export const RETURNING_PRODUCTION_METRICS = Object.freeze([
  "offensiveSnaps",
  "defensiveSnaps",
  "starts",
  "qbPassAttempts",
  "carries",
  "rushingYards",
  "targets",
  "receptions",
  "receivingYards",
  "offensiveLineSnaps",
  "sacks",
  "pressures",
  "defensiveBackSnaps",
]);

const SOURCE_TYPES = new Set([
  "repository_manual",
  "warren_sharp",
  "vsin",
  "official_team",
  "league",
  "structured_provider",
  "public_source",
  "fixture",
  "other",
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER_URL = /example\.com|placeholder|todo|tbd|fake/i;
const FORBIDDEN_SCORE_KEY = /(score|rating|edge|pick|projection)/i;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pathJoin(path, segment) {
  return `${path}.${segment}`;
}

function addError(result, path, code, message) {
  result.errors.push({ path, code, message });
}

function addWarning(result, path, code, message) {
  result.warnings.push({ path, code, message });
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isDateOnly(value) {
  return typeof value === "string" && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function requireString(result, value, path, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim() === "") {
    addError(result, path, "required_string", `${path} must be a non-empty string`);
  }
}

function validateDateField(result, value, path, { dateOnly = false, nullable = true } = {}) {
  if (value == null && nullable) return;
  if (dateOnly ? !isDateOnly(value) : !isIsoDateTime(value)) {
    addError(result, path, "invalid_date", `${path} must be a valid ${dateOnly ? "YYYY-MM-DD" : "ISO"} date`);
  }
  if (typeof value === "string" && /1900-01-01|1970-01-01|2099-12-31|0000-00-00/.test(value)) {
    addError(result, path, "placeholder_date", `${path} looks like an invented placeholder date`);
  }
}

function validateSourceRef(result, ref, path, sourceIds) {
  if (!isRecord(ref)) {
    addError(result, path, "invalid_source_ref", `${path} must be an object`);
    return;
  }
  requireString(result, ref.sourceId, pathJoin(path, "sourceId"));
  if (typeof ref.sourceId === "string" && !sourceIds.has(ref.sourceId)) {
    addError(result, pathJoin(path, "sourceId"), "unknown_source_ref", `${path}.sourceId does not reference a declared source`);
  }
  if (ref.sourceRowId != null && typeof ref.sourceRowId !== "string") {
    addError(result, pathJoin(path, "sourceRowId"), "invalid_source_row_id", `${path}.sourceRowId must be a string when present`);
  }
}

function validateSourceRefs(result, sourceRefs, path, sourceIds) {
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    addError(result, path, "missing_source_refs", `${path} must contain at least one source reference`);
    return;
  }
  sourceRefs.forEach((ref, index) => validateSourceRef(result, ref, `${path}[${index}]`, sourceIds));
}

function validatePersonIdentity(result, person, path) {
  if (person == null) return;
  if (!isRecord(person)) {
    addError(result, path, "invalid_person_identity", `${path} must be an object`);
    return;
  }
  if (person.playerId != null && typeof person.playerId !== "string") addError(result, pathJoin(path, "playerId"), "invalid_player_id", "playerId must be a string");
  if (person.providerId != null && typeof person.providerId !== "string") addError(result, pathJoin(path, "providerId"), "invalid_provider_id", "providerId must be a string");
  requireString(result, person.playerName ?? person.name, pathJoin(path, "playerName"));
  if (person.normalizedName != null && typeof person.normalizedName !== "string") addError(result, pathJoin(path, "normalizedName"), "invalid_normalized_name", "normalizedName must be a string");
}

function validateCoachContinuity(result, roleRecord, path, sourceIds) {
  if (!isRecord(roleRecord)) {
    addError(result, path, "invalid_coaching_role", `${path} must be an object`);
    return;
  }
  if (!COACHING_STATUSES.includes(roleRecord.status)) {
    addError(result, pathJoin(path, "status"), "invalid_coaching_status", `${path}.status is unsupported`);
  }
  if (roleRecord.status === "vacancy" && roleRecord.coachName) {
    addError(result, pathJoin(path, "coachName"), "contradictory_coaching_status", "vacancy cannot include a coachName");
  }
  if (["returning", "new", "changed_role"].includes(roleRecord.status)) {
    requireString(result, roleRecord.coachName, pathJoin(path, "coachName"));
  }
  if (roleRecord.priorRole != null && typeof roleRecord.priorRole !== "string") addError(result, pathJoin(path, "priorRole"), "invalid_prior_role", "priorRole must be a string or null");
  validateDateField(result, roleRecord.effectiveDate, pathJoin(path, "effectiveDate"), { dateOnly: true, nullable: true });
  if (roleRecord.schemeChange != null && typeof roleRecord.schemeChange !== "string") addError(result, pathJoin(path, "schemeChange"), "invalid_scheme_change", "schemeChange must be a sourced string or null");
  if (!EVIDENCE_STATUSES.includes(roleRecord.evidenceStatus)) addError(result, pathJoin(path, "evidenceStatus"), "invalid_evidence_status", "evidenceStatus is unsupported");
  validateSourceRefs(result, roleRecord.sourceRefs, pathJoin(path, "sourceRefs"), sourceIds);
}

function validateMetric(result, metric, path, sourceIds) {
  if (!isRecord(metric)) {
    addError(result, path, "invalid_metric", `${path} must be an object`);
    return;
  }
  const { value, numerator, denominator, coverageComplete } = metric;
  if (value != null && (typeof value !== "number" || value < 0 || value > 1)) {
    addError(result, pathJoin(path, "value"), "invalid_share", "retained share must be null or between 0 and 1");
  }
  if (numerator != null && (typeof numerator !== "number" || numerator < 0)) {
    addError(result, pathJoin(path, "numerator"), "invalid_numerator", "numerator must be null or a non-negative number");
  }
  if (denominator != null && (typeof denominator !== "number" || denominator < 0)) {
    addError(result, pathJoin(path, "denominator"), "invalid_denominator", "denominator must be null or a non-negative number");
  }
  if (typeof coverageComplete !== "boolean") {
    addError(result, pathJoin(path, "coverageComplete"), "invalid_coverage_flag", "coverageComplete must be boolean");
  }
  if (typeof numerator === "number" && typeof denominator === "number" && numerator > denominator) {
    addError(result, pathJoin(path, "numerator"), "numerator_exceeds_denominator", "numerator cannot exceed denominator");
  }
  if (coverageComplete && denominator == null) {
    addError(result, pathJoin(path, "denominator"), "complete_missing_denominator", "coverageComplete cannot be true without a denominator");
  }
  if (value === 0 && (numerator == null || denominator == null)) {
    addError(result, pathJoin(path, "value"), "zero_filled_unavailable_metric", "unavailable data must remain null, not zero-filled");
  }
  validateSourceRefs(result, metric.sourceRefs, pathJoin(path, "sourceRefs"), sourceIds);
  if (!Array.isArray(metric.warnings)) addError(result, pathJoin(path, "warnings"), "invalid_metric_warnings", "metric warnings must be an array");
}

function validateReturningProduction(result, returningProduction, path, sourceIds) {
  if (!isRecord(returningProduction) || !isRecord(returningProduction.metrics)) {
    addError(result, path, "invalid_returning_production", `${path}.metrics is required`);
    return;
  }
  for (const metricKey of RETURNING_PRODUCTION_METRICS) {
    if (!Object.prototype.hasOwnProperty.call(returningProduction.metrics, metricKey)) {
      addError(result, pathJoin(path, `metrics.${metricKey}`), "missing_returning_metric", `${metricKey} is required`);
      continue;
    }
    validateMetric(result, returningProduction.metrics[metricKey], pathJoin(path, `metrics.${metricKey}`), sourceIds);
  }
}

function validateTransaction(result, tx, path, sourceIds, canonicalIds) {
  if (!isRecord(tx)) {
    addError(result, path, "invalid_transaction", `${path} must be an object`);
    return;
  }
  requireString(result, tx.transactionId, pathJoin(path, "transactionId"));
  if (!TRANSACTION_TYPES.includes(tx.type)) addError(result, pathJoin(path, "type"), "invalid_transaction_type", "transaction type is unsupported");
  validatePersonIdentity(result, tx.player, pathJoin(path, "player"));
  requireString(result, tx.position, pathJoin(path, "position"), { nullable: true });
  if (tx.fromTeamId != null && !canonicalIds.has(tx.fromTeamId)) addError(result, pathJoin(path, "fromTeamId"), "invalid_team_id", "fromTeamId is not canonical");
  if (tx.toTeamId != null && !canonicalIds.has(tx.toTeamId)) addError(result, pathJoin(path, "toTeamId"), "invalid_team_id", "toTeamId is not canonical");
  validateDateField(result, tx.transactionDate, pathJoin(path, "transactionDate"), { dateOnly: true, nullable: false });
  if (tx.expectedRole != null && !EXPECTED_ROLES.includes(tx.expectedRole)) addError(result, pathJoin(path, "expectedRole"), "invalid_expected_role", "expectedRole is unsupported");
  if (!EVIDENCE_STATUSES.includes(tx.evidenceStatus)) addError(result, pathJoin(path, "evidenceStatus"), "invalid_evidence_status", "evidenceStatus is unsupported");
  validateSourceRefs(result, tx.sourceRefs, pathJoin(path, "sourceRefs"), sourceIds);
  if (tx.type === "retirement" && tx.toTeamId != null) addError(result, pathJoin(path, "toTeamId"), "invalid_retirement_destination", "retirement cannot have a toTeamId");
  if (tx.type === "draft_selection" && tx.fromTeamId != null) addError(result, pathJoin(path, "fromTeamId"), "invalid_draft_origin", "draft selection cannot have a fromTeamId");
}

function validateInjuryReturn(result, injury, path, sourceIds, canonicalIds) {
  if (!isRecord(injury)) {
    addError(result, path, "invalid_injury_return", `${path} must be an object`);
    return;
  }
  validatePersonIdentity(result, injury.player, pathJoin(path, "player"));
  requireString(result, injury.position, pathJoin(path, "position"));
  if (injury.priorTeamId != null && !canonicalIds.has(injury.priorTeamId)) addError(result, pathJoin(path, "priorTeamId"), "invalid_team_id", "priorTeamId is not canonical");
  if (!Number.isInteger(injury.gamesMissed) || injury.gamesMissed < 0) addError(result, pathJoin(path, "gamesMissed"), "invalid_games_missed", "gamesMissed must be a non-negative integer");
  requireString(result, injury.availabilityCategory, pathJoin(path, "availabilityCategory"));
  requireString(result, injury.expectedReturnStatus, pathJoin(path, "expectedReturnStatus"));
  requireString(result, injury.priorRole, pathJoin(path, "priorRole"));
  if (!EVIDENCE_STATUSES.includes(injury.evidenceStatus)) addError(result, pathJoin(path, "evidenceStatus"), "invalid_evidence_status", "evidenceStatus is unsupported");
  validateDateField(result, injury.sourceDate, pathJoin(path, "sourceDate"), { dateOnly: true, nullable: true });
  validateSourceRefs(result, injury.sourceRefs, pathJoin(path, "sourceRefs"), sourceIds);
}

function validateQuarterbackContinuity(result, qb, path, sourceIds) {
  if (!isRecord(qb)) {
    addError(result, path, "invalid_quarterback_continuity", `${path} must be an object`);
    return;
  }
  if (!QB_CONTINUITY_STATUSES.includes(qb.status)) addError(result, pathJoin(path, "status"), "invalid_qb_status", "QB continuity status is unsupported");
  if (["returning_starter", "new_starter", "rookie_candidate", "veteran_acquisition"].includes(qb.status) && !qb.player) {
    addError(result, pathJoin(path, "player"), "missing_qb_player", `${qb.status} requires a player identity`);
  }
  if (qb.status === "open_competition" && qb.player) {
    addError(result, pathJoin(path, "player"), "inconsistent_qb_status", "open competition cannot declare a single starter");
  }
  validatePersonIdentity(result, qb.player, pathJoin(path, "player"));
  validateDateField(result, qb.effectiveDate, pathJoin(path, "effectiveDate"), { dateOnly: true, nullable: true });
  if (!EVIDENCE_STATUSES.includes(qb.evidenceStatus)) addError(result, pathJoin(path, "evidenceStatus"), "invalid_evidence_status", "evidenceStatus is unsupported");
  validateSourceRefs(result, qb.sourceRefs, pathJoin(path, "sourceRefs"), sourceIds);
}

function validateSources(result, sources) {
  const sourceIds = new Set();
  if (!Array.isArray(sources) || sources.length === 0) {
    addError(result, "sources", "missing_sources", "sources must be a non-empty array");
    return sourceIds;
  }
  sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    if (!isRecord(source)) {
      addError(result, path, "invalid_source", `${path} must be an object`);
      return;
    }
    requireString(result, source.sourceId, pathJoin(path, "sourceId"));
    if (sourceIds.has(source.sourceId)) addError(result, pathJoin(path, "sourceId"), "duplicate_source_id", `duplicate sourceId ${source.sourceId}`);
    sourceIds.add(source.sourceId);
    requireString(result, source.sourceName, pathJoin(path, "sourceName"));
    if (!SOURCE_TYPES.has(source.sourceType)) addError(result, pathJoin(path, "sourceType"), "invalid_source_type", "sourceType is unsupported");
    if (source.sourcePath == null && source.cachePath == null) addError(result, path, "missing_source_path", "sourcePath or cachePath is required");
    validateDateField(result, source.sourceUpdatedAt, pathJoin(path, "sourceUpdatedAt"), { dateOnly: true, nullable: true });
    validateDateField(result, source.retrievedAt, pathJoin(path, "retrievedAt"), { dateOnly: false, nullable: true });
    if (source.sourceUrl != null) {
      if (typeof source.sourceUrl !== "string" || !/^https?:\/\//.test(source.sourceUrl)) {
        addError(result, pathJoin(path, "sourceUrl"), "invalid_source_url", "sourceUrl must be a real http(s) URL when present");
      } else if (PLACEHOLDER_URL.test(source.sourceUrl)) {
        addError(result, pathJoin(path, "sourceUrl"), "placeholder_source_url", "sourceUrl looks invented");
      }
    }
    if (typeof source.verified !== "boolean") addError(result, pathJoin(path, "verified"), "invalid_verified", "verified must be boolean");
  });
  return sourceIds;
}

function validateNoScoreFields(result, value, path = "dataset") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoScoreFields(result, entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_SCORE_KEY.test(key) && key !== "source") {
      addError(result, pathJoin(path, key), "forbidden_score_field", "personnel evidence must not contain score/rating/edge/projection fields");
    }
    validateNoScoreFields(result, entry, pathJoin(path, key));
  }
}

export function canonicalTeamMaps(teamsJson) {
  const teams = Array.isArray(teamsJson?.teams) ? teamsJson.teams : [];
  return {
    teams,
    byId: new Map(teams.map((team) => [team.id, team])),
    byAbbr: new Map(teams.map((team) => [team.abbr, team])),
    ids: new Set(teams.map((team) => team.id)),
  };
}

export function validatePersonnelEvidenceDataset(dataset, teamsJson, { requireAllTeams = false } = {}) {
  const result = { valid: true, errors: [], warnings: [] };
  if (!isRecord(dataset)) {
    addError(result, "dataset", "invalid_dataset", "dataset must be an object");
    result.valid = false;
    return result;
  }

  validateNoScoreFields(result, dataset);
  if (dataset.schemaVersion !== PERSONNEL_EVIDENCE_SCHEMA_VERSION) {
    addError(result, "schemaVersion", "unsupported_schema_version", `schemaVersion must be ${PERSONNEL_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(dataset.targetSeason) || dataset.targetSeason < 2000 || dataset.targetSeason > 2100) addError(result, "targetSeason", "invalid_target_season", "targetSeason must be a season year");
  if (!Number.isInteger(dataset.priorSeason) || dataset.priorSeason !== dataset.targetSeason - 1) addError(result, "priorSeason", "invalid_prior_season", "priorSeason must equal targetSeason - 1");
  validateDateField(result, dataset.generatedAt, "generatedAt", { dateOnly: false, nullable: false });
  validateDateField(result, dataset.sourceCutoff, "sourceCutoff", { dateOnly: true, nullable: false });
  requireString(result, dataset.generatorVersion, "generatorVersion");

  const { byId, ids: canonicalIds } = canonicalTeamMaps(teamsJson);
  const sourceIds = validateSources(result, dataset.sources);

  if (!Array.isArray(dataset.warnings)) addError(result, "warnings", "invalid_warnings", "warnings must be an array");
  if (!Array.isArray(dataset.conflicts)) addError(result, "conflicts", "invalid_conflicts", "conflicts must be an array");
  if (!Array.isArray(dataset.teams)) {
    addError(result, "teams", "missing_teams", "teams must be an array");
  } else {
    const seenTeamIds = new Set();
    const transactionIds = new Set();
    const people = [];
    dataset.teams.forEach((team, index) => {
      const path = `teams[${index}]`;
      if (!isRecord(team)) {
        addError(result, path, "invalid_team", `${path} must be an object`);
        return;
      }
      if (!canonicalIds.has(team.teamId)) addError(result, pathJoin(path, "teamId"), "invalid_team_id", `${team.teamId} is not canonical`);
      if (seenTeamIds.has(team.teamId)) addError(result, pathJoin(path, "teamId"), "duplicate_team", `duplicate team ${team.teamId}`);
      seenTeamIds.add(team.teamId);
      const canonical = byId.get(team.teamId);
      if (canonical) {
        if (team.abbr !== canonical.abbr) addError(result, pathJoin(path, "abbr"), "team_abbr_mismatch", "team abbreviation does not match canonical teams.json");
        if (team.slug !== canonical.slug) addError(result, pathJoin(path, "slug"), "team_slug_mismatch", "team slug does not match canonical teams.json");
      }
      validateQuarterbackContinuity(result, team.quarterbackContinuity, pathJoin(path, "quarterbackContinuity"), sourceIds);
      for (const role of COACHING_ROLES) validateCoachContinuity(result, team.coachingContinuity?.[role], pathJoin(path, `coachingContinuity.${role}`), sourceIds);
      validateReturningProduction(result, team.returningProduction, pathJoin(path, "returningProduction"), sourceIds);
      if (!Array.isArray(team.transactions)) addError(result, pathJoin(path, "transactions"), "invalid_transactions", "transactions must be an array");
      else {
        team.transactions.forEach((tx, txIndex) => {
          validateTransaction(result, tx, `${path}.transactions[${txIndex}]`, sourceIds, canonicalIds);
          if (tx?.transactionId) {
            if (transactionIds.has(tx.transactionId)) addError(result, `${path}.transactions[${txIndex}].transactionId`, "duplicate_transaction_id", `duplicate transactionId ${tx.transactionId}`);
            transactionIds.add(tx.transactionId);
          }
          if (tx?.player) people.push(tx.player);
        });
      }
      if (!Array.isArray(team.injuryReturns)) addError(result, pathJoin(path, "injuryReturns"), "invalid_injury_returns", "injuryReturns must be an array");
      else team.injuryReturns.forEach((injury, injuryIndex) => {
        validateInjuryReturn(result, injury, `${path}.injuryReturns[${injuryIndex}]`, sourceIds, canonicalIds);
        if (injury?.player) people.push(injury.player);
      });
      if (!Array.isArray(team.warnings)) addError(result, pathJoin(path, "warnings"), "invalid_team_warnings", "team warnings must be an array");
      if (!Array.isArray(team.conflicts)) addError(result, pathJoin(path, "conflicts"), "invalid_team_conflicts", "team conflicts must be an array");
    });
    if (requireAllTeams && seenTeamIds.size !== 32) addError(result, "teams", "incomplete_team_count", `expected 32 teams, received ${seenTeamIds.size}`);
    for (const collision of detectSameNameCollisions(people)) {
      addWarning(result, "teams", "same_name_collision", `same-name collision requires provider IDs: ${collision.normalizedName}`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function assertValidPersonnelEvidenceDataset(dataset, teamsJson, options = {}) {
  const validation = validatePersonnelEvidenceDataset(dataset, teamsJson, options);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`NFL personnel evidence validation failed: ${details}`);
  }
  return validation;
}

export function sortPersonnelEvidenceDataset(dataset) {
  return {
    schemaVersion: dataset.schemaVersion,
    targetSeason: dataset.targetSeason,
    priorSeason: dataset.priorSeason,
    generatedAt: dataset.generatedAt,
    sourceCutoff: dataset.sourceCutoff,
    generatorVersion: dataset.generatorVersion,
    sources: [...(dataset.sources ?? [])].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId))),
    completeness: dataset.completeness ?? {},
    warnings: [...(dataset.warnings ?? [])].sort(),
    conflicts: [...(dataset.conflicts ?? [])].sort((a, b) => String(a.conflictId ?? "").localeCompare(String(b.conflictId ?? ""))),
    teams: [...(dataset.teams ?? [])]
      .sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)))
      .map((team) => ({
        teamId: team.teamId,
        abbr: team.abbr,
        slug: team.slug,
        name: team.name,
        quarterbackContinuity: team.quarterbackContinuity,
        coachingContinuity: team.coachingContinuity,
        returningProduction: {
          metrics: Object.fromEntries(RETURNING_PRODUCTION_METRICS.map((key) => [key, team.returningProduction?.metrics?.[key] ?? null])),
        },
        transactions: [...(team.transactions ?? [])].sort((a, b) => String(a.transactionDate).localeCompare(String(b.transactionDate)) || String(a.transactionId).localeCompare(String(b.transactionId))),
        injuryReturns: [...(team.injuryReturns ?? [])].sort((a, b) => String(a.player?.playerName ?? "").localeCompare(String(b.player?.playerName ?? ""))),
        completeness: team.completeness ?? {},
        warnings: [...(team.warnings ?? [])].sort(),
        conflicts: [...(team.conflicts ?? [])].sort((a, b) => String(a.conflictId ?? "").localeCompare(String(b.conflictId ?? ""))),
      })),
  };
}
