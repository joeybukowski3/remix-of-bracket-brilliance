import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCsv } from "../../../nfl-schedules-results-core.mjs";
import { toNflJsonFileString } from "../../../nfl-data-meta.mjs";
import { evaluatePersonnelCompleteness } from "../../completeness.mjs";
import { buildPersonIdentity, normalizePlayerName, stableId } from "../../identity.mjs";
import { buildReturningProductionMetric } from "../../returning-production.mjs";
import {
  PERSONNEL_EVIDENCE_GENERATOR_VERSION,
  PERSONNEL_EVIDENCE_SCHEMA_VERSION,
  RETURNING_PRODUCTION_METRICS,
  validatePersonnelEvidenceDataset,
} from "../../schema.mjs";

export const NFLVERSE_AUDIT_GENERATOR_VERSION = "nflverse-personnel-audit-v0.1";
export const NFLVERSE_SAMPLE_TEAM_ABBRS = Object.freeze(["atl", "chi", "nyj", "sea"]);
export const NFLVERSE_SOURCE_BASE = "https://github.com/nflverse/nflverse-data/releases/download";
export const REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION = "nflverse-reviewed-identity-overrides-v0.1";

export const NFLVERSE_DATASETS = Object.freeze({
  rosters: {
    family: "rosters",
    release: "rosters",
    filename: (season) => `roster_${season}.csv`,
    requiredFields: ["season", "team", "position", "full_name"],
    sourceId: "nflverse-rosters",
    sourceName: "nflverse rosters release",
    pfrDerived: false,
  },
  priorRosters: {
    family: "rosters",
    release: "rosters",
    filename: (season) => `roster_${season}.csv`,
    requiredFields: ["season", "team", "position", "full_name"],
    sourceId: "nflverse-prior-rosters",
    sourceName: "nflverse prior-season rosters release",
    pfrDerived: false,
  },
  playerStats: {
    family: "stats_player_reg",
    release: "stats_player",
    filename: (season) => `stats_player_reg_${season}.csv`,
    requiredFields: ["season", "season_type", "recent_team", "player_id", "player_display_name", "position"],
    sourceId: "nflverse-player-stats-season",
    sourceName: "nflverse stats_player regular-season release",
    pfrDerived: false,
  },
  snapCounts: {
    family: "snap_counts",
    release: "snap_counts",
    filename: (season) => `snap_counts_${season}.csv`,
    requiredFields: ["season", "game_type", "team", "player", "pfr_player_id"],
    sourceId: "nflverse-snap-counts",
    sourceName: "nflverse snap_counts release",
    pfrDerived: true,
  },
});

const SUPPORTED_AUDIT_METRICS = Object.freeze([
  "offensiveSnaps",
  "defensiveSnaps",
  "qbPassAttempts",
  "carries",
  "rushingYards",
  "targets",
  "receptions",
  "receivingYards",
]);

const ALL_RETURNING_METRICS = new Set(RETURNING_PRODUCTION_METRICS);
const SEASON_TYPE_REG_VALUES = new Set(["REG", "reg", "REGULAR", "regular", ""]);
const ACTIVE_ROSTER_STATUSES = new Set(["ACT", "INA", "RES", "DEV", "EXE"]);
const IDENTITY_REASON_CATEGORIES = Object.freeze({
  missingGsisId: "missing_gsis_id",
  pfrOnlySnapIdentity: "pfr_only_snap_identity",
  providerIdConflict: "provider_id_conflict",
  sameNameDistinctPeople: "same_name_distinct_people",
  nameVariant: "name_variant",
  suffixVariant: "suffix_variant",
  punctuationVariant: "punctuation_variant",
  positionChange: "position_change",
  legitimateTeamChange: "legitimate_team_change",
  rosterMissingStats: "roster_missing_stats",
  statsMissingRoster: "stats_missing_roster",
  snapsMissingRoster: "snaps_missing_roster",
  conflictingTeamSameDate: "conflicting_team_same_date",
  conflictingNameForProviderId: "conflicting_name_for_provider_id",
  insufficientEvidence: "insufficient_evidence",
  other: "other",
});

const IDENTITY_RESOLUTION_POLICY = Object.freeze({
  automaticallyResolvable: [
    IDENTITY_REASON_CATEGORIES.punctuationVariant,
    IDENTITY_REASON_CATEGORIES.suffixVariant,
    IDENTITY_REASON_CATEGORIES.legitimateTeamChange,
    IDENTITY_REASON_CATEGORIES.positionChange,
    "unique_pfr_to_gsis_crosswalk",
  ],
  warningIncluded: [
    "unique_name_team_position_fallback",
    "roster_status_mismatch_without_identity_change",
    IDENTITY_REASON_CATEGORIES.rosterMissingStats,
  ],
  mustExclude: [
    IDENTITY_REASON_CATEGORIES.providerIdConflict,
    IDENTITY_REASON_CATEGORIES.conflictingNameForProviderId,
    IDENTITY_REASON_CATEGORIES.sameNameDistinctPeople,
    IDENTITY_REASON_CATEGORIES.conflictingTeamSameDate,
    IDENTITY_REASON_CATEGORIES.insufficientEvidence,
    IDENTITY_REASON_CATEGORIES.pfrOnlySnapIdentity,
  ],
  noFuzzyMatching: true,
});

const IDENTITY_EXPANSION_GATES = Object.freeze({
  maxCriticalProviderConflicts: 0,
  minOffensiveProductionAttribution: 0.98,
  minOffensiveSnapAttribution: 0.98,
  minDefensiveSnapAttribution: 0.98,
  requireExcludedProductionQuantified: true,
  requireDeterministicReplay: true,
});

