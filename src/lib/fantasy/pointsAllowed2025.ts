/**
 * 2025 fantasy points allowed by defense, per position.
 *
 * Source: FantasyPros "Fantasy Points Allowed", 2025 actual season, average per
 * game across weeks 1-17. This is historical data, never a 2026 projection —
 * every surface that renders it must label it 2025.
 *
 * Rank 1 is the defense that allowed the MOST points to a position, i.e. the
 * most favourable matchup for that position. Rank therefore feeds the shared
 * gold/green → neutral → red scale directly, with no inversion.
 *
 * This is a different signal from the JKB `strengthOfSchedule` column, which is
 * a composite schedule metric. Both are shown; neither replaces the other.
 */

import pointsAllowedCsv from "../../../data/fantasy/points-allowed-2025.csv?raw";
import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";

export const POINTS_ALLOWED_SEASON = 2025;
/** Every defense is ranked 1-32, so the gradient always spans the league. */
export const POINTS_ALLOWED_TEAM_COUNT = 32;

export type PointsAllowedPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export const POINTS_ALLOWED_POSITIONS: readonly PointsAllowedPosition[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DST",
];

export type PointsAllowedEntry = {
  /** 1 = allowed the most points to this position (best matchup). */
  rank: number;
  /** Average fantasy points allowed per game. */
  pointsAllowed: number;
};

export type PointsAllowedTeam = {
  /** Canonical lowercase site code, e.g. "wsh". */
  abbr: string;
  /** Full team name as supplied by the source. */
  name: string;
  byPosition: Record<PointsAllowedPosition, PointsAllowedEntry>;
};

/**
 * The source spells out "Los Angeles" / "New York" where the site's own team
 * list uses "LA" / "NY". Normalising both sides keeps the abbreviation map
 * derived from `NFL_POWER_RATINGS` instead of hand-listing 32 teams.
 */
function normalizeTeamName(name: string): string {
  return name.trim().replace(/^Los Angeles /, "LA ").replace(/^New York /, "NY ");
}

const ABBR_BY_TEAM_NAME = new Map(
  NFL_POWER_RATINGS.map((team) => [normalizeTeamName(team.team), team.abbr]),
);

/**
 * Opponent tokens in the fantasy workbook use a couple of codes that differ
 * from the site's canonical team codes.
 */
const OPPONENT_CODE_ALIASES: Readonly<Record<string, string>> = {
  la: "lar",
  was: "wsh",
};

/** Strips any "@" prefix and resolves a schedule token to a canonical code. */
export function normalizeOpponentCode(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const code = token.trim().replace(/^@/, "").toLowerCase();
  if (!code) return undefined;
  return OPPONENT_CODE_ALIASES[code] ?? code;
}

function parseCsv(source: string): readonly PointsAllowedTeam[] {
  const lines = source.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((cell) => cell.trim());
  const columnIndex = new Map(header.map((label, index) => [label, index]));

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const name = cells[0];
    const abbr = ABBR_BY_TEAM_NAME.get(normalizeTeamName(name));
    if (!abbr) {
      throw new Error(`No canonical team code for points-allowed team "${name}".`);
    }

    const byPosition = Object.fromEntries(
      POINTS_ALLOWED_POSITIONS.map((position) => {
        const rank = Number(cells[columnIndex.get(`${position} RK`)!]);
        const pointsAllowed = Number(cells[columnIndex.get(`${position} PA`)!]);
        if (!Number.isFinite(rank) || !Number.isFinite(pointsAllowed)) {
          throw new Error(`Incomplete ${position} points-allowed data for ${name}.`);
        }
        return [position, { rank, pointsAllowed }];
      }),
    ) as Record<PointsAllowedPosition, PointsAllowedEntry>;

    return { abbr, name, byPosition };
  });
}

export const POINTS_ALLOWED_2025: readonly PointsAllowedTeam[] = parseCsv(pointsAllowedCsv);

const BY_ABBR = new Map(POINTS_ALLOWED_2025.map((team) => [team.abbr, team]));

export function getPointsAllowedTeam(abbr: string | undefined): PointsAllowedTeam | undefined {
  return abbr ? BY_ABBR.get(abbr) : undefined;
}

/**
 * Resolves a schedule opponent token ("@KC", "LA") to that defense's 2025
 * points allowed against the given position.
 */
export function getOpponentPointsAllowed(
  opponentToken: string | undefined,
  position: PointsAllowedPosition,
): (PointsAllowedEntry & { team: PointsAllowedTeam }) | undefined {
  const team = getPointsAllowedTeam(normalizeOpponentCode(opponentToken));
  if (!team) return undefined;
  return { ...team.byPosition[position], team };
}
