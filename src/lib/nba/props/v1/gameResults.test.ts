import { describe, expect, it } from "vitest";
import type { ImportedPlayerGame } from "./playerGameImport";
import { buildGameScores, isCompleteTeamMinutes, resultFor } from "./gameResults";

function row(over: Partial<ImportedPlayerGame> & { playerId: string; team: string; opponent: string }): ImportedPlayerGame {
  return { season: "2026-27", seasonType: "regular", gameId: "g1", gameDate: "2026-10-20", isHome: over.team === "BOS", playerName: over.playerId, minutes: 48, pts: 20, reb: 5, ast: 3, ...over };
}
/** Five players per side, 48 minutes each: a complete regulation box score that adds up to `pts`. */
const side = (team: string, opponent: string, pts: number): ImportedPlayerGame[] =>
  Array.from({ length: 5 }, (_, i) => row({ playerId: `${team}-${i}`, team, opponent, pts: i === 0 ? pts - 40 : 10 }));

const BOS_AT_HOME = { season: "2026-27", gameId: "g1", team: "BOS", opponent: "NYK" };

describe("isCompleteTeamMinutes", () => {
  it("accepts 240 plus whole overtimes within a few minutes, and rejects a missing rotation player", () => {
    for (const minutes of [240, 239, 242, 265, 264, 290]) expect(isCompleteTeamMinutes(minutes), String(minutes)).toBe(true);
    for (const minutes of [210, 225, 252, 276, 0]) expect(isCompleteTeamMinutes(minutes), String(minutes)).toBe(false);
  });
});

describe("buildGameScores / resultFor", () => {
  it("reports the final score from both complete box scores, from each side", () => {
    const scores = buildGameScores([...side("BOS", "NYK", 112), ...side("NYK", "BOS", 104)]);
    expect(resultFor(scores, BOS_AT_HOME)).toEqual({ won: true, teamPts: 112, opponentPts: 104 });
    expect(resultFor(scores, { ...BOS_AT_HOME, team: "NYK", opponent: "BOS" })).toEqual({ won: false, teamPts: 104, opponentPts: 112 });
  });

  it("gives no result when either side's minutes show a missing player row", () => {
    const scores = buildGameScores([...side("BOS", "NYK", 112), ...side("NYK", "BOS", 104).slice(0, 4)]);
    expect(scores.size).toBe(0);
    expect(resultFor(scores, BOS_AT_HOME)).toBeUndefined();
  });

  it("gives no result for a one-team game or equal sums, and never guesses across seasons", () => {
    expect(buildGameScores(side("BOS", "NYK", 100)).size).toBe(0);
    expect(buildGameScores([...side("BOS", "NYK", 100), ...side("NYK", "BOS", 100)]).size).toBe(0);
    const scores = buildGameScores([...side("BOS", "NYK", 112), ...side("NYK", "BOS", 104)]);
    expect(resultFor(scores, { ...BOS_AT_HOME, season: "2025-26" })).toBeUndefined();
    expect(resultFor(undefined, BOS_AT_HOME)).toBeUndefined();
  });
});
