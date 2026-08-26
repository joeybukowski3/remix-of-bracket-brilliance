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
import { FANTASY_PAR_ROWS } from "../src/lib/fantasy/parRankings.ts";
import {
  buildShadowCandidates,
  computeFpaAdjustment,
  computeHistoricalBaselineOptions,
  computeMarketAdjustment,
  computeTeamAdjustment,
  computeUsageAdjustment,
  shadowConfidence,
} from "../src/lib/fantasy/rosResearch/shadowProjection.ts";
import { runHistoricalBaselineBacktest, type BacktestCase } from "../src/lib/fantasy/rosResearch/shadowBacktest.ts";
import {
  SHADOW_PROJECTION_SCHEMA_VERSION,
  ADJUSTMENT_CAPS,
  COMBINED_ADJUSTMENT_CAP,
  MIN_SAMPLE_GAMES,
  MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
  RECENCY_WEIGHTS,
  SHADOW_CANDIDATE_INPUTS,
  SHADOW_CANDIDATE_LABELS,
  USAGE_SIGNAL_FIELD_BY_POSITION,
} from "../src/lib/fantasy/rosResearch/shadowProjectionConfig.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_DIR = join(ROOT, "data", "fantasy", "ros-research", "2026");
const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }

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
    candidates: Array<{
      candidate: string;
      label: string;
      projectedPpg: number | null;
      shadowParPerGame: number | null;
      confidence: string;
      adjustmentBreakdown: unknown;
      combinedFactor: number | null;
      combinedFactorClamped: boolean;
      availableInputs: string[];
      missingInputs: string[];
    }>;
    shadowPositionRank: number | null; // based on candidate E shadowParPerGame
  };

  const playersOut: PlayerOut[] = resolved.map((row) => {
    const playerId = row.identity.playerId as string;
    const position = row.position;
    const team = row.team;
    const liveRanking = rankingsByOverallRank.get(row.overallRank);
    const livePar = row.parMatch.found && row.parMatch.sourceId ? parBySourceId.get(row.parMatch.sourceId) : undefined;

    const baselineSeasons = baselineByPlayerId.get(playerId) ?? [];
    const historicalBaselineOptions = computeHistoricalBaselineOptions(baselineSeasons);
    const selectedBaselinePpg = historicalBaselineOptions["recency-weighted-min-sample"].ppg;

    const usageSeasons = (usageByPlayerId.get(playerId) ?? []) as never;
    const usageFactor = computeUsageAdjustment(position, usageSeasons);
    const teamFactor = computeTeamAdjustment(team ? teamEnvByTeam.get(team) : undefined, leagueAvgImpliedTotal);
    const fpaFactor = computeFpaAdjustment(team ? fpaByTeamPosition.get(`${team}|${position}`) : undefined, leagueAvgPointsAllowedByPosition[position]);
    const marketFactor = computeMarketAdjustment(team ? marketByTeam.get(team) : undefined, leagueAvgRemainingImpliedTotal);

    const rawCandidates = buildShadowCandidates(selectedBaselinePpg, { usage: usageFactor, team: teamFactor, fpa: fpaFactor, market: marketFactor });
    const replacementPpg = replacementByPosition[position];

    const candidates = rawCandidates.map((candidate) => ({
      candidate: candidate.candidate,
      label: SHADOW_CANDIDATE_LABELS[candidate.candidate],
      projectedPpg: candidate.projectedPpg,
      shadowParPerGame: candidate.projectedPpg == null ? null : candidate.projectedPpg - replacementPpg,
      confidence: shadowConfidence(candidate),
      adjustmentBreakdown: candidate.adjustmentBreakdown,
      combinedFactor: candidate.combinedFactor,
      combinedFactorClamped: candidate.combinedFactorClamped,
      availableInputs: candidate.availableInputs,
      missingInputs: candidate.missingInputs,
    }));

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
      candidates,
      shadowPositionRank: null, // filled in below
    };
  });

  // ---- SHADOW-ONLY position rank, based on Candidate E's shadowParPerGame (descending), same convention the live PAR rank uses ----
  for (const position of POSITIONS) {
    const ranked = playersOut
      .filter((p) => p.position === position)
      .map((p) => ({ p, parPerGame: p.candidates.find((c) => c.candidate === "E")!.shadowParPerGame }))
      .filter((row) => row.parPerGame != null)
      .sort((a, b) => (b.parPerGame as number) - (a.parPerGame as number));
    ranked.forEach((row, index) => { row.p.shadowPositionRank = index + 1; });
  }

  // ---- SHADOW-ONLY cross-position Model Rank, based on Candidate E's shadowParPerGame (descending), across all positions ----
  const modelRanked = playersOut
    .map((p) => ({ p, parPerGame: p.candidates.find((c) => c.candidate === "E")!.shadowParPerGame }))
    .filter((row) => row.parPerGame != null)
    .sort((a, b) => (b.parPerGame as number) - (a.parPerGame as number));
  const shadowModelRankByPlayerId = new Map(modelRanked.map((row, index) => [row.p.canonicalPlayerId, index + 1]));

  const playersWithModelRank = playersOut.map((p) => ({
    ...p,
    shadowModelRank: shadowModelRankByPlayerId.get(p.canonicalPlayerId) ?? null,
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
    .filter((p) => p.candidates.find((c) => c.candidate === "A")!.projectedPpg == null)
    .map((p) => ({ player: p.player, position: p.position, reason: "no historical baseline in any of the three tested weightings (no 2023-2025 game data resolved for this canonical identity)" }));

  // ---- Leakage-safe backtest: train on 2023-2024, label = actual 2025 PPG ----
  const backtestCases: BacktestCase[] = resolved
    .map((row) => {
      const playerId = row.identity.playerId as string;
      const allSeasons = baselineByPlayerId.get(playerId) ?? [];
      const trainingSeasons = allSeasons.filter((s) => s.season < 2025);
      const labelSeasonRow = allSeasons.find((s) => s.season === 2025);
      if (!trainingSeasons.length || !labelSeasonRow) return null;
      const trainingUsageSeasons = ((usageByPlayerId.get(playerId) ?? []) as Array<{ season: number }>).filter((s) => s.season < 2025);
      return {
        playerId,
        position: row.position,
        trainingSeasons,
        trainingUsageSeasons: trainingUsageSeasons as never,
        labelSeason: 2025,
        labelPpg: labelSeasonRow.ppg,
      } satisfies BacktestCase;
    })
    .filter((c): c is BacktestCase => c !== null);
  const backtest = runHistoricalBaselineBacktest(backtestCases, [2023, 2024]);

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
        "shadowPositionRank and shadowModelRank are SHADOW-ONLY ranks derived from Candidate E's shadowParPerGame (descending); see methodology.shadowRanking below.",
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
      shadowRanking: "shadowPositionRank: rank within position by Candidate E shadowParPerGame, descending (same convention as the live PAR rank sort). shadowModelRank: SHADOW-ONLY cross-position rank by Candidate E shadowParPerGame, descending, across all resolved players with a non-null Candidate E value.",
    },
    validation: {
      historicalBaselineBacktest: backtest,
      teamFpaMarketBacktestAvailability: "Not backtested. Team/FPA/market adjustment inputs are tied to the specific 2026 remaining schedule and current market snapshot; no historical season in this dataset has an analogous 'remaining schedule as of a past point in time' record to backtest against. Reported explicitly rather than fabricated. Diagnostics in this artifact (largest PPG/rank disagreements, low-confidence players) are the available check for those inputs.",
    },
    diagnostics: {
      largestPositivePpgChangesVsCurrentRos: largestPositivePpgChanges,
      largestNegativePpgChangesVsCurrentRos: largestNegativePpgChanges,
      largestOverallRankDisagreements: rankDisagreements,
      adpCoverage,
      lowConfidencePlayers,
      playersMissingHistoricalBaseline: missingMajorInputsPlayers,
    },
    counts: {
      totalResolvedPlayers: resolved.length,
      playersWithAnyCandidate: playersWithModelRank.filter((p) => p.candidates.some((c) => c.projectedPpg != null)).length,
      playersWithNoBaseline: missingMajorInputsPlayers.length,
      playersLowOrNoConfidenceOnCandidateE: lowConfidencePlayers.length,
    },
    players: playersWithModelRank,
  };

  writeAtomic(join(RESEARCH_DIR, "shadow-ros-projections.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log("Shadow projections generated:", artifact.counts);
}

main();
