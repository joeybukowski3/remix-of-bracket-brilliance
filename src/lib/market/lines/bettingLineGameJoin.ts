import { THE_ODDS_API_PROVIDER } from "../providers/theOddsApiClient";
import type { NormalizedTheOddsApiBookLine } from "../providers/theOddsApiWire";
import type { CanonicalBettingGame } from "./canonicalBettingGame";
import { safeParseBettingLineSnapshot } from "./bettingLineSchema";
import {
  BETTING_LINE_SCHEMA_VERSION,
  type BettingLineLeague,
  type BettingLineMoneyline,
  type BettingLineSnapshot,
  type BettingLineSpread,
} from "./bettingLineTypes";

/**
 * WU8 canonical join: attach a provider book line to a JKB canonical game.
 *
 * Identity is JKB's — never the provider event id. A row matches a canonical
 * game only when both resolved team ids line up (directly, or reversed for a
 * neutral-site game) AND the provider `commence_time` is within
 * `kickoffToleranceMs` of the canonical kickoff. Zero matches -> unmatched;
 * more than one -> ambiguous. Neither is persisted.
 */

export const DEFAULT_BETTING_LINE_KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1_000;

export type BettingLineTeamResolver = (teamName: string | null) => string | null;

export type BettingLineJoinEvidence = {
  providerEventId: string;
  providerHomeTeam: string;
  providerAwayTeam: string;
  resolvedHomeTeamId: string | null;
  resolvedAwayTeamId: string | null;
  providerKickoff: string;
  candidateGameIds: string[];
  kickoffDeltaMinutes: number | null;
  neutralSiteOrientationReversed: boolean;
};

export type BettingLineJoinResult =
  | { status: "matched"; snapshot: BettingLineSnapshot; evidence: BettingLineJoinEvidence }
  | {
      status: "unmatched";
      reason:
        | "TEAM_MAPPING_FAILED"
        | "NO_CANONICAL_GAME"
        | "KICKOFF_OUTSIDE_TOLERANCE";
      evidence: BettingLineJoinEvidence;
    }
  | { status: "ambiguous"; reason: "MULTIPLE_CANONICAL_GAMES"; evidence: BettingLineJoinEvidence }
  | {
      status: "rejected";
      reason: "INVALID_FINAL_SNAPSHOT";
      evidence: BettingLineJoinEvidence;
      validationIssues: string[];
    };

type OrientedCandidate = {
  game: CanonicalBettingGame;
  reversed: boolean;
  kickoffDeltaMinutes: number | null;
};

function kickoffDeltaMinutes(providerKickoff: string, canonicalKickoff: string | null): number | null {
  const provider = Date.parse(providerKickoff);
  const canonical = canonicalKickoff === null ? NaN : Date.parse(canonicalKickoff);
  if (!Number.isFinite(provider) || !Number.isFinite(canonical)) return null;
  return Math.abs(provider - canonical) / 60_000;
}

function swapSpread(spread: BettingLineSpread | null): BettingLineSpread | null {
  if (spread === null) return null;
  return {
    homeLine: spread.awayLine,
    awayLine: spread.homeLine,
    homePrice: spread.awayPrice,
    awayPrice: spread.homePrice,
  };
}

function swapMoneyline(moneyline: BettingLineMoneyline | null): BettingLineMoneyline | null {
  if (moneyline === null) return null;
  return { homePrice: moneyline.awayPrice, awayPrice: moneyline.homePrice };
}

