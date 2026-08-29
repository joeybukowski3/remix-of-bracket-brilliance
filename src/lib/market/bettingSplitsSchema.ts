import { z } from "zod";
import {
  BETTING_SPLITS_SCHEMA_VERSION,
  type BettingSplitSnapshot,
} from "./bettingSplitsTypes";

const identifierSchema = z.string().trim().min(1);
const isoTimestampSchema = z.string().datetime({ offset: true });
const nullableIsoTimestampSchema = isoTimestampSchema.nullable();
const nullableFiniteNumberSchema = z.number().finite().nullable();
const nullablePercentageSchema = z.number().finite().min(0).max(100).nullable();

export const bettingSpreadSplitSchema = z.object({
  openingHomeLine: nullableFiniteNumberSchema,
  openingAwayLine: nullableFiniteNumberSchema,
  currentHomeLine: nullableFiniteNumberSchema,
  currentAwayLine: nullableFiniteNumberSchema,
  homeBetPct: nullablePercentageSchema,
  awayBetPct: nullablePercentageSchema,
  homeMoneyPct: nullablePercentageSchema,
  awayMoneyPct: nullablePercentageSchema,
}).strict();

export const bettingTotalSplitSchema = z.object({
  openingLine: nullableFiniteNumberSchema,
  currentLine: nullableFiniteNumberSchema,
  overBetPct: nullablePercentageSchema,
  underBetPct: nullablePercentageSchema,
  overMoneyPct: nullablePercentageSchema,
  underMoneyPct: nullablePercentageSchema,
}).strict();

export const bettingMoneylineSplitSchema = z.object({
  openingHomePrice: nullableFiniteNumberSchema,
  openingAwayPrice: nullableFiniteNumberSchema,
  currentHomePrice: nullableFiniteNumberSchema,
  currentAwayPrice: nullableFiniteNumberSchema,
  homeBetPct: nullablePercentageSchema,
  awayBetPct: nullablePercentageSchema,
  homeMoneyPct: nullablePercentageSchema,
  awayMoneyPct: nullablePercentageSchema,
}).strict();

export const bettingSplitSnapshotSchema = z.object({
  schemaVersion: z.literal(BETTING_SPLITS_SCHEMA_VERSION),
  league: z.enum(["nfl", "cfb"]),
  season: z.number().int().min(2000),
  week: z.number().int().positive().nullable(),
  jkbGameId: identifierSchema,
  awayTeamId: identifierSchema,
  homeTeamId: identifierSchema,
  kickoffUtc: nullableIsoTimestampSchema,
  provider: identifierSchema,
  providerGameId: identifierSchema,
  sportsbook: identifierSchema.nullable(),
  capturedAt: isoTimestampSchema,
  providerCreatedAt: nullableIsoTimestampSchema,
  providerLastSeenAt: nullableIsoTimestampSchema,
  spread: bettingSpreadSplitSchema.nullable(),
  total: bettingTotalSplitSchema.nullable(),
  moneyline: bettingMoneylineSplitSchema.nullable(),
  contentHash: identifierSchema.nullable(),
  firstObservedAt: isoTimestampSchema,
  lastObservedAt: isoTimestampSchema,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.awayTeamId === snapshot.homeTeamId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["homeTeamId"],
      message: "Home and away team IDs must be different.",
    });
  }

  if (Date.parse(snapshot.firstObservedAt) > Date.parse(snapshot.lastObservedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastObservedAt"],
      message: "lastObservedAt cannot precede firstObservedAt.",
    });
  }
});

export function parseBettingSplitSnapshot(value: unknown): BettingSplitSnapshot {
  return bettingSplitSnapshotSchema.parse(value) as BettingSplitSnapshot;
}

export function safeParseBettingSplitSnapshot(
  value: unknown,
): z.SafeParseReturnType<unknown, BettingSplitSnapshot> {
  return bettingSplitSnapshotSchema.safeParse(value) as z.SafeParseReturnType<unknown, BettingSplitSnapshot>;
}
