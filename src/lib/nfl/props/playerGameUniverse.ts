import {
  NFL_PLAYER_GAME_UNIVERSE_SCHEMA_VERSION,
  type NflPlayerGameUniverseEligibility,
  type NflPlayerGameUniverseOutcomes,
  type NflPlayerGameUniverseRow,
} from "./types/playerGameUniverse";
import type { NflPropPosition } from "./types/identity";
import { gameJoinKey, type NflGameJoinRecord, type NflYardageOutcomeRow } from "./historicalOutcomes";
import { normalizeNflPropTeamAbbr } from "./types/identity";

export const UNIVERSE_POSITIONS: readonly NflPropPosition[] = ["QB", "RB", "WR", "TE"];

/** Same low, fixed, non-tuned bar Phase 5 used for rushing, generalized to any activity stat. */
export const PRIOR_SEASON_ELIGIBILITY_THRESHOLD: Readonly<Record<"carries" | "targets" | "passAttempts", number>> = {
  carries: 20,
  targets: 20,
  passAttempts: 50,
};

export type NflRosterStatusRow = {
  season: number;
  week: number;
  team: string;
  playerId: string;
  playerName: string;
  position: string;
  status: string;
};

const ZERO_OUTCOMES: NflPlayerGameUniverseOutcomes = {
  passAttempts: 0, completions: 0, passingYards: 0, carries: 0, rushingYards: 0, targets: 0, receptions: 0, receivingYards: 0,
};

function opponentOf(gameId: string | null, team: string, games: readonly { gameId: string; homeAbbr: string; awayAbbr: string }[]): string | null {
  if (!gameId) return null;
  const game = games.find((g) => g.gameId === gameId);
  if (!game) return null;
  if (game.homeAbbr === team) return game.awayAbbr;
  if (game.awayAbbr === team) return game.homeAbbr;
  return null;
}

/**
 * Tier 1: every Phase 1 player-week outcome row (already unfiltered by stat
 * value -- `normalizeYardageOutcomeRow` never drops a zero-carry/zero-target
 * row, only non-REG season_type and unresolved identity) restricted to
 * QB/RB/WR/TE. This alone recovers the large majority of legitimate
 * zero-output games, because a player who recorded ANY offensive stat that
 * week (e.g. a RB with 0 carries but 2 receptions) already has a row here.
 */
export function buildStatsTableUniverseRows(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  games: readonly { gameId: string; homeAbbr: string; awayAbbr: string }[],
  rosterStatusKnownSeasons: ReadonlySet<number>,
): NflPlayerGameUniverseRow[] {
  const rows: NflPlayerGameUniverseRow[] = [];
  for (const r of yardageOutcomeRows) {
    const position = r.context.position as NflPropPosition;
    if (!UNIVERSE_POSITIONS.includes(position)) continue;
    rows.push({
      schemaVersion: NFL_PLAYER_GAME_UNIVERSE_SCHEMA_VERSION,
      season: r.context.season, week: r.context.week, gameId: r.context.gameId, gameDateUtc: r.context.gameDateUtc,
      playerId: r.context.playerId, playerName: r.context.playerName, team: r.context.team,
      opponent: r.context.opponent || opponentOf(r.context.gameId, r.context.team, games),
      position, homeAway: r.context.homeAway,
      membershipSource: "statsTable",
      rosterStatusKnown: rosterStatusKnownSeasons.has(r.context.season),
      outcomes: {
        passAttempts: r.outcomes.passAttempts, completions: null, passingYards: r.outcomes.passingYards,
        carries: r.outcomes.carries, rushingYards: r.outcomes.rushingYards,
        targets: r.outcomes.targets, receptions: r.outcomes.receptions, receivingYards: r.outcomes.receivingYards,
      },
      eligibility: { rushingEligiblePregame: false, receivingEligiblePregame: false, passingEligiblePregame: false }, // filled in later
    });
  }
  return rows;
}

/**
 * Tier 2: a skill-position player confirmed `status=="ACT"` in weekly_rosters
 * for an exact team-week with NO matching stats_table row. Distinct from the
 * source's own explicit `"INA"` (inactive) status, so this specifically
 * targets "dressed, recorded zero in every offensive category" -- treated
 * as a true zero across every stat, not a guess. 2023-2025 only (no 2022
 * weekly_rosters cache).
 */
