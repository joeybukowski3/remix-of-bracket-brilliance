/**
 * Defense vs. Position (DvP): PTS, REB and AST allowed to PG, SG, SF, PF and C.
 *
 * Definition. For one opponent team, season, position and stat:
 *   allowedPerGame = sum over that team's games of (sum over opposing players of
 *                    position weight x stat) / games the team played in the dataset.
 * The denominator is every game the team has in the input, including games where
 * no one was attributed to the position, so a position that rarely plays is not
 * inflated. Position weights come from dvpPositions.ts; unclassified players are
 * excluded and reported through `minutesCoverage`, never guessed.
 * Rank 1 = most allowed (easiest matchup). Ties are broken by team code so the
 * order is deterministic. A rank exists only when all 30 teams have a row.
 *
 * Seasons: "2025-26" is called 2025 and "2026-27" is called 2026 in the product.
 * The two seasons are always kept separate; the blend is a display aid only and
 * is not an input to any projection (no holdout evaluation supports using DvP).
 *
 * Nothing here fetches data. Callers pass player-game lines from a source whose
 * license permits the use, with provenance.
 */
import { CANONICAL_TEAM_CODES } from "./canonical";
import { classifyPositionMinutes, classifyRosterLabel, DVP_POSITIONS, type DvpPosition, type PositionClassification } from "./dvpPositions";

export { DVP_POSITIONS };
export type { DvpPosition };

export const DVP_SEASONS = ["2025-26", "2026-27"] as const;
export type DvpSeason = (typeof DVP_SEASONS)[number];
export const DVP_STATS = ["PTS", "REB", "AST"] as const;
export type DvpStat = (typeof DVP_STATS)[number];
export type DvpView = DvpSeason | "blended";

export const SEASON_LABEL: Readonly<Record<DvpSeason, string>> = Object.freeze({ "2025-26": "2025", "2026-27": "2026" });

/** Prior-season pseudo-games in the blend. An untuned design default; not validated on holdout data. */
export const BLEND_PRIOR_GAMES = 20;
/** Current-season games below which a matchup read is mostly last season's information. */
export const PRIOR_LED_BELOW_GAMES = 5;
export const CURRENT_LED_FROM_GAMES = 20;
/** Rank thresholds for a 30-team league: 1-10 allows the most, 21-30 the least. */
export const FAVORABLE_RANK_MAX = 10;
export const TOUGH_RANK_MIN = 21;

const MIN_PLAYER_MINUTES = 0;

export interface DvpPlayerGameLine {
  season: DvpSeason;
  gameId: string;
  /** The defense: the team the player's team played against. */
  opponentTeam: string;
  playerId: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** Roster position label (for example "G-F"); used when positionMinutes is absent. */
  positionLabel: string | null;
  /** Minutes at each position; preferred when present. */
  positionMinutes?: Partial<Record<string, number>>;
  sourceId: string;
  sourceUpdatedAtUtc: string;
}

export interface DvpRow {
  season: DvpSeason;
  opponentTeam: string;
  position: DvpPosition;
  statistic: DvpStat;
  allowedPerGame: number;
  /** 1 = most allowed. Null until all 30 teams have a row for this season, position and stat. */
  rank: number | null;
  gamesSampled: number;
  /** Share of the team's player minutes that could be attributed to a position (0-1). */
  minutesCoverage: number;
  lastUpdatedUtc: string;
  sourceId: string;
}

export interface DvpExclusion {
  season: DvpSeason;
  gameId: string;
  playerId: string;
  reason: string;
}

export interface DvpBuildResult {
  rows: DvpRow[];
  excluded: DvpExclusion[];
}

const STAT_FIELD = { PTS: "pts", REB: "reb", AST: "ast" } as const;

interface TeamSeasonAcc {
  games: Set<string>;
  classifiedMinutes: number;
  totalMinutes: number;
  totals: Map<string, number>;
  sourceId: string;
  lastUpdatedUtc: string;
}

function classify(line: DvpPlayerGameLine): PositionClassification {
  return line.positionMinutes ? classifyPositionMinutes(line.positionMinutes, line.minutes) : classifyRosterLabel(line.positionLabel);
}

function validateLine(line: DvpPlayerGameLine, teams: ReadonlySet<string>): void {
  if (!DVP_SEASONS.includes(line.season)) throw new Error(`unsupported DvP season "${line.season}"`);
  if (!teams.has(line.opponentTeam)) throw new Error(`unknown opponent team "${line.opponentTeam}"`);
  if (!line.gameId || !line.playerId) throw new Error("game and player ids are required");
  if (!line.sourceId || !Number.isFinite(Date.parse(line.sourceUpdatedAtUtc))) throw new Error("source provenance is required");
  if (!Number.isFinite(line.minutes) || line.minutes < MIN_PLAYER_MINUTES) throw new Error("minutes must be a non-negative number");
  if ([line.pts, line.reb, line.ast].some((v) => !Number.isFinite(v) || v < 0)) throw new Error("box-score stats must be non-negative numbers");
}

