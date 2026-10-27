/**
 * Invented board for local UI review (dev server only, `?demo=synthetic`).
 * Every player, line, projection and box score below is made up. The artifact
 * is flagged synthetic so the page shows a banner. Browser-safe: no hashing.
 */
import { CANONICAL_TEAM_CODES } from "../canonical";
import { buildDvpRows, DVP_POSITIONS, type DvpPlayerGameLine, type DvpSeason } from "../dvp";
import { BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";
import { opponentRecentKey, type OpponentRecentGame, type OpponentRecentSequence, type PlayerRecentGame } from "../recentForm";
import type { RecentTotals, SeasonStatsView, SeasonTotals } from "../seasonStats";

const SOURCE = { sourceId: "synthetic-box", sourceUpdatedAtUtc: "2026-11-09T12:00:00Z" } as const;
const STAT_BASE = { pts: [22, 20, 18, 16, 14], reb: [4, 5, 7, 9, 11], ast: [8, 5, 4, 3, 2] } as const;

/** Deterministic wobble in [-5, 5] that differs by team, position and game, so rank orders differ across positions. */
const wobble = (team: number, position: number, salt: number): number => ((team * 7 + position * 13 + salt * 5 + team * position * 3) % 11) - 5;

function demoLines(season: DvpSeason, games: number): DvpPlayerGameLine[] {
  return CANONICAL_TEAM_CODES.flatMap((team, t) =>
    Array.from({ length: games }, (_, g) =>
      DVP_POSITIONS.map((position, p): DvpPlayerGameLine => ({
        season,
        gameId: `${season}-${team}-${g}`,
        opponentTeam: team,
        playerId: `${season}-${team}-${g}-${position}`,
        minutes: 30,
        pts: Math.max(0, STAT_BASE.pts[p] + wobble(t, p, g)),
        reb: Math.max(0, STAT_BASE.reb[p] + Math.round(wobble(t, p, g + 1) / 2)),
        ast: Math.max(0, STAT_BASE.ast[p] + Math.round(wobble(t, p, g + 2) / 2)),
        positionLabel: position,
        ...SOURCE,
      })),
    ).flat(),
  );
}

const TIPOFF = "2026-11-10T00:30:00Z";
const GAME_KEY = "2026-11-09|NYK@BOS";
const CAPTURED = "2026-11-09T21:30:00Z";

/** Invented season totals from per-game figures: games, minutes, points, rebounds and assists per game. Not real data. */
const totals = (season: string, games: number, mpg: number, ppg: number, rpg: number, apg: number): SeasonTotals => ({
  season,
  games,
  minutes: Math.round(games * mpg * 10) / 10,
  pts: Math.round(games * ppg * 10) / 10,
  reb: Math.round(games * rpg * 10) / 10,
  ast: Math.round(games * apg * 10) / 10,
});

/** Invented last-N window from per-game figures. Not real data. */
const recent = (games: number, mpg: number, ppg: number, rpg: number, apg: number): RecentTotals => ({
  games,
  minutes: Math.round(games * mpg * 10) / 10,
  pts: Math.round(games * ppg * 10) / 10,
  reb: Math.round(games * rpg * 10) / 10,
  ast: Math.round(games * apg * 10) / 10,
});

interface DemoPlayer {
  name: string;
  /** JKB projected minutes. */
  minutes: number;
  /** Invented season-to-date figures; absent for a player with no history at all. */
  seasonStats?: SeasonStatsView;
  team: "NYK" | "BOS";
  label: string | null;
  pts: [line: number | null, projection: number | null];
  reb: [number | null, number | null];
  ast: [number | null, number | null];
}

const CURRENT = "2026-27";
const PREVIOUS = "2025-26";


/** Offsets that sum to zero, so the invented games average exactly the invented per-game figure. */
const OFFSETS: Readonly<Record<number, readonly number[]>> = {
  3: [-1, 2, -1],
  5: [-2, 1, 3, -3, 1],
  10: [-4, 3, -2, 5, -1, 2, -3, 4, -5, 1],
};
const RECENT_OPPONENTS = ["MIA", "ATL", "CHI", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAL"] as const;
const dayBefore = (daysBack: number): string => new Date(Date.UTC(2026, 10, 9) - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
const tenth = (n: number): number => Math.round(Math.max(0, n) * 10) / 10;

/** Invented game-by-game results (oldest to newest) behind a last-N window. Not real data. */
function demoGames(n: number, mpg: number, ppg: number, rpg: number, apg: number): PlayerRecentGame[] {
  const offsets = OFFSETS[n] ?? Array.from({ length: n }, () => 0);
  return offsets.map((offset, i) => ({
    date: dayBefore((n - i) * 2),
    opponent: RECENT_OPPONENTS[i % RECENT_OPPONENTS.length],
    isHome: i % 2 === 0,
    minutes: tenth(mpg),
    pts: tenth(ppg + offset),
    reb: tenth(rpg + offset * 0.4),
    ast: tenth(apg + offset * 0.2),
  }));
}

/** Invented opponent games for one position; every figure is a fixed formula of the game number. Not real data. */
function demoOpponentGames(defense: string, position: number, games: number, gapGame: number | null): OpponentRecentGame[] {
  return Array.from({ length: games }, (_, i) => {
    const total = 240;
    const gap = gapGame === i;
    return {
      date: dayBefore((games - i) * 2),
      versus: RECENT_OPPONENTS[(i + position) % RECENT_OPPONENTS.length],
      defenseIsHome: i % 2 === 1,
      attributedMinutes: gap ? 0 : total - 24 - ((i * 7 + position * 5) % 30),
      totalMinutes: total,
      pts: gap ? null : tenth(STAT_BASE.pts[position] + wobble(defense === "BOS" ? 3 : 8, position, i)),
      reb: gap ? null : tenth(STAT_BASE.reb[position] + wobble(defense === "BOS" ? 3 : 8, position, i + 1) / 2),
      ast: gap ? null : tenth(STAT_BASE.ast[position] + wobble(defense === "BOS" ? 3 : 8, position, i + 2) / 2),
    };
  });
}

/** BOS has played ten games (a full window, with one gap for the centers); NYK only four, so its window is a small sample. */
function demoOpponentRecent(): Record<string, OpponentRecentSequence> {
  const sequences: Record<string, OpponentRecentSequence> = {};
  for (const [defense, count, seasonGames] of [["BOS", 10, 14], ["NYK", 4, 4]] as const) {
    DVP_POSITIONS.forEach((position, p) => {
      sequences[opponentRecentKey(GAME_KEY, defense, position)] = { team: defense, position, season: CURRENT, seasonGames, games: demoOpponentGames(defense, p, count, defense === "BOS" && position === "C" ? 4 : null) };
    });
  }
  return sequences;
}

const PLAYERS: DemoPlayer[] = [
  // Full-sample veteran: this season and last, shown with a clear sample size.
  { name: "Demo Guard One", team: "NYK", label: "PG", minutes: 34, seasonStats: { current: totals(CURRENT, 24, 33.8, 25.4, 3.9, 8.6), previous: totals(PREVIOUS, 74, 34.6, 24.1, 4.2, 8.1), last5: recent(5, 34.2, 28.6, 3.4, 9.2), last10: recent(10, 33.9, 26.8, 3.7, 8.9), recentGames: demoGames(10, 33.9, 26.8, 3.7, 8.9) }, pts: [24.5, 26.1], reb: [3.5, 3.8], ast: [8.5, 9.4] },
  // Early in the season: three games, so last season is shown beside it, separately.
  { name: "Demo Wing Two", team: "NYK", label: "SG", minutes: 31.5, seasonStats: { current: totals(CURRENT, 3, 29.1, 15.3, 5.7, 3.0), previous: totals(PREVIOUS, 70, 32.4, 19.8, 5.3, 3.6), last5: recent(3, 29.1, 15.3, 5.7, 3.0), last10: recent(3, 29.1, 15.3, 5.7, 3.0), recentGames: demoGames(3, 29.1, 15.3, 5.7, 3.0) }, pts: [19.5, 17.9], reb: [5.5, 5.1], ast: [3.5, 3.2] },
  { name: "Demo Forward Three", team: "NYK", label: "PF", minutes: 29, seasonStats: { current: totals(CURRENT, 22, 28.4, 16.9, 8.1, 2.7), previous: totals(PREVIOUS, 66, 27.8, 15.2, 7.6, 2.4), last5: recent(5, 29.6, 19.4, 9.0, 2.2), last10: recent(10, 28.9, 17.8, 8.4, 2.5), recentGames: demoGames(10, 28.9, 17.8, 8.4, 2.5) }, pts: [16.5, 18.2], reb: [7.5, 8.4], ast: [2.5, 2.9] },
  { name: "Demo Big Four", team: "NYK", label: "C", minutes: 26, seasonStats: { current: totals(CURRENT, 20, 25.5, 13.8, 11.9, 2.1), previous: totals(PREVIOUS, 61, 26.9, 14.6, 11.2, 2.3), last5: recent(5, 24.2, 11.2, 13.4, 1.8), last10: recent(10, 25.1, 12.9, 12.3, 2.0), recentGames: demoGames(10, 25.1, 12.9, 12.3, 2.0) }, pts: [14.5, 14.0], reb: [11.5, 12.3], ast: [2.5, 2.2] },
  { name: "Demo Guard Five", team: "BOS", label: "SG", minutes: 33, seasonStats: { current: totals(CURRENT, 18, 32.6, 22.7, 4.1, 4.9), previous: totals(PREVIOUS, 72, 33.1, 21.9, 4.4, 4.6), last5: recent(5, 33.4, 21.2, 4.6, 5.8), last10: recent(10, 32.9, 22.1, 4.3, 5.2), recentGames: demoGames(10, 32.9, 22.1, 4.3, 5.2) }, pts: [22.5, 23.4], reb: [4.5, 4.2], ast: [4.5, 5.0] },
  // No games yet this season: only last season exists, shown on its own.
  { name: "Demo Wing Six", team: "BOS", label: "SF", minutes: 30, seasonStats: { current: null, previous: totals(PREVIOUS, 58, 30.2, 17.4, 6.4, 3.3), last5: null, last10: null, recentGames: [] }, pts: [18.5, null], reb: [6.5, null], ast: [3.5, null] },
  // No history at all: no season figures, and a projection with no minutes to scale from is still shown.
  { name: "Demo Bench Seven", team: "BOS", label: null, minutes: 14, pts: [null, 9.1], reb: [null, 3.0], ast: [null, 1.5] },
  { name: "Demo Big Eight", team: "BOS", label: "C", minutes: 27, seasonStats: { current: totals(CURRENT, 21, 26.7, 14.9, 10.2, 1.8), previous: totals(PREVIOUS, 64, 27.3, 14.1, 10.6, 1.6), last5: recent(5, 27.4, 16.0, 9.6, 1.4), last10: recent(10, 26.9, 15.4, 10.0, 1.7), recentGames: demoGames(10, 26.9, 15.4, 10.0, 1.7) }, pts: [13.5, 15.2], reb: [10.5, 10.1], ast: [1.5, 1.7] },
];

function entryFor(player: DemoPlayer, market: "pts" | "reb" | "ast"): BoardEntry {
  const [line, projection] = player[market];
  const opponent = player.team === "NYK" ? "BOS" : "NYK";
  return {
    entryKey: `${GAME_KEY}|${player.name}|${market}|demobook`,
    playerName: player.name,
    team: player.team,
    opponent,
    gameKey: GAME_KEY,
    tipoffUtc: TIPOFF,
    positionLabel: player.label,
    market,
    line: line === null ? null : { sportsbook: "demobook", line, overPrice: -115, underPrice: -105, capturedAtUtc: CAPTURED, freshness: "fresh", ageMinutes: 12 },
    lineWithheldReason: line === null ? "no line posted" : null,
    projection: projection === null ? null : { value: projection, minutes: player.minutes, modelVersion: "synthetic-demo" },
    projectionUnavailableReason: projection === null ? "no usable history" : null,
    ...(player.seasonStats ? { seasonStats: player.seasonStats } : {}),
  };
}

export function buildDemoBoard(): PropsBoardArtifact {
  const { rows } = buildDvpRows([...demoLines("2025-26", 4), ...demoLines("2026-27", 3)]);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    generatedAtUtc: "2026-11-09T22:00:00Z",
    isSynthetic: true,
    sources: { lines: ["synthetic-odds"], dvp: "synthetic-box", dvpUpdatedUtc: SOURCE.sourceUpdatedAtUtc },
    entries: PLAYERS.flatMap((player) => (["pts", "reb", "ast"] as const).map((market) => entryFor(player, market))),
    dvpRows: rows,
    opponentRecent: demoOpponentRecent(),
  };
}
