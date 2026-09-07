import type { DfsHistoryDetail, DfsHistoryIndex } from "../historyDelivery";
export const historyTarget = { season: 2026, week: 1, firstKickoff: "2026-09-10T00:00:00.000Z" };
export function historyFixture(): { index: DfsHistoryIndex; detail: DfsHistoryDetail } {
  const metadata = { season: 2026, week: 1, asOf: "2026-09-01T00:00:00.000Z", lastN: 10 as const, targetGameIds: ["target"],
    cohortPolicy: "individual-recorded-offensive-appearances-v1" as const,
    referencePolicy: "entering-game-trailing-10-recorded-games-v1" as const, temporalQuality: "event-time-reconstructed" as const };
  const base = { rowId: "old:gsis:p:passing", gameId: "old", season: 2025, week: 17, dateUtc: "2025-12-28T18:00:00.000Z",
    playerId: "gsis:p", playerName: "Player One", team: "no", opponent: "det", homeAway: "away" as const,
    position: "QB" as const, market: "passing" as const, actualYards: 250,
    historicalSportsbookLine: { point: 250, bookmaker: "DraftKings", observedAt: "2025-12-28T17:00:00.000Z", selectionPolicyVersion: "approved-final-pre-kickoff-v1" as const },
    lineResult: "push" as const, temporalQuality: metadata.temporalQuality };
  const player = { ...base, comparison: "player-vs-aggregate-positional-allowance" as const, allowanceScope: "entire-position-group-per-defense-game" as const,
    opponentPregamePositionalAllowance: 230, opponentPregamePositionalAllowanceSampleSize: 9, actualMinusOpponentAllowance: 20, missingReferenceReason: null };
  const defense = { ...base, comparison: "individual-player-vs-own-pregame-average" as const,
    playerPregameTrailing10Average: 240, playerReferenceSampleSize: 10, actualMinusPlayerAverage: 10, missingReferenceReason: null };
  return {
    index: { ...metadata, schemaVersion: "nfl-dfs-history-index-v1", playerKeys: ["gsis:p:passing"], defenseDeltas: { "det:passing:QB": [10, -5, 0, null] } },
    detail: { ...metadata, schemaVersion: "nfl-individual-yardage-history-v1", position: "QB", players: { "gsis:p:passing": [player] },
      defenseMatchups: { "det:passing:QB": [defense,
        { ...defense, rowId: "old:gsis:p2:passing", playerId: "gsis:p2", playerName: "Player Two", actualYards: 235, actualMinusPlayerAverage: -5, historicalSportsbookLine: null, lineResult: "unavailable" },
        { ...defense, rowId: "older:gsis:p:passing", gameId: "older", dateUtc: "2025-12-21T18:00:00.000Z", actualYards: 240, actualMinusPlayerAverage: 0, historicalSportsbookLine: null, lineResult: "unavailable" },
        { ...defense, rowId: "first:gsis:p:passing", gameId: "first", dateUtc: "2025-12-14T18:00:00.000Z", playerPregameTrailing10Average: null, playerReferenceSampleSize: 0, actualMinusPlayerAverage: null, missingReferenceReason: "no-prior-player-reference", historicalSportsbookLine: null, lineResult: "unavailable" },
      ] } },
  };
}
