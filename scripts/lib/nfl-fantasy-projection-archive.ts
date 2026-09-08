import { join } from "node:path";
import { canonicalPlayerId, normalizeNflTeamAbbr } from "../../src/lib/nfl/identity/identity";
import { FANTASY_SCORING_FORMAT, FANTASY_SCORING_VERSION } from "../../src/lib/fantasy/weekly/scoring";
import { weeklyFantasyProjectionProductionArtifactSchema, weeklyFantasyProjectionProductionRowSchema } from "../../src/lib/fantasy/weekly/projections/production/artifactContract";
import { appendArchiveEvents, buildSourceManifest, contentHash, writeArchiveManifest, type JsonValue } from "./nfl-production-prediction-archive";

export const FANTASY_ARCHIVE_SCHEMA = "jkb-football-fantasy-prediction-v1";
export const FANTASY_ARCHIVE_POLICY = "jkb-fantasy-capture-v1";
export const FANTASY_ARCHIVE_FILE = "jkb-weekly-fantasy.jsonl";
type ObjectValue = Record<string, JsonValue>;
export type ArchiveGame = { gameId: string; season: number; week: number; seasonType: string; dateUtc: string | null; homeAbbr: string; awayAbbr: string };
export type ArchivePlayer = { gsis_id: string; position: string };
export type FantasyPredictionEvent = {
  schemaVersion: typeof FANTASY_ARCHIVE_SCHEMA; predictionId: string;
  season: number; week: number; gameId: string | null; kickoff: string | null;
  playerId: string | null; playerName: string | null; position: string | null;
  team: string | null; opponent: string | null; projectedFantasyPoints: JsonValue;
  scoringFormat: typeof FANTASY_SCORING_FORMAT; scoringLabel: "JKB Full PPR projections";
  scoringVersion: JsonValue; modelVersion: JsonValue; policyVersion: typeof FANTASY_ARCHIVE_POLICY;
  generatedAt: JsonValue; inputAsOf: JsonValue; capturedAt: string;
  sourceArtifact: string; sourceArtifactHash: string; sourceManifestHash: string;
  sourceMetadata: ObjectValue; sourceRow: JsonValue;
  identityResolutionStatus: "resolved" | "unresolved";
  gameResolutionStatus: "resolved" | "unresolved";
  missingKickoffReason: string | null; sourceKickoffMissing: boolean;
  rejectionReasons: string[];
};
export type FantasyCaptureRun = {
  schemaVersion: "jkb-fantasy-archive-run-v1"; runId: string; season: number; week: number;
  capturedAt: string; sourceArtifact: string; sourceArtifactHash: string; sourceManifestHash: string;
  scoringVersion: JsonValue; archivePolicyVersion: typeof FANTASY_ARCHIVE_POLICY;
  generatedAt: JsonValue; inputAsOf: JsonValue; predictionIds: string[];
  counts: { input: number; accepted: number; unresolved: number; rejected: number; finalPregameEligible: number };
  rejectionSummary: Record<string, number>;
};

export function validateFantasyRun(run: FantasyCaptureRun): void {
  const { runId, ...state } = run;
  if (run.schemaVersion !== "jkb-fantasy-archive-run-v1" || run.archivePolicyVersion !== FANTASY_ARCHIVE_POLICY || !Number.isFinite(utcMillis(run.capturedAt)) || runId !== `run_${contentHash(state as unknown as JsonValue)}`) throw new Error("Invalid fantasy run manifest");
}

function object(value: JsonValue | undefined): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function str(value: JsonValue | undefined): string | null { return typeof value === "string" && value.trim() ? value : null; }
export function utcMillis(value: unknown): number {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ? Date.parse(value) : NaN;
}
function materialState(event: FantasyPredictionEvent): JsonValue {
  const { predictionId: _id, capturedAt: _capture, ...state } = event;
  return state as unknown as JsonValue;
}
export function validateFantasyEvent(event: FantasyPredictionEvent): void {
  if (event.schemaVersion !== FANTASY_ARCHIVE_SCHEMA || event.policyVersion !== FANTASY_ARCHIVE_POLICY) throw new Error("Unsupported fantasy archive contract");
  if (!Number.isFinite(utcMillis(event.capturedAt))) throw new Error("Invalid capturedAt");
  if (event.predictionId !== `pred_${contentHash(materialState(event))}`) throw new Error("Fantasy prediction ID mismatch");
}

