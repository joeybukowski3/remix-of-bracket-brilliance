/**
 * ROS projection authority -- Phase 3 shadow projection generator.
 *
 * Builds `data/fantasy/ros-research/2026/shadow-ros-projections.json`, a
 * SHADOW-ONLY research artifact, from the already-committed Phase 1+2
 * artifacts under `data/fantasy/ros-research/2026/` plus the live
 * `FANTASY_RANKINGS`/`FANTASY_PAR_ROWS` (read-only, for current-value
 * comparison columns only). Every formula is in
 * `src/lib/fantasy/rosResearch/shadowProjection*.ts`; this script only
 * wires data together and writes the artifact. Nothing here writes to
 * `data/fantasy/2026-par-consensus.json`, `src/data/fantasyRankings2026.ts`,
 * or any `public/data/fantasy/weekly` artifact, and no live Overall Rank,
 * POS RK, PAR/G, Projection RK, or replacement level is ever modified.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FANTASY_RANKINGS, type FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import { FANTASY_PAR_ROWS, type FantasyParSourceRow } from "../src/lib/fantasy/parRankings.ts";
import parConsensusSourceRaw from "../data/fantasy/2026-par-consensus.json" with { type: "json" };
import {
  applyStatusTreatments,
  buildRefinedCandidates,
  buildShadowCandidates,
  capConfidenceForBaselineSource,
  computeFpaAdjustment,
  computeF2PromotedModelRanks,
  computeHistoricalBaselineOptions,
  computeMarketAdjustment,
  computeTeamAdjustment,
  computeUsageAdjustment,
  REFINED_CANDIDATE_LABELS,
  selectEffectiveBaseline,
  shadowConfidence,
} from "../src/lib/fantasy/rosResearch/shadowProjection.ts";
import {
  aggregateFolds,
  runHistoricalBaselineBacktest,
  runUsageCapExperiment,
  selectedWeightingPairs,
  type BacktestCase,
} from "../src/lib/fantasy/rosResearch/shadowBacktest.ts";
import { buildStatusAvailability, type StatusSourceRow } from "../src/lib/fantasy/rosResearch/statusAvailability.ts";
import { buildRookieFallback, type RookieFallbackSourceRow } from "../src/lib/fantasy/rosResearch/rookieFallback.ts";
import {
  buildNormalizedAvailability,
  ELIGIBILITY_POLICY_IDS,
  ELIGIBILITY_POLICY_LABELS,
  evaluateRankEligibility,
  isProjectionEligible,
  type EligibilityPolicyId,
} from "../src/lib/fantasy/rosResearch/rankEligibility.ts";
import {
  SHADOW_PROJECTION_SCHEMA_VERSION,
  ADJUSTMENT_CAPS,
  COMBINED_ADJUSTMENT_CAP,
  MIN_SAMPLE_GAMES,
  MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
  RECENCY_WEIGHTS,
  SHADOW_CANDIDATE_INPUTS,
  SHADOW_CANDIDATE_LABELS,
  STATUS_CONFIDENCE_CEILING,
  STATUS_MODEL_RANK_EXCLUSION,
  STATUS_PROJECTION_MODIFIER,
  STATUS_TREATMENT_APPLIED_TO_ARTIFACT,
  STATUS_TREATMENT_LABELS,
  USAGE_SIGNAL_FIELD_BY_POSITION,
} from "../src/lib/fantasy/rosResearch/shadowProjectionConfig.ts";
import { normalizeHistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_DIR = join(ROOT, "data", "fantasy", "ros-research", "2026");
const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];
const USAGE_CAPS_TO_TEST = [0, 0.05, 0.1, 0.15] as const;
/**
 * Phase 3C: `data/fantasy/2026-par-consensus.json` carries no embedded
 * generation timestamp of its own; its last committed change is used as
 * `asOf` for the PAR-consensus-team availability signal (verified via
 * `git log -1 --format="%ai" -- data/fantasy/2026-par-consensus.json`,
 * 2026-08-13 -- older than either nflverse source below, so it is only ever
 * used to escalate an already-ambiguous nflverse category, never to override
 * a decisive one; see `rankEligibility.ts`).
 */
const PAR_CONSENSUS_AS_OF = "2026-08-13";
/** Applied by default to the artifact's flat rankEligible/rankEligibilityReason fields. R1/R2/R3 are all computed and compared in diagnostics.eligibilityPolicyComparison. */
const APPLIED_ELIGIBILITY_POLICY: EligibilityPolicyId = "R2";

function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; rowCount: number; byteSize: number; sha256: string; headerColumns?: string[] };

