import { describe, expect, it } from "vitest";
import { buildDataset, type NormalizedSnapshot } from "./dataset";
import { playerGame, teamGame, TEAM_A, TEAM_B } from "./__fixtures__/synthetic";
import type { NbaPlayerGame, NbaTeamGame } from "./types";

function teamSnapshot(rows: NbaTeamGame[], retrievedAtUtc = "2025-07-20T00:00:00Z", snapshotId = "team-1"): NormalizedSnapshot {
  return { meta: { snapshotId, endpoint: "teamgamelogs", season: "2024-25", seasonType: "regular", retrievedAtUtc }, teamRows: rows, issues: [] };
}

function playerSnapshot(rows: NbaPlayerGame[], retrievedAtUtc = "2025-07-20T00:00:00Z", snapshotId = "player-1"): NormalizedSnapshot {
  return { meta: { snapshotId, endpoint: "playergamelogs", season: "2024-25", seasonType: "regular", retrievedAtUtc }, playerRows: rows, issues: [] };
}

const homeAway = [
  teamGame({ teamId: TEAM_A, isHome: true, pts: 25 }),
  teamGame({ teamId: TEAM_B, teamAbbr: "BBB", opponentAbbr: "AAA", isHome: false, pts: 30 }),
];

const players = [
  playerGame({ playerId: 1, teamId: TEAM_A, pts: 15, minutes: 130, opponentTeamId: null }),
  playerGame({ playerId: 2, teamId: TEAM_A, pts: 10, minutes: 110, opponentTeamId: null }),
  playerGame({ playerId: 3, teamId: TEAM_B, pts: 30, minutes: 240, opponentTeamId: null, isHome: false }),
];

describe("buildDataset", () => {
  it("resolves opponents, builds games and identities, and reconciles cleanly", () => {
    const dataset = buildDataset([teamSnapshot(homeAway), playerSnapshot(players)]);
    expect(dataset.issues).toEqual([]);
    expect(dataset.games).toEqual([
      expect.objectContaining({ gameId: "0022400001", teamIds: [TEAM_A, TEAM_B], homeTeamId: TEAM_A, awayTeamId: TEAM_B, neutralSite: false }),
    ]);
    expect(dataset.playerGames.find((row) => row.playerId === 3)?.opponentTeamId).toBe(TEAM_A);
    expect(dataset.teamGames.find((row) => row.teamId === TEAM_A)?.opponentTeamId).toBe(TEAM_B);
    expect(dataset.players.map((p) => p.playerId)).toEqual([1, 2, 3]);
    expect(dataset.coverage).toEqual([
      expect.objectContaining({ season: "2024-25", seasonType: "regular", games: 1, teamGames: 2, playerGames: 3, uniquePlayers: 3, pointsReconciliationFailures: 0 }),
    ]);
  });

  it("accepts neutral-site games where both teams are listed as away", () => {
    const neutral = homeAway.map((row) => ({ ...row, isHome: false }));
    const dataset = buildDataset([teamSnapshot(neutral), playerSnapshot(players)]);
    expect(dataset.issues).toEqual([]);
    expect(dataset.games[0]).toMatchObject({ neutralSite: true, homeTeamId: null, awayTeamId: null });
    expect(dataset.playerGames.find((row) => row.playerId === 1)?.opponentTeamId).toBe(TEAM_B);
  });

  it("flags points that do not reconcile to the team total", () => {
    const short = players.map((row) => (row.playerId === 2 ? { ...row, pts: 9 } : row));
    const dataset = buildDataset([teamSnapshot(homeAway), playerSnapshot(short)]);
    expect(dataset.issues).toEqual([expect.objectContaining({ code: "points_reconciliation_failed", severity: "error", teamId: TEAM_A })]);
    expect(dataset.coverage[0].pointsReconciliationFailures).toBe(1);
  });

  it("dedupes repeated player-game keys and reports them", () => {
    const dataset = buildDataset([teamSnapshot(homeAway), playerSnapshot([...players, players[0]])]);
    expect(dataset.playerGames).toHaveLength(3);
    expect(dataset.issues).toEqual([expect.objectContaining({ code: "duplicate_player_game", severity: "error" })]);
  });

  it("uses the latest snapshot and reports revisions against the previous one", () => {
    const older = playerSnapshot(players.map((row) => (row.playerId === 1 ? { ...row, ast: 1 } : row)).slice(0, 2), "2025-03-01T00:00:00Z", "player-old");
    const dataset = buildDataset([teamSnapshot(homeAway), older, playerSnapshot(players)]);
    expect(dataset.playerGames.find((row) => row.playerId === 1)?.ast).toBe(3);
    expect(dataset.revisions).toEqual([
      expect.objectContaining({ endpoint: "playergamelogs", latestSnapshotId: "player-1", previousSnapshotId: "player-old", added: 1, removed: 0, changed: 1 }),
    ]);
  });

  it("warns when the latest snapshot drops rows the previous one had", () => {
    const shrunk = playerSnapshot(players.slice(0, 2), "2025-08-01T00:00:00Z", "player-new");
    const dataset = buildDataset([teamSnapshot(homeAway), playerSnapshot(players), shrunk]);
    expect(dataset.revisions[0]).toMatchObject({ removed: 1 });
    expect(dataset.issues).toContainEqual(expect.objectContaining({ code: "snapshot_rows_removed", severity: "warning", snapshotId: "player-new" }));
  });

  it("rejects games without exactly two distinct team rows", () => {
    const dataset = buildDataset([teamSnapshot([homeAway[0]]), playerSnapshot(players.slice(0, 2))]);
    expect(dataset.games).toHaveLength(0);
    expect(dataset.issues.map((issue) => issue.code)).toEqual(["game_team_rows_invalid", "player_team_not_in_game", "player_team_not_in_game"]);
  });

  it("keeps every name spelling observed for a player", () => {
    const renamed = [
      playerGame({ playerId: 9, playerName: "Old Name", gameDate: "2024-11-01", gameId: "0022400001" }),
      playerGame({ playerId: 9, playerName: "New Name", gameDate: "2024-11-03", gameId: "0022400002" }),
    ];
    const dataset = buildDataset([playerSnapshot(renamed)]);
    expect(dataset.players[0]).toMatchObject({ playerName: "New Name", namesSeen: ["Old Name", "New Name"], firstGameDate: "2024-11-01", lastGameDate: "2024-11-03" });
  });
});