export function joinTheOddsApiBookLine(input: {
  row: NormalizedTheOddsApiBookLine;
  league: BettingLineLeague;
  canonicalGames: readonly CanonicalBettingGame[];
  resolveTeam: BettingLineTeamResolver;
  capturedAt: string;
  kickoffToleranceMs?: number;
}): BettingLineJoinResult {
  const { row, league, canonicalGames, resolveTeam, capturedAt } = input;
  const toleranceMinutes =
    Math.max(0, input.kickoffToleranceMs ?? DEFAULT_BETTING_LINE_KICKOFF_TOLERANCE_MS) / 60_000;

  const resolvedHomeTeamId = resolveTeam(row.homeTeamName);
  const resolvedAwayTeamId = resolveTeam(row.awayTeamName);

  const evidence: BettingLineJoinEvidence = {
    providerEventId: row.providerEventId,
    providerHomeTeam: row.homeTeamName,
    providerAwayTeam: row.awayTeamName,
    resolvedHomeTeamId,
    resolvedAwayTeamId,
    providerKickoff: row.commenceTimeUtc,
    candidateGameIds: [],
    kickoffDeltaMinutes: null,
    neutralSiteOrientationReversed: false,
  };

  if (resolvedHomeTeamId === null || resolvedAwayTeamId === null) {
    return { status: "unmatched", reason: "TEAM_MAPPING_FAILED", evidence };
  }

  const oriented: OrientedCandidate[] = [];
  for (const game of canonicalGames) {
    if (game.league !== league) continue;
    const direct =
      game.homeTeamId === resolvedHomeTeamId && game.awayTeamId === resolvedAwayTeamId;
    const reversed =
      game.neutralSite &&
      game.homeTeamId === resolvedAwayTeamId &&
      game.awayTeamId === resolvedHomeTeamId;
    if (!direct && !reversed) continue;
    oriented.push({
      game,
      reversed: reversed && !direct,
      kickoffDeltaMinutes: kickoffDeltaMinutes(row.commenceTimeUtc, game.kickoffUtc),
    });
  }

  const uniqueGameIds = [...new Set(oriented.map((candidate) => candidate.game.jkbGameId))].sort();
  if (oriented.length === 0) {
    return { status: "unmatched", reason: "NO_CANONICAL_GAME", evidence };
  }

  const withinTolerance = oriented.filter(
    (candidate) =>
      candidate.kickoffDeltaMinutes !== null &&
      candidate.kickoffDeltaMinutes <= toleranceMinutes,
  );

  if (withinTolerance.length === 0) {
    return {
      status: "unmatched",
      reason: "KICKOFF_OUTSIDE_TOLERANCE",
      evidence: {
        ...evidence,
        candidateGameIds: uniqueGameIds,
        kickoffDeltaMinutes: oriented[0].kickoffDeltaMinutes,
      },
    };
  }

  const distinctWinners = [
    ...new Set(withinTolerance.map((candidate) => candidate.game.jkbGameId)),
  ];
  if (distinctWinners.length > 1) {
    return {
      status: "ambiguous",
      reason: "MULTIPLE_CANONICAL_GAMES",
      evidence: { ...evidence, candidateGameIds: distinctWinners.sort() },
    };
  }

  const winner = withinTolerance.reduce((best, candidate) =>
    (candidate.kickoffDeltaMinutes ?? Infinity) < (best.kickoffDeltaMinutes ?? Infinity)
      ? candidate
      : best,
  );
  const { game, reversed } = winner;

  const snapshot: BettingLineSnapshot = {
    schemaVersion: BETTING_LINE_SCHEMA_VERSION,
    league,
    season: game.season,
    week: game.week,
    jkbGameId: game.jkbGameId,
    provider: row.provider ?? THE_ODDS_API_PROVIDER,
    providerEventId: row.providerEventId,
    sportsbook: row.sportsbook,
    capturedAt,
    providerUpdatedAt: row.providerUpdatedAt,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    kickoffUtc: game.kickoffUtc,
    spread: reversed ? swapSpread(row.spread) : row.spread,
    total: row.total,
    moneyline: reversed ? swapMoneyline(row.moneyline) : row.moneyline,
    contentHash: null,
    firstObservedAt: capturedAt,
    lastObservedAt: capturedAt,
  };

  const finalEvidence: BettingLineJoinEvidence = {
    ...evidence,
    candidateGameIds: [game.jkbGameId],
    kickoffDeltaMinutes: winner.kickoffDeltaMinutes,
    neutralSiteOrientationReversed: reversed,
  };

  const validation = safeParseBettingLineSnapshot(snapshot);
  if (!validation.success) {
    return {
      status: "rejected",
      reason: "INVALID_FINAL_SNAPSHOT",
      evidence: finalEvidence,
      validationIssues: validation.error.issues.map(
        (issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`,
      ),
    };
  }

  return { status: "matched", snapshot: validation.data, evidence: finalEvidence };
}
