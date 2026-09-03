/**
 * WU4B S3 — candidate player opportunity-SHARE models.
 *
 * Every model predicts a RAW share for one player within one team-game
 * pool. The allocation step (`allocate.ts`) is what enforces the finite
 * pool: raw shares are clipped ≥ 0 and renormalised to sum to 1 within the
 * pool. Normalisation is an accounting constraint, NOT evidence a model is
 * predictive — the walk-forward harness measures share error, volume
 * error, final-yards error and rank quality separately, and separately
 * measures the distortion normalisation introduces per role cohort.
 *
 * Models, simplest first (Part 6 discipline — no jump to complexity):
 *   priorShare      — the player's own point-in-time within-pool share,
 *                     backed off to a fitted depth-rank prior, then equal split.
 *   depthPrior      — the fitted depth-rank prior only (ignores the player's
 *                     own history; a pure role model).
 *   shrinkageBlend  — player prior share shrunk toward the depth-rank prior
 *                     by a fitted games-count prior strength.
 *   teamChangeAware — shrinkageBlend, but a team-changed player's own prior
 *                     share is discounted (it was earned on the old team).
 */

export type NflShareModelKey = "priorShare" | "depthPrior" | "shrinkageBlend" | "teamChangeAware";
export const NFL_SHARE_MODEL_KEYS: readonly NflShareModelKey[] = ["priorShare", "depthPrior", "shrinkageBlend", "teamChangeAware"];

/** One player's role evidence + realised outcome for a single team-game pool. */
export type NflShareObservation = {
  season: number;
  week: number;
  gameId: string;
  team: string;
  playerId: string;
  playerName: string;
  /** Groups all players competing for the same finite pool (`gameId|team|poolKey`). */
  poolId: string;
  poolKey: "qb" | "rb" | "wrTe" | "receiving";
  /** Rank-prior bucket key: `rank:<n>` for rush pools, `<pos>:<n>` for receiving. */
  rankKey: string;
  depthRankProxy: number | null;
  isProjectedStarter: boolean;
  priorShare: number | null;
  priorGamesPlayed: number;
  noHistory: boolean;
  limitedHistory: boolean;
  teamChanged: boolean | null;
  /** true when `depthRankProxy` comes from a current sourced depth chart (2026 live), false when usage-derived (historical). */
  roleSourced: boolean;
  concentration: number | null;
  rosterCompetitionCount: number | null;
  /** Unshrunk prior efficiency (YPC or YPT) for the final-yards leg. Null → league fallback applied later. */
  priorEfficiency: number | null;
  /** Realised. */
  actualShare: number | null;
  actualVolume: number;
  actualYards: number;
  /** Team-game context for pool sizing during evaluation. */
  context: {
    teamDesignedRushes: number;
    teamDropbacks: number;
    /** Realised size of THIS player's pool (rush sub-pool count, or team pass attempts for receiving). */
    poolActual: number;
    gameDateUtc: string;
  };
};

export type NflShareModelFit = {
  /** rankKey -> mean realised within-pool share (training). */
  rankPrior: Map<string, number>;
  /** mean realised share for no-history rows (training). */
  noHistoryPrior: number;
  /** overall mean realised share (fallback). */
  overallMean: number;
  /** fitted shrinkage prior strength (games) for shrinkageBlend / teamChangeAware. */
  shrinkageK: number;
  /** games of "credit" a team-changed player's own prior share keeps. */
  teamChangeRetainedGames: number;
};

export const SHARE_SHRINKAGE_K_GRID: readonly number[] = [1, 2, 3, 4, 6, 8];
const TEAM_CHANGE_RETAINED_GAMES = 1;

function mean(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : 0;
}

/** Deterministic training aggregates. `shrinkageK` is chosen by the caller's grid search; default here is a neutral 3. */
export function fitShareModel(train: readonly NflShareObservation[], shrinkageK = 3): NflShareModelFit {
  const byRank = new Map<string, number[]>();
  const noHist: number[] = [];
  const all: number[] = [];
  for (const o of train) {
    if (o.actualShare == null) continue;
    all.push(o.actualShare);
    (byRank.get(o.rankKey) ?? byRank.set(o.rankKey, []).get(o.rankKey)!).push(o.actualShare);
    if (o.noHistory) noHist.push(o.actualShare);
  }
  const rankPrior = new Map<string, number>();
  for (const [k, v] of byRank) rankPrior.set(k, mean(v));
  return {
    rankPrior,
    noHistoryPrior: noHist.length > 0 ? mean(noHist) : mean(all),
    overallMean: mean(all),
    shrinkageK,
    teamChangeRetainedGames: TEAM_CHANGE_RETAINED_GAMES,
  };
}

