import { safeParseBettingSplitSnapshot } from "./bettingSplitsSchema";
import { BETTING_SPLITS_SCHEMA_VERSION, type BettingMoneylineSplit, type BettingSpreadSplit } from "./bettingSplitsTypes";
import type { NormalizedProviderBettingSplit } from "./providers/normalizedProviderBettingSplits";
import {
  DEFAULT_BETTING_SPLIT_KICKOFF_TOLERANCE_MS,
  type BettingProviderGameCrosswalk,
  type BettingSplitGameJoinEvidence,
  type BettingSplitGameJoinOptions,
  type BettingSplitGameJoinResult,
  type CanonicalBettingGame,
} from "./gameJoinTypes";

export type ProviderTeamResolver = (
  providerTeamId: string | null,
  providerTeamName: string | null,
) => string | null;

type JoinCandidate = {
  game: CanonicalBettingGame;
  kickoffDeltaMinutes: number;
  orientationOverride: boolean;
};

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoffDeltaMinutes(
  providerKickoff: string | null,
  canonicalKickoff: string | null,
): number | null {
  const provider = parseTimestamp(providerKickoff);
  const canonical = parseTimestamp(canonicalKickoff);
  return provider === null || canonical === null ? null : Math.abs(provider - canonical) / 60_000;
}

function providerTeamLabel(id: string | null, name: string | null): string | null {
  return id ?? name;
}

function baseEvidence(
  input: NormalizedProviderBettingSplit,
  normalizedHomeTeam: string | null,
  normalizedAwayTeam: string | null,
  usedCrosswalk: boolean,
): BettingSplitGameJoinEvidence {
  return {
    providerGameId: input.providerGameId,
    league: input.league,
    season: input.season,
    providerHomeTeam: providerTeamLabel(input.providerHomeTeamId, input.providerHomeTeamName),
    providerAwayTeam: providerTeamLabel(input.providerAwayTeamId, input.providerAwayTeamName),
    normalizedHomeTeam,
    normalizedAwayTeam,
    providerKickoff: input.kickoffUtc,
    candidateGameIds: [],
    candidateKickoffDeltas: [],
    kickoffDeltaMinutes: null,
    usedCrosswalk,
    neutralSiteOrientationOverride: false,
    weekMismatch: null,
  };
}

function withCandidates(
  evidence: BettingSplitGameJoinEvidence,
  candidates: readonly JoinCandidate[],
): BettingSplitGameJoinEvidence {
  const sorted = [...candidates].sort((left, right) =>
    left.game.jkbGameId.localeCompare(right.game.jkbGameId),
  );
  return {
    ...evidence,
    candidateGameIds: sorted.map((candidate) => candidate.game.jkbGameId),
    candidateKickoffDeltas: sorted.map((candidate) => ({
      gameId: candidate.game.jkbGameId,
      kickoffDeltaMinutes: candidate.kickoffDeltaMinutes,
    })),
  };
}

function swapSpread(split: BettingSpreadSplit | null): BettingSpreadSplit | null {
  if (split === null) return null;
  return {
    openingHomeLine: split.openingAwayLine,
    openingAwayLine: split.openingHomeLine,
    currentHomeLine: split.currentAwayLine,
    currentAwayLine: split.currentHomeLine,
    homeBetPct: split.awayBetPct,
    awayBetPct: split.homeBetPct,
    homeMoneyPct: split.awayMoneyPct,
    awayMoneyPct: split.homeMoneyPct,
  };
}

function swapMoneyline(split: BettingMoneylineSplit | null): BettingMoneylineSplit | null {
  if (split === null) return null;
  return {
    openingHomePrice: split.openingAwayPrice,
    openingAwayPrice: split.openingHomePrice,
    currentHomePrice: split.currentAwayPrice,
    currentAwayPrice: split.currentHomePrice,
    homeBetPct: split.awayBetPct,
    awayBetPct: split.homeBetPct,
    homeMoneyPct: split.awayMoneyPct,
    awayMoneyPct: split.homeMoneyPct,
  };
}