/** Temporal eligibility is evaluated at EACH observation, never at generatedAt. */
export function fantasyEligibility(event: FantasyPredictionEvent, capturedAt = event.capturedAt) {
  const reasons = [...event.rejectionReasons];
  const capture = utcMillis(capturedAt);
  const kickoff = utcMillis(event.kickoff);
  if (!Number.isFinite(capture)) reasons.push("invalid-captured-at");
  if (!Number.isFinite(kickoff)) reasons.push("invalid-kickoff");
  else if (capture >= kickoff) reasons.push("capture-not-before-kickoff");
  for (const [name, value] of [["generated-at", event.generatedAt], ["input-as-of", event.inputAsOf]] as const) {
    if (value !== null && !Number.isFinite(utcMillis(value))) reasons.push(`invalid-${name}`);
    else if (value !== null && utcMillis(value) > capture) reasons.push(`${name}-after-capture`);
  }
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], freshness: {
    generatedAgeHours: Number.isFinite(utcMillis(event.generatedAt)) ? (capture - utcMillis(event.generatedAt)) / 3600000 : null,
    inputAgeHours: Number.isFinite(utcMillis(event.inputAsOf)) ? (capture - utcMillis(event.inputAsOf)) / 3600000 : null,
    stale: Number.isFinite(utcMillis(event.generatedAt)) && capture - utcMillis(event.generatedAt) > 86400000,
    sourceKickoffMissing: event.sourceKickoffMissing,
  } };
}

