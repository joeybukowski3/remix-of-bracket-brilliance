/**
 * JKB projected spread consumption (nfl-spread-v0.1.0).
 *
 * Reads the generated public/data/nfl/matchup-projections.json artifact. No
 * modelling happens in the browser and nflverse is never called from it.
 *
 * The model itself is market-independent: no spread, moneyline, total or ATS
 * value takes part in its features, its opponent adjustment or its single
 * fitted parameter. The market appears only here, in the consumer layer, and
 * only as a side-by-side comparison after the projection already exists.
 *
 * That comparison is descriptive. Backtesting did not show the model beating
 * the market, so nothing in this module produces a pick, a best bet, a value
 * bet, a confidence level, an expected value or a stake size, and the
 * difference is labelled "Model vs Market" rather than an edge.
 */

import type { MarketCurrentGame } from "@/lib/nfl/marketData";

export const PROJECTIONS_ARTIFACT_PATH = "/data/nfl/matchup-projections.json";
export const NFL_SPREAD_MODEL_VERSION = "nfl-spread-v0.1.0";

const NA = "N/A";

export type ProjectionTeamSide = {
  offAdj: number;
  defAdj: number;
  pdgAdj: number;
  compositeZ: number;
  sampleGames: number;
  lastSampleGameId: string | null;
  priorSeason: number | null;
  priorWeight: number;
  currentSeasonGames: number;
  priorSeasonGames: number;
};

export type ProjectedSpreadNotation = {
  favoriteTeam: string | null;
  line: number;
  display: string;
};

export type GameProjection = {
  gameId: string;
  season: number;
  week: number;
  kickoff: string | null;
  awayTeam: string;
  homeTeam: string;
  neutralSite: boolean;
  beta: number;
  away: ProjectionTeamSide;
  home: ProjectionTeamSide;
  /** Composite z difference, home minus away. */
  strengthDiff: number;
  /** beta x strengthDiff, before home field. */
  neutralMargin: number;
  homeFieldAdvantage: number;
  /** Positive means the home team is projected to win by this many points. */
  projectedHomeMargin: number;
  projectedSpread: ProjectedSpreadNotation;
};

export type ProjectionsArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string };
  schemaVersion: string;
  modelVersion: string;
  currentSeason: number;
  model: {
    weights: { off: number; def: number; pdg: number };
    priorK: number;
    homeFieldAdvantage: number;
    neutralSiteHomeFieldAdvantage: number;
    recency: string;
    opponentAdjustment: string;
    epaSource: string;
    epaDefinition: string;
    beta: number;
    betaFitSeasons: number[];
    betaFitObservations: number;
    betaFitThrough: number;
    fittedParameters: string[];
    marketInputUsed: boolean;
  };
  projections: Record<string, GameProjection>;
  provenance: {
    generatedAt: string;
    dataCutoff: string;
    historySeasons: number[];
    gamesProjected: number;
  };
};

export function projectionFor(
  artifact: ProjectionsArtifact | null,
  gameId: string | null | undefined
): GameProjection | null {
  if (!artifact || !gameId) return null;
  return artifact.projections[gameId] ?? null;
}

/**
 * Conventional spread notation for a projected home margin, e.g. "SEA −3.4".
 * A home margin of +3.4 means the home team is a 3.4-point favourite, so the
 * printed line is negative for the favourite.
 *
 * Rebuilt from the artifact's parts rather than echoing its `display` string so
 * the typographic minus matches the market line rendered beside it; the two
 * sitting side by side with different characters reads as a data mismatch.
 */
export function formatProjectedSpread(projection: GameProjection | null): string {
  if (!projection) return NA;
  const { favoriteTeam, line } = projection.projectedSpread;
  if (favoriteTeam == null) return "PK";
  return `${favoriteTeam.toUpperCase()} −${Math.abs(line).toFixed(1)}`;
}

/** Signed points, e.g. "+3.4" / "−1.5" / "0.0". */
export function formatPoints(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return NA;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

/**
 * The market line stated the same way the model states its own: as a home
 * margin, positive when the home team is favoured.
 *
 * marketData publishes spread.home in sportsbook notation, where a favourite
 * carries a negative number, so the sign is inverted here.
 */
export function marketHomeMargin(market: MarketCurrentGame | null | undefined): number | null {
  const home = market?.spread?.home;
  if (home == null || !Number.isFinite(home)) return null;
  return -home;
}

export type ModelVsMarket = {
  /** Model projection expressed as a home margin. */
  modelHomeMargin: number;
  /** Market line expressed as a home margin, or null when no line exists. */
  marketHomeMargin: number | null;
  /**
   * modelHomeMargin − marketHomeMargin. Positive means the model is higher on
   * the home team than the market is; negative means it is higher on the away
   * team. This is a description of the gap, not an edge or a recommendation.
   */
  difference: number | null;
  /** Team the model leans toward relative to the market, if the two differ. */
  leansToward: string | null;
};

export function compareToMarket(
  projection: GameProjection | null,
  market: MarketCurrentGame | null | undefined
): ModelVsMarket | null {
  if (!projection) return null;
  const marketMargin = marketHomeMargin(market);
  if (marketMargin == null) {
    return {
      modelHomeMargin: projection.projectedHomeMargin,
      marketHomeMargin: null,
      difference: null,
      leansToward: null,
    };
  }
  const difference = projection.projectedHomeMargin - marketMargin;
  const rounded = Number(difference.toFixed(1));
  return {
    modelHomeMargin: projection.projectedHomeMargin,
    marketHomeMargin: marketMargin,
    difference,
    leansToward: rounded === 0 ? null : rounded > 0 ? projection.homeTeam : projection.awayTeam,
  };
}

/** The team the model projects to win, or null for an exact pick'em. */
export function projectedWinner(projection: GameProjection | null): string | null {
  if (!projection) return null;
  const rounded = Number(projection.projectedHomeMargin.toFixed(1));
  if (rounded === 0) return null;
  return rounded > 0 ? projection.homeTeam : projection.awayTeam;
}

export type ProjectionBreakdownRow = {
  label: string;
  value: string;
  detail: string;
};

/**
 * The three terms that make up the projection, in the order they are applied.
 * Deliberately limited to what the model actually computes — there is no
 * confidence, no probability and no bet sizing behind it.
 */
export function projectionBreakdown(projection: GameProjection | null): ProjectionBreakdownRow[] {
  if (!projection) return [];
  const { homeTeam, awayTeam, strengthDiff, neutralMargin, homeFieldAdvantage, neutralSite } = projection;
  const stronger = strengthDiff >= 0 ? homeTeam : awayTeam;
  return [
    {
      label: "Team Strength Difference",
      value: formatPoints(neutralMargin),
      detail:
        `${stronger.toUpperCase()} rates higher on opponent-adjusted EPA and point differential ` +
        `(${strengthDiff >= 0 ? "+" : "−"}${Math.abs(strengthDiff).toFixed(2)} composite), ` +
        `worth ${Math.abs(neutralMargin).toFixed(1)} points on a neutral field.`,
    },
    {
      label: "Home Field",
      value: formatPoints(homeFieldAdvantage),
      detail: neutralSite
        ? "Neutral site — no home-field adjustment is applied."
        : `Fixed ${homeFieldAdvantage.toFixed(1)}-point adjustment for ${homeTeam.toUpperCase()}. Never fitted.`,
    },
    {
      label: "Projected Margin",
      value: formatPoints(projection.projectedHomeMargin),
      detail: `Projected final margin for ${homeTeam.toUpperCase()} against ${awayTeam.toUpperCase()}.`,
    },
  ];
}
