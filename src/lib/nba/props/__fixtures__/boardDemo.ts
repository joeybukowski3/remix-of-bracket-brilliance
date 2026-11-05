/**
 * Invented board for local UI review (dev server only, `?demo=synthetic`).
 * Every player, line, projection and box score below is made up. The artifact
 * is flagged synthetic so the page shows a banner. Browser-safe: no hashing.
 */
import { CANONICAL_TEAM_CODES } from "../canonical";
import { buildDvpRows, DVP_POSITIONS, type DvpPlayerGameLine, type DvpSeason } from "../dvp";
import { BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";
import { opponentBoxKey, opponentRecentKey, teamDefenseKey, type OpponentBoxScoreGame, type OpponentBoxScores, type OpponentRecentGame, type OpponentRecentSequence, type OpposingPlayerLine, type PlayerRecentGame, type GameResult, type TeamDefenseEntry, type TeamDefenseTable } from "../recentForm";
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
    // One game in each window has no known final score, so the table's "no result" state is exercised too.
    ...(i === 4 ? {} : { result: demoResult(i) }),
  }));
}

/** An invented final score from the player's side: lost every third game. */
function demoResult(i: number): GameResult {
  const won = i % 3 !== 1;
  return { won, teamPts: won ? 112 + i : 101 + i, opponentPts: won ? 104 + i : 109 + i };
}

/** Starting and bench minutes by position (PG, SG, SF, PF, C), and an invented base line for each. Not real data. */
const STARTER_MINUTES = [34, 33, 31, 29, 27] as const;
const BENCH_MINUTES = [14, 12, 13, 15, 11] as const;
/** In a fully attributed game the benches are longer, so the opposing minutes add to 240 with nobody left unmatched. */
const FULL_BENCH_MINUTES = [20, 18, 16, 18, 14] as const;
const TEAM_MINUTES = 240;

const integer = (n: number): number => Math.max(0, Math.round(n));

/** The estimated position of the starter listed at `position` in a defense's game; differs from it only in the ambiguous BOS games. */
function estimatedPosition(defense: string, game: number, position: (typeof DVP_POSITIONS)[number]): (typeof DVP_POSITIONS)[number] | null {
  if (defense !== "BOS") return position;
  if (game === AMBIGUOUS_GAMES.twoGuards && position === "SG") return "PG";
  if (game === AMBIGUOUS_GAMES.noPointGuard && position === "PG") return "SF";
  if (game === AMBIGUOUS_GAMES.unclassifiedStarter && position === "C") return null;
  return position;
}

/**
 * Games of the BOS defense that exercise the starter rule. The flags are the source's; the positions are the estimates.
 *   6: the SG starter is estimated at PG too, so PG has two starters and SG has none
 *   7: the PG starter is estimated at SF, so PG has no starter and SF has two
 *   8: the C starter has no position estimate, so who holds a position is unclear
 */
const AMBIGUOUS_GAMES = { twoGuards: 6, noPointGuard: 7, unclassifiedStarter: 8 } as const;

/** Invented opposing players for one defense game: every figure is a fixed formula of the game number. Not real data. */
function demoOpposingPlayers(defense: string, versus: string, i: number, isGap: boolean): OpposingPlayerLine[] {
  const unmatched = (minutes: number, label: string, pts: number): OpposingPlayerLine => ({ name: `Demo ${versus} ${label}`, minutes, pts, reb: 2, ast: 1, position: null, starter: false });
  // A gap game is a two-player box with no starter status the rule can trust (and no positions): it carries no starter figure.
  if (isGap) return [unmatched(130, "Reserve A", 41), unmatched(110, "Reserve B", 33)];
  const isFull = i % 5 === 2;
  const team = defense === "BOS" ? 3 : 8;
  const lines: OpposingPlayerLine[] = [];
  DVP_POSITIONS.forEach((position, p) => {
    const pts = integer(STAT_BASE.pts[p] + wobble(team, p, i));
    const reb = integer(STAT_BASE.reb[p] + wobble(team, p, i + 1) / 2);
    const ast = integer(STAT_BASE.ast[p] + wobble(team, p, i + 2) / 2);
    const hasBench = isFull || (i + p) % 3 !== 0;
    const share = hasBench ? 0.7 : 1;
    const estimated = estimatedPosition(defense, i, position);
    lines.push({ name: `Demo ${versus} ${position} Starter`, minutes: STARTER_MINUTES[p], pts: integer(pts * share), reb: integer(reb * share), ast: integer(ast * share), position: estimated, starter: true });
    if (hasBench) lines.push({ name: `Demo ${versus} ${position} Bench`, minutes: isFull ? FULL_BENCH_MINUTES[p] : BENCH_MINUTES[p], pts: pts - integer(pts * share), reb: reb - integer(reb * share), ast: ast - integer(ast * share), position, starter: false });
  });
  const left = TEAM_MINUTES - lines.reduce((sum, l) => sum + l.minutes, 0);
  if (left > 0) lines.push(unmatched(Math.ceil(left / 2), "Reserve A", 6), unmatched(Math.floor(left / 2), "Reserve B", 3));
  return lines.filter((l) => l.minutes > 0);
}

