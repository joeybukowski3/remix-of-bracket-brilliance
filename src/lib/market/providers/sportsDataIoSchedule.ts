/**
 * WU6 provider slate discovery: decode a verified SportsDataIO NFL `Score[]`
 * payload into provider game identities, then narrow it to the games that
 * plausibly belong to a caller-supplied canonical JKB slate before any
 * betting-splits request is made.
 *
 * Verified against the SportsDataIO NFL v3 Scores OpenAPI (`Score` schema,
 * retrieved 2026-08-30). Relevant fields:
 *   ScoreID (int), Season (int), SeasonType (int: 1=REG,2=PRE,3=POST),
 *   Week (int|null), AwayTeam / HomeTeam (abbrev "Key"), AwayTeamID / HomeTeamID,
 *   DateTime (US Eastern), DateTimeUTC (UTC), Day (US Eastern).
 *
 * Kickoff resolution prefers the provider's own `DateTimeUTC`; only when it is
 * absent do we fall back to converting the Eastern `DateTime` through
 * {@link easternLocalToUtcIso}. A machine-local `Date` parse is never used.
 */

import { z } from "zod";
import {
  EasternTimeConversionError,
  easternLocalToUtcIso,
} from "../timezone/easternToUtc";
import type { BettingLeague } from "../bettingSplitsTypes";
import type { CanonicalBettingGame } from "../gameJoinTypes";
import { DEFAULT_BETTING_SPLIT_KICKOFF_TOLERANCE_MS } from "../gameJoinTypes";

export class SportsDataIoScheduleDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportsDataIoScheduleDecodeError";
  }
}

const SEASON_TYPE_BY_ID: Readonly<Record<number, "REG" | "PRE" | "POST">> = {
  1: "REG",
  2: "PRE",
  3: "POST",
};

/** Provider-native game identity, before any join to canonical JKB games. */
export type SportsDataIoScheduleGame = {
  league: BettingLeague;
  providerGameId: string;
  season: number;
  seasonType: "REG" | "PRE" | "POST" | null;
  week: number | null;
  awayTeamKey: string | null;
  homeTeamKey: string | null;
  awayTeamProviderId: string | null;
  homeTeamProviderId: string | null;
  kickoffUtc: string | null;
  /** How {@link kickoffUtc} was derived, for run-report QA evidence. */
  kickoffSource: "provider-utc" | "eastern-converted" | "unavailable";
};

const nflScoreSchema = z
  .object({
    ScoreID: z.number().int(),
    Season: z.number().int(),
    SeasonType: z.number().int().nullable().optional(),
    Week: z.number().int().nullable().optional(),
    AwayTeam: z.string().nullable().optional(),
    HomeTeam: z.string().nullable().optional(),
    AwayTeamID: z.number().int().nullable().optional(),
    HomeTeamID: z.number().int().nullable().optional(),
    DateTime: z.string().nullable().optional(),
    DateTimeUTC: z.string().nullable().optional(),
    Day: z.string().nullable().optional(),
  })
  .passthrough();

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function resolveKickoff(row: z.infer<typeof nflScoreSchema>): {
  kickoffUtc: string | null;
  kickoffSource: SportsDataIoScheduleGame["kickoffSource"];
} {
  const utc = trimToNull(row.DateTimeUTC);
  if (utc !== null) {
    // SportsDataIO renders DateTimeUTC without an explicit offset ("2026-09-13T20:25:00")
    // but documents the value as UTC; pin it to UTC rather than the machine zone.
    const pinned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(utc) ? utc : `${utc}Z`;
    const parsed = Date.parse(pinned);
    if (Number.isFinite(parsed)) {
      return { kickoffUtc: new Date(parsed).toISOString(), kickoffSource: "provider-utc" };
    }
  }
  const eastern = trimToNull(row.DateTime) ?? trimToNull(row.Day);
  if (eastern !== null) {
    try {
      return {
        kickoffUtc: easternLocalToUtcIso(eastern),
        kickoffSource: "eastern-converted",
      };
    } catch (error) {
      if (!(error instanceof EasternTimeConversionError)) throw error;
    }
  }
  return { kickoffUtc: null, kickoffSource: "unavailable" };
}

/**
 * Decode a raw SportsDataIO NFL `ScoresByWeek` payload. Throws
 * {@link SportsDataIoScheduleDecodeError} when the payload is not an array of
 * objects with the required identity fields — the collector fails closed rather
 * than guessing an incomplete slate.
 */