export function buildFantasyCapture(options: {
  season: number; week: number; capturedAt: string; sourceArtifact: string; sourceText: string;
  games: ArchiveGame[]; players: ArchivePlayer[];
  resolutionSources: { logicalName: string; path: string; content: string }[];
}) {
  if (!Number.isInteger(options.season) || options.season < 2000 || options.season > 2100 || !Number.isInteger(options.week) || options.week < 1 || options.week > 18) throw new Error("Invalid season/week");
  if (!Number.isFinite(utcMillis(options.capturedAt))) throw new Error("Invalid capturedAt");
  const artifact = object(JSON.parse(options.sourceText));
  if (!artifact.rows || typeof artifact.rows !== "object" || Array.isArray(artifact.rows)) throw new Error("Projection artifact must contain position row arrays");
  const entries = Object.entries(artifact.rows).flatMap(([position, rows]) => {
    if (!Array.isArray(rows)) throw new Error(`Invalid rows container: ${position}`);
    return rows.map(row => ({ position, row }));
  });
  const metadata = { ...artifact }; delete metadata.rows;
  // Validate envelope separately so a bad row is retained, not dropped by whole-artifact parsing.
  const envelope = weeklyFantasyProjectionProductionArtifactSchema.safeParse({ ...metadata, rows: { QB: [], RB: [], WR: [], TE: [] } });
  const source = buildSourceManifest("jkb-weekly-fantasy", [{ logicalName: "projection", path: options.sourceArtifact, content: options.sourceText }, ...options.resolutionSources]);
  const playerCounts = new Map<string, number>();
  const canonicalPlayers = new Map<string, number>();
  options.players.forEach(player => {
    const key = `${canonicalPlayerId(player.gsis_id)}|${player.position}`;
    canonicalPlayers.set(key, (canonicalPlayers.get(key) ?? 0) + 1);
  });
  entries.forEach(({ row }) => { const id = str(object(row).playerId); if (id) playerCounts.set(id, (playerCounts.get(id) ?? 0) + 1); });
  const events = entries.map(({ row: raw, position: group }) => {
    const row = object(raw);
    const reasons: string[] = [];
    if (!envelope.success) reasons.push(...envelope.error.issues.map(issue => `artifact-schema:${issue.path.join(".")}:${issue.code}`));
    const rowCheck = weeklyFantasyProjectionProductionRowSchema.safeParse(raw);
    if (!rowCheck.success) reasons.push(...rowCheck.error.issues.map(issue => `row-schema:${issue.path.join(".")}:${issue.code}`));
    if (artifact.season !== options.season || artifact.week !== options.week || (row.season != null && row.season !== options.season) || (row.week != null && row.week !== options.week)) reasons.push("season-week-mismatch");
    const playerId = str(row.playerId), position = str(row.position);
    const matches = canonicalPlayers.get(`${playerId}|${position}`) ?? 0;
    const identityResolved = !!playerId && matches === 1 && !!str(row.playerName) && group === position && playerCounts.get(playerId) === 1;
    if (!identityResolved) reasons.push("player-identity-unresolved-or-duplicate");
    if (!matches) reasons.push("canonical-player-id-position-not-found");
    if (matches > 1) reasons.push("canonical-player-id-position-ambiguous");
    const team = normalizeNflTeamAbbr(str(row.team)), opponent = normalizeNflTeamAbbr(str(row.opponent));
    const games = options.games.filter(game => game.season === options.season && game.week === options.week && game.seasonType === "REG" &&
      ((normalizeNflTeamAbbr(game.homeAbbr) === team && normalizeNflTeamAbbr(game.awayAbbr) === opponent) || (normalizeNflTeamAbbr(game.awayAbbr) === team && normalizeNflTeamAbbr(game.homeAbbr) === opponent)));
    const game = games.length === 1 ? games[0] : null;
    const gameResolved = !!game && !!str(game.gameId) && (row.gameId == null || row.gameId === game.gameId);
    if (!gameResolved) reasons.push("game-identity-unresolved");
    const kickoff = gameResolved && Number.isFinite(utcMillis(game?.dateUtc)) ? game!.dateUtc : null;
    if (!kickoff) reasons.push("canonical-kickoff-missing-or-invalid");
    if (row.kickoff != null && row.kickoff !== kickoff) reasons.push("source-kickoff-conflict");
    if (artifact.scoringVersion !== FANTASY_SCORING_VERSION) reasons.push("unsupported-scoring-version");
    if (typeof row.projectedFantasyPoints !== "number" || !Number.isFinite(row.projectedFantasyPoints)) reasons.push("invalid-projection-value");
    const event: FantasyPredictionEvent = {
      schemaVersion: FANTASY_ARCHIVE_SCHEMA, predictionId: "", season: options.season, week: options.week,
      gameId: gameResolved ? game!.gameId : null, kickoff, playerId, playerName: str(row.playerName), position, team, opponent,
      projectedFantasyPoints: row.projectedFantasyPoints ?? null, scoringFormat: FANTASY_SCORING_FORMAT, scoringLabel: "JKB Full PPR projections",
      scoringVersion: artifact.scoringVersion ?? null, modelVersion: artifact.modelVersion ?? null, policyVersion: FANTASY_ARCHIVE_POLICY,
      generatedAt: artifact.generatedAt ?? null, inputAsOf: artifact.inputAsOf ?? null, capturedAt: options.capturedAt,
      sourceArtifact: options.sourceArtifact, sourceArtifactHash: contentHash(options.sourceText), sourceManifestHash: source.hash,
      sourceMetadata: metadata, sourceRow: raw, identityResolutionStatus: identityResolved ? "resolved" : "unresolved",
      gameResolutionStatus: gameResolved ? "resolved" : "unresolved", sourceKickoffMissing: row.kickoff == null,
      missingKickoffReason: kickoff ? null : "canonical-kickoff-missing-or-invalid", rejectionReasons: [...new Set(reasons)].sort(),
    };
    event.predictionId = `pred_${contentHash(materialState(event))}`;
    validateFantasyEvent(event);
    return event;
  });
  const counts = { input: events.length, accepted: 0, unresolved: 0, rejected: 0, finalPregameEligible: 0 };
  const rejectionSummary: Record<string, number> = {};
  for (const event of events) {
    const eligibility = fantasyEligibility(event);
    if (event.identityResolutionStatus === "unresolved" || event.gameResolutionStatus === "unresolved" || !event.kickoff) counts.unresolved++;
    else if (!eligibility.eligible) counts.rejected++;
    else counts.accepted++;
    if (eligibility.eligible) counts.finalPregameEligible++;
    eligibility.reasons.forEach(reason => rejectionSummary[reason] = (rejectionSummary[reason] ?? 0) + 1);
  }
  const runState: Omit<FantasyCaptureRun, "runId"> = { schemaVersion: "jkb-fantasy-archive-run-v1", season: options.season, week: options.week,
    capturedAt: options.capturedAt, sourceArtifact: options.sourceArtifact, sourceArtifactHash: contentHash(options.sourceText), sourceManifestHash: source.hash,
    scoringVersion: artifact.scoringVersion ?? null, archivePolicyVersion: FANTASY_ARCHIVE_POLICY,
    generatedAt: artifact.generatedAt ?? null, inputAsOf: artifact.inputAsOf ?? null,
    predictionIds: events.map(event => event.predictionId), counts, rejectionSummary };
  const run: FantasyCaptureRun = { ...runState, runId: `run_${contentHash(runState as unknown as JsonValue)}` };
  return { events, run, source };
}