/** BOS has played ten games (a full window, with one game that has no positions at all); NYK only four, so its window is a small sample. */
function demoOpponentBoxScores(): OpponentBoxScores {
  const boxes: OpponentBoxScores = {};
  for (const [defense, count] of [["BOS", 10], ["NYK", 4]] as const) {
    boxes[opponentBoxKey(GAME_KEY, defense)] = Array.from({ length: count }, (_, i): OpponentBoxScoreGame => {
      const versus = RECENT_OPPONENTS[i % RECENT_OPPONENTS.length];
      return { gameId: `demo-${defense}-${i}`, date: dayBefore((count - i) * 2), versus, defenseIsHome: i % 2 === 1, players: demoOpposingPlayers(defense, versus, i, defense === "BOS" && i === 4) };
    });
  }
  return boxes;
}

/** The sequences, derived from the boxes by the same rule as the real builder (v1/opponentRecentBuild.ts), so the two reconcile. */
function demoOpponentRecent(boxes: OpponentBoxScores): Record<string, OpponentRecentSequence> {
  const sequences: Record<string, OpponentRecentSequence> = {};
  for (const [defense, seasonGames] of [["BOS", 14], ["NYK", 4]] as const) {
    const games = boxes[opponentBoxKey(GAME_KEY, defense)];
    for (const position of DVP_POSITIONS) {
      sequences[opponentRecentKey(GAME_KEY, defense, position)] = {
        team: defense,
        position,
        season: CURRENT,
        seasonGames,
        games: games.map((g): OpponentRecentGame => {
          const attributedMinutes = g.players.reduce((sum, l) => sum + (l.position === null ? 0 : l.minutes), 0);
          const at = g.players.filter((l) => l.position === position);
          const sum = (field: "pts" | "reb" | "ast") => (attributedMinutes > 0 ? at.reduce((total, l) => total + l[field], 0) : null);
          return { date: g.date, versus: g.versus, defenseIsHome: g.defenseIsHome, attributedMinutes, totalMinutes: g.players.reduce((total, l) => total + l.minutes, 0), pts: sum("pts"), reb: sum("reb"), ast: sum("ast") };
        }),
      };
    }
  }
  return sequences;
}

/**
 * Invented pregame defensive ratings for every opponent-and-date the demo players faced. Samples run from one to twelve games so the
 * small-sample marker and every strength label appear; one pair is left out so the "no earlier game" state does too. Not real data.
 */
function demoTeamDefense(players: readonly DemoPlayer[]): TeamDefenseTable {
  const pairs = [...new Set(players.flatMap((p) => (p.seasonStats?.recentGames ?? []).map((g) => teamDefenseKey(g.opponent, g.date))))].sort();
  const asOf: Record<string, TeamDefenseEntry> = {};
  pairs.forEach((key, idx) => {
    if (key === NO_RATING_PAIR) return;
    const rank = 1 + ((idx * 7) % 30);
    asOf[key] = { rating: Math.round((104 + rank * 0.45) * 10) / 10, leagueRating: 112, rank, rankedOf: 30, games: 1 + ((idx * 5) % 12) };
  });
  return { season: CURRENT, asOf, usableGames: 200, unusableGames: 0 };
}

/** The first game of the three-game demo player: no earlier usable game for that opponent, so it has no rating. */
const NO_RATING_PAIR = teamDefenseKey(RECENT_OPPONENTS[0], dayBefore(6));

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
  const boxes = demoOpponentBoxScores();
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    generatedAtUtc: "2026-11-09T22:00:00Z",
    isSynthetic: true,
    sources: { lines: ["synthetic-odds"], dvp: "synthetic-box", dvpUpdatedUtc: SOURCE.sourceUpdatedAtUtc },
    entries: PLAYERS.flatMap((player) => (["pts", "reb", "ast"] as const).map((market) => entryFor(player, market))),
    dvpRows: rows,
    opponentRecent: demoOpponentRecent(boxes),
    opponentBoxScores: boxes,
    teamDefense: demoTeamDefense(PLAYERS),
  };
}
