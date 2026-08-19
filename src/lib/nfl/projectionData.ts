/**
 * JKB projected spread consumption (jkb-power-number-v1.0.0).
 *
 * Reads the generated public/data/nfl/matchup-projections.json artifact. No
 * modelling happens in the browser and nflverse is never called from it.
 *
 * The model itself is market-independent: the ONLY team-strength input is
 * the canonical universal Current OVR board (the same rating shown
 * everywhere else on the site) reduced to a Power Number relative to the
 * current league-average team, then combined with a fixed home-field
 * adjustment. No spread, moneyline, total or ATS value takes part in the
 * projection. The market appears only here, in the consumer layer, and only
 * as a side-by-side comparison after the projection already exists.
 *
 * That comparison is descriptive. Backtesting did not show the model beating
 * the market, so nothing in this module produces a pick, a best bet, a value
 * bet, a confidence level, an expected value or a stake size, and the
 * difference is labelled "Model vs Market" rather than an edge.
 *
 * REPLACES the nfl-spread-v0.1.0 composite as the authoritative public JKB
 * spread source (2026-08-19). That model's code remains available under
 * scripts/analysis/nfl-spread-v0.1.0-legacy/ for historical/model comparison
 * only — it no longer feeds this artifact or this module.
 */

import type { MarketCurrentGame } from "@/lib/nfl/marketData";

export const PROJECTIONS_ARTIFACT_PATH = "/data/nfl/matchup-projections.json";
export const JKB_POWER_NUMBER_MODEL_VERSION = "jkb-power-number-v1.0.0";

const NA = "N/A";

export type GameProjection = {
  gameId: string;
  week: number;
  kickoff: string | null;
  homeTeam: string;
  awayTeam: string;
  /** The exact canonical universal Current OVR (1-99 scale) for each side. */
  homeCurrentOVR: number;
  awayCurrentOVR: number;
  /** The 32-team mean Current OVR both Power Numbers were centered against. */
  leagueAverageOVR: number;
  /** Points better/worse than the average NFL team on a neutral field. */
  homePowerNumber: number;
  awayPowerNumber: number;
  neutralSite: boolean;
  /** 2.0 at a normal site, 0.0 at a neutral site. Never fitted. */
  homeFieldAdvantage: number;
  /** homePowerNumber - awayPowerNumber, before home-field advantage. */
  neutralProjectedMargin: number;
  /** Positive means the home team is projected to win by this many points. */
  projectedHomeMargin: number;
  /** Pre-formatted sportsbook-style notation, e.g. "SEA −3.5" / "PK". */
  formattedJkbSpread: string;
};

export type ProjectionsArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string };
  schemaVersion: string;
  modelVersion: string;
  currentSeason: number;
  model: {
    ovrToPointsCoefficient: number;
    homeFieldAdvantage: number;
    neutralSiteHomeFieldAdvantage: number;
    leagueAverageOVR: number;
    strengthInput: string;
    fittedParameters: string[];
    marketInputUsed: boolean;
  };
  projections: Record<string, GameProjection>;
  provenance: {
    generatedAt: string;
    gamesProjected: number;
    inputs: Record<string, string>;
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
 * Conventional spread notation for this projection, e.g. "SEA −3.4" / "PK".
 * Generated once at build time (scripts/generate-nfl-matchup-projections.mts)
 * using the same typographic minus (U+2212) the market line uses, so the two
 * sitting side by side never read as a data mismatch.
 */
export function formatProjectedSpread(projection: GameProjection | null): string {
  if (!projection) return NA;
  return projection.formattedJkbSpread;
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

/**
 * Team-oriented rendering of the model-vs-market gap, e.g. "BUF +2.5" — never
 * a bare signed number, since a signed difference alone doesn't say which
 * team it favors. "Even" when the two agree exactly, "N/A" when there's no
 * market line to compare against. This is a description of the gap, not an
 * edge, a pick or a betting recommendation.
 */
export function formatModelVsMarketDifference(comparison: ModelVsMarket | null): string {
  if (!comparison || comparison.difference == null) return NA;
  const rounded = Number(comparison.difference.toFixed(1));
  if (rounded === 0 || !comparison.leansToward) return "Even";
  return `${comparison.leansToward.toUpperCase()} +${Math.abs(rounded).toFixed(1)}`;
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
 * The five terms that make up the projection, in the order they are applied.
 * Deliberately limited to what the model actually computes — there is no
 * confidence, no probability and no bet sizing behind it.
 */
export function projectionBreakdown(projection: GameProjection | null): ProjectionBreakdownRow[] {
  if (!projection) return [];
  const {
    homeTeam,
    awayTeam,
    homeCurrentOVR,
    awayCurrentOVR,
    leagueAverageOVR,
    homePowerNumber,
    awayPowerNumber,
    neutralProjectedMargin,
    homeFieldAdvantage,
    neutralSite,
    projectedHomeMargin,
  } = projection;

  return [
    {
      label: `${homeTeam.toUpperCase()} Power Number`,
      value: formatPoints(homePowerNumber),
      detail:
        `Current OVR ${homeCurrentOVR.toFixed(1)} vs a league-average Current OVR of ` +
        `${leagueAverageOVR.toFixed(1)} — how many points better or worse than an average NFL ` +
        `team ${homeTeam.toUpperCase()} projects on a neutral field.`,
    },
    {
      label: `${awayTeam.toUpperCase()} Power Number`,
      value: formatPoints(awayPowerNumber),
      detail:
        `Current OVR ${awayCurrentOVR.toFixed(1)} vs the same league-average Current OVR of ` +
        `${leagueAverageOVR.toFixed(1)}.`,
    },
    {
      label: "Neutral Margin",
      value: formatPoints(neutralProjectedMargin),
      detail: `${homeTeam.toUpperCase()} Power Number minus ${awayTeam.toUpperCase()} Power Number — the expected margin on a neutral field.`,
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
      value: formatPoints(projectedHomeMargin),
      detail: `Projected final margin for ${homeTeam.toUpperCase()} against ${awayTeam.toUpperCase()}.`,
    },
  ];
}