function matchedResult(
  input: NormalizedProviderBettingSplit,
  candidate: JoinCandidate,
  evidence: BettingSplitGameJoinEvidence,
): BettingSplitGameJoinResult {
  const { game, orientationOverride } = candidate;
  const snapshot = {
    schemaVersion: BETTING_SPLITS_SCHEMA_VERSION,
    league: input.league,
    season: game.season,
    week: game.week,
    jkbGameId: game.jkbGameId,
    awayTeamId: game.awayTeamId,
    homeTeamId: game.homeTeamId,
    kickoffUtc: game.kickoffUtc,
    provider: input.provider,
    providerGameId: input.providerGameId,
    sportsbook: input.sportsbook,
    capturedAt: input.capturedAt,
    providerCreatedAt: input.providerCreatedAt,
    providerLastSeenAt: input.providerLastSeenAt,
    spread: orientationOverride ? swapSpread(input.spread) : input.spread,
    total: input.total,
    moneyline: orientationOverride ? swapMoneyline(input.moneyline) : input.moneyline,
    contentHash: null,
    firstObservedAt: input.capturedAt,
    lastObservedAt: input.capturedAt,
  };
  const validation = safeParseBettingSplitSnapshot(snapshot);
  const finalEvidence: BettingSplitGameJoinEvidence = {
    ...withCandidates(evidence, [candidate]),
    kickoffDeltaMinutes: candidate.kickoffDeltaMinutes,
    neutralSiteOrientationOverride: orientationOverride,
    weekMismatch: input.week !== null && game.week !== null && input.week !== game.week,
  };
  if (!validation.success) {
    return {
      status: "rejected",
      reason: "INVALID_FINAL_SNAPSHOT",
      evidence: finalEvidence,
      validationIssues: validation.error.issues.map((issue) =>
        `${issue.path.join(".") || "snapshot"}: ${issue.message}`,
      ),
    };
  }
  const crosswalkCandidate: BettingProviderGameCrosswalk = {
    league: input.league,
    provider: input.provider,
    providerGameId: input.providerGameId,
    jkbGameId: game.jkbGameId,
  };
  return {
    status: "matched",
    snapshot: validation.data,
    crosswalkCandidate,
    evidence: finalEvidence,
  };
}

function orientationFor(
  game: CanonicalBettingGame,
  normalizedHomeTeam: string | null,
  normalizedAwayTeam: string | null,
): "direct" | "neutral-reversed" | "mismatch" | "unknown" {
  if (normalizedHomeTeam === null || normalizedAwayTeam === null) return "unknown";
  if (game.homeTeamId === normalizedHomeTeam && game.awayTeamId === normalizedAwayTeam) return "direct";
  if (game.neutralSite && game.homeTeamId === normalizedAwayTeam && game.awayTeamId === normalizedHomeTeam) {
    return "neutral-reversed";
  }
  return "mismatch";
}