function rankPriorFor(fit: NflShareModelFit, o: NflShareObservation, rankBackoff = 0): number {
  if (rankBackoff > 0 && o.depthRankProxy != null) {
    const [pos] = o.rankKey.split(":");
    const isReceiving = o.poolKey === "receiving";
    const backedKey = isReceiving ? `${pos}:${o.depthRankProxy + rankBackoff}` : `rank:${o.depthRankProxy + rankBackoff}`;
    const backed = fit.rankPrior.get(backedKey);
    if (backed != null) return backed;
  }
  return fit.rankPrior.get(o.rankKey) ?? fit.noHistoryPrior ?? fit.overallMean;
}

/**
 * S5A — no-history / uncertain-player prior calibration. `null` = S4
 * behaviour (raw depth-rank prior for a no-history row).
 */
export type NflNoHistoryCalibration = {
  /** multiply the no-history prior share by this (≤ 1 shrinks uncertain players toward less opportunity). */
  shareMultiplier: number;
  /** look up the prior `rankBackoff` ranks deeper for a no-history row (hedge an unproven "starter"). */
  rankBackoff: number;
  /** if set, multiply by min(1, ref / rosterCompetitionCount) — more bodies competing → less share. */
  rosterCompetitionRef: number | null;
};

function noHistoryPrior(fit: NflShareModelFit, o: NflShareObservation, cal: NflNoHistoryCalibration | null): number {
  const base = rankPriorFor(fit, o, cal?.rankBackoff ?? 0);
  if (!cal) return base;
  let v = base * cal.shareMultiplier;
  if (cal.rosterCompetitionRef != null && o.rosterCompetitionCount != null && o.rosterCompetitionCount > 0) {
    v *= Math.min(1, cal.rosterCompetitionRef / o.rosterCompetitionCount);
  }
  return v;
}

/**
 * S5E — role-transition calibration. `null` = S5A behaviour. Activates
 * ONLY for a player whose team changed AND who has a usable current depth
 * rank AND whose current role materially conflicts with old-team usage
 * (`|priorShare − rankPrior| > conflictThreshold`). Same-team players are
 * never touched. When `requireSourced` is set, a usage-derived
 * (non-sourced) rank does not activate it either.
 */
export type NflTeamChangeCalibration = {
  /** fraction of prior-games credit a team-changed player's own share keeps (0 = full reset to the current-role prior). */
  carryover: number;
  /** multiply the shrinkage K (pull toward the current-role rank prior) for a qualifying team-changed player. */
  rankPriorBoost: number;
  /** only activate when |priorShare − rankPrior| exceeds this. */
  conflictThreshold: number;
  /** require the current depth rank to be sourced (not usage-derived). */
  requireSourced: boolean;
};

function teamChangeQualifies(o: NflShareObservation, prior: number, cal: NflTeamChangeCalibration): boolean {
  if (o.teamChanged !== true || o.priorShare == null || o.depthRankProxy == null) return false;
  if (cal.requireSourced && !o.roleSourced) return false;
  return Math.abs(o.priorShare - prior) > cal.conflictThreshold;
}

/** RAW (un-normalised) predicted share for one observation. Always ≥ 0. */
export function predictRawShare(
  model: NflShareModelKey,
  fit: NflShareModelFit,
  o: NflShareObservation,
  noHistoryCal: NflNoHistoryCalibration | null = null,
  teamChangeCal: NflTeamChangeCalibration | null = null,
): number {
  const prior = rankPriorFor(fit, o);
  const noHistFallback = () => Math.max(0, noHistoryPrior(fit, o, noHistoryCal));
  switch (model) {
    case "priorShare":
      return o.priorShare == null ? noHistFallback() : Math.max(0, o.priorShare);
    case "depthPrior":
      return o.noHistory ? noHistFallback() : Math.max(0, prior);
    case "shrinkageBlend": {
      if (o.priorShare == null) return noHistFallback();
      if (teamChangeCal && teamChangeQualifies(o, prior, teamChangeCal)) {
        const w = o.priorGamesPlayed * teamChangeCal.carryover;
        const k = fit.shrinkageK * teamChangeCal.rankPriorBoost;
        return Math.max(0, (w * o.priorShare + k * prior) / (w + k));
      }
      const w = o.priorGamesPlayed;
      return Math.max(0, (w * o.priorShare + fit.shrinkageK * prior) / (w + fit.shrinkageK));
    }
    case "teamChangeAware": {
      if (o.priorShare == null) return noHistFallback();
      const w = o.teamChanged === true ? fit.teamChangeRetainedGames : o.priorGamesPlayed;
      return Math.max(0, (w * o.priorShare + fit.shrinkageK * prior) / (w + fit.shrinkageK));
    }
  }
}
