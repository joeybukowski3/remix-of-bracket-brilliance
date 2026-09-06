import { describe, expect, it } from "vitest";
import { deriveOpponentGameSummary } from "./mlb-strikeout-prop-details-fetch.mjs";

function boxscore({ homeTeamId, awayTeamId }) {
  return {
    teams: {
      home: { team: { id: homeTeamId, abbreviation: "HOM" }, players: {}, teamStats: { batting: { strikeOuts: 9 } } },
      away: { team: { id: awayTeamId, abbreviation: "AWY" }, players: {}, teamStats: { batting: { strikeOuts: 7 } } },
    },
  };
}

describe("deriveOpponentGameSummary home/away", () => {
  it("marks the game home when the requested team is the boxscore's home club", () => {
    const summary = deriveOpponentGameSummary(boxscore({ homeTeamId: 100, awayTeamId: 200 }), 100, "2026-07-01");
    expect(summary.isHome).toBe(true);
    expect(summary.site).toBe("home");
  });

  it("marks the game away when the requested team is the boxscore's away club", () => {
    const summary = deriveOpponentGameSummary(boxscore({ homeTeamId: 100, awayTeamId: 200 }), 200, "2026-07-01");
    expect(summary.isHome).toBe(false);
    expect(summary.site).toBe("away");
  });

  it("never fabricates a home/away value when the boxscore itself could not be resolved", () => {
    const summary = deriveOpponentGameSummary(null, 100, "2026-07-01");
    expect(summary.isHome).toBeNull();
    expect(summary.site).toBeNull();
  });
});