export function buildActiveRosterUniverseRows(
  rosterRows: readonly NflRosterStatusRow[],
  statsTableKeys: ReadonlySet<string>,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  games: readonly { gameId: string; homeAbbr: string; awayAbbr: string }[],
): NflPlayerGameUniverseRow[] {
  const rows: NflPlayerGameUniverseRow[] = [];
  const seen = new Set<string>();
  for (const r of rosterRows) {
    if (r.status !== "ACT") continue;
    const position = r.position as NflPropPosition;
    if (!UNIVERSE_POSITIONS.includes(position)) continue;
    const team = normalizeNflPropTeamAbbr(r.team);
    if (!team) continue;
    const statsKey = `${r.season}|${r.week}|${r.playerId}`;
    if (statsTableKeys.has(statsKey)) continue; // already covered by tier 1
    const dedupeKey = `${statsKey}|${team}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const join = gameJoinIndex.get(gameJoinKey(r.season, r.week, team));
    rows.push({
      schemaVersion: NFL_PLAYER_GAME_UNIVERSE_SCHEMA_VERSION,
      season: r.season, week: r.week, gameId: join?.gameId ?? null, gameDateUtc: join?.gameDateUtc ?? null,
      playerId: r.playerId, playerName: r.playerName, team,
      opponent: join ? opponentOf(join.gameId, team, games) : null,
      position, homeAway: join?.homeAway ?? null,
      membershipSource: "activeRosterConfirmed",
      rosterStatusKnown: true,
      outcomes: join ? { ...ZERO_OUTCOMES } : { passAttempts: null, completions: null, passingYards: null, carries: null, rushingYards: null, targets: null, receptions: null, receivingYards: null },
      eligibility: { rushingEligiblePregame: false, receivingEligiblePregame: false, passingEligiblePregame: false },
    });
  }
  return rows;
}

type ActivityLogEntry = { playerId: string; season: number; gameDateUtc: string; activityCount: number };

function buildActivityLog(rows: readonly NflPlayerGameUniverseRow[], statKey: "carries" | "targets" | "passAttempts"): ActivityLogEntry[] {
  return rows
    .filter((r) => r.gameDateUtc != null && r.outcomes[statKey] != null)
    .map((r) => ({ playerId: r.playerId, season: r.season, gameDateUtc: r.gameDateUtc as string, activityCount: r.outcomes[statKey] as number }));
}

/** Same eligibility algorithm Phase 5 established for rushing, generalized to any activity stat. Never reads the target row's own activity. */
export function isMarketPregameEligible(
  activityLog: readonly ActivityLogEntry[],
  playerId: string,
  season: number,
  beforeDateUtc: string,
  priorSeasonThreshold: number,
): boolean {
  const priorThisSeason = activityLog.some((e) => e.playerId === playerId && e.season === season && e.gameDateUtc < beforeDateUtc && e.activityCount > 0);
  if (priorThisSeason) return true;
  const priorSeasonTotal = activityLog
    .filter((e) => e.playerId === playerId && e.season === season - 1)
    .reduce((s, e) => s + e.activityCount, 0);
  return priorSeasonTotal >= priorSeasonThreshold;
}

/** Computes and attaches all three market eligibility flags to every row, using only the full row set's OWN prior-game activity (never a row's own week). */
export function attachEligibility(rows: readonly NflPlayerGameUniverseRow[]): NflPlayerGameUniverseRow[] {
  const rushLog = buildActivityLog(rows, "carries");
  const targetLog = buildActivityLog(rows, "targets");
  const attemptLog = buildActivityLog(rows, "passAttempts");
  return rows.map((row) => {
    if (row.gameDateUtc == null) return row;
    const eligibility: NflPlayerGameUniverseEligibility = {
      rushingEligiblePregame: isMarketPregameEligible(rushLog, row.playerId, row.season, row.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.carries),
      receivingEligiblePregame: isMarketPregameEligible(targetLog, row.playerId, row.season, row.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.targets),
      passingEligiblePregame: row.position === "QB" && isMarketPregameEligible(attemptLog, row.playerId, row.season, row.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.passAttempts),
    };
    return { ...row, eligibility };
  });
}

/** Full build: tier 1 + tier 2, deduplicated, sorted, with eligibility attached. */
export function buildPlayerGameUniverse(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  rosterRows: readonly NflRosterStatusRow[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  games: readonly { gameId: string; homeAbbr: string; awayAbbr: string }[],
  rosterStatusKnownSeasons: ReadonlySet<number>,
): NflPlayerGameUniverseRow[] {
  const statsRows = buildStatsTableUniverseRows(yardageOutcomeRows, games, rosterStatusKnownSeasons);
  const statsTableKeys = new Set(statsRows.map((r) => `${r.season}|${r.week}|${r.playerId}`));
  const rosterOnlyRows = buildActiveRosterUniverseRows(rosterRows, statsTableKeys, gameJoinIndex, games);
  const all = attachEligibility([...statsRows, ...rosterOnlyRows]);
  return all.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team) || a.playerId.localeCompare(b.playerId),
  );
}
