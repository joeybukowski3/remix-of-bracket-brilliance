/** Deterministic human-review artifact for the D2.5 Week 1 pre-integration audit. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import {
  auditedProductionAlias,
  normalizeProductionPlayerName,
  resolveProductionProjectionIdentity,
  type ProductionIdentitySourceRow,
} from "../src/lib/fantasy/weekly/productionIdentity.ts";
import { weeklyFantasyRankingArtifactSchema } from "../src/lib/fantasy/weekly/productionAuthority.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "data", "fantasy", "backtests", "phase-d2-5", "week-01-pre-integration-audit-v1.json");
const ARTIFACT_PATH = join(ROOT, "public", "data", "fantasy", "weekly", "2026", "week-01.json");
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Position = typeof POSITIONS[number];
type CsvRow = Record<string, string>;
type ParRow = { Player: string; Team: string; Position: Position; "Source ID": string; "2026 Projected PPG": number };

function sha(text: string | Buffer): string { return createHash("sha256").update(text).digest("hex"); }
function read(path: string): string { return readFileSync(path, "utf8"); }
function sourceRow(row: CsvRow, kind: "roster" | "player"): ProductionIdentitySourceRow {
  return {
    gsisId: row.gsis_id || null,
    pfrId: row.pfr_id || null,
    playerName: kind === "roster" ? row.full_name : row.display_name,
    position: row.position,
    team: (kind === "roster" ? row.team : row.team_abbr) || null,
    status: row.status || null,
  };
}
function classification(name: string): string {
  if (name === "Barion Brown" || name === "Darren Waller") return "duplicate/collision";
  if (name === "Bo Melton") return "unsupported identity";
  if (["Stefon Diggs", "Deebo Samuel Sr.", "Brandon Aiyuk"].includes(name)) return "stale projection player";
  return "player not on current NFL roster";
}
function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

const parPath = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
const playersPath = join(ROOT, "data", "nfl", "nflverse", "players", "players.csv");
const rosterPath = join(ROOT, "data", "nfl", "nflverse", "weekly-rosters", "roster_weekly_2026.csv");
const parText = read(parPath);
const playersText = read(playersPath);
const rosterText = read(rosterPath);
const artifactText = read(ARTIFACT_PATH);
const projections = (JSON.parse(parText) as ParRow[]).filter((row) => POSITIONS.includes(row.Position));
const playerRows = (parseCsv(playersText) as CsvRow[]).map((row) => sourceRow(row, "player"));
const rawRosterRows = (parseCsv(rosterText) as CsvRow[]).filter((row) => row.season === "2026" && row.week === "1" && row.game_type === "REG");
const rosterRows = rawRosterRows.map((row) => sourceRow(row, "roster"));
const resolutions = projections.map((projection) => ({
  projection,
  resolution: resolveProductionProjectionIdentity({
    projection: { sourceId: projection["Source ID"], playerName: projection.Player, position: projection.Position, team: projection.Team },
    rosterRows,
    playerRows,
  }),
}));
const artifact = weeklyFantasyRankingArtifactSchema.parse(JSON.parse(artifactText));
const ranked = Object.values(artifact.rankings).flat();
const unresolvedNames = new Set(artifact.diagnostics.excluded.filter((row) => row.reasons.includes("IDENTITY_UNRESOLVED")).map((row) => row.playerName));
const unresolved = resolutions.filter(({ projection }) => unresolvedNames.has(projection.Player)).map(({ projection, resolution }) => ({
  projectionPlayerName: projection.Player,
  projectionPlayerId: projection["Source ID"],
  projectionTeam: projection.Team,
  position: projection.Position,
  attemptedGsisResolution: resolution.attemptedGsisIds,
  currentRosterCandidates: resolution.rosterCandidates,
  exactReasonResolutionFailed: resolution.failureReason,
  issueType: classification(projection.Player),
}));
const directSourceIdConflicts = resolutions.filter(({ resolution }) => resolution.directPfrConflict).map(({ projection, resolution }) => ({
  projectionPlayerName: projection.Player,
  projectionPlayerId: projection["Source ID"],
  projectionTeam: projection.Team,
  position: projection.Position,
  resolved: resolution.resolved,
  resolvedGsisId: resolution.gsisId,
  resolutionStrategy: resolution.strategy,
  rosterCandidates: resolution.rosterCandidates,
  failureReason: resolution.failureReason,
}));
const resolvedByGsis = new Map<string, typeof resolutions>();
for (const row of resolutions.filter(({ resolution }) => resolution.resolved && resolution.gsisId)) {
  resolvedByGsis.set(row.resolution.gsisId!, [...(resolvedByGsis.get(row.resolution.gsisId!) ?? []), row]);
}
const duplicateResolvedGsis = [...resolvedByGsis].filter(([, rows]) => rows.length > 1).map(([gsisId, rows]) => ({
  gsisId,
  projections: rows.map(({ projection }) => ({ playerName: projection.Player, sourceId: projection["Source ID"], position: projection.Position })),
}));
const availabilityAudit = ["Parris Campbell", "Seydou Traore"].map((playerName) => {
  const roster = rawRosterRows.find((row) => normalizeProductionPlayerName(row.full_name) === normalizeProductionPlayerName(playerName));
  const after = ranked.find((row) => row.playerName === playerName);
  return {
    player: playerName,
    position: roster?.position ?? null,
    team: normalizeNflTeamAbbr(roster?.team),
    currentAvailabilitySource: "verified nflverse roster_weekly_2026.csv Week 1 status/status_description_abbr",
    rawRosterStatus: roster?.status ?? null,
    rawStatusDescriptionAbbr: roster?.status_description_abbr ?? null,
    finalAvailability: after?.availability ?? "excluded",
    finalConfidence: after?.confidence ?? "unranked",
    finding: playerName === "Parris Campbell"
      ? "normalization defect repaired: RET/R02 is a deterministic retired-list state and is now ineligible"
      : "expected source limitation: E14 is not defined by the committed source contract; status remains unknown without invention",
  };
});
const strategies = Object.fromEntries(["direct-pfr", "exact-name-position", "audited-alias", "unresolved"].map((strategy) => [strategy, resolutions.filter(({ resolution }) => resolution.strategy === strategy).length]));
const counts = Object.fromEntries(POSITIONS.map((position) => [position, artifact.rankings[position].length]));
const confidenceCounts = Object.fromEntries(["high", "medium", "low"].map((confidence) => [confidence, ranked.filter((row) => row.confidence === confidence).length]));
const exclusions = artifact.diagnostics.excluded.map((row) => ({ ...row, potentiallySurprising: ["Fernando Mendoza", "Carson Beck", "Ty Simpson", "Brenen Thompson", "Sam Roush", "Barion Brown", "Bo Melton"].includes(row.playerName) }));

writeAtomic(OUTPUT, {
  schemaVersion: "fantasy-weekly-d2-5-audit-v1",
  season: 2026,
  week: 1,
  generatedAt: artifact.generatedAt,
  inputs: [
    { source: "data/fantasy/2026-par-consensus.json", sha256: sha(parText) },
    { source: "data/nfl/nflverse/players/players.csv", sha256: sha(playersText) },
    { source: "data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv", sha256: sha(rosterText) },
    { source: "public/data/fantasy/weekly/2026/week-01.json", sha256: sha(artifactText) },
  ],
  beforeRepair: {
    artifactSha256: "3d916b2c1c6c1fb69397e9cec4c816c8117d51957a4b5f5c7dda07ae61a8ca24",
    rankedCounts: { QB: 74, RB: 122, WR: 187, TE: 110 },
    unresolvedIdentityCount: 13,
    reserveExclusions: 5,
    unknownAvailabilityCount: 2,
    confidenceCounts: { high: 0, medium: 491, low: 2 },
  },
  afterRepair: {
    artifactSha256: sha(artifactText), rankedCounts: counts,
    unresolvedIdentityCount: unresolved.length,
    reserveExclusions: artifact.diagnostics.excluded.filter((row) => row.reasons.includes("RESERVE")).length,
    unknownAvailabilityCount: ranked.filter((row) => row.availability === "unknown").length,
    confidenceCounts,
  },
  identityAudit: {
    projectionRows: projections.length,
    strategyCounts: strategies,
    unresolved,
    collisionAudit: {
      directSourceIdConflictCount: directSourceIdConflicts.length,
      directSourceIdConflicts,
      duplicateResolvedGsis,
      wrongPlayerResolutions: resolutions.filter(({ projection, resolution }) => {
        if (!resolution.resolved || !resolution.roster) return false;
        const rosterName = normalizeProductionPlayerName(resolution.roster.playerName);
        const alias = auditedProductionAlias({ sourceId: projection["Source ID"], playerName: projection.Player, position: projection.Position, team: projection.Team });
        return (rosterName !== normalizeProductionPlayerName(projection.Player) && rosterName !== alias) || resolution.roster.position !== projection.Position;
      }).map(({ projection }) => projection.Player),
    },
  },
  lowConfidenceAvailabilityAudit: availabilityAudit,
  top25: Object.fromEntries(POSITIONS.map((position) => [position, artifact.rankings[position].slice(0, 25).map((row) => ({
    rank: row.positionRank, player: row.playerName, team: row.team, baselineValue: row.baselineValue,
    authority: row.baselineAuthority, confidence: row.confidence,
  }))])),
  lowConfidenceRankedPlayers: ranked.filter((row) => row.confidence === "low").map((row) => ({ player: row.playerName, position: row.position, team: row.team, availability: row.availability, reasons: row.reasons })),
  exclusions,
});
console.log(JSON.stringify({ output: OUTPUT, unresolved: unresolved.length, collisions: directSourceIdConflicts.length, duplicateResolvedGsis: duplicateResolvedGsis.length, counts, confidenceCounts, artifactSha256: sha(artifactText) }, null, 2));
