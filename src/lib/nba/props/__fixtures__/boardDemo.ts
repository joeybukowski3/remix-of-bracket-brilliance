/**
 * Invented board for local UI review (dev server only, `?demo=synthetic`).
 * Every player, line, projection and box score below is made up. The artifact
 * is flagged synthetic so the page shows a banner. Browser-safe: no hashing.
 */
import { CANONICAL_TEAM_CODES } from "../canonical";
import { buildDvpRows, DVP_POSITIONS, type DvpPlayerGameLine, type DvpSeason } from "../dvp";
import { BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";

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

interface DemoPlayer {
  name: string;
  team: "NYK" | "BOS";
  label: string | null;
  pts: [line: number | null, projection: number | null];
  reb: [number | null, number | null];
  ast: [number | null, number | null];
}

const PLAYERS: DemoPlayer[] = [
  { name: "Demo Guard One", team: "NYK", label: "PG", pts: [24.5, 26.1], reb: [3.5, 3.8], ast: [8.5, 9.4] },
  { name: "Demo Wing Two", team: "NYK", label: "SG", pts: [19.5, 17.9], reb: [5.5, 5.1], ast: [3.5, 3.2] },
  { name: "Demo Forward Three", team: "NYK", label: "PF", pts: [16.5, 18.2], reb: [7.5, 8.4], ast: [2.5, 2.9] },
  { name: "Demo Big Four", team: "NYK", label: "C", pts: [14.5, 14.0], reb: [11.5, 12.3], ast: [2.5, 2.2] },
  { name: "Demo Guard Five", team: "BOS", label: "SG", pts: [22.5, 23.4], reb: [4.5, 4.2], ast: [4.5, 5.0] },
  { name: "Demo Wing Six", team: "BOS", label: "SF", pts: [18.5, null], reb: [6.5, null], ast: [3.5, null] },
  { name: "Demo Bench Seven", team: "BOS", label: null, pts: [null, 9.1], reb: [null, 3.0], ast: [null, 1.5] },
  { name: "Demo Big Eight", team: "BOS", label: "C", pts: [13.5, 15.2], reb: [10.5, 10.1], ast: [1.5, 1.7] },
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
    projection: projection === null ? null : { value: projection, minutes: 31.5, modelVersion: "synthetic-demo" },
    projectionUnavailableReason: projection === null ? "no usable history" : null,
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
  };
}