/** WU6B.3 contract only. Corrections append and link to previous outcome IDs. */
export type FantasyOutcomeContract = {
  predictionId: string; playerId: string; gameId: string; actualFantasyPoints: number;
  scoringVersion: typeof FANTASY_SCORING_VERSION; statsSource: string; statsHash: string;
  outcomeId: string; outcomeRevision: number; supersedesOutcomeId: string | null;
  status: "original" | "corrected"; recordedAt: string;
};
export type FantasySelectionPolicy = { kind: "player-game-prekickoff" } | { kind: "slate-prelock"; lockAt: string; gameIds: string[] };

export function selectFinalPregame(events: FantasyPredictionEvent[], runs: FantasyCaptureRun[], season: number, week: number,
  policy: FantasySelectionPolicy = { kind: "player-game-prekickoff" }) {
  const byId = new Map(events.map(event => { validateFantasyEvent(event); return [event.predictionId, event] as const; }));
  if (policy.kind === "slate-prelock" && (!Number.isFinite(utcMillis(policy.lockAt)) || !policy.gameIds.length)) throw new Error("Explicit slate lock and games required");
  const selected = new Map<string, { predictionId: string; runId: string; playerId: string; gameId: string; capturedAt: string; freshness: ReturnType<typeof fantasyEligibility>["freshness"] }>();
  for (const run of [...runs].sort((a, b) => utcMillis(a.capturedAt) - utcMillis(b.capturedAt) || a.runId.localeCompare(b.runId))) {
    validateFantasyRun(run);
    if (run.season !== season || run.week !== week) continue;
    for (const id of [...run.predictionIds].sort()) {
      const event = byId.get(id);
      if (!event) throw new Error(`Missing prediction ${id}`);
      if (event.sourceManifestHash !== run.sourceManifestHash || event.sourceArtifactHash !== run.sourceArtifactHash || utcMillis(run.capturedAt) < utcMillis(event.capturedAt)) throw new Error("Observation provenance mismatch or backdating");
      const eligibility = fantasyEligibility(event, run.capturedAt);
      if (event.season !== season || event.week !== week || !eligibility.eligible) continue;
      if (policy.kind === "slate-prelock" && (!policy.gameIds.includes(event.gameId!) || utcMillis(run.capturedAt) >= utcMillis(policy.lockAt) || utcMillis(policy.lockAt) > utcMillis(event.kickoff))) continue;
      selected.set(`${event.playerId}|${event.gameId}`, { predictionId: id, runId: run.runId, playerId: event.playerId!, gameId: event.gameId!, capturedAt: run.capturedAt, freshness: eligibility.freshness });
    }
  }
  const state = { schemaVersion: "jkb-fantasy-final-pregame-v1", archivePolicyVersion: FANTASY_ARCHIVE_POLICY, season, week, policy,
    status: "latest-eligible-observed-state; provisional-before-cutoff",
    selections: [...selected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row) };
  return { ...state, selectionId: `selection_${contentHash(state as unknown as JsonValue)}` };
}

export function persistFantasyCapture(rootDir: string, capture: ReturnType<typeof buildFantasyCapture>, dryRun = false) {
  validateFantasyRun(capture.run);
  const partition = join(rootDir, String(capture.run.season), String(capture.run.week).padStart(2, "0"));
  const path = join(partition, FANTASY_ARCHIVE_FILE);
  const sourcePath = join(rootDir, "manifests", "sources", `${capture.source.hash}.json`);
  const runPath = join(partition, "fantasy-runs", `${capture.run.runId}.json`);
  // Preflight collisions and validation before writing any state.
  writeArchiveManifest(sourcePath, capture.source.manifest as unknown as JsonValue, true);
  writeArchiveManifest(runPath, capture.run as unknown as JsonValue, true);
  appendArchiveEvents({ path, records: capture.events, id: row => row.predictionId, state: materialState, validate: validateFantasyEvent, dryRun: true });
  writeArchiveManifest(sourcePath, capture.source.manifest as unknown as JsonValue, dryRun);
  const write = appendArchiveEvents({ path, records: capture.events, id: row => row.predictionId, state: materialState, validate: validateFantasyEvent, dryRun });
  writeArchiveManifest(runPath, capture.run as unknown as JsonValue, dryRun);
  return { ...write, intendedWrites: [path, sourcePath, runPath], runPath };
}
