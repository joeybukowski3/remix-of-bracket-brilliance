import { normalizeRosterTeamAbbr as normalizeNflTeamAbbr } from "./nfl-roster-identity.mjs";

export function assertTouchdownPreviewArtifact(artifact, { season, week, games, yardage }) {
  if (artifact.schemaVersion !== "nfl-touchdown-preview-v1" || artifact.season !== season || artifact.week !== week || !Array.isArray(artifact.players) || !artifact.players.length) throw new Error("TD preview target/schema/population mismatch.");
  const current = new Map(games.filter((game) => game.season === season && game.week === week && game.seasonType === "REG").map((game) => [game.gameId, game]));
  const expected = new Set(yardage.rows.filter((row) => row.status === "projected" && row.season === season && row.week === week && ((row.position === "QB" && row.market === "passing") || (row.position === "RB" && row.market === "rushing") || (["WR", "TE"].includes(row.position) && row.market === "receiving"))).map((row) => row.playerId));
  const ids = new Set();
  const covered = new Set();
  for (const player of artifact.players) {
    const game = current.get(player.gameId);
    if (!game || ids.has(player.playerId) || !expected.has(player.playerId)) throw new Error("TD preview candidate is duplicated or outside the current slate.");
    const home = normalizeNflTeamAbbr(game.homeAbbr), away = normalizeNflTeamAbbr(game.awayAbbr);
    if (!((player.team === home && player.opponent === away && player.homeAway === "home") || (player.team === away && player.opponent === home && player.homeAway === "away"))) throw new Error("TD preview candidate matchup mismatch.");
    if (player.kickoff !== game.dateUtc) throw new Error("TD preview candidate kickoff mismatch.");
    for (const history of [...player.playerHistory, ...player.opponentHistory]) {
      if (history.season > season || (history.season === season && history.week >= week)) throw new Error("TD preview contains target/future-week history.");
    }
    for (const key of ["2025", "2026", "last8"]) {
      if (!player.windows[key] || (player.windows[key].jkbTdScore != null && !Number.isFinite(player.windows[key].jkbTdScore))) throw new Error("TD preview has invalid window scores.");
    }
    ids.add(player.playerId); covered.add(player.gameId);
  }
  if (ids.size !== expected.size || covered.size !== current.size) throw new Error("TD preview is missing current candidates/games.");
}
