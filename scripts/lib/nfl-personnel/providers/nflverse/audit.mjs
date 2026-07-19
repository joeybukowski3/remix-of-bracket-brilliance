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
  playerStats: {
    family: "player_stats_season",
    release: "player_stats",
    filename: () => "player_stats_season.csv",
    requiredFields: ["season"],
    sourceId: "nflverse-player-stats-season",
    sourceName: "nflverse player_stats season release",
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
      metric: emptyMetric(sourceIds, `${metricKey} unavailable: no covered prior-season source rows for team`),
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
  return {
    metric: buildReturningProductionMetric({
      numerator,
      denominator,
      sourceRefs: sourceRefs(...sourceIds),
      warnings,
    }),
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
        emptyMetric(sourceIds, `${metric} unavailable in Phase 5C-2A nflverse audit source selection`),
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

function buildTeamRecord({ team, rosterRows, statRows, snapRows, sourceIds }) {
  const indexes = rosterIndexes(rosterRows);
  const teamStatRows = statRows.filter((row) => row.teamId === team.id);
  const teamSnapRows = snapRows.filter((row) => row.teamId === team.id);
  const snapByIdentity = aggregateByIdentity(teamSnapRows, ["offensiveSnaps", "defensiveSnaps", "specialTeamsSnaps"]);
  const snapAggregates = [...snapByIdentity.values()].map((entry) => ({
    ...entry.row,
    ...entry.values,
    rowIds: entry.rowIds,
  }));

  const metricInputs = {
    offensiveSnaps: { rows: snapAggregates, metricKey: "offensiveSnaps", sourceIds: [sourceIds.snapCounts] },
    defensiveSnaps: { rows: snapAggregates, metricKey: "defensiveSnaps", sourceIds: [sourceIds.snapCounts] },
    qbPassAttempts: { rows: teamStatRows.filter((row) => row.position === "QB" || row.passingAttempts > 0), metricKey: "passingAttempts", sourceIds: [sourceIds.playerStats] },
    carries: { rows: teamStatRows, metricKey: "carries", sourceIds: [sourceIds.playerStats] },
    rushingYards: { rows: teamStatRows, metricKey: "rushingYards", sourceIds: [sourceIds.playerStats] },
    targets: { rows: teamStatRows, metricKey: "targets", sourceIds: [sourceIds.playerStats] },
    receptions: { rows: teamStatRows, metricKey: "receptions", sourceIds: [sourceIds.playerStats] },
    receivingYards: { rows: teamStatRows, metricKey: "receivingYards", sourceIds: [sourceIds.playerStats] },
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
  playerStatsSourcePath = null,
  snapCountsSourcePath = null,
  rosterSourceUrl = null,
  playerStatsSourceUrl = null,
  snapCountsSourceUrl = null,
  cacheDir = null,
  teamsJson,
  manualDataset = null,
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

  const diagnostics = identityDiagnostics(rosterRows);
  const sourceIds = {
    rosters: NFLVERSE_DATASETS.rosters.sourceId,
    playerStats: NFLVERSE_DATASETS.playerStats.sourceId,
    snapCounts: NFLVERSE_DATASETS.snapCounts.sourceId,
  };
  const teams = sampleTeams.map((team) =>
    buildTeamRecord({
      team,
      rosterRows: rosterRows.filter((row) => row.teamId === team.id),
      statRows,
      snapRows,
      sourceIds,
    }),
  );
  teams.forEach((team) => {
    team.conflicts = diagnostics.conflicts.filter((conflict) => conflict.message.includes(team.teamId));
  });

  const dataset = {
    schemaVersion: PERSONNEL_EVIDENCE_SCHEMA_VERSION,
    auditOnly: true,
    auditLabel: "Phase 5C-2A nflverse four-team returning-production audit",
    targetSeason: season,
    priorSeason,
    generatedAt,
    sourceCutoff,
    rosterEffectiveAt: generatedAt,
    rosterState: "offseason",
    generatorVersion: `${PERSONNEL_EVIDENCE_GENERATOR_VERSION}+${NFLVERSE_AUDIT_GENERATOR_VERSION}`,
    sources: [
      sourceRecord("rosters", rosters),
      sourceRecord("playerStats", playerStats),
      sourceRecord("snapCounts", snapCounts),
    ],
    completeness: {},
    identityMatchSummary: {
      teamCount: teams.length,
      rosterPlayers: rosterRows.length,
      priorSeasonStatPlayers: statRows.length,
      priorSeasonSnapRows: snapRows.length,
      providerPriority: ["gsis_id", "approved provider ID", "team/name/position fallback"],
      warnings: diagnostics.warnings,
      conflicts: diagnostics.conflicts,
    },
    unmatchedPlayerSummary: Object.fromEntries(
      teams.map((team) => [
        team.teamId,
        Object.fromEntries(
          Object.entries(team.returningProduction.advisory.unmatchedPlayers).map(([metric, rows]) => [metric, rows.length]),
        ),
      ]),
    ),
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
    ].sort(),
    conflicts: diagnostics.conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
    teams,
  };
  dataset.completenessEvaluation = evaluatePersonnelCompleteness(dataset, teamsJson, {
    asOfDate: sourceCutoff,
    maxSourceAgeDays: 365,
  });
  const validation = validatePersonnelEvidenceDataset(dataset, teamsJson, { requireAllTeams: false });
  return {
    dataset,
    validation,
    sourceManifests: [rosters, playerStats, snapCounts],
    json: toNflJsonFileString(dataset),
  };
}

export function assertNonProductionOutput(outputPath, season) {
  const normalized = resolve(outputPath).replace(/\\/g, "/").toLowerCase();
  const forbidden = `/public/data/nfl/${season}/personnel-evidence.json`;
  if (normalized.endsWith(forbidden)) {
    throw new Error("refusing to write production personnel-evidence.json from nflverse audit");
  }
}
