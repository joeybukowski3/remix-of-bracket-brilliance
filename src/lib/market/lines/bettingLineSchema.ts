import { z } from "zod";
import {
  BETTING_LINE_SCHEMA_VERSION,
  type BettingLineSnapshot,
} from "./bettingLineTypes";

/**
 * Runtime validation for {@link BettingLineSnapshot}. Every value that crosses a
 * system boundary (provider decode output, a JSONL history line) is parsed
 * through here before it is trusted.
 */

const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be an ISO timestamp");

const nullableIso = isoTimestamp.nullable();

const finiteNumberOrNull = z
  .number()
  .refine((value) => Number.isFinite(value), "must be a finite number")
  .nullable();

const spreadSchema = z
  .object({
    homeLine: finiteNumberOrNull,
    awayLine: finiteNumberOrNull,
    homePrice: finiteNumberOrNull,
    awayPrice: finiteNumberOrNull,
  })
  .strict();

const totalSchema = z
  .object({
    line: finiteNumberOrNull,
    overPrice: finiteNumberOrNull,
    underPrice: finiteNumberOrNull,
  })
  .strict();

const moneylineSchema = z
  .object({
    homePrice: finiteNumberOrNull,
    awayPrice: finiteNumberOrNull,
  })
  .strict();

const nonEmpty = z.string().trim().min(1);

export const bettingLineSnapshotSchema = z
  .object({
    schemaVersion: z.literal(BETTING_LINE_SCHEMA_VERSION),
    league: z.enum(["nfl"]),
    season: z.number().int().gte(2000).lte(2100),
    week: z.number().int().positive().nullable(),
    jkbGameId: nonEmpty,
    provider: nonEmpty,
    providerEventId: nonEmpty,
    sportsbook: nonEmpty,
    capturedAt: isoTimestamp,
    providerUpdatedAt: nullableIso,
    homeTeamId: nonEmpty,
    awayTeamId: nonEmpty,
    kickoffUtc: nullableIso,
    spread: spreadSchema.nullable(),
    total: totalSchema.nullable(),
    moneyline: moneylineSchema.nullable(),
    contentHash: z.string().min(1).nullable(),
    firstObservedAt: isoTimestamp,
    lastObservedAt: isoTimestamp,
  })
  .strict();

export function safeParseBettingLineSnapshot(
  value: unknown,
): z.SafeParseReturnType<unknown, BettingLineSnapshot> {
  return bettingLineSnapshotSchema.safeParse(value) as z.SafeParseReturnType<
    unknown,
    BettingLineSnapshot
  >;
}

export function parseBettingLineSnapshot(value: unknown): BettingLineSnapshot {
  return bettingLineSnapshotSchema.parse(value) as BettingLineSnapshot;
}
