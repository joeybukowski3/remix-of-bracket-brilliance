/**
 * JKB Power Number — spread-strength representation of the canonical current
 * OVR board (Current-OVR Spread Calibration, approved 2026-08-19).
 *
 * A team's Power Number is how many NFL scoreboard points better (positive)
 * or worse (negative) it is than the CURRENT league-average team on a
 * neutral field. Higher Power Number always means a stronger team — sign
 * flips only happen at the sportsbook-display layer, never in this module.
 *
 * FORMULA (the entire model, five steps):
 *   1. leagueAverageOVR = mean(CurrentRatingRow.rating) across all 32 teams
 *   2. powerNumber       = (currentOVR - leagueAverageOVR) * OVR_TO_POINTS_COEFFICIENT
 *   3. neutralMargin      = homePowerNumber - awayPowerNumber
 *   4. expectedHomeMargin = neutralMargin + (neutralSite ? 0 : HOME_FIELD_ADVANTAGE_POINTS)
 *   5. sportsbook notation = toSportsbookSpread(expectedHomeMargin)
 *
 * PROVENANCE: OVR_TO_POINTS_COEFFICIENT (0.24) and HOME_FIELD_ADVANTAGE_POINTS
 * (2.0) are NOT re-derived here. They are the fixed, approved outputs of the
 * Current-OVR Spread Calibration (walk-forward, no-leakage, 2023-2025,
 * scripts/analysis/nfl-current-ovr-spread-calibration/): fitted beta range
 * 0.229-0.256 across the 2024/2025 out-of-sample fits (production value 0.24
 * is the stable midpoint); HFA grid-tested at 0/1.5/2.0/2.5 with a
 * statistically flat optimum, 2.0 retained for consistency with the
 * previously-shipped nfl-spread-v0.1.0 precedent; intercept tested and
 * rejected (out-of-sample MAE was worse with one); linear confirmed
 * (quadratic diagnostic term added negligible in-sample fit). This module
 * changes ONLY the representation (average-relative Power Number instead of
 * a raw OVR-difference term) — it is algebraically identical to
 * `0.24 * (OVR_home - OVR_away) + HFA`, proven by the equivalence test in
 * jkbPowerNumber2026.test.ts, because the league-average term cancels
 * between any two teams.
 *
 * MATHEMATICAL EQUIVALENCE (why the average term is safe to introduce):
 *   powerNumber_A - powerNumber_B
 *     = (OVR_A - avg) * k - (OVR_B - avg) * k
 *     = (OVR_A - OVR_B) * k                      <- avg cancels exactly
 *
 * VEGAS/MARKET INDEPENDENCE: nothing in this module reads, imports or
 * accepts a market/spread/odds value of any kind. Every function here is a
 * pure function of the Current OVR board (or of two already-computed Power
 * Numbers) and neutral-site status. Market comparison is a downstream,
 * separate concern (see src/lib/nfl/projectionData.ts's existing
 * compareToMarket pattern) — this module never touches it.
 *
 * NO LEGACY RATING INPUT: this module imports nothing from v03Review.ts,
 * guideData.ts/guide2026.ts, nflPreseason2026.ts, or the scripts/lib
 * nfl-spread-model.mjs / nfl-spread-dataset.mjs composite. Its only rating
 * input is CurrentRatingBoard.teams[].rating — the exact same universal
 * Current OVR value rendered everywhere else on the site.
 *
 * Framework-free: never fetches, never mutates its input, takes an
 * already-built CurrentRatingBoard (see src/hooks/useNflCurrentRating2026.ts
 * for the one place that loads one).
 */

import { rankByDescending } from "@/lib/nfl/publicPowerRatings";
import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";

/** Empirically calibrated NFL points per Current-OVR point. Approved 2026-08-19. Do not hand-tune. */
export const OVR_TO_POINTS_COEFFICIENT = 0.24;

/** Fixed home-field advantage, points. Never fitted per-team, never fitted jointly with beta in production. */
export const HOME_FIELD_ADVANTAGE_POINTS = 2.0;

/** Neutral-site games receive exactly zero home-field advantage. */
export const NEUTRAL_SITE_HOME_FIELD_ADVANTAGE_POINTS = 0.0;

export const JKB_POWER_NUMBER_MODEL_VERSION = "jkb-power-number-v1.0.0";

export type PowerNumberTeamRow = {
  abbr: string;
  /** The exact universal Current OVR (1-99 scale) this Power Number was derived from. */
  currentOVR: number;
  /** The Current OVR board's own rank — carried through, never recomputed here. */
  currentOVRRank: number;
  /** The 32-team mean Current OVR this Power Number was centered against. */
  leagueAverageOVR: number;
  /** Points better (positive) or worse (negative) than the average NFL team on a neutral field. */
  powerNumber: number;
  /** 1..32, descending by powerNumber. Identical ordering to currentOVRRank by construction (see equivalence test). */
  powerNumberRank: number;
};

export type PowerNumberBoard = {
  season: number;
  leagueAverageOVR: number;
  teams: PowerNumberTeamRow[];
};