function assignRanks(rows: DvpRow[], teamCount: number): void {
  for (const season of DVP_SEASONS) {
    for (const position of DVP_POSITIONS) {
      for (const statistic of DVP_STATS) {
        const group = rows.filter((r) => r.season === season && r.position === position && r.statistic === statistic);
        if (group.length !== teamCount) continue;
        group.sort((a, b) => b.allowedPerGame - a.allowedPerGame || a.opponentTeam.localeCompare(b.opponentTeam));
        group.forEach((r, i) => {
          r.rank = i + 1;
        });
      }
    }
  }
}

export function buildDvpRows(lines: readonly DvpPlayerGameLine[], teams: readonly string[] = CANONICAL_TEAM_CODES): DvpBuildResult {
  const teamSet = new Set(teams);
  const seen = new Set<string>();
  const seasonSource = new Map<DvpSeason, string>();
  const accs = new Map<string, TeamSeasonAcc & { season: DvpSeason; team: string }>();
  const excluded: DvpExclusion[] = [];

  for (const line of lines) {
    validateLine(line, teamSet);
    const identity = [line.season, line.gameId, line.playerId].join("|");
    if (seen.has(identity)) throw new Error(`duplicate player-game ${identity}`);
    seen.add(identity);
    const knownSource = seasonSource.get(line.season);
    if (knownSource && knownSource !== line.sourceId) throw new Error(`mixed sources in ${line.season} require reconciliation`);
    seasonSource.set(line.season, line.sourceId);

    const key = `${line.season}|${line.opponentTeam}`;
    const acc =
      accs.get(key) ??
      { season: line.season, team: line.opponentTeam, games: new Set<string>(), classifiedMinutes: 0, totalMinutes: 0, totals: new Map<string, number>(), sourceId: line.sourceId, lastUpdatedUtc: line.sourceUpdatedAtUtc };
    accs.set(key, acc);
    acc.games.add(line.gameId);
    acc.totalMinutes += line.minutes;
    if (line.sourceUpdatedAtUtc > acc.lastUpdatedUtc) acc.lastUpdatedUtc = line.sourceUpdatedAtUtc;

    const position = classify(line);
    if (position.ok === false) {
      excluded.push({ season: line.season, gameId: line.gameId, playerId: line.playerId, reason: position.reason });
      continue;
    }
    acc.classifiedMinutes += line.minutes;
    for (const [pos, weight] of Object.entries(position.weights) as [DvpPosition, number][]) {
      for (const stat of DVP_STATS) {
        const id = `${pos}|${stat}`;
        acc.totals.set(id, (acc.totals.get(id) ?? 0) + weight * line[STAT_FIELD[stat]]);
      }
    }
  }

  const rows: DvpRow[] = [];
  for (const acc of accs.values()) {
    for (const position of DVP_POSITIONS) {
      for (const statistic of DVP_STATS) {
        rows.push({
          season: acc.season,
          opponentTeam: acc.team,
          position,
          statistic,
          allowedPerGame: (acc.totals.get(`${position}|${statistic}`) ?? 0) / acc.games.size,
          rank: null,
          gamesSampled: acc.games.size,
          minutesCoverage: acc.totalMinutes > 0 ? acc.classifiedMinutes / acc.totalMinutes : 0,
          lastUpdatedUtc: acc.lastUpdatedUtc,
          sourceId: acc.sourceId,
        });
      }
    }
  }
  assignRanks(rows, teamSet.size);
  return { rows, excluded };
}

export interface DvpBlend {
  allowedPerGame: number;
  rank: number | null;
  /** Share of the blended value that comes from the current season (0-1). */
  currentWeight: number;
}

/** Shrink the current season toward the prior season: (n x current + K x prior) / (n + K). */
export function blendAllowed(prior: DvpRow | null, current: DvpRow | null): Pick<DvpBlend, "allowedPerGame" | "currentWeight"> | null {
  if (!prior && !current) return null;
  if (!current) return { allowedPerGame: prior!.allowedPerGame, currentWeight: 0 };
  if (!prior) return { allowedPerGame: current.allowedPerGame, currentWeight: 1 };
  const n = current.gamesSampled;
  const currentWeight = n / (n + BLEND_PRIOR_GAMES);
  return { allowedPerGame: currentWeight * current.allowedPerGame + (1 - currentWeight) * prior.allowedPerGame, currentWeight };
}