export function joinNormalizedBettingSplit(
  input: NormalizedProviderBettingSplit,
  expectedLeague: CanonicalBettingGame["league"],
  games: readonly CanonicalBettingGame[],
  resolveTeam: ProviderTeamResolver,
  options: BettingSplitGameJoinOptions = {},
): BettingSplitGameJoinResult {
  const normalizedHomeTeam = resolveTeam(input.providerHomeTeamId, input.providerHomeTeamName);
  const normalizedAwayTeam = resolveTeam(input.providerAwayTeamId, input.providerAwayTeamName);
  const exactCrosswalks = (options.crosswalks ?? []).filter((crosswalk) =>
    crosswalk.league === input.league &&
    crosswalk.provider === input.provider &&
    crosswalk.providerGameId === input.providerGameId,
  );
  const evidence = baseEvidence(
    input,
    normalizedHomeTeam,
    normalizedAwayTeam,
    exactCrosswalks.length > 0,
  );
  if (input.league !== expectedLeague) {
    return { status: "rejected", reason: "LEAGUE_MISMATCH", evidence };
  }

  const toleranceMs = options.kickoffToleranceMs ?? DEFAULT_BETTING_SPLIT_KICKOFF_TOLERANCE_MS;
  const toleranceMinutes = Math.max(0, toleranceMs) / 60_000;
  const leagueGames = games.filter((game) => game.league === expectedLeague);

  if (exactCrosswalks.length > 0) {
    const targetIds = [...new Set(exactCrosswalks.map((crosswalk) => crosswalk.jkbGameId))].sort();
    if (targetIds.length !== 1) {
      return {
        status: "rejected",
        reason: "CROSSWALK_CONFLICT",
        evidence: { ...evidence, candidateGameIds: targetIds },
      };
    }
    const matchingTargets = leagueGames.filter((game) => game.jkbGameId === targetIds[0]);
    if (matchingTargets.length === 0) {
      return {
        status: "rejected",
        reason: "CROSSWALK_TARGET_NOT_FOUND",
        evidence: { ...evidence, candidateGameIds: targetIds },
      };
    }
    if (matchingTargets.length > 1) {
      return {
        status: "rejected",
        reason: "DUPLICATE_CANONICAL_GAME_ID",
        evidence: { ...evidence, candidateGameIds: targetIds },
      };
    }
    const target = matchingTargets[0];
    const delta = kickoffDeltaMinutes(input.kickoffUtc, target.kickoffUtc);
    const orientation = orientationFor(target, normalizedHomeTeam, normalizedAwayTeam);
    const compatible = target.season === input.season &&
      (delta === null || delta <= toleranceMinutes) &&
      orientation !== "mismatch";
    const candidate: JoinCandidate = {
      game: target,
      kickoffDeltaMinutes: delta ?? 0,
      orientationOverride: orientation === "neutral-reversed",
    };
    if (!compatible) {
      return {
        status: "rejected",
        reason: "CROSSWALK_IDENTITY_MISMATCH",
        evidence: {
          ...withCandidates(evidence, [candidate]),
          kickoffDeltaMinutes: delta,
        },
      };
    }
    return matchedResult(input, candidate, evidence);
  }

  if (normalizedHomeTeam === null || normalizedAwayTeam === null) {
    return { status: "rejected", reason: "TEAM_MAPPING_FAILED", evidence };
  }

  const sameSeason = leagueGames.filter((game) => game.season === input.season);
  const teamCompatible = sameSeason.flatMap((game): JoinCandidate[] => {
    const orientation = orientationFor(game, normalizedHomeTeam, normalizedAwayTeam);
    if (orientation === "mismatch" || orientation === "unknown") return [];
    const delta = kickoffDeltaMinutes(input.kickoffUtc, game.kickoffUtc);
    return delta === null ? [] : [{
      game,
      kickoffDeltaMinutes: delta,
      orientationOverride: orientation === "neutral-reversed",
    }];
  });
  const candidates = teamCompatible.filter((candidate) => candidate.kickoffDeltaMinutes <= toleranceMinutes);
  if (new Set(candidates.map((candidate) => candidate.game.jkbGameId)).size !== candidates.length) {
    return {
      status: "rejected",
      reason: "DUPLICATE_CANONICAL_GAME_ID",
      evidence: withCandidates(evidence, candidates),
    };
  }
  if (candidates.length > 1) {
    const candidateEvidence = withCandidates(evidence, candidates);
    return {
      status: "ambiguous",
      reason: "AMBIGUOUS_GAME",
      candidateGameIds: candidateEvidence.candidateGameIds,
      evidence: candidateEvidence,
    };
  }
  if (candidates.length === 1) return matchedResult(input, candidates[0], evidence);

  const reversedHomeSite = sameSeason.flatMap((game): JoinCandidate[] => {
    if (game.neutralSite || game.homeTeamId !== normalizedAwayTeam || game.awayTeamId !== normalizedHomeTeam) {
      return [];
    }
    const delta = kickoffDeltaMinutes(input.kickoffUtc, game.kickoffUtc);
    return delta !== null && delta <= toleranceMinutes
      ? [{ game, kickoffDeltaMinutes: delta, orientationOverride: false }]
      : [];
  });
  if (reversedHomeSite.length > 0) {
    return {
      status: "rejected",
      reason: "HOME_AWAY_MISMATCH",
      evidence: withCandidates(evidence, reversedHomeSite),
    };
  }
  if (teamCompatible.length > 0) {
    return {
      status: "unmatched",
      reason: "KICKOFF_OUTSIDE_TOLERANCE",
      evidence: withCandidates(evidence, teamCompatible),
    };
  }
  return { status: "unmatched", reason: "UNMATCHED_GAME", evidence };
}