export function decodeSportsDataIoNflSchedule(
  payload: unknown,
): SportsDataIoScheduleGame[] {
  if (!Array.isArray(payload)) {
    throw new SportsDataIoScheduleDecodeError(
      "Expected a JSON array of NFL Score objects.",
    );
  }

  return payload.map((entry, index) => {
    const parsed = nflScoreSchema.safeParse(entry);
    if (!parsed.success) {
      throw new SportsDataIoScheduleDecodeError(
        `Score row ${index} failed validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
          .join("; ")}.`,
      );
    }
    const row = parsed.data;
    const { kickoffUtc, kickoffSource } = resolveKickoff(row);
    return {
      league: "nfl",
      providerGameId: String(row.ScoreID),
      season: row.Season,
      seasonType:
        row.SeasonType == null ? null : SEASON_TYPE_BY_ID[row.SeasonType] ?? null,
      week: row.Week ?? null,
      awayTeamKey: trimToNull(row.AwayTeam),
      homeTeamKey: trimToNull(row.HomeTeam),
      awayTeamProviderId: row.AwayTeamID == null ? null : String(row.AwayTeamID),
      homeTeamProviderId: row.HomeTeamID == null ? null : String(row.HomeTeamID),
      kickoffUtc,
      kickoffSource,
    };
  });
}

export type ScheduleCandidateOptions = {
  /** Half-window for a provider↔canonical kickoff match. Defaults to WU3's 6h. */
  kickoffToleranceMs?: number;
  /**
   * Normalizes a provider team key ("SEA") and a canonical team id ("sea") onto
   * a common token so they can be compared. Injected so this module stays
   * league-agnostic.
   */
  normalizeTeam: (value: string | null) => string | null;
};

export type ScheduleCandidate = {
  providerGame: SportsDataIoScheduleGame;
  canonicalGame: CanonicalBettingGame;
  kickoffDeltaMinutes: number | null;
  matchedBy: "teams+kickoff" | "teams-only";
};

export type ScheduleCandidateSelection = {
  candidates: ScheduleCandidate[];
  /** Provider games that matched nothing on the canonical slate. */
  unmatchedProviderGames: SportsDataIoScheduleGame[];
};

function kickoffDeltaMinutes(
  a: string | null,
  b: string | null,
): number | null {
  if (a === null || b === null) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(left - right) / 60_000;
}

/**
 * Reduce a decoded provider slate to the games worth requesting splits for.
 *
 * A provider game is a candidate for a canonical game when, after normalization,
 * its two team tokens equal the canonical game's `{homeTeamId, awayTeamId}` in
 * either orientation (neutral-site reversal is tolerated here; the WU3 join makes
 * the authoritative orientation decision) AND, when both kickoffs are known, they
 * fall inside `kickoffToleranceMs`. Team identity is required; kickoff is a
 * tie-breaker, not a gate, because provider and canonical schedules occasionally
 * disagree by more than the window on early-week TBD slots.
 */
export function selectScheduleCandidates(
  providerGames: readonly SportsDataIoScheduleGame[],
  canonicalGames: readonly CanonicalBettingGame[],
  options: ScheduleCandidateOptions,
): ScheduleCandidateSelection {
  const toleranceMinutes =
    Math.max(0, options.kickoffToleranceMs ?? DEFAULT_BETTING_SPLIT_KICKOFF_TOLERANCE_MS) /
    60_000;

  const canonical = canonicalGames.map((game) => ({
    game,
    home: options.normalizeTeam(game.homeTeamId),
    away: options.normalizeTeam(game.awayTeamId),
  }));

  const candidates: ScheduleCandidate[] = [];
  const unmatchedProviderGames: SportsDataIoScheduleGame[] = [];

  for (const providerGame of providerGames) {
    const providerHome =
      options.normalizeTeam(providerGame.homeTeamKey) ??
      options.normalizeTeam(providerGame.homeTeamProviderId);
    const providerAway =
      options.normalizeTeam(providerGame.awayTeamKey) ??
      options.normalizeTeam(providerGame.awayTeamProviderId);

    if (providerHome === null || providerAway === null) {
      unmatchedProviderGames.push(providerGame);
      continue;
    }

    const teamMatches = canonical.filter(({ home, away }) => {
      if (home === null || away === null) return false;
      const direct = home === providerHome && away === providerAway;
      const reversed = home === providerAway && away === providerHome;
      return direct || reversed;
    });

    if (teamMatches.length === 0) {
      unmatchedProviderGames.push(providerGame);
      continue;
    }

    let matchedAny = false;
    for (const { game } of teamMatches) {
      const delta = kickoffDeltaMinutes(providerGame.kickoffUtc, game.kickoffUtc);
      if (delta !== null && delta > toleranceMinutes) continue;
      candidates.push({
        providerGame,
        canonicalGame: game,
        kickoffDeltaMinutes: delta,
        matchedBy: delta === null ? "teams-only" : "teams+kickoff",
      });
      matchedAny = true;
    }

    if (!matchedAny) unmatchedProviderGames.push(providerGame);
  }

  return { candidates, unmatchedProviderGames };
}
