import { z } from "zod";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FantasyAvailability } from "./availability";
import { selectWeeklyFantasyBaseline, type BaselineSource } from "./baseline";
import { resolveWeeklyEligibility } from "./eligibility";
import { FANTASY_SCORING_FORMAT, FANTASY_SCORING_VERSION } from "./scoring";

export const WEEKLY_FANTASY_RANKING_SCHEMA_VERSION = "weekly-fantasy-ranking-v1" as const;
export const WEEKLY_FANTASY_ARTIFACT_SCHEMA_VERSION = "weekly-fantasy-ranking-artifact-v1" as const;
export const WEEKLY_FANTASY_AUTHORITY_VERSION = "weekly-fantasy-authority-v1.0.0" as const;
export const WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES = 2 as const;

export const weeklyFantasyReasonCodeSchema = z.enum([
  "PRESEASON_ROS_BASELINE", "CURRENT_SEASON_BASELINE", "INSUFFICIENT_HISTORY",
  "BYE", "OUT", "RESERVE", "IDENTITY_UNRESOLVED", "AVAILABILITY_STALE",
  "AVAILABILITY_UNKNOWN", "SOURCE_FALLBACK", "AUTHORITY_TRANSITION",
]);

const nullableFinite = z.number().finite().nullable();
const provenanceSchema = z.object({
  source: z.string().min(1), sourceVersion: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  inputAsOf: z.string().datetime(),
}).strict();

export const weeklyFantasyRankingSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_RANKING_SCHEMA_VERSION),
  season: z.number().int().min(2000), week: z.number().int().min(1).max(18),
  scoringFormat: z.literal(FANTASY_SCORING_FORMAT), scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  position: z.enum(["QB", "RB", "WR", "TE"]), positionRank: z.number().int().positive(),
  playerId: z.string().regex(/^gsis:\S+$/), playerName: z.string().min(1),
  team: z.string().regex(/^[a-z]{2,3}$/), opponent: z.string().regex(/^[a-z]{2,3}$/),
  homeAway: z.enum(["home", "away", "neutral"]), eligible: z.literal(true),
  baselineAuthority: z.enum(["preseason-ros", "current-season", "fallback"]),
  baselineValue: z.number().finite(), baselineProjectedPpg: nullableFinite,
  currentSeasonPpg: nullableFinite, priorGamesCount: z.number().int().nonnegative(),
  matchupGrade: z.enum(["Great", "Good", "Neutral", "Tough", "Very Tough"]).nullable(),
  fpaRank: z.number().int().min(1).max(32).nullable(), fantasyPointsAllowed: nullableFinite,
  marketTotal: nullableFinite, impliedTeamTotal: nullableFinite,
  teamEnvironment: z.record(z.string(), nullableFinite),
  availability: z.enum(["active", "questionable", "doubtful", "out", "reserve", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]), reasons: z.array(weeklyFantasyReasonCodeSchema),
  sourceVersion: z.literal(WEEKLY_FANTASY_AUTHORITY_VERSION), provenance: provenanceSchema,
  inputAsOf: z.string().datetime(), generatedAt: z.string().datetime(),
  diagnostics: z.object({
    sourceAuthorityChangedThisWeek: z.boolean(), previousRank: z.number().int().positive().nullable(),
    absoluteRankMovement: z.number().int().nonnegative().nullable(), transitionFlag: z.boolean(),
  }).strict(),
}).strict();

const excludedSchema = z.object({
  playerKey: z.string().min(1), playerName: z.string().min(1), position: z.enum(["QB", "RB", "WR", "TE"]),
  reasons: z.array(weeklyFantasyReasonCodeSchema).min(1),
}).strict();

export const weeklyFantasyRankingArtifactSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_ARTIFACT_SCHEMA_VERSION),
  authorityVersion: z.literal(WEEKLY_FANTASY_AUTHORITY_VERSION),
  season: z.number().int().min(2000), week: z.number().int().min(1).max(18),
  generatedAt: z.string().datetime(), inputAsOf: z.string().datetime(),
  scoringFormat: z.literal(FANTASY_SCORING_FORMAT), scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  provenance: z.array(provenanceSchema).min(1),
  rankings: z.object({
    QB: z.array(weeklyFantasyRankingSchema), RB: z.array(weeklyFantasyRankingSchema),
    WR: z.array(weeklyFantasyRankingSchema), TE: z.array(weeklyFantasyRankingSchema),
  }).strict(),
  diagnostics: z.object({
    eligibleRows: z.number().int().nonnegative(), excludedRows: z.number().int().nonnegative(),
    excluded: z.array(excludedSchema), authorityTransitions: z.number().int().nonnegative(),
    authorityCounts: z.object({ preseasonRos: z.number().int().nonnegative(), currentSeason: z.number().int().nonnegative(), fallback: z.number().int().nonnegative() }).strict(),
    missingSources: z.array(z.string()), staleSources: z.array(z.string()),
    rankingPolicy: z.literal("baseline-value-desc; player-id-lexical"),
  }).strict(),
}).strict();

