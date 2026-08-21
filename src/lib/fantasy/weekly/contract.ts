import { z } from "zod";
import { FANTASY_SCORING_FORMAT, FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";

const nullableFinite = z.number().finite().nullable();
const nullableNonNegative = z.number().finite().nonnegative().nullable();
const nullableShare = z.number().finite().min(0).max(1).nullable();

export const WeeklyFantasyUsageSchema = z.object({
  offensiveSnaps: nullableNonNegative,
  snapShare: nullableShare,
  passAttempts: nullableNonNegative,
  completions: nullableNonNegative,
  rushAttempts: nullableNonNegative,
  targets: nullableNonNegative,
  receptions: nullableNonNegative,
  receivingAirYards: nullableNonNegative,
  targetShare: nullableShare,
  airYardsShare: nullableShare,
  routes: z.null(),
  routeParticipation: z.null(),
  redZoneTouches: z.null(),
  goalLineTouches: z.null(),
  redZoneTargets: z.null(),
}).strict();

export const WeeklyFantasyModelInputSchema = z.object({
  schemaVersion: z.literal("weekly-fantasy-model-input-v1"),
  season: z.number().int().min(2000),
  week: z.number().int().min(1).max(22),
  scoringFormat: z.literal(FANTASY_SCORING_FORMAT),
  scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  player: z.object({
    playerId: z.string().regex(/^gsis:\S+$/),
    playerName: z.string().trim().min(1),
    position: z.enum(["QB", "RB", "WR", "TE"]),
    externalIds: z.object({
      gsis: z.string().trim().min(1),
      pfr: z.string().trim().min(1).nullable(),
      espn: z.string().trim().min(1).nullable(),
    }).strict(),
    starterStatus: z.literal("unknown"),
  }).strict(),
  team: z.string().regex(/^[a-z]{2,3}$/).nullable(),
  opponent: z.string().regex(/^[a-z]{2,3}$/).nullable(),
  homeAway: z.enum(["home", "away", "neutral", "bye", "unknown"]),
  baselineProjectedPpg: nullableNonNegative,
  market: z.object({
    homeSpread: nullableFinite,
    total: nullableNonNegative,
    impliedTeamTotal: nullableNonNegative,
    sourceAsOf: z.string().datetime().nullable(),
  }).strict(),
  usage: WeeklyFantasyUsageSchema,
  availability: z.object({
    status: z.enum(["active", "questionable", "doubtful", "out", "reserve", "unknown"]),
    practiceStatus: z.enum(["DID_NOT_PARTICIPATE", "LIMITED", "FULL"]).nullable(),
    sourceSeason: z.number().int().nullable(),
    sourceWeek: z.number().int().nullable(),
    sourceAsOf: z.string().datetime().nullable(),
    isStale: z.boolean(),
  }).strict(),
  matchup: z.object({
    grade: z.enum(["Great", "Good", "Neutral", "Tough", "Very Tough"]).nullable(),
    fpaSeason: z.number().int().nullable(),
    fpaRank: z.number().int().min(1).max(32).nullable(),
    fantasyPointsAllowed: nullableNonNegative,
  }).strict(),
  teamContext: z.object({
    offensiveEpaPerPlay: nullableFinite,
    defensiveEpaPerPlayAllowed: nullableFinite,
    offensiveSuccessRate: nullableShare,
    defensiveSuccessRateAllowed: nullableShare,
    paceRank: z.number().int().min(1).max(32).nullable(),
  }).strict(),
  provenance: z.array(z.object({
    fieldGroup: z.string().trim().min(1),
    source: z.string().trim().min(1),
    sourceSeason: z.number().int().nullable(),
    sourceWeek: z.number().int().nullable(),
    sourceAsOf: z.string().datetime().nullable(),
    generatedAt: z.string().datetime(),
    schemaVersion: z.string().trim().min(1),
  }).strict()).min(1),
  missingInputs: z.array(z.string().trim().min(1)),
  staleInputs: z.array(z.string().trim().min(1)),
}).strict().superRefine((row, context) => {
  if (row.homeAway === "bye" && row.opponent !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["opponent"], message: "Bye rows cannot have an opponent." });
  }
  if ((row.homeAway === "home" || row.homeAway === "away" || row.homeAway === "neutral") && !row.opponent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["opponent"], message: "Scheduled rows require an opponent." });
  }
});

export type WeeklyFantasyModelInput = z.infer<typeof WeeklyFantasyModelInputSchema>;

export function parseWeeklyFantasyModelInput(value: unknown): WeeklyFantasyModelInput {
  return WeeklyFantasyModelInputSchema.parse(value);
}
