import { describe, expect, it } from "vitest";
import { nflGame, providerSplit } from "../market/__fixtures__/bettingSplitsGameJoinFixtures";
import { joinNflBettingSplitToGame } from "./bettingSplitsGameJoin";

describe("NFL betting-splits canonical game join", () => {
  it("joins a standard matchup by canonical abbreviations", () => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame()]);
    expect(result.status).toBe("matched");
    expect(result.status === "matched" && result.snapshot).toMatchObject({
      league: "nfl",
      jkbGameId: "2026_01_NE_SEA",
      awayTeamId: "ne",
      homeTeamId: "sea",
    });
  });

  it.each([
    ["LA", "lar"],
    ["WAS", "wsh"],
    ["JAC", "jax"],
    ["AZ", "ari"],
  ])("reuses canonical NFL alias normalization for %s", (providerCode, scheduleCode) => {
    const input = providerSplit({ providerAwayTeamId: providerCode });
    const game = nflGame({
      gameId: `2026_01_${providerCode}_SEA`,
      awayAbbr: scheduleCode,
    });
    const result = joinNflBettingSplitToGame(input, [game]);
    expect(result.status).toBe("matched");
    expect(result.evidence.normalizedAwayTeam).toBe(scheduleCode);
  });

  it("uses an explicit provider-team identity for an opaque provider ID", () => {
    const result = joinNflBettingSplitToGame(
      providerSplit({ providerAwayTeamId: "7", providerHomeTeamId: "28" }),
      [nflGame()],
      {
        providerTeamIdentities: [
          { league: "nfl", provider: "fixture-provider", providerTeamId: "7", jkbTeamId: "ne" },
          { league: "nfl", provider: "fixture-provider", providerTeamId: "28", jkbTeamId: "sea" },
        ],
      },
    );
    expect(result.status).toBe("matched");
  });

  it("rejects reversed home/away orientation at a home-site game", () => {
    const input = providerSplit({
      providerAwayTeamId: "SEA",
      providerHomeTeamId: "NE",
    });
    const result = joinNflBettingSplitToGame(input, [nflGame()]);
    expect(result).toMatchObject({ status: "rejected", reason: "HOME_AWAY_MISMATCH" });
  });

  it("uses kickoff evidence to disambiguate a regular-season/postseason rematch", () => {
    const games = [
      nflGame(),
      nflGame({
        gameId: "2026_19_NE_SEA",
        week: 19,
        seasonType: "WC",
        dateUtc: "2027-01-17T20:25:00.000Z",
      }),
    ];
    const result = joinNflBettingSplitToGame(
      providerSplit({ week: 19, kickoffUtc: "2027-01-17T20:30:00.000Z" }),
      games,
    );
    expect(result.status).toBe("matched");
    expect(result.status === "matched" && result.snapshot.jkbGameId).toBe("2026_19_NE_SEA");
  });
});