export type WeeklyFantasyRanking = z.infer<typeof weeklyFantasyRankingSchema>;
export type WeeklyFantasyRankingArtifact = z.infer<typeof weeklyFantasyRankingArtifactSchema>;
export type WeeklyFantasyReasonCode = z.infer<typeof weeklyFantasyReasonCodeSchema>;

export type ProductionRankingCandidate = {
  playerKey: string;
  identity: { resolved: boolean; playerId: string | null; playerName: string; position: FantasyPosition };
  team: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | "bye" | "unknown";
  availability: FantasyAvailability;
  historyGames: number;
  preseasonRos: BaselineSource | null;
  currentSeason: BaselineSource | null;
  historicalFallback: BaselineSource | null;
  context: {
    matchupGrade: WeeklyFantasyRanking["matchupGrade"];
    fpaRank: number | null; fantasyPointsAllowed: number | null;
    marketTotal: number | null; impliedTeamTotal: number | null;
    teamEnvironment: Record<string, number | null>;
  };
  previousRank?: number | null;
  previousAuthority?: WeeklyFantasyRanking["baselineAuthority"] | null;
};

export type ProductionAuthorityInput = {
  season: number; week: number; generatedAt: string; inputAsOf: string;
  candidates: readonly ProductionRankingCandidate[];
  provenance: WeeklyFantasyRankingArtifact["provenance"];
  missingSources?: readonly string[]; staleSources?: readonly string[];
};

export function assertProductionHistoryCutoff(
  rows: readonly { season: number; week: number }[],
  target: { season: number; week: number },
): void {
  if (rows.some((row) => row.season > target.season || (row.season === target.season && row.week >= target.week))) {
    throw new Error("Production history contains target-week or future-week information");
  }
}

export function compareWeeklyBaselineRank(
  left: { baselineValue: number; preseasonProjectedPpg: number | null; preseasonRosRank: number | null; playerId: string },
  right: { baselineValue: number; preseasonProjectedPpg: number | null; preseasonRosRank: number | null; playerId: string },
): number {
  return right.baselineValue - left.baselineValue ||
    left.playerId.localeCompare(right.playerId);
}

function exclusionReasons(candidate: ProductionRankingCandidate): WeeklyFantasyReasonCode[] {
  const eligibility = resolveWeeklyEligibility({
    identityResolved: candidate.identity.resolved,
    homeAway: candidate.homeAway,
    availabilityStatus: candidate.availability.status,
  });
  return eligibility.reasons.map((reason) => ({
    bye: "BYE", out: "OUT", reserve: "RESERVE", "unresolved-identity": "IDENTITY_UNRESOLVED",
  })[reason] as WeeklyFantasyReasonCode);
}