function readNflverseCsv(relativeDir: string, entry: ManifestEntry) {
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { rows: parseCsv(text) as CsvRow[], path, observedHash: sha(readFileSync(path)) };
}

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function main() {
  const options = parseArgs(process.argv);

  // ---- Load committed Phase 1+2 research artifacts (read-only) ----
  type IdentityRow = { player: string; position: FantasyPosition; team: string | null; overallRank: number; identity: { playerId: string | null }; parMatch: { found: boolean; sourceId: string | null } };
  const identityPath = join(RESEARCH_DIR, "identity-crosswalk.json");
  const identity = readJson<{ rows: IdentityRow[] }>(identityPath);
  const identityText = readFileSync(identityPath, "utf8");

  type BaselinePlayer = { playerId: string; seasons: Array<{ season: number; gamesPlayed: number; totalFantasyPoints: number; ppg: number }> };
  const baselinePath = join(RESEARCH_DIR, "historical-baseline.json");
  const baseline = readJson<{ players: BaselinePlayer[] }>(baselinePath);
  const baselineByPlayerId = new Map(baseline.players.map((p) => [p.playerId, p.seasons]));
  const baselineText = readFileSync(baselinePath, "utf8");

  type UsagePlayer = { playerId: string; seasons: Array<Record<string, unknown> & { season: number }> };
  const usagePath = join(RESEARCH_DIR, "usage-role-context.json");
  const usage = readJson<{ players: UsagePlayer[] }>(usagePath);
  const usageByPlayerId = new Map(usage.players.map((p) => [p.playerId, p.seasons as never]));
  const usageText = readFileSync(usagePath, "utf8");

  type TeamGame = { gameId: string; week: number; opponent: string; homeAway: "home" | "away"; impliedTeamTotal: number | null };
  type TeamRow = { team: string; games: TeamGame[] };
  const teamEnvPath = join(RESEARCH_DIR, "team-environment.json");
  const teamEnv = readJson<{ teams: TeamRow[] }>(teamEnvPath);
  const teamEnvByTeam = new Map(teamEnv.teams.map((t) => [t.team, t.games]));
  const teamEnvText = readFileSync(teamEnvPath, "utf8");

  const marketPath = join(RESEARCH_DIR, "schedule-scoring-environment.json");
  const marketEnv = readJson<{ teams: TeamRow[] }>(marketPath);
  const marketByTeam = new Map(marketEnv.teams.map((t) => [t.team, t.games]));
  const marketText = readFileSync(marketPath, "utf8");

  type FpaRow = { team: string; position: FantasyPosition; averagePointsAllowed: number | null; remainingGames: number; opponentsWithFpaData: number };
  const fpaPath = join(RESEARCH_DIR, "schedule-fpa-context.json");
  const fpaData = readJson<{ teams: FpaRow[] }>(fpaPath);
  const fpaByTeamPosition = new Map(fpaData.teams.map((row) => [`${row.team}|${row.position}`, row]));
  const fpaText = readFileSync(fpaPath, "utf8");

  // ---- Phase 3B: status/availability sources (read-only nflverse caches) ----
  const playersManifest = readJson<{ files: ManifestEntry[] }>(join(ROOT, "data/nfl/nflverse/players/manifest.json"));
  const playersEntry = playersManifest.files.find((entry) => entry.season === null)!;
  const playersCsv = readNflverseCsv("data/nfl/nflverse/players", playersEntry);
  const crosswalk = new Map(playersCsv.rows.map((row) => [String(row.gsis_id), { pfrId: String(row.pfr_id || "") || null, espnId: String(row.espn_id || "") || null }]));
  const masterTableRows: StatusSourceRow[] = playersCsv.rows
    .filter((row) => row.gsis_id)
    .map((row) => ({ gsisId: String(row.gsis_id), team: null, rawStatus: String(row.status || "") }));

  const rosterManifest = readJson<{ files: ManifestEntry[] }>(join(ROOT, "data/nfl/nflverse/weekly-rosters/manifest.json"));
  const roster2026Entry = rosterManifest.files.find((entry) => entry.season === 2026)!;
  const roster2026Csv = readNflverseCsv("data/nfl/nflverse/weekly-rosters", roster2026Entry);
  const latestRosterWeek = Math.max(...roster2026Csv.rows.map((row) => Number(row.week)));
  const currentSeasonRosterRows: StatusSourceRow[] = roster2026Csv.rows
    .filter((row) => row.gsis_id && Number(row.week) === latestRosterWeek)
    .map((row) => ({ gsisId: String(row.gsis_id), team: String(row.team || "") || null, rawStatus: String(row.status || "") }));

  // ---- Phase 3B: second leakage-safe backtest fold. 2022 stats aren't part of
  // the committed Phase 2 historical-baseline.json (which is fixed to
  // 2023-2025 per that artifact's own scope); read directly here, same
  // normalization pipeline as Phase 2's generator, purely for the fold-2
  // training season. ----
  const statsManifest = readJson<{ files: ManifestEntry[] }>(join(ROOT, "data/nfl/nflverse/stats-player-week/manifest.json"));
  const stats2022Entry = statsManifest.files.find((entry) => entry.season === 2022)!;
  const stats2022 = readNflverseCsv("data/nfl/nflverse/stats-player-week", stats2022Entry);
  const season2022ByPlayer = new Map<string, { gamesPlayed: number; totalFantasyPoints: number }>();
  for (const source of stats2022.rows) {
    const ids = crosswalk.get(String(source.player_id));
    const normalized = normalizeHistoricalPlayerWeek(source, ids, null);
    if (!normalized) continue;
    const cell = season2022ByPlayer.get(normalized.playerId) ?? { gamesPlayed: 0, totalFantasyPoints: 0 };
    cell.gamesPlayed += 1;
    cell.totalFantasyPoints += normalized.actualFantasyPoints;
    season2022ByPlayer.set(normalized.playerId, cell);
  }

  // ---- League averages used to normalize team/FPA/market factors ----
  function leagueAverageImplied(rows: readonly TeamRow[]): number {
    const values = rows.flatMap((t) => t.games.map((g) => g.impliedTeamTotal).filter((v): v is number => v != null));
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  }
  const leagueAvgImpliedTotal = leagueAverageImplied(teamEnv.teams);
  const leagueAvgRemainingImpliedTotal = leagueAverageImplied(marketEnv.teams);
  const leagueAvgPointsAllowedByPosition: Record<FantasyPosition, number> = Object.fromEntries(
    POSITIONS.map((position) => {
      const rows = fpaData.teams.filter((row) => row.position === position && row.averagePointsAllowed != null);
      const avg = rows.length ? rows.reduce((s, row) => s + (row.averagePointsAllowed ?? 0), 0) / rows.length : 0;
      return [position, avg];
    }),
  ) as Record<FantasyPosition, number>;

  // ---- Live current-value lookups (read-only comparison columns) ----
  const rankingsByOverallRank = new Map(FANTASY_RANKINGS.rows.map((row) => [row.overallRank, row]));
  const parBySourceId = new Map(FANTASY_PAR_ROWS.map((row) => [row.sourceId, row]));
  const replacementByPosition: Record<FantasyPosition, number> = Object.fromEntries(
    POSITIONS.map((position) => {
      const row = FANTASY_PAR_ROWS.find((r) => r.position === position);
      if (!row) throw new Error(`No live PAR row found for position ${position}; cannot read its replacement level.`);
      return [position, row.replacementPpg];
    }),
  ) as Record<FantasyPosition, number>;

  // ---- Per-player shadow computation ----
  const resolved = identity.rows.filter((row) => row.identity.playerId);
  const universe = resolved.map((row) => ({ playerId: row.identity.playerId as string, playerName: row.player, position: row.position }));

  // ---- Phase 3B: status/availability (all 250 resolved players) ----
  const statusAvailability = buildStatusAvailability({
    currentSeasonRosterRows,
    currentSeasonAsOf: roster2026Entry.retrievedDateUtc,
    masterTableRows,
    masterTableAsOf: playersEntry.retrievedDateUtc,
    universe,
  });
  const statusByPlayerId = new Map(statusAvailability.players.map((p) => [p.playerId, p.status]));

  // ---- Phase 3B: rookie/no-history fallback, only for players with zero historical seasons.
  // Reads the raw live PAR consensus SOURCE file directly (read-only), not
  // the position-limited FANTASY_PAR_ROWS board (PAR_POSITION_LIMITS caps
  // e.g. WR at 78/TE at 18 for board-display purposes only): a rookie whose
  // PAR row exists but falls below that display cutoff still has a real,
  // already-approved "2026 Projected PPG" value that should not be treated
  // as unavailable just because the JKB board doesn't show it. ----
  const rawParBySourceId = new Map((parConsensusSourceRaw as readonly FantasyParSourceRow[]).map((row) => [row["Source ID"], row]));
  const noHistoryUniverse = universe.filter((p) => (baselineByPlayerId.get(p.playerId) ?? []).length === 0);
  const fallbackSourceRows: RookieFallbackSourceRow[] = noHistoryUniverse.map((p) => {
    const row = resolved.find((r) => r.identity.playerId === p.playerId)!;
    const rawPar = row.parMatch.found && row.parMatch.sourceId ? rawParBySourceId.get(row.parMatch.sourceId) : undefined;
    return { playerId: p.playerId, playerName: p.playerName, position: p.position, parConsensusProjectedPpg: rawPar?.["2026 Projected PPG"] ?? null };
  });
  const rookieFallback = buildRookieFallback(noHistoryUniverse, fallbackSourceRows);
  const fallbackByPlayerId = new Map(rookieFallback.players.map((p) => [p.playerId, p.fallback]));

  type PlayerOut = {
    canonicalPlayerId: string;
    player: string;
    position: FantasyPosition;
    team: string | null;
    currentRosPpg: number | null;
    currentParPerGame: number | null;
    currentOverallRank: number | null;
    currentPositionRank: number | null;
    currentProjectionRank: number | null;
    adp: number | null;
    historicalBaselineOptions: ReturnType<typeof computeHistoricalBaselineOptions>;
    selectedBaselineWeighting: "recency-weighted-min-sample";
    baselineSource: "historical-model" | "fallback-par-consensus" | "none";
    fallback: { applied: boolean; source: string; ppg: number | null; reason: string | null } | null;
    status: { category: string; rawCode: string | null; source: string; sourceTeam: string | null; asOf: string | null };
    statusTreatmentComparison: unknown; // Treatments A-D applied to Candidate E, for audit/comparison (see methodology.statusTreatments)
    // ---- Phase 3C: normalized availability + rank-eligibility (no PPG penalty) ----
    availabilityStatus: string;
    availabilitySource: string;
    availabilityAsOf: string | null;
    availabilityConfidence: string;
    currentRosterVerified: boolean;
    statusConflict: boolean;
    statusConflictReason: string | null;
    projectionEligible: boolean;
    rankEligible: boolean;
    rankEligibilityReason: string | null;
    eligibilityByPolicy: Record<EligibilityPolicyId, { rankEligible: boolean; rankEligibilityReason: string | null }>;
    candidates: Array<{
      candidate: string;
      label: string;
      projectedPpg: number | null;
      shadowParPerGame: number | null;
      confidence: string;
      effectiveConfidence: string; // confidence after the applied status treatment's ceiling (Treatment D by default)
      excludedFromShadowRank: boolean;
      adjustmentBreakdown: unknown;
      combinedFactor: number | null;
      combinedFactorClamped: boolean;
      availableInputs: string[];
      missingInputs: string[];
    }>;
    refinedCandidates: Array<{
      candidate: string;
      label: string;
      projectedPpg: number | null;
      shadowParPerGame: number | null;
      confidence: string;
      effectiveConfidence: string;
      excludedFromShadowRank: boolean;
      availableInputs: string[];
      missingInputs: string[];
    }>;
    shadowPositionRank: number | null; // promoted F2 PAR/G rank within position, filtered by applied rank eligibility
  };

  const playersOut: PlayerOut[] = resolved.map((row) => {
    const playerId = row.identity.playerId as string;
    const position = row.position;
    const team = row.team;
    const liveRanking = rankingsByOverallRank.get(row.overallRank);
    const livePar = row.parMatch.found && row.parMatch.sourceId ? parBySourceId.get(row.parMatch.sourceId) : undefined;
    // Phase 3C: the FREE_AGENT-escalation signal must use the raw, uncapped PAR
    // consensus source (same rawParBySourceId used by the rookie fallback above),
    // not the display-capped FANTASY_PAR_ROWS `livePar`. PAR_POSITION_LIMITS caps
    // WR at 78/TE at 18 for board-display purposes only; both Tyreek Hill (WR
    // consensus rank 124) and Brandon Aiyuk (WR consensus rank 119) fall outside
    // that cap, so `livePar` is undefined for them and the "Team": "FA" signal
    // that is supposed to catch Hill's free-agent status would silently never
    // fire if this read the capped array instead.
    const rawParForAvailability = row.parMatch.found && row.parMatch.sourceId ? rawParBySourceId.get(row.parMatch.sourceId) : undefined;

    const baselineSeasons = baselineByPlayerId.get(playerId) ?? [];
    const historicalBaselineOptions = computeHistoricalBaselineOptions(baselineSeasons);
    const historicalBaselinePpg = historicalBaselineOptions["recency-weighted-min-sample"].ppg;
    const fallback = fallbackByPlayerId.get(playerId) ?? null;
    const effectiveBaseline = selectEffectiveBaseline(historicalBaselinePpg, fallback?.ppg ?? null);
    const selectedBaselinePpg = effectiveBaseline.ppg;

    const usageSeasons = (usageByPlayerId.get(playerId) ?? []) as never;
    const usageFactor = computeUsageAdjustment(position, usageSeasons);
    const teamFactor = computeTeamAdjustment(team ? teamEnvByTeam.get(team) : undefined, leagueAvgImpliedTotal);
    const fpaFactor = computeFpaAdjustment(team ? fpaByTeamPosition.get(`${team}|${position}`) : undefined, leagueAvgPointsAllowedByPosition[position]);
    const marketFactor = computeMarketAdjustment(team ? marketByTeam.get(team) : undefined, leagueAvgRemainingImpliedTotal);

    const rawCandidates = buildShadowCandidates(selectedBaselinePpg, { usage: usageFactor, team: teamFactor, fpa: fpaFactor, market: marketFactor });
    const replacementPpg = replacementByPosition[position];
    const status = statusByPlayerId.get(playerId)!;
    const appliedTreatment = STATUS_TREATMENT_APPLIED_TO_ARTIFACT;

    const candidates = rawCandidates.map((candidate) => {
      const baseConfidence = capConfidenceForBaselineSource(shadowConfidence(candidate), effectiveBaseline.source);
      const treatmentForCandidate = applyStatusTreatments(status.category as never, baseConfidence, candidate.projectedPpg)[appliedTreatment];
      return {
        candidate: candidate.candidate,
        label: SHADOW_CANDIDATE_LABELS[candidate.candidate],
        projectedPpg: candidate.projectedPpg,
        shadowParPerGame: candidate.projectedPpg == null ? null : candidate.projectedPpg - replacementPpg,
        confidence: baseConfidence,
        effectiveConfidence: treatmentForCandidate.effectiveConfidence,
        excludedFromShadowRank: treatmentForCandidate.excludedFromRank,
        adjustmentBreakdown: candidate.adjustmentBreakdown,
        combinedFactor: candidate.combinedFactor,
        combinedFactorClamped: candidate.combinedFactorClamped,
        availableInputs: candidate.availableInputs,
        missingInputs: candidate.missingInputs,
      };
    });

    const candidateE = rawCandidates.find((c) => c.candidate === "E")!;
    const candidateEBaseConfidence = capConfidenceForBaselineSource(shadowConfidence(candidateE), effectiveBaseline.source);
    const statusTreatmentComparison = applyStatusTreatments(status.category as never, candidateEBaseConfidence, candidateE.projectedPpg);

    // ---- Phase 3C: normalized availability (nflverse status + PAR-consensus team) and rank-eligibility policies ----
    const normalizedAvailability = buildNormalizedAvailability({
      status,
      parTeam: rawParForAvailability?.Team ?? null,
      parTeamAsOf: PAR_CONSENSUS_AS_OF,
      workbookTeam: team,
    });
    const eligibilityByPolicy = Object.fromEntries(
      ELIGIBILITY_POLICY_IDS.map((policy) => [
        policy,
        evaluateRankEligibility(policy, normalizedAvailability.availabilityStatus, normalizedAvailability.currentRosterVerified),
      ]),
    ) as Record<EligibilityPolicyId, ReturnType<typeof evaluateRankEligibility>>;
    const appliedEligibility = eligibilityByPolicy[APPLIED_ELIGIBILITY_POLICY];
    const projectionEligible = isProjectionEligible(candidateE.projectedPpg);

    const rawRefinedCandidates = buildRefinedCandidates(selectedBaselinePpg, fpaFactor);
    const refinedCandidates = rawRefinedCandidates.map((candidate) => {
      const treatment = applyStatusTreatments(status.category as never, "high", candidate.projectedPpg)[appliedTreatment];
      const baseConfidence: "high" | "medium" | "low" | "none" =
        candidate.projectedPpg == null ? "none" : capConfidenceForBaselineSource("high", effectiveBaseline.source);
      return {
        candidate: candidate.candidate,
        label: candidate.label,
        projectedPpg: candidate.projectedPpg,
        shadowParPerGame: candidate.projectedPpg == null ? null : candidate.projectedPpg - replacementPpg,
        confidence: baseConfidence,
        effectiveConfidence: candidate.projectedPpg == null ? "none" : capConfidenceForBaselineSource(treatment.effectiveConfidence, effectiveBaseline.source),
        excludedFromShadowRank: treatment.excludedFromRank,
        availableInputs: candidate.availableInputs,
        missingInputs: candidate.missingInputs,
      };
    });

    return {
      canonicalPlayerId: playerId,
      player: row.player,
      position,
      team,
      currentRosPpg: livePar?.projectedPpg ?? null,
      currentParPerGame: livePar?.parPerGame ?? null,
      currentOverallRank: liveRanking?.overallRank ?? row.overallRank,
      currentPositionRank: liveRanking?.positionRank ?? null,
      currentProjectionRank: liveRanking?.projectionRank ?? null,
      adp: liveRanking?.adp ?? null,
      historicalBaselineOptions,
      selectedBaselineWeighting: "recency-weighted-min-sample",
      baselineSource: effectiveBaseline.source,
      fallback,
      status,
      statusTreatmentComparison,
      availabilityStatus: normalizedAvailability.availabilityStatus,
      availabilitySource: normalizedAvailability.availabilitySource,
      availabilityAsOf: normalizedAvailability.availabilityAsOf,
      availabilityConfidence: normalizedAvailability.availabilityConfidence,
      currentRosterVerified: normalizedAvailability.currentRosterVerified,
      statusConflict: normalizedAvailability.statusConflict,
      statusConflictReason: normalizedAvailability.statusConflictReason,
      projectionEligible,
      rankEligible: appliedEligibility.rankEligible,
      rankEligibilityReason: appliedEligibility.rankEligibilityReason,
      eligibilityByPolicy,
      candidates,
      refinedCandidates,
      shadowPositionRank: null, // filled in below
    };
  });

  // ---- PROMOTED F2 ranks. F2 projected PPG was converted above using the
  // existing position replacement PPG; the resulting F2 shadow PAR/G is the
  // sole sorting authority. R2 eligibility withholds ranks without changing
  // projected PPG or PAR/G. Candidate E remains research-only. ----
  const promotedRanksByPlayerId = new Map(
    computeF2PromotedModelRanks(playersOut).map((rank) => [rank.canonicalPlayerId, rank]),
  );

  const playersWithModelRank = playersOut.map((p) => ({
    ...p,
    shadowPositionRank: promotedRanksByPlayerId.get(p.canonicalPlayerId)?.shadowPositionRank ?? null,
    shadowModelRank: promotedRanksByPlayerId.get(p.canonicalPlayerId)?.shadowModelRank ?? null,
  }));

  // ---- Diagnostics ----
  const withCandidateE = playersWithModelRank
    .map((p) => ({ p, e: p.candidates.find((c) => c.candidate === "E")! }))
    .filter((row) => row.e.projectedPpg != null && row.p.currentRosPpg != null);

  const byPpgDelta = withCandidateE
    .map((row) => ({ player: row.p.player, position: row.p.position, currentRosPpg: row.p.currentRosPpg, candidateEPpg: row.e.projectedPpg, delta: (row.e.projectedPpg as number) - (row.p.currentRosPpg as number) }))
    .sort((a, b) => b.delta - a.delta);
  const largestPositivePpgChanges = byPpgDelta.slice(0, 15);
  const largestNegativePpgChanges = [...byPpgDelta].sort((a, b) => a.delta - b.delta).slice(0, 15);

  const withRankComparison = playersWithModelRank.filter((p) => p.currentOverallRank != null && p.shadowModelRank != null);
  const rankDisagreements = withRankComparison
    .map((p) => ({ player: p.player, position: p.position, currentOverallRank: p.currentOverallRank, shadowModelRank: p.shadowModelRank, delta: (p.shadowModelRank as number) - (p.currentOverallRank as number) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 20);

  const playersWithAdp = playersWithModelRank.filter((p) => p.adp != null);
  const adpCoverage = { playersWithAdp: playersWithAdp.length, totalPlayers: playersWithModelRank.length, note: "The live JKB workbook (src/data/fantasyRankings2026.ts) does not populate the adp field for any of the 250 rows; ADP-based disagreement diagnostics cannot be computed from approved data and are not fabricated here." };

  const lowConfidencePlayers = playersWithModelRank
    .filter((p) => {
      const e = p.candidates.find((c) => c.candidate === "E")!;
      return e.confidence === "low" || e.confidence === "none";
    })
    .map((p) => ({ player: p.player, position: p.position, candidateEConfidence: p.candidates.find((c) => c.candidate === "E")!.confidence }));

  const missingMajorInputsPlayers = playersWithModelRank
    .filter((p) => p.baselineSource === "none")
    .map((p) => ({ player: p.player, position: p.position, reason: "no historical baseline in any of the three tested weightings AND no live PAR-consensus fallback projection resolved for this canonical identity" }));

  // ---- Phase 3C: board-wide availability status counts ----
  const availabilityStatusCounts: Record<string, number> = {};
  for (const p of playersWithModelRank) availabilityStatusCounts[p.availabilityStatus] = (availabilityStatusCounts[p.availabilityStatus] ?? 0) + 1;
  const currentRosterVerifiedCounts = {
    verified: playersWithModelRank.filter((p) => p.currentRosterVerified).length,
    notVerified: playersWithModelRank.filter((p) => !p.currentRosterVerified).length,
  };
  const statusConflicts = playersWithModelRank
    .filter((p) => p.statusConflict)
    .map((p) => ({ player: p.player, position: p.position, availabilityStatus: p.availabilityStatus, reason: p.statusConflictReason }));

  // ---- Phase 3C: rank F2 under an arbitrary eligibility predicate, using the
  // same authority and deterministic ordering as the promoted fields. ----
  function rankUnder(predicate: (p: (typeof playersWithModelRank)[number]) => boolean) {
    const rankByPlayerId = new Map(
      computeF2PromotedModelRanks(
        playersWithModelRank.map((player) => ({ ...player, rankEligible: predicate(player) })),
      ).map((rank) => [rank.canonicalPlayerId, rank.shadowModelRank]),
    );
    return playersWithModelRank
      .filter((player) => rankByPlayerId.has(player.canonicalPlayerId))
      .map((player) => ({ playerId: player.canonicalPlayerId, player: player.player, position: player.position, rank: rankByPlayerId.get(player.canonicalPlayerId)! }))
      .sort((a, b) => a.rank - b.rank);
  }

  const legacyRanked = rankUnder((p) => !p.candidates.find((c) => c.candidate === "E")!.excludedFromShadowRank);
  const rankedByPolicy: Record<EligibilityPolicyId, ReturnType<typeof rankUnder>> = {
    R1: rankUnder((p) => p.eligibilityByPolicy.R1.rankEligible),
    R2: rankUnder((p) => p.eligibilityByPolicy.R2.rankEligible),
    R3: rankUnder((p) => p.eligibilityByPolicy.R3.rankEligible),
  };

  function topN(list: ReturnType<typeof rankUnder>, n: number) {
    return new Set(list.filter((row) => row.rank <= n).map((row) => row.playerId));
  }
  function setDiff(a: Set<string>, b: Set<string>, byId: Map<string, string>) {
    return [...a].filter((id) => !b.has(id)).map((id) => byId.get(id) ?? id);
  }
  const playerNameById = new Map(playersWithModelRank.map((p) => [p.canonicalPlayerId, p.player]));

  const eligibilityPolicyComparison = {
    policies: ELIGIBILITY_POLICY_LABELS,
    note: "Each policy's top25/50/100 is an independently recomputed F2 ranking (F2 shadowParPerGame, descending with deterministic ties) filtered by that policy's rankEligible -- not a re-slice of the artifact's own R2-based shadowModelRank. 'legacy' applies the pre-Phase-3C Treatment D (released/suspended only) eligibility rule to the same F2 ranking authority for comparison.",
    counts: { legacy: legacyRanked.length, R1: rankedByPolicy.R1.length, R2: rankedByPolicy.R2.length, R3: rankedByPolicy.R3.length },
    top25: { legacy: topN(legacyRanked, 25).size, R1: topN(rankedByPolicy.R1, 25).size, R2: topN(rankedByPolicy.R2, 25).size, R3: topN(rankedByPolicy.R3, 25).size },
    top50: { legacy: topN(legacyRanked, 50).size, R1: topN(rankedByPolicy.R1, 50).size, R2: topN(rankedByPolicy.R2, 50).size, R3: topN(rankedByPolicy.R3, 50).size },
    top100: { legacy: topN(legacyRanked, 100).size, R1: topN(rankedByPolicy.R1, 100).size, R2: topN(rankedByPolicy.R2, 100).size, R3: topN(rankedByPolicy.R3, 100).size },
    removedFromTop100VsLegacy: {
      R1: setDiff(topN(legacyRanked, 100), topN(rankedByPolicy.R1, 100), playerNameById),
      R2: setDiff(topN(legacyRanked, 100), topN(rankedByPolicy.R2, 100), playerNameById),
      R3: setDiff(topN(legacyRanked, 100), topN(rankedByPolicy.R3, 100), playerNameById),
    },
    removedFromTop25VsR2: {
      R3vsR2: setDiff(topN(rankedByPolicy.R2, 25), topN(rankedByPolicy.R3, 25), playerNameById),
    },
  };

  const tracedPlayerNames = ["Tyreek Hill", "Stefon Diggs", "Deebo Samuel", "Brandon Aiyuk"];
  const rankById = (list: ReturnType<typeof rankUnder>, playerId: string) => list.find((row) => row.playerId === playerId)?.rank ?? null;
  const tracedPlayers = playersWithModelRank
    .filter((p) => tracedPlayerNames.includes(p.player))
    .map((p) => ({
      player: p.player,
      canonicalPlayerId: p.canonicalPlayerId,
      availabilityStatus: p.availabilityStatus,
      availabilitySource: p.availabilitySource,
      availabilityAsOf: p.availabilityAsOf,
      availabilityConfidence: p.availabilityConfidence,
      currentRosterVerified: p.currentRosterVerified,
      statusConflict: p.statusConflict,
      statusConflictReason: p.statusConflictReason,
      currentOverallRank: p.currentOverallRank,
      legacyShadowRank: rankById(legacyRanked, p.canonicalPlayerId),
      rankUnderPolicy: {
        R1: { rank: rankById(rankedByPolicy.R1, p.canonicalPlayerId), ...p.eligibilityByPolicy.R1 },
        R2: { rank: rankById(rankedByPolicy.R2, p.canonicalPlayerId), ...p.eligibilityByPolicy.R2 },
        R3: { rank: rankById(rankedByPolicy.R3, p.canonicalPlayerId), ...p.eligibilityByPolicy.R3 },
      },
    }));

  // ---- Phase 3C: every player in the CURRENT shadow top 100 (this artifact's own R2-based shadowModelRank) who is not clearly ACTIVE on a verified 2026 roster ----
  const top100NonActiveOrUnverified = playersWithModelRank
    .filter((p) => p.shadowModelRank != null && p.shadowModelRank <= 100 && (p.availabilityStatus !== "ACTIVE" || !p.currentRosterVerified))
    .map((p) => ({ player: p.player, position: p.position, shadowModelRank: p.shadowModelRank, availabilityStatus: p.availabilityStatus, currentRosterVerified: p.currentRosterVerified }))
    .sort((a, b) => (a.shadowModelRank as number) - (b.shadowModelRank as number));

  // ---- Leakage-safe backtest, fold 2: train on 2023-2024, label = actual 2025 PPG ----
  function buildBacktestCases(trainSeasons: readonly number[], labelSeason: number, seasonsByPlayerId: Map<string, Array<{ season: number; gamesPlayed: number; totalFantasyPoints: number; ppg: number }>>): BacktestCase[] {
    return resolved
      .map((row) => {
        const playerId = row.identity.playerId as string;
        const allSeasons = seasonsByPlayerId.get(playerId) ?? [];
        const trainingSeasons = allSeasons.filter((s) => trainSeasons.includes(s.season));
        const labelSeasonRow = allSeasons.find((s) => s.season === labelSeason);
        if (!trainingSeasons.length || !labelSeasonRow) return null;
        const trainingUsageSeasons = ((usageByPlayerId.get(playerId) ?? []) as Array<{ season: number }>).filter((s) => trainSeasons.includes(s.season));
        return {
          playerId,
          position: row.position,
          trainingSeasons,
          trainingUsageSeasons: trainingUsageSeasons as never,
          labelSeason,
          labelPpg: labelSeasonRow.ppg,
        } satisfies BacktestCase;
      })
      .filter((c): c is BacktestCase => c !== null);
  }

  const fold2Cases = buildBacktestCases([2023, 2024], 2025, baselineByPlayerId);
  const backtestFold2 = runHistoricalBaselineBacktest(fold2Cases, [2023, 2024]);

  // ---- Leakage-safe backtest, fold 1: train on 2022-2023, label = actual 2024 PPG.
  // 2022 is not part of the committed Phase 2 historical-baseline.json (fixed
  // to 2023-2025 by that artifact's own scope), so a merged season list is
  // built here purely for this fold: the freshly-read 2022 aggregate plus
  // the already-approved 2023/2024 rows from historical-baseline.json. ----
  const seasonsWithFold1ByPlayerId = new Map<string, Array<{ season: number; gamesPlayed: number; totalFantasyPoints: number; ppg: number }>>();
  for (const player of baseline.players) {
    const seasons = [...player.seasons];
    const season2022 = season2022ByPlayer.get(player.playerId);
    if (season2022) seasons.unshift({ season: 2022, gamesPlayed: season2022.gamesPlayed, totalFantasyPoints: season2022.totalFantasyPoints, ppg: season2022.totalFantasyPoints / season2022.gamesPlayed });
    seasonsWithFold1ByPlayerId.set(player.playerId, seasons.sort((a, b) => a.season - b.season));
  }
  const fold1Cases = buildBacktestCases([2022, 2023], 2024, seasonsWithFold1ByPlayerId);
  const backtestFold1 = runHistoricalBaselineBacktest(fold1Cases, [2022, 2023]);

  // ---- Aggregate the two folds (recency-weighted-min-sample, no usage) by pooling raw prediction pairs ----
  const foldAggregate = aggregateFolds([
    { labelSeason: 2024, trainingSeasons: [2022, 2023], pairs: selectedWeightingPairs(fold1Cases) },
    { labelSeason: 2025, trainingSeasons: [2023, 2024], pairs: selectedWeightingPairs(fold2Cases) },
  ]);

  // ---- Usage adjustment cap experiment (Phase 3B Task 3), run on fold 2 (the larger/more recent fold) ----
  const usageCapExperiment = runUsageCapExperiment(fold2Cases, USAGE_CAPS_TO_TEST);

  // ---- FPA historical validation availability (Phase 3B Task 5) ----
  const fpaHistoricalValidationAvailability = {
    available: false,
    reason: "Only one season of points-allowed-by-position data is cached in this repo (data/fantasy/points-allowed-2025.csv, season 2025 only). A leakage-safe FPA backtest needs at least two seasons -- one to derive a training-period 'remaining schedule as of a past point in time' signal, one to label actual outcomes against it -- and no earlier season's points-allowed-by-position source exists in this repo to fabricate that from. FPA therefore remains an unvalidated contextual signal: full 100% remaining-schedule coverage (see schedule-fpa-context.json) describes data completeness, not predictive validation.",
  };

  // ---- Write artifact ----
  const artifact = {
    schemaVersion: SHADOW_PROJECTION_SCHEMA_VERSION,
    season: 2026,
    shadow: true,
    generatedAt: options.generatedAt,
    provenance: {
      inputAsOf: options.generatedAt,
      sources: [
        { name: "identity-crosswalk", path: "data/fantasy/ros-research/2026/identity-crosswalk.json", hash: sha(identityText) },
        { name: "historical-baseline", path: "data/fantasy/ros-research/2026/historical-baseline.json", hash: sha(baselineText) },
        { name: "usage-role-context", path: "data/fantasy/ros-research/2026/usage-role-context.json", hash: sha(usageText) },
        { name: "team-environment", path: "data/fantasy/ros-research/2026/team-environment.json", hash: sha(teamEnvText) },
        { name: "schedule-fpa-context", path: "data/fantasy/ros-research/2026/schedule-fpa-context.json", hash: sha(fpaText) },
        { name: "schedule-scoring-environment", path: "data/fantasy/ros-research/2026/schedule-scoring-environment.json", hash: sha(marketText) },
      ],
      liveComparisonSources: [
        { name: "fantasy-rankings-2026", path: "src/data/fantasyRankings2026.ts", note: "Read-only; used only to populate currentOverallRank/currentPositionRank/currentProjectionRank/adp comparison columns. Never modified." },
        { name: "par-consensus-2026", path: "data/fantasy/2026-par-consensus.json", note: "Read-only via FANTASY_PAR_ROWS; used only to populate currentRosPpg/currentParPerGame comparison columns and replacement levels. Never modified." },
      ],
      notes: [
        "SHADOW-ONLY research artifact. Nothing in this file changes Overall Rank, POS RK, PAR/G, Projection RK, replacement levels, projectedFantasyPoints, or any Weekly Fantasy artifact.",
        "shadowPositionRank and shadowModelRank are promoted research ranks derived only from F2 shadowParPerGame (descending); Candidate E remains experimental and cannot drive either rank field. See methodology.shadowRanking below.",
      ],
    },
    methodology: {
      candidates: SHADOW_CANDIDATE_INPUTS,
      candidateLabels: SHADOW_CANDIDATE_LABELS,
      historicalBaselineWeightingsTested: {
        "latest-season": "Most recent season with any game data. No weighting.",
        "recency-weighted": `Weighted average of every available season's PPG using ${JSON.stringify(RECENCY_WEIGHTS)}, renormalized to sum to 1 over whichever seasons are present.`,
        "recency-weighted-min-sample": `Same recency weights, but a season only counts if it has at least ${MIN_SAMPLE_GAMES} games played; if none qualify, falls back to a plain equal-weighted average of all available seasons and flags minSampleFallbackApplied.`,
      },
      selectedBaselineWeighting: "recency-weighted-min-sample",
      selectionRationale: "Selected by leakage-safe backtest (see validation.historicalBaselineBacktest below), not chosen arbitrarily -- see MAE/RMSE/bias/correlation per weighting.",
      adjustmentCaps: ADJUSTMENT_CAPS,
      combinedAdjustmentCap: COMBINED_ADJUSTMENT_CAP,
      usageSignalFieldByPosition: USAGE_SIGNAL_FIELD_BY_POSITION,
      minMarketGamesForTeamFactor: MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
      fpaDirection: "Higher average points-allowed across the remaining slate = more favourable remaining schedule for that position (source rank 1 = allowed the most); a team-position average above the league-position average yields a factor > 1.",
      leagueAverages: { impliedTeamTotal: leagueAvgImpliedTotal, remainingImpliedTeamTotal: leagueAvgRemainingImpliedTotal, pointsAllowedByPosition: leagueAvgPointsAllowedByPosition },
      shadowRanking: `F2 is the sole promoted rank authority: recency-weighted-min-sample historical PPG, with PAR-consensus fallback only for players with no history, and no PPG change from status. Existing position replacement PPG is subtracted from F2 projected PPG to produce F2 shadowParPerGame. shadowPositionRank orders that value within position; shadowModelRank orders it across all positions, descending with currentOverallRank then canonicalPlayerId as deterministic tie-breakers. Players not rankEligible under the applied Phase 3C policy (${APPLIED_ELIGIBILITY_POLICY}) receive neither rank, but retain unchanged F2 projectedPpg/shadowParPerGame. Candidate E remains experimental and cannot drive either promoted rank field.`,
      statusAvailability: {
        primarySource: { name: "roster_weekly_2026", path: "data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv", week: latestRosterWeek, asOf: roster2026Entry.retrievedDateUtc, note: "Current-season, week-specific roster snapshot. Used first for every player." },
        fallbackSource: { name: "players", path: "data/nfl/nflverse/players/players.csv", asOf: playersEntry.retrievedDateUtc, note: "Master player table's status field (not season-specific; may be stale). Used ONLY when a player is absent from the current-season snapshot above." },
        categories: ["active", "reserve", "released", "suspended", "otherUnavailable", "unknown"],
        primaryCodeMap: { ACT: "active", CUT: "released", RES: "reserve", RET: "otherUnavailable" },
        masterTableCodeMap: { ACT: "active", CUT: "released", RLS: "released", RES: "reserve", PUP: "reserve", SUS: "suspended", RET: "otherUnavailable", DEV: "otherUnavailable" },
        unmappedCodesPolicy: "Any status code not in the two maps above resolves to 'unknown' rather than a guess (e.g. roster_weekly's E14, or players.csv's RSN/NWT/RSR/EXE/LB/INA -- none has a confirmed nflverse meaning in this repo).",
        treatments: STATUS_TREATMENT_LABELS,
        confidenceCeilingByCategory: STATUS_CONFIDENCE_CEILING,
        projectionModifierByCategory: STATUS_PROJECTION_MODIFIER,
        modelRankExclusionByCategory: STATUS_MODEL_RANK_EXCLUSION,
        appliedTreatment: STATUS_TREATMENT_APPLIED_TO_ARTIFACT,
        appliedTreatmentRationale: "Treatment D (confidence ceiling + Model Rank exclusion) is applied to every candidate's effectiveConfidence/excludedFromShadowRank in this artifact. Treatment B's PPG modifier is NOT applied by default: it cannot be backtested against a real 2026 outcome (the season has not been played), so scaling projectedPpg by an unvalidated, judgment-based factor would silently inject an unverified assumption into the one number this artifact reports as a projection. All four treatments are still computed per player (see statusTreatmentComparison) so the choice is auditable.",
      },
      refinedCandidates: {
        labels: REFINED_CANDIDATE_LABELS,
        usageOmittedRationale: "Usage was tested at caps of 0%, 5%, 10%, and 15% (see validation.usageCapExperiment) and found to worsen MAE monotonically at every cap, overall and at every position, on the available backtest fold -- it is not a validated component and is intentionally excluded from every refined candidate.",
        teamMarketOmittedRationale: "Team/market are excluded from the refined set: unvalidated (see validation.teamFpaMarketBacktestAvailability) AND coverage-limited to ~18.75% of team-games this early in the offseason -- the combination Phase 3's Jefferson-vs-Lamb comparison flagged as producing coverage-driven noise, not signal.",
      },
      rookieFallback: {
        appliesTo: "Players with zero seasons in historical-baseline.json (all three baseline weightings null).",
        source: "par-consensus-2026-projected-ppg",
        sourceDescription: "Live FANTASY_PAR_ROWS[...].projectedPpg (data/fantasy/2026-par-consensus.json '2026 Projected PPG' column), read-only. Already covers rookies with the same 'authoritative-derived (source-implied scoring)' Projection Status as every other row.",
        neverOverridesHistoricalModel: true,
        confidenceRule: "A candidate built on the fallback baseline can never report 'high' confidence (see capConfidenceForBaselineSource), regardless of how many adjustment inputs resolved -- it is not the validated historical-model methodology.",
      },
    },
    validation: {
      historicalBaselineBacktest: backtestFold2,
      backtestFolds: {
        fold1: { labelSeason: 2024, trainingSeasons: [2022, 2023], result: backtestFold1 },
        fold2: { labelSeason: 2025, trainingSeasons: [2023, 2024], result: backtestFold2 },
        aggregate: foldAggregate,
        note: "Two leakage-safe folds are possible from the committed nflverse player-week caches (2022-2025); there is no season before 2022 cached in this repo to run a third fold without fabricating a source. 'aggregate' pools raw prediction/actual pairs across both folds (recency-weighted-min-sample, no usage adjustment) and recomputes MAE/RMSE/bias/correlation from the pooled set -- not an average of the two folds' MAEs.",
      },
      usageCapExperiment: { ...usageCapExperiment, note: "Tests the recency-weighted-min-sample baseline with no usage adjustment and each cap applied, overall and by position, on fold 2 (train 2023-2024, label actual 2025 PPG). QB is always neutral (no reliable passing-volume signal in the current usage source) and is reported as such rather than omitted." },
      fpaHistoricalValidationAvailability,
      teamFpaMarketBacktestAvailability: "Team/market: not backtested -- their inputs are tied to the specific 2026 remaining schedule and current market snapshot; no historical season in this dataset has an analogous 'remaining schedule as of a past point in time' record to backtest against. FPA: see fpaHistoricalValidationAvailability above -- also not backtested, for a different reason (only one season of points-allowed-by-position source data exists in this repo). Diagnostics in this artifact (largest PPG/rank disagreements, low-confidence players) are the available check for these inputs.",
    },
    diagnostics: {
      largestPositivePpgChangesVsCurrentRos: largestPositivePpgChanges,
      largestNegativePpgChangesVsCurrentRos: largestNegativePpgChanges,
      largestOverallRankDisagreements: rankDisagreements,
      adpCoverage,
      lowConfidencePlayers,
      playersMissingHistoricalBaseline: missingMajorInputsPlayers,
      appliedEligibilityPolicy: APPLIED_ELIGIBILITY_POLICY,
      eligibilityPolicyComparison,
      tracedPlayers,
      top100NonActiveOrUnverified,
      statusConflicts,
    },
    counts: {
      totalResolvedPlayers: resolved.length,
      playersWithAnyCandidate: playersWithModelRank.filter((p) => p.candidates.some((c) => c.projectedPpg != null)).length,
      playersWithNoBaseline: missingMajorInputsPlayers.length,
      playersLowOrNoConfidenceOnCandidateE: lowConfidencePlayers.length,
      statusAvailability: statusAvailability.counts,
      rookieFallback: rookieFallback.counts,
      playersUsingFallbackBaseline: playersWithModelRank.filter((p) => p.baselineSource === "fallback-par-consensus").length,
      playersExcludedFromShadowRankByStatus: playersWithModelRank.filter((p) => p.candidates.find((c) => c.candidate === "E")!.excludedFromShadowRank).length,
      availabilityStatus: availabilityStatusCounts,
      currentRosterVerified: currentRosterVerifiedCounts,
      playersExcludedFromRankByAppliedPolicy: playersWithModelRank.filter((p) => !p.rankEligible).length,
    },
    players: playersWithModelRank,
  };

  writeAtomic(join(RESEARCH_DIR, "shadow-ros-projections.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log("Shadow projections generated:", artifact.counts);
}

main();