/**
 * Build the Power Number board from a complete, already-built Current OVR
 * board. Throws rather than silently proceeding when the board is not the
 * full 32-team league — a Power Number computed from any subset (one
 * division, one conference, one matchup) would center on the wrong average
 * and must never be produced.
 */
export function buildPowerNumberBoard(board: CurrentRatingBoard): PowerNumberBoard {
  if (board.teams.length !== 32) {
    throw new Error(
      `buildPowerNumberBoard: requires the complete 32-team Current OVR board, got ${board.teams.length} teams`
    );
  }

  const leagueAverageOVR = board.teams.reduce((sum, team) => sum + team.rating, 0) / board.teams.length;

  const unranked = board.teams.map((team) => ({
    abbr: team.abbr,
    currentOVR: team.rating,
    currentOVRRank: team.rank,
    leagueAverageOVR,
    powerNumber: (team.rating - leagueAverageOVR) * OVR_TO_POINTS_COEFFICIENT,
  }));

  const ranks = rankByDescending(
    unranked.map((row) => ({ key: row.abbr, value: row.powerNumber, name: row.abbr, teamId: row.abbr }))
  );

  const teams: PowerNumberTeamRow[] = unranked.map((row) => ({
    ...row,
    powerNumberRank: ranks.get(row.abbr) ?? unranked.length,
  }));

  return { season: board.season, leagueAverageOVR, teams };
}

export function powerNumberFor(powerBoard: PowerNumberBoard, abbr: string): PowerNumberTeamRow | null {
  return powerBoard.teams.find((row) => row.abbr === abbr) ?? null;
}

/** HFA for one game: fixed 2.0 at a normal site, exactly 0 at a neutral site. Never team-specific. */
export function homeFieldAdvantageFor(neutralSite: boolean): number {
  return neutralSite ? NEUTRAL_SITE_HOME_FIELD_ADVANTAGE_POINTS : HOME_FIELD_ADVANTAGE_POINTS;
}

/** Expected margin on a neutral field: simply the Power Number difference. Positive favors home. */
export function neutralMarginFor(homePowerNumber: number, awayPowerNumber: number): number {
  return homePowerNumber - awayPowerNumber;
}

/** Full expected home margin: neutral margin plus the site's home-field advantage. */
export function expectedHomeMarginFor(
  homePowerNumber: number,
  awayPowerNumber: number,
  neutralSite: boolean
): number {
  return neutralMarginFor(homePowerNumber, awayPowerNumber) + homeFieldAdvantageFor(neutralSite);
}

export type SportsbookSpread = {
  side: "home" | "away" | "pk";
  /** Signed line in conventional sportsbook notation (favorite negative). */
  line: number;
  display: string;
};

/**
 * Convert an expected home margin into sportsbook-style notation.
 * +4.5 -> "HOME -4.5" (home favored by 4.5)
 * -3.0 -> "AWAY -3.0" (away favored by 3.0)
 *  0   -> "PK"
 * Rounding happens here and only here — callers keep the unrounded margin.
 */
export function toSportsbookSpread(expectedHomeMargin: number): SportsbookSpread {
  const rounded = Math.round(expectedHomeMargin * 10) / 10;
  if (rounded === 0) return { side: "pk", line: 0, display: "PK" };
  if (rounded > 0) return { side: "home", line: -rounded, display: `HOME ${(-rounded).toFixed(1)}` };
  return { side: "away", line: rounded, display: `AWAY ${rounded.toFixed(1)}` };
}

export type MatchupPowerProjection = {
  homeAbbr: string;
  awayAbbr: string;
  neutralSite: boolean;
  homePowerNumber: number;
  awayPowerNumber: number;
  neutralMargin: number;
  homeFieldAdvantage: number;
  expectedHomeMargin: number;
  spread: SportsbookSpread;
};

/** The full five-step projection for one matchup, from an already-built Power Number board. */
export function projectMatchup(
  powerBoard: PowerNumberBoard,
  homeAbbr: string,
  awayAbbr: string,
  neutralSite: boolean
): MatchupPowerProjection {
  const home = powerNumberFor(powerBoard, homeAbbr);
  const away = powerNumberFor(powerBoard, awayAbbr);
  if (!home) throw new Error(`projectMatchup: no Power Number for home team ${homeAbbr}`);
  if (!away) throw new Error(`projectMatchup: no Power Number for away team ${awayAbbr}`);

  const neutralMargin = neutralMarginFor(home.powerNumber, away.powerNumber);
  const homeFieldAdvantage = homeFieldAdvantageFor(neutralSite);
  const expectedHomeMargin = neutralMargin + homeFieldAdvantage;

  return {
    homeAbbr,
    awayAbbr,
    neutralSite,
    homePowerNumber: home.powerNumber,
    awayPowerNumber: away.powerNumber,
    neutralMargin,
    homeFieldAdvantage,
    expectedHomeMargin,
    spread: toSportsbookSpread(expectedHomeMargin),
  };
}