const REVIEWED_OVERRIDE_STATUSES = new Set(["approved", "rejected", "pending", "superseded"]);
const ACTIVE_REVIEWED_OVERRIDE_STATUSES = new Set(["approved", "pending"]);
const APPROVED_OVERRIDE_RESOLUTION_TYPES = new Set([
  "pfr_to_gsis_review",
  "provider_to_gsis_review",
  "name_variant_review",
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requireSeason(value, label) {
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error(`${label} must be an integer season`);
  }
}

function datasetUrl(dataset, season) {
  const meta = NFLVERSE_DATASETS[dataset];
  return `${NFLVERSE_SOURCE_BASE}/${meta.release}/${meta.filename(season)}`;
}

function fileTextFromBuffer(buffer, sourcePath) {
  const bytes = sourcePath.endsWith(".gz") ? gunzipSync(buffer) : buffer;
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

async function readSourceBytes({ path, url }) {
  if (path) return { bytes: readFileSync(path), sourcePath: path, sourceUrl: url ?? null, fetched: false, sourceUpdatedAt: null };
  if (!url) throw new Error("source path or URL is required");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`nflverse fetch failed ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const lastModified = response.headers.get("last-modified");
  const sourceUpdatedAt = lastModified && !Number.isNaN(Date.parse(lastModified))
    ? new Date(lastModified).toISOString().slice(0, 10)
    : null;
  return { bytes, sourcePath: null, sourceUrl: url, fetched: true, sourceUpdatedAt };
}

function validateHeader(rows, requiredFields, dataset) {
  const first = rows[0] ?? {};
  const fields = new Set(Object.keys(first));
  const missing = requiredFields.filter((field) => !fields.has(field));
  if (missing.length > 0) {
    throw new Error(`${dataset} schema drift: missing required fields ${missing.join(", ")}`);
  }
  return [...fields].sort();
}

export async function loadNflverseDataset({
  dataset,
  season,
  sourcePath = null,
  sourceUrl = null,
  cacheDir = null,
  retrievedAt,
}) {
  requireSeason(season, "season");
  const meta = NFLVERSE_DATASETS[dataset];
  if (!meta) throw new Error(`unsupported nflverse dataset ${dataset}`);
  const url = sourceUrl ?? datasetUrl(dataset, season);
  const { bytes, sourcePath: inputPath, fetched, sourceUpdatedAt } = await readSourceBytes({ path: sourcePath, url });
  const checksum = sha256(bytes);
  const filename = sourcePath ? basename(sourcePath) : basename(new URL(url).pathname);
  let cachePath = sourcePath ? resolve(sourcePath) : null;

  if (cacheDir && fetched) {
    mkdirSync(cacheDir, { recursive: true });
    cachePath = join(cacheDir, filename);
    writeFileSync(cachePath, bytes);
  }

  const rows = parseCsv(fileTextFromBuffer(bytes, filename));
  const headerColumns = validateHeader(rows, meta.requiredFields, dataset);
  return {
    dataset,
    family: meta.family,
    release: meta.release,
    filename,
    sourceUrl: url,
    cachePath,
    inputPath,
    retrievedAt,
    sourceUpdatedAt,
    byteSize: bytes.length,
    sha256: checksum,
    rowCount: rows.length,
    headerColumns,
    pfrDerived: meta.pfrDerived,
    rows,
  };
}

export function writeNflverseManifest({ manifestPath, season, retrievedAt, datasets }) {
  const manifest = {
    schemaVersion: "nflverse-personnel-cache-v0.1",
    provider: "nflverse",
    season,
    retrievedAt,
    datasets: datasets.map((dataset) => ({
      dataset: dataset.dataset,
      family: dataset.family,
      release: dataset.release,
      filename: dataset.filename,
      sourceUrl: dataset.sourceUrl,
      cachePath: dataset.cachePath,
      sourceUpdatedAt: dataset.sourceUpdatedAt,
      byteSize: dataset.byteSize,
      sha256: dataset.sha256,
      rowCount: dataset.rowCount,
      headerColumns: dataset.headerColumns,
      pfrDerived: dataset.pfrDerived,
    })).sort((a, b) => a.dataset.localeCompare(b.dataset)),
  };
  mkdirSync(dirname(resolve(manifestPath)), { recursive: true });
  writeFileSync(manifestPath, toNflJsonFileString(manifest));
  return manifest;
}

export function validateNflverseManifest(manifest, { baseDir = "." } = {}) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, errors: [{ code: "invalid_manifest", message: "manifest must be an object" }], warnings };
  }
  if (manifest.schemaVersion !== "nflverse-personnel-cache-v0.1") {
    errors.push({ code: "unsupported_manifest_schema", message: "unsupported nflverse cache manifest schema" });
  }
  if (!Array.isArray(manifest.datasets) || manifest.datasets.length === 0) {
    errors.push({ code: "missing_datasets", message: "manifest.datasets must be a non-empty array" });
  } else {
    for (const entry of manifest.datasets) {
      if (!entry?.dataset || !NFLVERSE_DATASETS[entry.dataset]) {
        errors.push({ code: "unknown_dataset", message: `unknown dataset ${entry?.dataset ?? ""}` });
      }
      if (!entry?.sha256) errors.push({ code: "missing_checksum", message: `${entry?.dataset ?? "dataset"} missing sha256` });
      const candidatePath = entry?.cachePath ? resolve(baseDir, entry.cachePath) : null;
      if (candidatePath && existsSync(candidatePath)) {
        const actual = sha256(readFileSync(candidatePath));
        if (actual !== entry.sha256) {
          errors.push({ code: "checksum_mismatch", message: `${entry.dataset} checksum mismatch` });
        }
      } else if (candidatePath) {
        warnings.push({ code: "cache_file_missing", message: `${entry.dataset} cache file not found at ${entry.cachePath}` });
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isValidDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function isPlaceholderValue(value) {
  return /^(tbd|todo|unknown|placeholder|n\/a)$/i.test(String(value ?? "").trim());
}

function reviewedOverrideScopeKey(record) {
  return [
    record.provider,
    record.providerIdType ?? "providerPersonId",
    record.providerPersonId,
    record.sourceSeason ?? "all-seasons",
    (record.teamScope ?? []).join("|") || "all-teams",
  ].join(":");
}

function knownSourceIdsFromManifests(sourceManifests) {
  return new Set(
    (sourceManifests ?? [])
      .map((source) => source.sourceId ?? NFLVERSE_DATASETS[source.dataset]?.sourceId)
      .filter(Boolean),
  );
}

export function validateReviewedIdentityOverrides(overridesFile, {
  targetSeason = null,
  priorSeason = null,
  sourceManifests = [],
  knownRowIds = null,
} = {}) {
  const errors = [];
  const warnings = [];
  const knownSourceIds = knownSourceIdsFromManifests(sourceManifests);
  if (!isPlainObject(overridesFile)) {
    return { valid: false, errors: [{ code: "invalid_overrides_file", message: "reviewed identity overrides file must be an object" }], warnings };
  }
  if (overridesFile.schemaVersion !== REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION) {
    errors.push({ code: "unsupported_override_schema", message: "unsupported reviewed identity override schema" });
  }
  if (overridesFile.provider !== "nflverse") {
    errors.push({ code: "unsupported_override_provider", message: "reviewed identity overrides currently support provider nflverse only" });
  }
  if (!Array.isArray(overridesFile.overrides)) {
    errors.push({ code: "missing_overrides", message: "overrides must be an array" });
    return { valid: errors.length === 0, errors, warnings };
  }

  const activeByScope = new Map();
  const providerToCanonical = new Map();
  const canonicalToGsis = new Map();
  for (const [index, record] of overridesFile.overrides.entries()) {
    const label = record?.overrideId ?? `override[${index}]`;
    if (!isPlainObject(record)) {
      errors.push({ code: "invalid_override_record", message: `${label} must be an object` });
      continue;
    }
    if (record.schemaVersion !== REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION) {
      errors.push({ code: "unsupported_override_record_schema", message: `${label} has unsupported schemaVersion` });
    }
    if (!record.overrideId || isPlaceholderValue(record.overrideId)) errors.push({ code: "missing_override_id", message: `${label} missing overrideId` });
    if (record.provider !== "nflverse") errors.push({ code: "unsupported_override_record_provider", message: `${label} provider must be nflverse` });
    if (!record.providerPersonId || isPlaceholderValue(record.providerPersonId)) errors.push({ code: "missing_provider_person_id", message: `${label} missing providerPersonId` });
    if (!record.providerIdType || isPlaceholderValue(record.providerIdType)) errors.push({ code: "missing_provider_id_type", message: `${label} missing providerIdType` });
    if (!Number.isInteger(record.sourceSeason) || record.sourceSeason < 2000 || record.sourceSeason > 2100) {
      errors.push({ code: "invalid_source_season", message: `${label} sourceSeason must be an integer season` });
    }
    if (!record.canonicalPersonId || isPlaceholderValue(record.canonicalPersonId)) errors.push({ code: "missing_canonical_person_id", message: `${label} missing canonicalPersonId` });
    if (!record.canonicalName || isPlaceholderValue(record.canonicalName)) errors.push({ code: "missing_canonical_name", message: `${label} missing canonicalName` });
    if (!Array.isArray(record.sourceNameVariants) || record.sourceNameVariants.length === 0) {
      errors.push({ code: "missing_source_name_variants", message: `${label} must include sourceNameVariants` });
    }
    if (!Array.isArray(record.teamScope)) errors.push({ code: "invalid_team_scope", message: `${label} teamScope must be an array` });
    if (!Array.isArray(record.positionContext)) errors.push({ code: "invalid_position_context", message: `${label} positionContext must be an array` });
    if (!record.resolutionType || isPlaceholderValue(record.resolutionType)) {
      errors.push({ code: "missing_resolution_type", message: `${label} missing resolutionType` });
    }
    if (!REVIEWED_OVERRIDE_STATUSES.has(record.status)) {
      errors.push({ code: "invalid_override_status", message: `${label} has invalid status` });
    }
    if (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.length === 0) {
      errors.push({ code: "missing_evidence_refs", message: `${label} must include evidenceRefs` });
    } else {
      for (const ref of record.evidenceRefs) {
        if (!ref?.sourceId && !ref?.rowId) {
          errors.push({ code: "invalid_evidence_ref", message: `${label} evidenceRefs must include sourceId or rowId` });
        }
        if (knownSourceIds.size > 0 && ref?.sourceId && !knownSourceIds.has(ref.sourceId)) {
          errors.push({ code: "unknown_evidence_source", message: `${label} references unknown sourceId ${ref.sourceId}` });
        }
        if (knownRowIds && ref?.rowId && !knownRowIds.has(ref.rowId)) {
          errors.push({ code: "unknown_evidence_row", message: `${label} references unknown source row ${ref.rowId}` });
        }
        if (ref?.sourceUrl && (/example\.com/i.test(ref.sourceUrl) || isPlaceholderValue(ref.sourceUrl))) {
          errors.push({ code: "placeholder_evidence_url", message: `${label} contains placeholder evidence URL` });
        }
      }
    }
    if (record.status === "approved") {
      if (!record.reviewedBy || isPlaceholderValue(record.reviewedBy)) errors.push({ code: "missing_reviewer", message: `${label} approved override missing reviewedBy` });
      if (!isValidDateOnly(record.reviewedAt) || isPlaceholderValue(record.reviewedAt)) errors.push({ code: "missing_review_date", message: `${label} approved override missing valid reviewedAt` });
      if (!APPROVED_OVERRIDE_RESOLUTION_TYPES.has(record.resolutionType)) {
        errors.push({ code: "unsupported_approved_resolution_type", message: `${label} approved override has unsupported resolutionType` });
      }
      const notes = String(record.reviewNotes ?? "");
      if (/fuzzy/i.test(notes) && !/no fuzzy/i.test(notes)) {
        errors.push({ code: "fuzzy_only_override", message: `${label} approved override cannot be based only on fuzzy name similarity` });
      }
    }
    if (record.status !== "approved" && (record.reviewedBy || record.reviewedAt)) {
      warnings.push({ code: "review_metadata_ignored", message: `${label} has review metadata but status is ${record.status}` });
    }
    if (record.expiresAfterSeason != null && (!Number.isInteger(record.expiresAfterSeason) || record.expiresAfterSeason < record.sourceSeason)) {
      errors.push({ code: "invalid_expiration", message: `${label} expiresAfterSeason must be at or after sourceSeason` });
    }
    if (record.status === "approved" && targetSeason && record.expiresAfterSeason != null && record.expiresAfterSeason < targetSeason) {
      errors.push({ code: "expired_override", message: `${label} approved override expired before target season` });
    }
    if (priorSeason && record.sourceSeason !== priorSeason) {
      warnings.push({ code: "season_scope_mismatch", message: `${label} sourceSeason does not match priorSeason ${priorSeason}` });
    }

    const active = ACTIVE_REVIEWED_OVERRIDE_STATUSES.has(record.status);
    if (active) {
      const scopeKey = reviewedOverrideScopeKey(record);
      if (activeByScope.has(scopeKey)) {
        errors.push({ code: "duplicate_active_override", message: `${label} duplicates active override ${activeByScope.get(scopeKey)}` });
      }
      activeByScope.set(scopeKey, record.overrideId);
      const providerKeyValue = `${record.provider}:${record.providerIdType}:${record.providerPersonId}`;
      const canonicalSet = providerToCanonical.get(providerKeyValue) ?? new Set();
      canonicalSet.add(record.canonicalPersonId);
      providerToCanonical.set(providerKeyValue, canonicalSet);
      if (record.gsisId) {
        const gsisSet = canonicalToGsis.get(record.canonicalPersonId) ?? new Set();
        gsisSet.add(record.gsisId);
        canonicalToGsis.set(record.canonicalPersonId, gsisSet);
      }
    }
  }
  for (const [providerKeyValue, canonicalSet] of providerToCanonical) {
    if (canonicalSet.size > 1) {
      errors.push({ code: "conflicting_provider_override", message: `${providerKeyValue} maps to multiple canonical people` });
    }
  }
  for (const [canonicalPersonId, gsisSet] of canonicalToGsis) {
    if (gsisSet.size > 1) {
      errors.push({ code: "conflicting_canonical_identity", message: `${canonicalPersonId} maps to multiple GSIS IDs` });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function loadReviewedIdentityOverridesFile(filePath, options = {}) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const validation = validateReviewedIdentityOverrides(parsed, options);
  if (!validation.valid) {
    const detail = validation.errors.map((error) => `${error.code}: ${error.message}`).join("; ");
    throw new Error(`reviewed identity overrides invalid: ${detail}`);
  }
  return { overridesFile: parsed, validation };
}

function canonicalMaps(teamsJson) {
  const teams = Array.isArray(teamsJson?.teams) ? teamsJson.teams : [];
  return {
    byId: new Map(teams.map((team) => [team.id, team])),
    byAbbr: new Map(teams.map((team) => [team.abbr, team])),
    byNflverse: new Map(teams.map((team) => [team.nflverseAbbr, team])),
  };
}

function canonicalTeamForCode(code, maps) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return maps.byNflverse.get(upper) ?? maps.byAbbr.get(String(code).toLowerCase()) ?? null;
}

function field(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== "") return String(row[name]).trim();
  }
  return null;
}

function numberField(row, names) {
  const raw = field(row, names);
  if (raw == null || raw === "NA") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`invalid numeric nflverse field ${names[0]}=${raw}`);
  return value;
}

function providerIdsFromRow(row) {
  return {
    gsisId: field(row, ["gsis_id", "player_id"]),
    espnId: field(row, ["espn_id"]),
    pfrId: field(row, ["pfr_id", "pfr_player_id"]),
    sportradarId: field(row, ["sportradar_id"]),
    yahooId: field(row, ["yahoo_id"]),
    rotowireId: field(row, ["rotowire_id"]),
    pffId: field(row, ["pff_id"]),
    fantasyDataId: field(row, ["fantasy_data_id"]),
    sleeperId: field(row, ["sleeper_id"]),
    esbId: field(row, ["esb_id"]),
  };
}

function primaryProviderId(providerIds) {
  return providerIds.gsisId ?? providerIds.pfrId ?? providerIds.espnId ?? providerIds.sportradarId ?? null;
}

function providerPriorityName(providerIds) {
  if (providerIds.gsisId) return "gsis";
  if (providerIds.pfrId || providerIds.espnId || providerIds.sportradarId) return "provider_id";
  return "name_position_team";
}

function identityKeyFor({ providerIds, name, position, teamId }) {
  const providerId = primaryProviderId(providerIds);
  return buildPersonIdentity({ providerId, name, position, teamId }).identityKey;
}

export function normalizeNflverseRosterRows(rows, { teamsJson, allowedTeamAbbrs, season, sourceId }) {
  const maps = canonicalMaps(teamsJson);
  const allowed = new Set(allowedTeamAbbrs);
  return rows
    .filter((row) => Number(row.season) === season)
    .map((row, index) => {
      const team = canonicalTeamForCode(row.team, maps);
      if (!team) return null;
      if (!allowed.has(team.abbr)) return null;
      const name = field(row, ["full_name", "player_name", "player_display_name", "football_name"]);
      const position = field(row, ["position", "depth_chart_position"]);
      if (!name || !position) throw new Error(`rosters schema drift at row ${index + 1}: missing player name or position`);
      const providerIds = providerIdsFromRow(row);
      return {
        rowId: `roster:${season}:${team.abbr}:${primaryProviderId(providerIds) ?? normalizePlayerName(name)}:${index + 1}`,
        season,
        teamId: team.id,
        teamAbbr: team.abbr,
        name,
        normalizedName: normalizePlayerName(name),
        position,
        rosterStatus: field(row, ["status", "status_description_abbr"]),
        depthChartPosition: field(row, ["depth_chart_position"]),
        yearsExp: field(row, ["years_exp"]),
        providerIds,
        providerId: primaryProviderId(providerIds),
        identityMatchMethod: providerPriorityName(providerIds),
        identityKey: identityKeyFor({ providerIds, name, position, teamId: team.id }),
        sourceId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.teamAbbr.localeCompare(b.teamAbbr) || a.identityKey.localeCompare(b.identityKey));
}

export function normalizeNflversePlayerStatRows(rows, { teamsJson, allowedTeamAbbrs, season, sourceId }) {
  const maps = canonicalMaps(teamsJson);
  const allowed = new Set(allowedTeamAbbrs);
  return rows
    .filter((row) => Number(row.season) === season)
    .filter((row) => SEASON_TYPE_REG_VALUES.has(field(row, ["season_type", "game_type"]) ?? ""))
    .map((row, index) => {
      const team = canonicalTeamForCode(field(row, ["recent_team", "team"]), maps);
      if (!team) return null;
      if (!allowed.has(team.abbr)) return null;
      const name = field(row, ["player_display_name", "player_name", "player"]);
      const position = field(row, ["position", "player_position"]);
      if (!name) throw new Error(`player_stats schema drift at row ${index + 1}: missing player name`);
      const providerIds = { gsisId: field(row, ["player_id", "gsis_id"]) };
      return {
        rowId: `player_stats:${season}:${team.abbr}:${primaryProviderId(providerIds) ?? normalizePlayerName(name)}:${index + 1}`,
        season,
        teamId: team.id,
        teamAbbr: team.abbr,
        name,
        normalizedName: normalizePlayerName(name),
        position,
        providerIds,
        providerId: primaryProviderId(providerIds),
        identityMatchMethod: providerPriorityName(providerIds),
        identityKey: identityKeyFor({ providerIds, name, position, teamId: team.id }),
        passingAttempts: numberField(row, ["attempts", "passing_attempts"]),
        carries: numberField(row, ["carries", "rushing_attempts"]),
        rushingYards: numberField(row, ["rushing_yards"]),
        targets: numberField(row, ["targets"]),
        receptions: numberField(row, ["receptions"]),
        receivingYards: numberField(row, ["receiving_yards"]),
        sacks: numberField(row, ["sacks", "def_sacks"]),
        sourceId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.teamAbbr.localeCompare(b.teamAbbr) || a.identityKey.localeCompare(b.identityKey));
}

export function normalizeNflverseSnapRows(rows, { teamsJson, allowedTeamAbbrs, season, sourceId }) {
  const maps = canonicalMaps(teamsJson);
  const allowed = new Set(allowedTeamAbbrs);
  return rows
    .filter((row) => Number(row.season) === season)
    .filter((row) => (field(row, ["game_type"]) ?? "REG") === "REG")
    .map((row, index) => {
      const team = canonicalTeamForCode(row.team, maps);
      if (!team) return null;
      if (!allowed.has(team.abbr)) return null;
      const name = field(row, ["player"]);
      const position = field(row, ["position"]);
      if (!name || !position) throw new Error(`snap_counts schema drift at row ${index + 1}: missing player name or position`);
      const providerIds = { pfrId: field(row, ["pfr_player_id"]) };
      return {
        rowId: `snap_counts:${season}:${team.abbr}:${field(row, ["game_id"]) ?? "game"}:${primaryProviderId(providerIds) ?? normalizePlayerName(name)}:${index + 1}`,
        season,
        gameId: field(row, ["game_id"]),
        teamId: team.id,
        teamAbbr: team.abbr,
        name,
        normalizedName: normalizePlayerName(name),
        position,
        providerIds,
        providerId: primaryProviderId(providerIds),
        identityMatchMethod: providerPriorityName(providerIds),
        identityKey: identityKeyFor({ providerIds, name, position, teamId: team.id }),
        offensiveSnaps: numberField(row, ["offense_snaps"]),
        defensiveSnaps: numberField(row, ["defense_snaps"]),
        specialTeamsSnaps: numberField(row, ["st_snaps"]),
        offensePct: numberField(row, ["offense_pct"]),
        defensePct: numberField(row, ["defense_pct"]),
        specialTeamsPct: numberField(row, ["st_pct"]),
        sourceId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.teamAbbr.localeCompare(b.teamAbbr) || String(a.gameId).localeCompare(String(b.gameId)) || a.identityKey.localeCompare(b.identityKey));
}

function sourceRefs(...sourceIds) {
  return [...new Set(sourceIds.filter(Boolean))].map((sourceId) => ({ sourceId }));
}

function emptyMetric(sourceIds, message) {
  return buildReturningProductionMetric({
    numerator: null,
    denominator: null,
    sourceRefs: sourceRefs(...sourceIds),
    warnings: [message],
  });
}

function aggregateByIdentity(rows, metrics) {
  const byKey = new Map();
  for (const row of rows) {
    const existing = byKey.get(row.identityKey) ?? {
      row,
      values: Object.fromEntries(metrics.map((metric) => [metric, 0])),
      rowIds: [],
    };
    for (const metric of metrics) existing.values[metric] += row[metric] ?? 0;
    existing.rowIds.push(row.rowId);
    byKey.set(row.identityKey, existing);
  }
  return byKey;
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }

  find(key) {
    if (!this.parent.has(key)) this.parent.set(key, key);
    const parent = this.parent.get(key);
    if (parent !== key) this.parent.set(key, this.find(parent));
    return this.parent.get(key);
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function providerKey(providerName, value) {
  return value ? `${providerName}:${value}` : null;
}

function providerKeysForRow(row) {
  return Object.entries(row.providerIds ?? {})
    .map(([providerName, value]) => providerKey(providerName, value))
    .filter(Boolean);
}

function fallbackKeyForRow(row) {
  return stableId(["fallback", row.normalizedName, row.position ?? "unknown-position", row.teamId ?? "unknown-team"]);
}

function bestIdentityKey(keys) {
  const orderedKeys = [...keys];
  const priority = ["gsisId", "pfrId", "espnId", "sportradarId", "yahooId", "rotowireId", "pffId", "fantasyDataId", "sleeperId", "esbId"];
  for (const providerName of priority) {
    const match = orderedKeys.filter((key) => key.startsWith(`${providerName}:`)).sort()[0];
    if (match) return match;
  }
  return orderedKeys.sort()[0] ?? "unresolved";
}

function addSetValue(map, key, value) {
  if (value == null || value === "") return;
  if (map instanceof Map) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  } else if (map[key]) {
    map[key].add(value);
  }
}

function sortedSet(set) {
  return [...(set ?? [])].sort();
}

function buildIdentityCrosswalk({ targetRosterRows, priorRosterRows, statRows, snapRows, sourceIds, reviewedOverrides = null, targetSeason }) {
  const unionFind = new UnionFind();
  const sourceRows = [];
  const diagnostics = {
    conflicts: [],
    warnings: [],
    overrideApplications: [],
  };
  const reviewedOverridesByProvider = overrideIndex(reviewedOverrides);

  function addSourceRows(rows, sourceKind, seasonRole, teamRole, metricFields = []) {
    for (const row of rows) {
      const keys = providerKeysForRow(row);
      const fallback = fallbackKeyForRow(row);
      const allKeys = keys.length > 0 ? keys : [fallback];
      allKeys.forEach((key) => unionFind.find(key));
      allKeys.slice(1).forEach((key) => unionFind.union(allKeys[0], key));
      sourceRows.push({ row, keys: allKeys, fallback, sourceKind, seasonRole, teamRole, metricFields });
    }
  }

  addSourceRows(targetRosterRows, "target_roster", "target", "targetSeasonTeams");
  addSourceRows(priorRosterRows, "prior_roster", "prior", "priorSeasonTeams");
  addSourceRows(statRows, "player_stats", "prior", "priorProductionTeams", [
    "passingAttempts",
    "carries",
    "rushingYards",
    "targets",
    "receptions",
    "receivingYards",
  ]);
  addSourceRows(snapRows, "snap_counts", "prior", "priorSnapTeams", [
    "offensiveSnaps",
    "defensiveSnaps",
    "specialTeamsSnaps",
  ]);

  const groups = new Map();
  for (const sourceRow of sourceRows) {
    const roots = sourceRow.keys.map((key) => unionFind.find(key)).sort();
    const root = roots[0] ?? sourceRow.fallback;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(sourceRow);
  }

  const crosswalk = [];
  const byProvider = new Map();

  for (const rows of groups.values()) {
    const keys = new Set();
    const providerIds = {};
    const providerIdSets = new Map();
    const names = new Set();
    const normalizedNames = new Set();
    const positions = new Set();
    const sourceRowsOut = [];
    const teamSets = {
      priorSeasonTeams: new Set(),
      targetSeasonTeams: new Set(),
      priorProductionTeams: new Set(),
      priorSnapTeams: new Set(),
    };
    const sourcePresence = {
      targetRoster: false,
      priorRoster: false,
      playerStats: false,
      snapCounts: false,
    };

    for (const entry of rows) {
      entry.keys.forEach((key) => keys.add(key));
      names.add(entry.row.name);
      normalizedNames.add(entry.row.normalizedName);
      if (entry.row.position) positions.add(entry.row.position);
      addSetValue(teamSets, entry.teamRole, entry.row.teamId);
      if (entry.sourceKind === "target_roster") sourcePresence.targetRoster = true;
      if (entry.sourceKind === "prior_roster") sourcePresence.priorRoster = true;
      if (entry.sourceKind === "player_stats") sourcePresence.playerStats = true;
      if (entry.sourceKind === "snap_counts") sourcePresence.snapCounts = true;
      for (const [providerName, value] of Object.entries(entry.row.providerIds ?? {})) {
        if (!value) continue;
        if (!providerIdSets.has(providerName)) providerIdSets.set(providerName, new Set());
        providerIdSets.get(providerName).add(value);
        byProvider.set(`${providerName}:${value}`, [...(byProvider.get(`${providerName}:${value}`) ?? []), entry.row]);
      }
      sourceRowsOut.push({
        sourceKind: entry.sourceKind,
        sourceId: entry.row.sourceId,
        rowId: entry.row.rowId,
        season: entry.row.season,
        gameId: entry.row.gameId ?? null,
        teamId: entry.row.teamId,
        teamAbbr: entry.row.teamAbbr,
        position: entry.row.position,
        playerName: entry.row.name,
        normalizedName: entry.row.normalizedName,
        identityKey: entry.row.identityKey,
        providerIds: Object.fromEntries(Object.entries(entry.row.providerIds ?? {}).filter(([, value]) => value)),
        identityMatchMethod: entry.row.identityMatchMethod,
        metrics: Object.fromEntries(entry.metricFields.map((metric) => [metric, entry.row[metric] ?? 0])),
      });
    }

    for (const [providerName, values] of providerIdSets) providerIds[providerName] = sortedSet(values);
    const canonicalKey = bestIdentityKey(keys);
    const gsisCount = providerIds.gsisId?.length ?? 0;
    const warnings = [];
    if (gsisCount > 1) warnings.push("one person group has multiple GSIS IDs");
    if (positions.size > 1) warnings.push("position changed across sources");
    if (sourcePresence.snapCounts && !sourcePresence.targetRoster && !sourcePresence.priorRoster && !sourcePresence.playerStats) {
      warnings.push("unresolved PFR-only snap identity");
    }
    if (sourcePresence.playerStats && !sourcePresence.targetRoster) warnings.push("stats player missing from target roster");
    if (sourcePresence.snapCounts && !sourcePresence.targetRoster) warnings.push("snap player missing from target roster");
    if (sourcePresence.targetRoster && !sourcePresence.playerStats) warnings.push("target roster player missing from prior player stats");
    const priorTeams = new Set([...teamSets.priorSeasonTeams, ...teamSets.priorProductionTeams, ...teamSets.priorSnapTeams]);
    const targetTeams = teamSets.targetSeasonTeams;
    const legitimateTeamChange = priorTeams.size > 0 && targetTeams.size > 0 && [...priorTeams].some((teamId) => !targetTeams.has(teamId));
    if (legitimateTeamChange) warnings.push("team changed across prior and target sources");

    const status = gsisCount > 1
      ? "conflicted"
      : canonicalKey.startsWith("gsisId:")
        ? "resolved_gsis"
        : canonicalKey.includes("Id:")
          ? "resolved_provider_id"
          : "name_position_team";
    crosswalk.push({
      canonicalPersonId: stableId(["nflverse-person", canonicalKey]),
      canonicalIdentityKey: canonicalKey,
      providerIds,
      normalizedNames: sortedSet(normalizedNames),
      sourceNameVariants: sortedSet(names),
      positions: sortedSet(positions),
      priorSeasonTeams: sortedSet(teamSets.priorSeasonTeams),
      priorProductionTeams: sortedSet(teamSets.priorProductionTeams),
      priorSnapTeams: sortedSet(teamSets.priorSnapTeams),
      targetSeasonTeams: sortedSet(teamSets.targetSeasonTeams),
      identityMatchMethod: canonicalKey.startsWith("gsisId:")
        ? "gsis"
        : canonicalKey.includes("Id:")
          ? "provider_id"
          : "name_position_team",
      resolutionStatus: status,
      sourcePresence,
      sourceRows: sourceRowsOut.sort((a, b) => String(a.sourceKind).localeCompare(String(b.sourceKind)) || String(a.rowId).localeCompare(String(b.rowId))),
      warnings: [...new Set(warnings)].sort(),
    });
  }

  for (const [key, rows] of byProvider) {
    const names = new Set(rows.map((row) => row.normalizedName));
    const compactNames = new Set(rows.map((row) => compactNameForVariant(row.name)));
    if (names.size > 1 && compactNames.size > 1) {
      const [providerName, providerId] = key.split(":");
      const overrideDecision = matchingOverrideDecision({
        providerName,
        providerId,
        rows,
        overridesByProvider: reviewedOverridesByProvider,
        targetSeason,
      });
      diagnostics.overrideApplications.push(overrideDecision);
      if (overrideDecision.applied) {
        diagnostics.warnings.push(`${key} provider-name conflict resolved by reviewed override ${overrideDecision.overrideId}`);
      } else {
        diagnostics.conflicts.push({
          conflictId: stableId(["nflverse-crosswalk-provider-conflict", key]),
          severity: "critical",
          category: "identity",
          message: `${key} maps to conflicting player names`,
          reviewedOverride: overrideDecision.considered ? overrideDecision : null,
        });
      }
    } else if (names.size > 1) {
      diagnostics.warnings.push(`${key} has punctuation or suffix name variants`);
    }
  }
  for (const entry of crosswalk) {
    if ((entry.providerIds.gsisId?.length ?? 0) > 1) {
      diagnostics.conflicts.push({
        conflictId: stableId(["nflverse-crosswalk-multiple-gsis", entry.canonicalPersonId]),
        severity: "critical",
        category: "identity",
        message: `${entry.canonicalPersonId} has multiple GSIS IDs`,
      });
    }
  }
  const byCrosswalkName = new Map();
  for (const entry of crosswalk) {
    for (const normalizedName of entry.normalizedNames) {
      byCrosswalkName.set(normalizedName, [...(byCrosswalkName.get(normalizedName) ?? []), entry]);
    }
  }
  for (const [normalizedName, entries] of byCrosswalkName) {
    const canonicalPeople = new Set(entries.map((entry) => entry.canonicalPersonId));
    const providerIdentities = new Set(
      entries.flatMap((entry) => Object.values(entry.providerIds).flat()).filter(Boolean),
    );
    const nameOnlyCount = entries.filter((entry) => entry.identityMatchMethod === "name_position_team").length;
    if (canonicalPeople.size > 1 && providerIdentities.size > 1) {
      diagnostics.warnings.push(`same normalized name has distinct provider IDs: ${normalizedName}`);
    }
    if (nameOnlyCount > 1) diagnostics.warnings.push(`name-only collision requires provider ID before merge: ${normalizedName}`);
  }

  return {
    entries: crosswalk.sort((a, b) => a.canonicalPersonId.localeCompare(b.canonicalPersonId)),
    warnings: [...new Set(diagnostics.warnings)].sort(),
    conflicts: diagnostics.conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
    overrideApplications: diagnostics.overrideApplications.sort((a, b) =>
      String(a.providerName).localeCompare(String(b.providerName)) ||
      String(a.providerId).localeCompare(String(b.providerId)) ||
      String(a.overrideId ?? "").localeCompare(String(b.overrideId ?? "")),
    ),
  };
}

function rosterIndexes(rosterRows) {
  const byProvider = new Map();
  const byFallback = new Map();
  const activeRows = rosterRows.filter((row) => ACTIVE_ROSTER_STATUSES.has(row.rosterStatus ?? "ACT"));
  for (const row of activeRows) {
    for (const value of Object.values(row.providerIds)) {
      if (value) byProvider.set(stableId(["provider", value]), row);
    }
    byFallback.set(stableId(["name", row.normalizedName, row.position ?? "unknown-position", row.teamId]), row);
  }
  return { activeRows, byProvider, byFallback };
}

function matchToRoster(row, indexes, teamId) {
  for (const value of Object.values(row.providerIds)) {
    if (!value) continue;
    const match = indexes.byProvider.get(stableId(["provider", value]));
    if (match && match.teamId === teamId) return { matched: true, rosterRow: match, method: value === row.providerIds.gsisId ? "gsis" : "provider_id" };
  }
  const fallback = indexes.byFallback.get(stableId(["name", row.normalizedName, row.position ?? "unknown-position", teamId]));
  if (fallback) return { matched: true, rosterRow: fallback, method: "name_position_team" };
  return { matched: false, rosterRow: null, method: "unmatched" };
}

function buildMetric({ rows, metricKey, sourceIds, indexes, teamId }) {
  if (rows.length === 0) {
    return {
      metric: {
        ...emptyMetric(sourceIds, `${metricKey} unavailable: no covered prior-season source rows for team`),
        matchedPlayerCount: 0,
        unmatchedPlayerCount: 0,
        unmatchedProduction: null,
      },
      retained: [],
      unmatched: [],
    };
  }
  const denominator = rows.reduce((sum, row) => sum + (row[metricKey] ?? 0), 0);
  const retained = [];
  const unmatched = [];
  let numerator = 0;
  for (const row of rows) {
    const value = row[metricKey] ?? 0;
    if (value === 0) continue;
    const match = matchToRoster(row, indexes, teamId);
    if (match.matched) {
      numerator += value;
      retained.push({ playerName: row.name, identityKey: row.identityKey, amount: value, matchMethod: match.method });
    } else {
      unmatched.push({ playerName: row.name, identityKey: row.identityKey, amount: value });
    }
  }
  const warnings = [];
  if (unmatched.length > 0) warnings.push(`${unmatched.length} player(s) with ${metricKey} production unmatched to target roster`);
  const matchedPlayerCount = new Set(retained.map((row) => row.identityKey)).size;
  const unmatchedProduction = unmatched.reduce((sum, row) => sum + row.amount, 0);
  return {
    metric: {
      ...buildReturningProductionMetric({
        numerator,
        denominator,
        sourceRefs: sourceRefs(...sourceIds),
        warnings,
      }),
      matchedPlayerCount,
      unmatchedPlayerCount: unmatched.length,
      unmatchedProduction,
    },
    retained,
    unmatched,
  };
}

function unsupportedMetrics(sourceIds) {
  return Object.fromEntries(
    [...ALL_RETURNING_METRICS]
      .filter((metric) => !SUPPORTED_AUDIT_METRICS.includes(metric))
      .map((metric) => [
        metric,
        emptyMetric(sourceIds, `${metric} unavailable in Phase 5C-2B nflverse audit source selection`),
      ]),
  );
}

function identityDiagnostics(rosterRows) {
  const conflicts = [];
  const warnings = [];
  const byProvider = new Map();
  const byName = new Map();

  for (const row of rosterRows) {
    for (const [providerName, value] of Object.entries(row.providerIds)) {
      if (!value) continue;
      const key = `${providerName}:${value}`;
      byProvider.set(key, [...(byProvider.get(key) ?? []), row]);
    }
    if (!row.providerId) byName.set(row.normalizedName, [...(byName.get(row.normalizedName) ?? []), row]);
  }

  for (const [key, rows] of byProvider) {
    const names = new Set(rows.map((row) => row.normalizedName));
    const teams = new Set(rows.map((row) => row.teamId));
    if (names.size > 1) {
      conflicts.push({
        conflictId: stableId(["nflverse-identity-conflict", key, "person"]),
        severity: "critical",
        category: "identity",
        message: `${key} maps to conflicting player names`,
      });
    }
    if (teams.size > 1) {
      conflicts.push({
        conflictId: stableId(["nflverse-identity-conflict", key, "team"]),
        severity: "critical",
        category: "identity",
        message: `${key} maps to multiple teams at target roster cutoff`,
      });
    }
  }

  for (const [name, rows] of byName) {
    if (rows.length > 1) warnings.push(`name-only collision requires provider ID before merge: ${name}`);
  }

  return { conflicts, warnings };
}

function buildTeamRecord({ team, rosterRows, statRows, snapRows, sourceIds, identityCoverage = null }) {
  const indexes = rosterIndexes(rosterRows);
  const teamStatRows = statRows.filter((row) => row.teamId === team.id);
  const teamSnapRows = snapRows.filter((row) => row.teamId === team.id);
  const statByIdentity = aggregateByIdentity(teamStatRows, [
    "passingAttempts",
    "carries",
    "rushingYards",
    "targets",
    "receptions",
    "receivingYards",
  ]);
  const statAggregates = [...statByIdentity.values()].map((entry) => ({
    ...entry.row,
    ...entry.values,
    rowIds: entry.rowIds,
  }));
  const snapByIdentity = aggregateByIdentity(teamSnapRows, ["offensiveSnaps", "defensiveSnaps", "specialTeamsSnaps"]);
  const snapAggregates = [...snapByIdentity.values()].map((entry) => ({
    ...entry.row,
    ...entry.values,
    rowIds: entry.rowIds,
  }));

  const metricInputs = {
    offensiveSnaps: { rows: snapAggregates, metricKey: "offensiveSnaps", sourceIds: [sourceIds.snapCounts] },
    defensiveSnaps: { rows: snapAggregates, metricKey: "defensiveSnaps", sourceIds: [sourceIds.snapCounts] },
    qbPassAttempts: { rows: statAggregates.filter((row) => row.position === "QB" || row.passingAttempts > 0), metricKey: "passingAttempts", sourceIds: [sourceIds.playerStats] },
    carries: { rows: statAggregates, metricKey: "carries", sourceIds: [sourceIds.playerStats] },
    rushingYards: { rows: statAggregates, metricKey: "rushingYards", sourceIds: [sourceIds.playerStats] },
    targets: { rows: statAggregates, metricKey: "targets", sourceIds: [sourceIds.playerStats] },
    receptions: { rows: statAggregates, metricKey: "receptions", sourceIds: [sourceIds.playerStats] },
    receivingYards: { rows: statAggregates, metricKey: "receivingYards", sourceIds: [sourceIds.playerStats] },
  };
  const calculated = Object.fromEntries(
    Object.entries(metricInputs).map(([metricName, input]) => [
      metricName,
      buildMetric({ ...input, indexes, teamId: team.id }),
    ]),
  );

  const metrics = {
    ...Object.fromEntries(Object.entries(calculated).map(([key, value]) => [key, value.metric])),
    ...unsupportedMetrics([sourceIds.rosters, sourceIds.playerStats, sourceIds.snapCounts]),
  };

  const unmatched = Object.fromEntries(
    Object.entries(calculated).map(([key, value]) => [key, value.unmatched]),
  );
  const retained = Object.fromEntries(
    Object.entries(calculated).map(([key, value]) => [key, value.retained]),
  );
  const warnings = [
    "Starts unavailable from approved Phase 5C-2A nflverse fields; not inferred.",
    "Sacks, pressures, offensive-line snaps, and defensive-back snaps remain unavailable or advisory in this slice.",
    ...Object.entries(unmatched).filter(([, rows]) => rows.length > 0).map(([key, rows]) => `${rows.length} unmatched ${key} production row(s)`),
  ];

  return {
    teamId: team.id,
    abbr: team.abbr,
    slug: team.slug,
    name: team.fullName ?? team.name,
    quarterbackContinuity: {
      status: "unknown",
      player: null,
      effectiveDate: null,
      sourceRefs: sourceRefs(sourceIds.rosters),
      evidenceStatus: "unverified",
      notes: "QB continuity is not inferred from this returning-production audit.",
    },
    coachingContinuity: {
      headCoach: unknownCoach(sourceIds.rosters),
      offensiveCoordinator: unknownCoach(sourceIds.rosters),
      defensiveCoordinator: unknownCoach(sourceIds.rosters),
    },
    returningProduction: {
      metrics,
      advisory: {
        specialTeamsSnaps: calculated.offensiveSnaps
          ? buildMetric({ rows: snapAggregates, metricKey: "specialTeamsSnaps", sourceIds: [sourceIds.snapCounts], indexes, teamId: team.id }).metric
          : emptyMetric([sourceIds.snapCounts], "special-teams snaps unavailable"),
        retainedPlayers: retained,
        unmatchedPlayers: unmatched,
      },
    },
    transactions: [],
    injuryReturns: [],
    completeness: {
      transactionsThroughCutoff: false,
      rosterEvidenceAvailable: rosterRows.length > 0,
      returningProductionAuditOnly: true,
      identityCoverage,
    },
    warnings: [...new Set(warnings)].sort(),
    conflicts: [],
  };
}

function unknownCoach(sourceId) {
  return {
    status: "unknown",
    coachName: null,
    priorRole: null,
    effectiveDate: null,
    schemeChange: null,
    sourceRefs: sourceRefs(sourceId),
    evidenceStatus: "unverified",
  };
}

function buildPlayerStatSourceDiagnosis({ priorSeason, playerStats }) {
  const seasonsPresent = [...new Set(playerStats.rows.map((row) => Number(row.season)).filter(Number.isFinite))].sort((a, b) => a - b);
  const seasonTypeValues = [...new Set(playerStats.rows.map((row) => field(row, ["season_type", "game_type"]) ?? "").filter(Boolean))].sort();
  const requestedSeasonRows = playerStats.rows.filter((row) => Number(row.season) === priorSeason).length;
  const requestedRegularSeasonRows = playerStats.rows
    .filter((row) => Number(row.season) === priorSeason)
    .filter((row) => SEASON_TYPE_REG_VALUES.has(field(row, ["season_type", "game_type"]) ?? ""))
    .length;
  return {
    status: requestedRegularSeasonRows > 0 ? "resolved" : "requested_season_absent",
    previousInput: {
      release: "player_stats",
      filename: "player_stats_season.csv",
      sourceUrl: `${NFLVERSE_SOURCE_BASE}/player_stats/player_stats_season.csv`,
      issue: "The aggregate player_stats release was stale for this audit and did not include requested 2025 season rows.",
    },
    selectedInput: {
      release: NFLVERSE_DATASETS.playerStats.release,
      filename: NFLVERSE_DATASETS.playerStats.filename(priorSeason),
      sourceUrl: playerStats.sourceUrl,
      sourceUpdatedAt: playerStats.sourceUpdatedAt,
      sourceLineage: "nflreadr load_player_stats(summary_level = 'reg') resolves to stats_player/stats_player_reg_<season>.csv.",
    },
    seasonsPresent,
    seasonTypeValues,
    requestedSeasonRows,
    requestedRegularSeasonRows,
    rowCount: playerStats.rowCount,
    headerColumns: playerStats.headerColumns,
  };
}

function buildIdentityCrosswalkSummary(crosswalk) {
  const entries = crosswalk.entries;
  return {
    personCount: entries.length,
    resolvedGsis: entries.filter((entry) => entry.identityMatchMethod === "gsis").length,
    resolvedProviderId: entries.filter((entry) => entry.identityMatchMethod === "provider_id").length,
    namePositionTeamFallback: entries.filter((entry) => entry.identityMatchMethod === "name_position_team").length,
    unresolvedOrConflicted: entries.filter((entry) => entry.resolutionStatus === "conflicted" || entry.warnings.some((warning) => warning.includes("unresolved"))).length,
    warningCount: crosswalk.warnings.length + entries.reduce((sum, entry) => sum + entry.warnings.length, 0),
    conflictCount: crosswalk.conflicts.length,
  };
}

function buildIdentityCoverageByTeam({ teams, crosswalk }) {
  return Object.fromEntries(
    teams.map((team) => {
      const entries = crosswalk.entries.filter((entry) => {
        const teamIds = [
          ...entry.priorSeasonTeams,
          ...entry.priorProductionTeams,
          ...entry.priorSnapTeams,
          ...entry.targetSeasonTeams,
        ];
        return teamIds.includes(team.id);
      });
      const withTargetRoster = entries.filter((entry) => entry.targetSeasonTeams.includes(team.id)).length;
      const priorProductionEntries = entries.filter((entry) => entry.priorProductionTeams.includes(team.id)).length;
      const unresolved = entries.filter((entry) => entry.resolutionStatus === "conflicted" || entry.warnings.some((warning) => warning.includes("unresolved"))).length;
      const changedTeams = entries.filter((entry) => entry.warnings.includes("team changed across prior and target sources")).length;
      return [
        team.id,
        {
          personCount: entries.length,
          targetRosterPlayers: withTargetRoster,
          priorProductionPlayers: priorProductionEntries,
          unresolvedOrConflicted: unresolved,
          legitimateTeamChanges: changedTeams,
        },
      ];
    }),
  );
}

function buildUnmatchedProductionSummary(teams) {
  return Object.fromEntries(
    teams.map((team) => [
      team.teamId,
      Object.fromEntries(
        Object.entries(team.returningProduction.advisory.unmatchedPlayers).map(([metric, rows]) => [
          metric,
          {
            playerCount: rows.length,
            amount: rows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
          },
        ]),
      ),
    ]),
  );
}

function compactNameForVariant(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function rawNameHasSuffix(value) {
  return /\b(jr|sr|ii|iii|iv|v)\b\.?$/i.test(String(value ?? "").trim());
}

function providerConflictKeys(conflicts) {
  return new Set(
    conflicts
      .map((conflict) => conflict.message.match(/^([A-Za-z0-9]+):([^ ]+) maps to conflicting player names$/))
      .filter(Boolean)
      .map((match) => `${match[1]}:${match[2]}`),
  );
}

function providerKeysForEntry(entry) {
  return Object.entries(entry.providerIds ?? {})
    .flatMap(([providerName, values]) => (values ?? []).map((value) => `${providerName}:${value}`));
}

function overrideIndex(overridesFile, { includePending = false } = {}) {
  const index = new Map();
  for (const record of overridesFile?.overrides ?? []) {
    if (record.status !== "approved" && !(includePending && record.status === "pending")) continue;
    const providerName = record.providerIdType;
    if (!providerName || !record.providerPersonId) continue;
    const key = `${providerName}:${record.providerPersonId}`;
    index.set(key, [...(index.get(key) ?? []), record]);
  }
  for (const [key, records] of index) {
    index.set(key, records.sort((a, b) => a.overrideId.localeCompare(b.overrideId)));
  }
  return index;
}

function matchingOverrideDecision({ providerName, providerId, rows, overridesByProvider, targetSeason }) {
  const key = `${providerName}:${providerId}`;
  const records = overridesByProvider.get(key) ?? [];
  if (records.length === 0) {
    return {
      considered: false,
      applied: false,
      reason: "no reviewed override for provider ID",
      providerName,
      providerId,
      overrideId: null,
      evidenceRefs: [],
      resultingIdentity: null,
    };
  }
  const decisions = records.map((record) => {
    const rowIds = new Set(rows.map((row) => row.rowId));
    const sourceIds = new Set(rows.map((row) => row.sourceId));
    const seasons = new Set(rows.map((row) => row.season));
    const teamIds = new Set(rows.map((row) => row.teamId));
    const gsisIds = new Set(rows.map((row) => row.providerIds?.gsisId).filter(Boolean));
    const evidenceRefs = record.evidenceRefs ?? [];
    const evidenceKnown = evidenceRefs.every((ref) => !ref.rowId || rowIds.has(ref.rowId)) &&
      evidenceRefs.every((ref) => !ref.sourceId || sourceIds.has(ref.sourceId));
    const seasonMatches = !record.sourceSeason || seasons.has(record.sourceSeason);
    const teamMatches = !record.teamScope?.length || [...teamIds].every((teamId) => record.teamScope.includes(teamId));
    const expirationOk = record.expiresAfterSeason == null || record.expiresAfterSeason >= targetSeason;
    const gsisConsistent = !record.gsisId || gsisIds.size === 0 || (gsisIds.size === 1 && gsisIds.has(record.gsisId));
    const applied = evidenceKnown && seasonMatches && teamMatches && expirationOk && gsisConsistent;
    const rejectedReasons = [
      evidenceKnown ? null : "evidence references do not match source rows",
      seasonMatches ? null : "season scope does not match source rows",
      teamMatches ? null : "team scope does not match source rows",
      expirationOk ? null : "override expired",
      gsisConsistent ? null : "stable GSIS evidence contradicts override",
    ].filter(Boolean);
    return {
      considered: true,
      applied,
      reason: applied ? "reviewed override evidence matches provider conflict and does not contradict stable GSIS evidence" : rejectedReasons.join("; "),
      providerName,
      providerId,
      overrideId: record.overrideId,
      status: record.status,
      evidenceRefs,
      resultingIdentity: applied
        ? {
            canonicalPersonId: record.canonicalPersonId,
            canonicalName: record.canonicalName,
            gsisId: record.gsisId ?? null,
          }
        : null,
    };
  });
  return decisions.find((decision) => decision.applied) ?? decisions[0];
}

function classifyIdentityEntry(entry, conflictKeys) {
  const categories = new Set();
  const providerKeys = providerKeysForEntry(entry);
  const hasProviderConflict = providerKeys.some((key) => conflictKeys.has(key));
  if (!entry.providerIds.gsisId?.length) categories.add(IDENTITY_REASON_CATEGORIES.missingGsisId);
  if (entry.warnings.includes("unresolved PFR-only snap identity")) categories.add(IDENTITY_REASON_CATEGORIES.pfrOnlySnapIdentity);
  if (hasProviderConflict || entry.resolutionStatus === "conflicted") categories.add(IDENTITY_REASON_CATEGORIES.providerIdConflict);
  if (hasProviderConflict) categories.add(IDENTITY_REASON_CATEGORIES.conflictingNameForProviderId);
  if (entry.warnings.includes("position changed across sources")) categories.add(IDENTITY_REASON_CATEGORIES.positionChange);
  if (entry.warnings.includes("team changed across prior and target sources")) categories.add(IDENTITY_REASON_CATEGORIES.legitimateTeamChange);
  if (entry.warnings.includes("target roster player missing from prior player stats")) categories.add(IDENTITY_REASON_CATEGORIES.rosterMissingStats);
  if (entry.warnings.includes("stats player missing from target roster")) categories.add(IDENTITY_REASON_CATEGORIES.statsMissingRoster);
  if (entry.warnings.includes("snap player missing from target roster")) categories.add(IDENTITY_REASON_CATEGORIES.snapsMissingRoster);
  if ((entry.normalizedNames?.length ?? 0) > 1) categories.add(IDENTITY_REASON_CATEGORIES.nameVariant);
  if ((entry.sourceNameVariants ?? []).some(rawNameHasSuffix)) categories.add(IDENTITY_REASON_CATEGORIES.suffixVariant);
  const compactNames = new Set((entry.sourceNameVariants ?? []).map(compactNameForVariant).filter(Boolean));
  if ((entry.normalizedNames?.length ?? 0) > 1 && compactNames.size === 1) {
    categories.add(IDENTITY_REASON_CATEGORIES.punctuationVariant);
  }
  if (entry.identityMatchMethod === "name_position_team" && (entry.sourceRows?.length ?? 0) > 1) {
    categories.add(IDENTITY_REASON_CATEGORIES.sameNameDistinctPeople);
  }
  if (categories.size === 0 && entry.identityMatchMethod === "name_position_team") {
    categories.add(IDENTITY_REASON_CATEGORIES.insufficientEvidence);
  }
  if (categories.size === 0) categories.add(IDENTITY_REASON_CATEGORIES.other);

  const mustExclude = [...categories].some((category) => IDENTITY_RESOLUTION_POLICY.mustExclude.includes(category));
  const hasProviderCritical = [
    IDENTITY_REASON_CATEGORIES.providerIdConflict,
    IDENTITY_REASON_CATEGORIES.conflictingNameForProviderId,
    IDENTITY_REASON_CATEGORIES.sameNameDistinctPeople,
    IDENTITY_REASON_CATEGORIES.conflictingTeamSameDate,
  ].some((category) => categories.has(category));
  const effectiveCategories = new Set(categories);
  if (
    effectiveCategories.has(IDENTITY_REASON_CATEGORIES.nameVariant) &&
    (effectiveCategories.has(IDENTITY_REASON_CATEGORIES.punctuationVariant) ||
      effectiveCategories.has(IDENTITY_REASON_CATEGORIES.suffixVariant))
  ) {
    effectiveCategories.delete(IDENTITY_REASON_CATEGORIES.nameVariant);
  }
  const autoResolved = [...effectiveCategories].every((category) =>
    IDENTITY_RESOLUTION_POLICY.automaticallyResolvable.includes(category) ||
    category === IDENTITY_REASON_CATEGORIES.other,
  );
  const warningIncluded = !mustExclude && !autoResolved;
  return {
    reasonCategories: [...categories].sort(),
    severity: hasProviderCritical || hasProviderConflict ? "critical" : mustExclude || warningIncluded ? "warning" : "info",
    resolutionStatus: mustExclude ? "excluded" : autoResolved ? "automatically_resolved" : "warning_included",
    recommendedReviewAction: mustExclude
      ? "Review source rows before inclusion; no automatic merge is allowed."
      : warningIncluded
        ? "Retain with warning and monitor before all-32 expansion."
        : "No manual action required under current policy.",
  };
}

function sourceRefsForEntry(entry) {
  return sourceRefs(...new Set((entry.sourceRows ?? []).map((row) => row.sourceId)));
}

function buildReviewRecord(entry, conflictKeys) {
  const classification = classifyIdentityEntry(entry, conflictKeys);
  const teamIds = [...new Set([
    ...(entry.priorSeasonTeams ?? []),
    ...(entry.priorProductionTeams ?? []),
    ...(entry.priorSnapTeams ?? []),
    ...(entry.targetSeasonTeams ?? []),
  ])].sort();
  return {
    canonicalPersonId: entry.canonicalPersonId,
    canonicalIdentityKey: entry.canonicalIdentityKey,
    teams: teamIds,
    sourceDatasets: [...new Set((entry.sourceRows ?? []).map((row) => row.sourceKind))].sort(),
    sourceRowIdentities: (entry.sourceRows ?? []).map((row) => row.rowId).sort(),
    normalizedNames: entry.normalizedNames,
    sourceNameVariants: entry.sourceNameVariants,
    positions: entry.positions,
    providerIds: entry.providerIds,
    priorSeasonTeams: entry.priorSeasonTeams,
    priorProductionTeams: entry.priorProductionTeams,
    priorSnapTeams: entry.priorSnapTeams,
    targetSeasonTeams: entry.targetSeasonTeams,
    seasons: [...new Set((entry.sourceRows ?? []).map((row) => row.season).filter(Boolean))].sort(),
    games: [...new Set((entry.sourceRows ?? []).map((row) => row.gameId).filter(Boolean))].sort(),
    identityMatchMethod: entry.identityMatchMethod,
    matchCandidates: (entry.sourceRows ?? []).map((row) => ({
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      rowId: row.rowId,
      playerName: row.playerName,
      normalizedName: row.normalizedName,
      position: row.position,
      teamId: row.teamId,
      teamAbbr: row.teamAbbr,
      providerIds: row.providerIds,
    })),
    reasonCategories: classification.reasonCategories,
    severity: classification.severity,
    resolutionStatus: classification.resolutionStatus,
    supportingSourceRefs: sourceRefsForEntry(entry),
    recommendedReviewAction: classification.recommendedReviewAction,
  };
}

function metricImpactForEntry(entry, teamsById) {
  const impacts = [];
  const metricMap = {
    offensiveSnaps: "offensiveSnaps",
    defensiveSnaps: "defensiveSnaps",
    passingAttempts: "qbPassAttempts",
    carries: "carries",
    rushingYards: "rushingYards",
    targets: "targets",
    receptions: "receptions",
    receivingYards: "receivingYards",
  };
  const retainedIdentityKeysByTeamMetric = new Map();
  for (const team of teamsById.values()) {
    for (const [metric, rows] of Object.entries(team.returningProduction.advisory.retainedPlayers ?? {})) {
      retainedIdentityKeysByTeamMetric.set(`${team.teamId}:${metric}`, new Set(rows.map((row) => row.identityKey)));
    }
  }
  for (const row of entry.sourceRows ?? []) {
    for (const [sourceMetric, amount] of Object.entries(row.metrics ?? {})) {
      if (!amount) continue;
      const metric = metricMap[sourceMetric];
      if (!metric) continue;
      if (metric === "qbPassAttempts" && row.position !== "QB" && amount <= 0) continue;
      const team = teamsById.get(row.teamId);
      if (!team) continue;
      const metricRecord = team.returningProduction.metrics[metric];
      const retainedSet = retainedIdentityKeysByTeamMetric.get(`${team.teamId}:${metric}`) ?? new Set();
      const includedInRetainedNumerator = retainedSet.has(row.identityKey);
      const denominator = metricRecord.denominator ?? 0;
      const numerator = metricRecord.numerator ?? 0;
      const lowerNumerator = includedInRetainedNumerator ? Math.max(0, numerator - amount) : numerator;
      const upperNumerator = includedInRetainedNumerator ? numerator : numerator + amount;
      impacts.push({
        teamId: team.teamId,
        teamAbbr: team.abbr,
        affectedMetric: metric,
        excludedQuantity: includedInRetainedNumerator ? 0 : amount,
        sourceQuantity: amount,
        includedInRetainedNumerator,
        retainedShareCouldChangeMaterially: denominator > 0 && amount / denominator >= 0.01,
        lowerBound: denominator > 0 ? Number((lowerNumerator / denominator).toFixed(6)) : null,
        upperBound: denominator > 0 ? Number((upperNumerator / denominator).toFixed(6)) : null,
        coverageCompleteRecommendation: includedInRetainedNumerator ? "remain_true" : "become_false_until_reviewed",
        sourceRowId: row.rowId,
      });
    }
  }
  return impacts.sort((a, b) =>
    a.teamAbbr.localeCompare(b.teamAbbr) ||
    a.affectedMetric.localeCompare(b.affectedMetric) ||
    a.sourceRowId.localeCompare(b.sourceRowId),
  );
}

function summarizeImpactsByTeam(records) {
  const byTeam = new Map();
  for (const record of records) {
    for (const impact of record.affectedProduction ?? []) {
      const key = impact.teamId;
      const team = byTeam.get(key) ?? {
        teamId: impact.teamId,
        teamAbbr: impact.teamAbbr,
        metrics: {},
      };
      const metric = team.metrics[impact.affectedMetric] ?? {
        excludedQuantity: 0,
        sourceQuantity: 0,
        affectedRows: 0,
        coverageCompleteShouldBecomeFalse: false,
      };
      metric.excludedQuantity += impact.excludedQuantity;
      metric.sourceQuantity += impact.sourceQuantity;
      metric.affectedRows += 1;
      if (impact.coverageCompleteRecommendation === "become_false_until_reviewed") {
        metric.coverageCompleteShouldBecomeFalse = true;
      }
      team.metrics[impact.affectedMetric] = metric;
      byTeam.set(key, team);
    }
  }
  return Object.fromEntries([...byTeam.entries()].sort((a, b) => a[1].teamAbbr.localeCompare(b[1].teamAbbr)));
}

function diagnoseProviderConflict(conflict, crosswalk) {
  const match = conflict.message.match(/^([A-Za-z0-9]+):([^ ]+) maps to conflicting player names$/);
  if (!match) return { ...conflict, deterministicResolutionPossible: false, cause: "unknown" };
  const [, providerName, providerId] = match;
  const sourceRows = crosswalk.entries
    .flatMap((entry) => entry.sourceRows ?? [])
    .filter((row) => row.providerIds?.[providerName] === providerId)
    .sort((a, b) => a.rowId.localeCompare(b.rowId));
  const names = [...new Set(sourceRows.map((row) => row.playerName))].sort();
  const normalizedNames = [...new Set(sourceRows.map((row) => row.normalizedName))].sort();
  const teams = [...new Set(sourceRows.map((row) => row.teamId))].sort();
  const positions = [...new Set(sourceRows.map((row) => row.position).filter(Boolean))].sort();
  const seasons = [...new Set(sourceRows.map((row) => row.season).filter(Boolean))].sort();
  const games = [...new Set(sourceRows.map((row) => row.gameId).filter(Boolean))].sort();
  const correspondingRosterProviderIds = sourceRows
    .filter((row) => row.sourceKind === "target_roster" || row.sourceKind === "prior_roster")
    .map((row) => row.providerIds)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ...conflict,
    providerName,
    providerId,
    names,
    normalizedNames,
    teams,
    positions,
    seasons,
    games,
    sourceRows,
    correspondingRosterProviderIds,
    likelyCause: normalizedNames.length > 1 ? "conflicting_name_for_provider_id_in_approved_inputs" : "adapter_grouping_review_required",
    fixtureIssue: false,
    adapterLogicIssue: false,
    deterministicResolutionPossible: normalizedNames.length === 1,
    resolution: normalizedNames.length === 1
      ? "Can be retained through stable provider evidence."
      : "Unresolved; requires source review before all-32 expansion.",
  };
}

function buildProviderCrosswalkDiagnostics(crosswalk) {
  const rows = crosswalk.entries.flatMap((entry) => entry.sourceRows ?? []);
  const bySourceKind = new Map();
  for (const row of rows) {
    const source = bySourceKind.get(row.sourceKind) ?? {
      rowCount: 0,
      missingGsisId: 0,
      missingPfrId: 0,
    };
    source.rowCount += 1;
    if (!row.providerIds?.gsisId) source.missingGsisId += 1;
    if (!row.providerIds?.pfrId) source.missingPfrId += 1;
    bySourceKind.set(row.sourceKind, source);
  }
  const mappings = crosswalk.entries.map((entry) => ({
    canonicalPersonId: entry.canonicalPersonId,
    gsisIds: entry.providerIds.gsisId ?? [],
    espnIds: entry.providerIds.espnId ?? [],
    sportradarIds: entry.providerIds.sportradarId ?? [],
    pfrIds: entry.providerIds.pfrId ?? [],
    normalizedNames: entry.normalizedNames,
    positions: entry.positions,
    teamHistory: [...new Set([
      ...(entry.priorSeasonTeams ?? []),
      ...(entry.priorProductionTeams ?? []),
      ...(entry.priorSnapTeams ?? []),
      ...(entry.targetSeasonTeams ?? []),
    ])].sort(),
  }));
  return {
    gsisToEspn: mappings.filter((entry) => entry.gsisIds.length && entry.espnIds.length),
    gsisToSportradar: mappings.filter((entry) => entry.gsisIds.length && entry.sportradarIds.length),
    gsisToPfr: mappings.filter((entry) => entry.gsisIds.length && entry.pfrIds.length),
    providerIdToNormalizedName: mappings.map((entry) => ({
      canonicalPersonId: entry.canonicalPersonId,
      providerIds: {
        gsisId: entry.gsisIds,
        espnId: entry.espnIds,
        sportradarId: entry.sportradarIds,
        pfrId: entry.pfrIds,
      },
      normalizedNames: entry.normalizedNames,
    })),
    providerIdToPosition: mappings.map((entry) => ({
      canonicalPersonId: entry.canonicalPersonId,
      providerIds: {
        gsisId: entry.gsisIds,
        pfrId: entry.pfrIds,
      },
      positions: entry.positions,
    })),
    providerIdToTeamHistory: mappings.map((entry) => ({
      canonicalPersonId: entry.canonicalPersonId,
      providerIds: {
        gsisId: entry.gsisIds,
        pfrId: entry.pfrIds,
      },
      teamHistory: entry.teamHistory,
    })),
    missingIdRates: Object.fromEntries([...bySourceKind.entries()].map(([sourceKind, summary]) => [
      sourceKind,
      {
        ...summary,
        missingGsisRate: summary.rowCount > 0 ? Number((summary.missingGsisId / summary.rowCount).toFixed(6)) : null,
        missingPfrRate: summary.rowCount > 0 ? Number((summary.missingPfrId / summary.rowCount).toFixed(6)) : null,
      },
    ]).sort((a, b) => a[0].localeCompare(b[0]))),
    mappingChangesAcrossSeasons: mappings.filter((entry) => entry.teamHistory.length > 1),
  };
}

function metricCoverage(team, metricNames) {
  const totals = metricNames.reduce((summary, metric) => {
    const record = team.returningProduction.metrics[metric];
    if (!record || record.denominator == null) return summary;
    summary.denominator += record.denominator;
    summary.unmatched += record.unmatchedProduction ?? 0;
    return summary;
  }, { denominator: 0, unmatched: 0 });
  return totals.denominator > 0 ? Number(((totals.denominator - totals.unmatched) / totals.denominator).toFixed(6)) : null;
}

function buildIdentityQualitySummary({ teams, reviewRecords, crosswalk }) {
  const criticalByTeam = new Map();
  const excludedByTeam = new Map();
  const warningIncludedByTeam = new Map();
  for (const record of reviewRecords) {
    for (const teamId of record.teams) {
      if (record.severity === "critical") criticalByTeam.set(teamId, (criticalByTeam.get(teamId) ?? 0) + 1);
      if (record.resolutionStatus === "excluded") excludedByTeam.set(teamId, (excludedByTeam.get(teamId) ?? 0) + 1);
      if (record.resolutionStatus === "warning_included") warningIncludedByTeam.set(teamId, (warningIncludedByTeam.get(teamId) ?? 0) + 1);
    }
  }
  return Object.fromEntries(teams.map((team) => {
    const entries = crosswalk.entries.filter((entry) => [
      ...(entry.priorSeasonTeams ?? []),
      ...(entry.priorProductionTeams ?? []),
      ...(entry.priorSnapTeams ?? []),
      ...(entry.targetSeasonTeams ?? []),
    ].includes(team.teamId));
    return [team.teamId, {
      teamId: team.teamId,
      teamAbbr: team.abbr,
      totalSourcePersons: entries.length,
      gsisResolved: entries.filter((entry) => entry.identityMatchMethod === "gsis").length,
      providerCrosswalkResolved: entries.filter((entry) => entry.identityMatchMethod === "provider_id").length,
      deterministicFallbackResolved: entries.filter((entry) => entry.identityMatchMethod === "name_position_team").length,
      warningLevelIncluded: warningIncludedByTeam.get(team.teamId) ?? 0,
      unresolvedExcluded: excludedByTeam.get(team.teamId) ?? 0,
      criticalConflicts: criticalByTeam.get(team.teamId) ?? 0,
      productionCoveragePercentage: metricCoverage(team, ["qbPassAttempts", "carries", "rushingYards", "targets", "receptions", "receivingYards"]),
      offensiveSnapCoveragePercentage: metricCoverage(team, ["offensiveSnaps"]),
      defensiveSnapCoveragePercentage: metricCoverage(team, ["defensiveSnaps"]),
    }];
  }).sort((a, b) => a[1].teamAbbr.localeCompare(b[1].teamAbbr)));
}

function buildExpansionGateEvaluation(identityQualityByTeam, criticalConflictCount) {
  const failures = [];
  if (criticalConflictCount > IDENTITY_EXPANSION_GATES.maxCriticalProviderConflicts) {
    failures.push("critical_provider_conflicts_present");
  }
  for (const summary of Object.values(identityQualityByTeam)) {
    if ((summary.productionCoveragePercentage ?? 0) < IDENTITY_EXPANSION_GATES.minOffensiveProductionAttribution) {
      failures.push(`${summary.teamAbbr}:offensive_production_below_threshold`);
    }
    if ((summary.offensiveSnapCoveragePercentage ?? 0) < IDENTITY_EXPANSION_GATES.minOffensiveSnapAttribution) {
      failures.push(`${summary.teamAbbr}:offensive_snap_below_threshold`);
    }
    if ((summary.defensiveSnapCoveragePercentage ?? 0) < IDENTITY_EXPANSION_GATES.minDefensiveSnapAttribution) {
      failures.push(`${summary.teamAbbr}:defensive_snap_below_threshold`);
    }
  }
  return {
    safeForAll32IdentityExpansion: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    gates: IDENTITY_EXPANSION_GATES,
  };
}

function impactForProviderConflict(conflict, crosswalk, teamsById) {
  if (!conflict.providerName || !conflict.providerId) return [];
  const seen = new Set();
  return crosswalk.entries
    .filter((entry) => (entry.providerIds?.[conflict.providerName] ?? []).includes(conflict.providerId))
    .flatMap((entry) => metricImpactForEntry(entry, teamsById))
    .filter((impact) => {
      const key = `${impact.sourceRowId}:${impact.affectedMetric}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      a.teamAbbr.localeCompare(b.teamAbbr) ||
      a.affectedMetric.localeCompare(b.affectedMetric) ||
      a.sourceRowId.localeCompare(b.sourceRowId),
    );
}

function buildPendingOverrideSimulation({ crosswalk, teams, reviewedOverrides, targetSeason }) {
  const pendingByProvider = overrideIndex(reviewedOverrides, { includePending: true });
  const teamsById = new Map(teams.map((team) => [team.teamId, team]));
  const simulatedDecisions = crosswalk.conflicts
    .map((conflict) => diagnoseProviderConflict(conflict, crosswalk))
    .map((diagnosed) => {
      if (!diagnosed.providerName || !diagnosed.providerId) return null;
      const decision = matchingOverrideDecision({
        providerName: diagnosed.providerName,
        providerId: diagnosed.providerId,
        rows: diagnosed.sourceRows ?? [],
        overridesByProvider: pendingByProvider,
        targetSeason,
      });
      return {
        ...decision,
        simulationOnly: true,
        wouldClearCriticalConflict: Boolean(decision.applied),
        affectedProduction: impactForProviderConflict(diagnosed, crosswalk, teamsById),
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      String(a.providerName).localeCompare(String(b.providerName)) ||
      String(a.providerId).localeCompare(String(b.providerId)) ||
      String(a.overrideId ?? "").localeCompare(String(b.overrideId ?? "")),
    );
  const wouldClear = simulatedDecisions.filter((decision) => decision.wouldClearCriticalConflict).length;
  return {
    enabled: true,
    simulationOnly: true,
    pendingOverrideCount: (reviewedOverrides?.overrides ?? []).filter((record) => record.status === "pending").length,
    criticalConflictCountBefore: crosswalk.conflicts.length,
    criticalConflictCountAfterSimulation: Math.max(0, crosswalk.conflicts.length - wouldClear),
    simulatedDecisions,
    notes: [
      "Pending override simulation is not applied to normal audit results.",
      "Simulation does not change production artifacts or automatic identity policy.",
    ],
  };
}

function buildReviewedOverridesSummary({ reviewedOverrides, validation, crosswalk, teams, targetSeason, simulatePendingOverrides }) {
  const records = reviewedOverrides?.overrides ?? [];
  return {
    schemaVersion: reviewedOverrides?.schemaVersion ?? REVIEWED_IDENTITY_OVERRIDES_SCHEMA_VERSION,
    provided: Boolean(reviewedOverrides),
    validation: validation ?? { valid: true, errors: [], warnings: [] },
    counts: {
      total: records.length,
      approved: records.filter((record) => record.status === "approved").length,
      pending: records.filter((record) => record.status === "pending").length,
      rejected: records.filter((record) => record.status === "rejected").length,
      superseded: records.filter((record) => record.status === "superseded").length,
      applied: crosswalk.overrideApplications.filter((decision) => decision.applied).length,
      rejectedAtApplication: crosswalk.overrideApplications.filter((decision) => decision.considered && !decision.applied).length,
    },
    resolutionPriority: [
      "stable GSIS identity",
      "unambiguous provider crosswalk",
      "approved reviewed override",
      "deterministic fallback with warning",
      "unresolved/excluded",
    ],
    applications: crosswalk.overrideApplications,
    pendingSimulation: simulatePendingOverrides
      ? buildPendingOverrideSimulation({ crosswalk, teams, reviewedOverrides, targetSeason })
      : { enabled: false, simulationOnly: true },
  };
}

function buildIdentityReview({ dataset, crosswalk, teams, reviewedOverridesSummary = null }) {
  const conflictKeys = providerConflictKeys(crosswalk.conflicts);
  const teamsById = new Map(teams.map((team) => [team.teamId, team]));
  const reviewRecords = crosswalk.entries
    .map((entry) => {
      const record = buildReviewRecord(entry, conflictKeys);
      return {
        ...record,
        affectedProduction: metricImpactForEntry(entry, teamsById),
      };
    })
    .filter((record) => record.severity !== "info" || record.reasonCategories.some((category) => category !== IDENTITY_REASON_CATEGORIES.other))
    .sort((a, b) => a.severity.localeCompare(b.severity) || a.canonicalPersonId.localeCompare(b.canonicalPersonId));
  const criticalConflicts = crosswalk.conflicts.map((conflict) => diagnoseProviderConflict(conflict, crosswalk));
  const identityQualityByTeam = buildIdentityQualitySummary({ teams, reviewRecords, crosswalk });
  return {
    schemaVersion: "nflverse-identity-review-v0.1",
    auditOnly: true,
    auditLabel: "Phase 5C-2C nflverse identity review",
    generatedAt: dataset.generatedAt,
    sourceCutoff: dataset.sourceCutoff,
    targetSeason: dataset.targetSeason,
    priorSeason: dataset.priorSeason,
    sampleTeams: teams.map((team) => team.abbr),
    reasonTaxonomy: IDENTITY_REASON_CATEGORIES,
    resolutionPolicy: IDENTITY_RESOLUTION_POLICY,
    unresolvedIdentities: reviewRecords.filter((record) => record.resolutionStatus === "excluded" || record.severity === "critical"),
    warningLevelIdentities: reviewRecords.filter((record) => record.resolutionStatus === "warning_included"),
    automaticallyResolvedIdentities: reviewRecords.filter((record) => record.resolutionStatus === "automatically_resolved"),
    criticalConflicts,
    reviewedIdentityOverrides: reviewedOverridesSummary,
    providerCrosswalkDiagnostics: buildProviderCrosswalkDiagnostics(crosswalk),
    productionImpactByTeam: summarizeImpactsByTeam(reviewRecords),
    identityQualityByTeam,
    all32ExpansionGateEvaluation: buildExpansionGateEvaluation(identityQualityByTeam, criticalConflicts.length),
    sourceLineageCautions: [
      "nflverse snap_counts are PFR-derived; review redistribution terms before production use.",
      "No fuzzy matching is used to override provider-ID conflicts.",
    ],
  };
}

function sourceRecord(dataset, source) {
  const meta = NFLVERSE_DATASETS[dataset];
  return {
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    sourceType: "public_source",
    sourcePath: source.cachePath ?? source.inputPath ?? source.filename,
    cachePath: source.cachePath,
    sourceUpdatedAt: source.sourceUpdatedAt,
    retrievedAt: source.retrievedAt,
    sourceUrl: source.sourceUrl,
    providerVersion: null,
    verified: true,
    redistributionStatus: source.pfrDerived ? "PFR-derived via nflverse; review redistribution terms before public production use." : "Public nflverse release; attribution required.",
    usageNotes: source.pfrDerived ? "Snap counts are PFR-derived according to nflreadr documentation." : "Read-only nflverse public release.",
  };
}

function compareManualEvidence({ team, rosterRows, manualDataset }) {
  const manual = manualDataset?.records?.find((record) => record.teamId === team.id || record.abbr === team.abbr);
  if (!manual) {
    return { corroboratedFacts: [], generatedFactsAbsentFromManual: [], manualFactsNotCoveredByNflverse: ["manual offseason record unavailable"], conflicts: [], unsupportedCategories: [] };
  }
  const rosterNames = new Set(rosterRows.map((row) => row.normalizedName));
  const corroboratedFacts = [];
  const manualFactsNotCoveredByNflverse = [];
  const conflicts = [];
  for (const item of manual.personnel ?? []) {
    if (rosterNames.has(item.normalizedPlayerName)) {
      corroboratedFacts.push(`${item.playerName} appears on nflverse target roster; transaction type ${item.kind} not independently validated`);
    } else {
      manualFactsNotCoveredByNflverse.push(`${item.playerName} ${item.kind} not present in nflverse target roster sample`);
    }
  }
  const manualNames = new Set((manual.personnel ?? []).map((item) => item.normalizedPlayerName));
  const generatedFactsAbsentFromManual = rosterRows
    .filter((row) => !manualNames.has(row.normalizedName))
    .slice(0, 12)
    .map((row) => `${row.name} present on nflverse target roster`);
  return {
    corroboratedFacts: corroboratedFacts.sort(),
    generatedFactsAbsentFromManual: generatedFactsAbsentFromManual.sort(),
    manualFactsNotCoveredByNflverse: [
      ...manualFactsNotCoveredByNflverse,
      "coaching continuity cannot be validated by approved nflverse 5C-2A inputs",
      "transaction method/date cannot be validated by approved nflverse 5C-2A inputs",
    ].sort(),
    conflicts,
    unsupportedCategories: ["coaching", "complete transaction log", "injury returns", "official QB starter status"],
  };
}

export async function buildNflverseFourTeamAudit({
  season,
  priorSeason,
  generatedAt,
  sourceCutoff,
  rosterSourcePath = null,
  priorRosterSourcePath = null,
  playerStatsSourcePath = null,
  snapCountsSourcePath = null,
  rosterSourceUrl = null,
  priorRosterSourceUrl = null,
  playerStatsSourceUrl = null,
  snapCountsSourceUrl = null,
  cacheDir = null,
  teamsJson,
  manualDataset = null,
  reviewedIdentityOverrides = null,
  simulatePendingOverrides = false,
}) {
  requireSeason(season, "season");
  requireSeason(priorSeason, "priorSeason");
  if (priorSeason !== season - 1) throw new Error("priorSeason must equal season - 1");
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error("--generated-at must be a valid ISO timestamp");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceCutoff)) throw new Error("--source-cutoff must be YYYY-MM-DD");

  const cacheRoot = cacheDir ? resolve(cacheDir) : null;
  const loadOptions = { retrievedAt: generatedAt };
  const rosters = await loadNflverseDataset({
    ...loadOptions,
    dataset: "rosters",
    season,
    sourcePath: rosterSourcePath,
    sourceUrl: rosterSourceUrl,
    cacheDir: cacheRoot,
  });
  const priorRosters = await loadNflverseDataset({
    ...loadOptions,
    dataset: "priorRosters",
    season: priorSeason,
    sourcePath: priorRosterSourcePath,
    sourceUrl: priorRosterSourceUrl,
    cacheDir: cacheRoot,
  });
  const playerStats = await loadNflverseDataset({
    ...loadOptions,
    dataset: "playerStats",
    season: priorSeason,
    sourcePath: playerStatsSourcePath,
    sourceUrl: playerStatsSourceUrl,
    cacheDir: cacheRoot,
  });
  const snapCounts = await loadNflverseDataset({
    ...loadOptions,
    dataset: "snapCounts",
    season: priorSeason,
    sourcePath: snapCountsSourcePath,
    sourceUrl: snapCountsSourceUrl,
    cacheDir: cacheRoot,
  });

  const maps = canonicalMaps(teamsJson);
  const sampleTeams = NFLVERSE_SAMPLE_TEAM_ABBRS.map((abbr) => maps.byAbbr.get(abbr));
  if (sampleTeams.some((team) => !team)) throw new Error("teams.json is missing a Phase 5C-2A sample team");
  const rosterRows = normalizeNflverseRosterRows(rosters.rows, {
    teamsJson,
    allowedTeamAbbrs: NFLVERSE_SAMPLE_TEAM_ABBRS,
    season,
    sourceId: NFLVERSE_DATASETS.rosters.sourceId,
  });
  const priorRosterRows = normalizeNflverseRosterRows(priorRosters.rows, {
    teamsJson,
    allowedTeamAbbrs: NFLVERSE_SAMPLE_TEAM_ABBRS,
    season: priorSeason,
    sourceId: NFLVERSE_DATASETS.priorRosters.sourceId,
  });
  const statRows = normalizeNflversePlayerStatRows(playerStats.rows, {
    teamsJson,
    allowedTeamAbbrs: NFLVERSE_SAMPLE_TEAM_ABBRS,
    season: priorSeason,
    sourceId: NFLVERSE_DATASETS.playerStats.sourceId,
  });
  const snapRows = normalizeNflverseSnapRows(snapCounts.rows, {
    teamsJson,
    allowedTeamAbbrs: NFLVERSE_SAMPLE_TEAM_ABBRS,
    season: priorSeason,
    sourceId: NFLVERSE_DATASETS.snapCounts.sourceId,
  });
  const knownRowIds = new Set([...rosterRows, ...priorRosterRows, ...statRows, ...snapRows].map((row) => row.rowId));
  const overrideValidation = reviewedIdentityOverrides
    ? validateReviewedIdentityOverrides(reviewedIdentityOverrides, {
        targetSeason: season,
        priorSeason,
        sourceManifests: [rosters, priorRosters, playerStats, snapCounts],
        knownRowIds,
      })
    : { valid: true, errors: [], warnings: [] };
  if (!overrideValidation.valid) {
    const detail = overrideValidation.errors.map((error) => `${error.code}: ${error.message}`).join("; ");
    throw new Error(`reviewed identity overrides invalid: ${detail}`);
  }

  const diagnostics = identityDiagnostics(rosterRows);
  const sourceIds = {
    rosters: NFLVERSE_DATASETS.rosters.sourceId,
    priorRosters: NFLVERSE_DATASETS.priorRosters.sourceId,
    playerStats: NFLVERSE_DATASETS.playerStats.sourceId,
    snapCounts: NFLVERSE_DATASETS.snapCounts.sourceId,
  };
  const crosswalk = buildIdentityCrosswalk({
    targetRosterRows: rosterRows,
    priorRosterRows,
    statRows,
    snapRows,
    sourceIds,
    reviewedOverrides: reviewedIdentityOverrides,
    targetSeason: season,
  });
  const identityCoverageByTeam = buildIdentityCoverageByTeam({ teams: sampleTeams, crosswalk });
  const teams = sampleTeams.map((team) =>
    buildTeamRecord({
      team,
      rosterRows: rosterRows.filter((row) => row.teamId === team.id),
      statRows,
      snapRows,
      sourceIds,
      identityCoverage: identityCoverageByTeam[team.id],
    }),
  );
  teams.forEach((team) => {
    team.conflicts = [...diagnostics.conflicts, ...crosswalk.conflicts].filter((conflict) => conflict.message.includes(team.teamId));
  });
  const unmatchedProductionSummary = buildUnmatchedProductionSummary(teams);
  const reviewedOverridesSummary = buildReviewedOverridesSummary({
    reviewedOverrides: reviewedIdentityOverrides,
    validation: overrideValidation,
    crosswalk,
    teams,
    targetSeason: season,
    simulatePendingOverrides,
  });

  const dataset = {
    schemaVersion: PERSONNEL_EVIDENCE_SCHEMA_VERSION,
    auditOnly: true,
    auditLabel: "Phase 5C-2B nflverse four-team returning-production audit",
    targetSeason: season,
    priorSeason,
    generatedAt,
    sourceCutoff,
    rosterEffectiveAt: generatedAt,
    rosterState: "offseason",
    generatorVersion: `${PERSONNEL_EVIDENCE_GENERATOR_VERSION}+${NFLVERSE_AUDIT_GENERATOR_VERSION}`,
    sources: [
      sourceRecord("rosters", rosters),
      sourceRecord("priorRosters", priorRosters),
      sourceRecord("playerStats", playerStats),
      sourceRecord("snapCounts", snapCounts),
    ],
    completeness: {},
    playerStatSourceDiagnosis: buildPlayerStatSourceDiagnosis({ priorSeason, playerStats }),
    identityMatchSummary: {
      teamCount: teams.length,
      targetRosterPlayers: rosterRows.length,
      priorRosterPlayers: priorRosterRows.length,
      priorSeasonStatPlayers: statRows.length,
      priorSeasonSnapRows: snapRows.length,
      providerPriority: ["gsis_id", "approved provider ID", "team/name/position fallback"],
      ...buildIdentityCrosswalkSummary(crosswalk),
      warnings: [...new Set([...diagnostics.warnings, ...crosswalk.warnings])].sort(),
      conflicts: [...diagnostics.conflicts, ...crosswalk.conflicts].sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
    },
    identityCoverageByTeam,
    identityCrosswalk: crosswalk.entries,
    reviewedIdentityOverrides: reviewedOverridesSummary,
    unmatchedPlayerSummary: Object.fromEntries(
      teams.map((team) => [
        team.teamId,
        Object.fromEntries(
          Object.entries(team.returningProduction.advisory.unmatchedPlayers).map(([metric, rows]) => [metric, rows.length]),
        ),
      ]),
    ),
    unmatchedProductionSummary,
    manualEvidenceComparison: Object.fromEntries(
      sampleTeams.map((team) => [
        team.id,
        compareManualEvidence({
          team,
          rosterRows: rosterRows.filter((row) => row.teamId === team.id),
          manualDataset,
        }),
      ]),
    ),
    warnings: [
      "Audit-only artifact; not imported by production application code.",
      "nflverse rosters prove roster presence at cutoff, not transaction method/date.",
      "nflverse snap_counts are PFR-derived; review redistribution terms before production use.",
      ...diagnostics.warnings,
      ...crosswalk.warnings,
      ...overrideValidation.warnings.map((warning) => warning.message),
    ].sort(),
    conflicts: [...diagnostics.conflicts, ...crosswalk.conflicts].sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
    teams,
  };
  dataset.completenessEvaluation = evaluatePersonnelCompleteness(dataset, teamsJson, {
    asOfDate: sourceCutoff,
    maxSourceAgeDays: 365,
  });
  dataset.identityReview = buildIdentityReview({ dataset, crosswalk, teams, reviewedOverridesSummary });
  const validation = validatePersonnelEvidenceDataset(dataset, teamsJson, { requireAllTeams: false });
  return {
    dataset,
    validation,
    sourceManifests: [rosters, priorRosters, playerStats, snapCounts],
    json: toNflJsonFileString(dataset),
    identityReview: dataset.identityReview,
    identityReviewJson: toNflJsonFileString(dataset.identityReview),
  };
}

export function assertNonProductionOutput(outputPath, season) {
  const normalized = resolve(outputPath).replace(/\\/g, "/").toLowerCase();
  const forbidden = `/public/data/nfl/${season}/personnel-evidence.json`;
  if (normalized.endsWith(forbidden) || normalized.includes("/public/data/nfl/")) {
    throw new Error("refusing to write production NFL data from nflverse audit");
  }
}