/** Sole V1 production ranker. Context fields are copied only after baseline-only sorting. */
export function buildWeeklyFantasyRankingArtifact(input: ProductionAuthorityInput): WeeklyFantasyRankingArtifact {
  const excluded: WeeklyFantasyRankingArtifact["diagnostics"]["excluded"] = [];
  const prepared: Array<{ candidate: ProductionRankingCandidate; baseline: NonNullable<ReturnType<typeof selectWeeklyFantasyBaseline>>; value: number; reasons: WeeklyFantasyReasonCode[]; confidence: "high" | "medium" | "low" }> = [];

  for (const candidate of input.candidates) {
    const reasons = exclusionReasons(candidate);
    if (reasons.length || !candidate.identity.playerId || !candidate.team || !candidate.opponent || !["home", "away", "neutral"].includes(candidate.homeAway)) {
      if (!reasons.length) reasons.push("IDENTITY_UNRESOLVED");
      excluded.push({ playerKey: candidate.playerKey, playerName: candidate.identity.playerName, position: candidate.identity.position, reasons });
      continue;
    }
    const baseline = selectWeeklyFantasyBaseline({
      season: input.season, week: input.week, playerId: candidate.identity.playerId,
      position: candidate.identity.position, historyGames: candidate.historyGames,
      currentSeason: candidate.currentSeason, preseasonRos: candidate.preseasonRos,
      historicalFallback: candidate.historicalFallback,
      minimumHistoryGames: WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES, generatedAt: input.generatedAt,
    });
    if (!baseline) {
      excluded.push({ playerKey: candidate.playerKey, playerName: candidate.identity.playerName, position: candidate.identity.position, reasons: ["SOURCE_FALLBACK"] });
      continue;
    }
    const preferredCurrentMissing = candidate.historyGames >= WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES && !candidate.currentSeason;
    const value = baseline.sourceAuthority === "current-season"
      ? candidate.currentSeason!.projectedPpg
      : baseline.sourceAuthority === "preseason-ros"
        ? candidate.preseasonRos!.projectedPpg
        : candidate.historicalFallback!.projectedPpg;
    if (value == null) {
      excluded.push({ playerKey: candidate.playerKey, playerName: candidate.identity.playerName, position: candidate.identity.position, reasons: ["SOURCE_FALLBACK"] });
      continue;
    }
    reasons.push(baseline.sourceAuthority === "current-season" ? "CURRENT_SEASON_BASELINE" : baseline.sourceAuthority === "preseason-ros" ? "PRESEASON_ROS_BASELINE" : "SOURCE_FALLBACK");
    if (candidate.historyGames < WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES) reasons.push("INSUFFICIENT_HISTORY");
    if (preferredCurrentMissing) reasons.push("SOURCE_FALLBACK");
    const transition = baseline.sourceAuthority === "current-season" && candidate.historyGames === WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES;
    if (transition) reasons.push("AUTHORITY_TRANSITION");
    if (candidate.availability.isStale) reasons.push("AVAILABILITY_STALE");
    if (candidate.availability.status === "unknown") reasons.push("AVAILABILITY_UNKNOWN");
    const confidence = candidate.availability.isStale || candidate.availability.status === "unknown" || preferredCurrentMissing || baseline.sourceAuthority === "fallback"
      ? "low" : baseline.confidence;
    prepared.push({ candidate, baseline, value, reasons: [...new Set(reasons)], confidence });
  }

  const rankings = Object.fromEntries((["QB", "RB", "WR", "TE"] as FantasyPosition[]).map((position) => {
    const rows = prepared.filter((row) => row.candidate.identity.position === position).sort((left, right) => compareWeeklyBaselineRank({
      baselineValue: left.value, preseasonProjectedPpg: left.candidate.preseasonRos?.projectedPpg ?? null,
      preseasonRosRank: left.candidate.preseasonRos?.rank ?? null, playerId: left.candidate.identity.playerId!,
    }, {
      baselineValue: right.value, preseasonProjectedPpg: right.candidate.preseasonRos?.projectedPpg ?? null,
      preseasonRosRank: right.candidate.preseasonRos?.rank ?? null, playerId: right.candidate.identity.playerId!,
    }));
    return [position, rows.map(({ candidate, baseline, value, reasons, confidence }, index): WeeklyFantasyRanking => {
      const positionRank = index + 1;
      const changed = candidate.previousAuthority != null && candidate.previousAuthority !== baseline.sourceAuthority;
      const transitionFlag = baseline.sourceAuthority === "current-season" && candidate.historyGames === WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES;
      return weeklyFantasyRankingSchema.parse({
        schemaVersion: WEEKLY_FANTASY_RANKING_SCHEMA_VERSION,
        season: input.season, week: input.week, scoringFormat: FANTASY_SCORING_FORMAT, scoringVersion: FANTASY_SCORING_VERSION,
        position, positionRank, playerId: candidate.identity.playerId, playerName: candidate.identity.playerName,
        team: candidate.team, opponent: candidate.opponent, homeAway: candidate.homeAway, eligible: true,
        baselineAuthority: baseline.sourceAuthority, baselineValue: value,
        baselineProjectedPpg: candidate.preseasonRos?.projectedPpg ?? null,
        currentSeasonPpg: baseline.sourceAuthority === "current-season" ? value : null,
        priorGamesCount: candidate.historyGames,
        ...candidate.context, availability: candidate.availability.status, confidence, reasons,
        sourceVersion: WEEKLY_FANTASY_AUTHORITY_VERSION, provenance: { ...baseline.provenance, inputAsOf: baseline.inputAsOf },
        inputAsOf: baseline.inputAsOf, generatedAt: input.generatedAt,
        diagnostics: {
          sourceAuthorityChangedThisWeek: changed,
          previousRank: candidate.previousRank ?? null,
          absoluteRankMovement: candidate.previousRank == null ? null : Math.abs(positionRank - candidate.previousRank),
          transitionFlag,
        },
      });
    })];
  })) as WeeklyFantasyRankingArtifact["rankings"];

  const allRows = Object.values(rankings).flat();
  return weeklyFantasyRankingArtifactSchema.parse({
    schemaVersion: WEEKLY_FANTASY_ARTIFACT_SCHEMA_VERSION, authorityVersion: WEEKLY_FANTASY_AUTHORITY_VERSION,
    season: input.season, week: input.week, generatedAt: input.generatedAt, inputAsOf: input.inputAsOf,
    scoringFormat: FANTASY_SCORING_FORMAT, scoringVersion: FANTASY_SCORING_VERSION,
    provenance: input.provenance, rankings,
    diagnostics: {
      eligibleRows: allRows.length, excludedRows: excluded.length, excluded,
      authorityTransitions: allRows.filter((row) => row.diagnostics.transitionFlag).length,
      authorityCounts: {
        preseasonRos: allRows.filter((row) => row.baselineAuthority === "preseason-ros").length,
        currentSeason: allRows.filter((row) => row.baselineAuthority === "current-season").length,
        fallback: allRows.filter((row) => row.baselineAuthority === "fallback").length,
      },
      missingSources: [...(input.missingSources ?? [])].sort(), staleSources: [...(input.staleSources ?? [])].sort(),
      rankingPolicy: "baseline-value-desc; player-id-lexical",
    },
  });
}
