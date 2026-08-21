/** Immutable full-PPR scoring authority for historical weekly outcomes. */
export const FANTASY_SCORING_VERSION = "jkb-full-ppr-v1.0.0" as const;
export const FANTASY_SCORING_FORMAT = "PPR" as const;

export const FULL_PPR_SCORING = Object.freeze({
  passingYard: 0.04,
  passingTouchdown: 4,
  interception: -2,
  rushingYard: 0.1,
  rushingTouchdown: 6,
  reception: 1,
  receivingYard: 0.1,
  receivingTouchdown: 6,
  fumbleLost: -2,
  twoPointConversion: 2,
  specialTeamsTouchdown: 6,
  bonuses: Object.freeze([] as const),
});

export type FantasyStatLine = {
  passingYards: number;
  passingTouchdowns: number;
  interceptions: number;
  rushingYards: number;
  rushingTouchdowns: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  fumblesLost: number;
  passingTwoPointConversions?: number;
  rushingTwoPointConversions?: number;
  receivingTwoPointConversions?: number;
  specialTeamsTouchdowns?: number;
};

function requireNonNegativeFinite(value: number | undefined, field: string): number {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }
  return normalized;
}

/** Calculates points only; rounding is a presentation concern. */
export function calculateFullPprFantasyPoints(statLine: FantasyStatLine): number {
  const passingYards = requireNonNegativeFinite(statLine.passingYards, "passingYards");
  const passingTouchdowns = requireNonNegativeFinite(statLine.passingTouchdowns, "passingTouchdowns");
  const interceptions = requireNonNegativeFinite(statLine.interceptions, "interceptions");
  const rushingYards = requireNonNegativeFinite(statLine.rushingYards, "rushingYards");
  const rushingTouchdowns = requireNonNegativeFinite(statLine.rushingTouchdowns, "rushingTouchdowns");
  const receptions = requireNonNegativeFinite(statLine.receptions, "receptions");
  const receivingYards = requireNonNegativeFinite(statLine.receivingYards, "receivingYards");
  const receivingTouchdowns = requireNonNegativeFinite(statLine.receivingTouchdowns, "receivingTouchdowns");
  const fumblesLost = requireNonNegativeFinite(statLine.fumblesLost, "fumblesLost");
  const twoPointConversions =
    requireNonNegativeFinite(statLine.passingTwoPointConversions, "passingTwoPointConversions") +
    requireNonNegativeFinite(statLine.rushingTwoPointConversions, "rushingTwoPointConversions") +
    requireNonNegativeFinite(statLine.receivingTwoPointConversions, "receivingTwoPointConversions");
  const specialTeamsTouchdowns = requireNonNegativeFinite(
    statLine.specialTeamsTouchdowns,
    "specialTeamsTouchdowns",
  );

  return (
    passingYards * FULL_PPR_SCORING.passingYard +
    passingTouchdowns * FULL_PPR_SCORING.passingTouchdown +
    interceptions * FULL_PPR_SCORING.interception +
    rushingYards * FULL_PPR_SCORING.rushingYard +
    rushingTouchdowns * FULL_PPR_SCORING.rushingTouchdown +
    receptions * FULL_PPR_SCORING.reception +
    receivingYards * FULL_PPR_SCORING.receivingYard +
    receivingTouchdowns * FULL_PPR_SCORING.receivingTouchdown +
    fumblesLost * FULL_PPR_SCORING.fumbleLost +
    twoPointConversions * FULL_PPR_SCORING.twoPointConversion +
    specialTeamsTouchdowns * FULL_PPR_SCORING.specialTeamsTouchdown
  );
}