const findRow = (rows: readonly DvpRow[], season: DvpSeason, team: string, position: DvpPosition, statistic: DvpStat): DvpRow | null =>
  rows.find((r) => r.season === season && r.opponentTeam === team && r.position === position && r.statistic === statistic) ?? null;

/** Blend every team in one position and stat group, then rank them. */
export function blendGroup(rows: readonly DvpRow[], position: DvpPosition, statistic: DvpStat, teams: readonly string[] = CANONICAL_TEAM_CODES): Map<string, DvpBlend> {
  const blends = new Map<string, DvpBlend>();
  for (const team of teams) {
    const blend = blendAllowed(findRow(rows, "2025-26", team, position, statistic), findRow(rows, "2026-27", team, position, statistic));
    if (blend) blends.set(team, { ...blend, rank: null });
  }
  if (blends.size === teams.length) {
    [...blends.entries()]
      .sort((a, b) => b[1].allowedPerGame - a[1].allowedPerGame || a[0].localeCompare(b[0]))
      .forEach(([, blend], i) => {
        blend.rank = i + 1;
      });
  }
  return blends;
}

export type SampleBasis = "none" | "prior-led" | "blending" | "current-led";
export type MatchupTier = "favorable" | "neutral" | "tough";

export interface DvpComparison {
  prior: DvpRow | null;
  current: DvpRow | null;
  blended: DvpBlend | null;
  sampleBasis: SampleBasis;
  /** Null when no rank is available. Read with sampleBasis: "prior-led" means mostly last season. */
  tier: MatchupTier | null;
}

export function sampleBasisFor(prior: DvpRow | null, current: DvpRow | null): SampleBasis {
  const n = current?.gamesSampled ?? 0;
  if (!prior && !current) return "none";
  if (n < PRIOR_LED_BELOW_GAMES) return prior ? "prior-led" : "none";
  return n < CURRENT_LED_FROM_GAMES ? "blending" : "current-led";
}

export function tierForRank(rank: number | null): MatchupTier | null {
  if (rank === null) return null;
  if (rank <= FAVORABLE_RANK_MAX) return "favorable";
  return rank >= TOUGH_RANK_MIN ? "tough" : "neutral";
}

export function compareDvp(rows: readonly DvpRow[], team: string, position: DvpPosition, statistic: DvpStat, teams: readonly string[] = CANONICAL_TEAM_CODES): DvpComparison {
  const prior = findRow(rows, "2025-26", team, position, statistic);
  const current = findRow(rows, "2026-27", team, position, statistic);
  const blended = blendGroup(rows, position, statistic, teams).get(team) ?? null;
  return { prior, current, blended, sampleBasis: sampleBasisFor(prior, current), tier: tierForRank(blended?.rank ?? null) };
}

export interface DvpMatrixCell {
  team: string;
  allowedPerGame: number | null;
  rank: number | null;
  gamesSampled: number | null;
  /** Current-season weight, for the blended view only. */
  currentWeight: number | null;
}

function blendedCell(rows: readonly DvpRow[], team: string, position: DvpPosition, statistic: DvpStat, blends: Map<string, DvpBlend>): DvpMatrixCell {
  const blend = blends.get(team);
  const current = findRow(rows, "2026-27", team, position, statistic);
  return { team, allowedPerGame: blend?.allowedPerGame ?? null, rank: blend?.rank ?? null, gamesSampled: current?.gamesSampled ?? null, currentWeight: blend?.currentWeight ?? null };
}

/** One column of the DvP matrix: every team for one position, stat and view, best matchup first, teams with no data last. */
export function dvpMatrixColumn(rows: readonly DvpRow[], view: DvpView, position: DvpPosition, statistic: DvpStat, teams: readonly string[] = CANONICAL_TEAM_CODES): DvpMatrixCell[] {
  const blends = view === "blended" ? blendGroup(rows, position, statistic, teams) : new Map<string, DvpBlend>();
  const cellFor = (team: string): DvpMatrixCell => {
    if (view === "blended") return blendedCell(rows, team, position, statistic, blends);
    const row = findRow(rows, view, team, position, statistic);
    return { team, allowedPerGame: row?.allowedPerGame ?? null, rank: row?.rank ?? null, gamesSampled: row?.gamesSampled ?? null, currentWeight: null };
  };
  const cells = teams.map(cellFor);
  return cells.sort((a, b) => (a.allowedPerGame === null ? 1 : 0) - (b.allowedPerGame === null ? 1 : 0) || (b.allowedPerGame ?? 0) - (a.allowedPerGame ?? 0) || a.team.localeCompare(b.team));
}
