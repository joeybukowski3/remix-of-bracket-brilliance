import { describe, expect, it } from "vitest";
import {
  cfbGame,
  cfbProviderSplit,
} from "../market/__fixtures__/bettingSplitsGameJoinFixtures";
import { joinCfbBettingSplitToGame } from "./bettingSplitsGameJoin";

describe("CFB betting-splits canonical game join", () => {
  it("joins canonical FBS teams without confusing Miami and Miami (OH)", () => {
    const result = joinCfbBettingSplitToGame(cfbProviderSplit(), [cfbGame()]);
    expect(result.status).toBe("matched");
    expect(result.status === "matched" && result.snapshot).toMatchObject({
      league: "cfb",
      jkbGameId: "401752123",
      awayTeamId: "miami-oh",
      homeTeamId: "mia",
    });
  });

  it("maps numeric provider team identities through explicit canonical identities", () => {
    const input = cfbProviderSplit({
      providerAwayTeamId: "152",
      providerAwayTeamName: "North Carolina State",
      providerHomeTeamId: "30",
      providerHomeTeamName: "Southern California",
    });
    const game = cfbGame({ awayTeamId: "ncsu", homeTeamId: "usc" });
    const result = joinCfbBettingSplitToGame(input, [game], {
      providerTeamIdentities: [
        { league: "cfb", provider: "fixture-provider", providerTeamId: "152", jkbTeamId: "ncsu" },
        { league: "cfb", provider: "fixture-provider", providerTeamId: "30", jkbTeamId: "usc" },
      ],
    });
    expect(result.status).toBe("matched");
  });

  it.each([
    ["Southern California", "usc", "North Carolina State", "ncsu"],
    ["Louisiana", "ul", "Louisiana Monroe", "ulm"],
  ])("reuses controlled CFBD aliases: %s / %s", (awayName, awayId, homeName, homeId) => {
    const input = cfbProviderSplit({
      providerAwayTeamName: awayName,
      providerHomeTeamName: homeName,
    });
    const game = cfbGame({ awayTeamId: awayId, homeTeamId: homeId });
    const result = joinCfbBettingSplitToGame(input, [game]);
    expect(result.status).toBe("matched");
    expect(result.evidence).toMatchObject({
      normalizedAwayTeam: awayId,
      normalizedHomeTeam: homeId,
    });
  });

  it("maps an unknown numeric opponent only to the exact canonical cfbd:<id>", () => {
    const input = cfbProviderSplit({
      providerAwayTeamId: "9999",
      providerAwayTeamName: "Example FCS",
      providerHomeTeamId: null,
      providerHomeTeamName: "Miami",
    });
    const game = cfbGame({ awayTeamId: "cfbd:9999", homeTeamId: "mia" });
    const result = joinCfbBettingSplitToGame(input, [game]);
    expect(result.status).toBe("matched");
    expect(result.evidence.normalizedAwayTeam).toBe("cfbd:9999");
  });

  it("joins a neutral-site game without changing correctly oriented markets", () => {
    const input = cfbProviderSplit();
    const result = joinCfbBettingSplitToGame(input, [cfbGame({ neutralSite: true })]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.evidence.neutralSiteOrientationOverride).toBe(false);
    expect(result.snapshot.spread).toEqual(input.spread);
    expect(result.snapshot.moneyline).toEqual(input.moneyline);
  });

  it("explicitly permits and safely reorients a reversed neutral-site designation", () => {
    const input = cfbProviderSplit({
      providerAwayTeamName: "Miami",
      providerHomeTeamName: "Miami (OH)",
    });
    const result = joinCfbBettingSplitToGame(input, [cfbGame({ neutralSite: true })]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.evidence.neutralSiteOrientationOverride).toBe(true);
    expect(result.snapshot.spread).toEqual({
      openingHomeLine: input.spread?.openingAwayLine,
      openingAwayLine: input.spread?.openingHomeLine,
      currentHomeLine: input.spread?.currentAwayLine,
      currentAwayLine: input.spread?.currentHomeLine,
      homeBetPct: input.spread?.awayBetPct,
      awayBetPct: input.spread?.homeBetPct,
      homeMoneyPct: input.spread?.awayMoneyPct,
      awayMoneyPct: input.spread?.homeMoneyPct,
    });
    expect(result.snapshot.moneyline).toMatchObject({
      currentHomePrice: input.moneyline?.currentAwayPrice,
      currentAwayPrice: input.moneyline?.currentHomePrice,
      homeBetPct: input.moneyline?.awayBetPct,
      awayBetPct: input.moneyline?.homeBetPct,
    });
    expect(result.snapshot.total).toEqual(input.total);
  });

  it("rejects the same reversed orientation at a non-neutral game", () => {
    const input = cfbProviderSplit({
      providerAwayTeamName: "Miami",
      providerHomeTeamName: "Miami (OH)",
    });
    const result = joinCfbBettingSplitToGame(input, [cfbGame({ neutralSite: false })]);
    expect(result).toMatchObject({ status: "rejected", reason: "HOME_AWAY_MISMATCH" });
  });

  it("tolerates a rescheduled kickoff inside the bounded window", () => {
    const result = joinCfbBettingSplitToGame(
      cfbProviderSplit({ kickoffUtc: "2026-10-04T04:30:00.000Z" }),
      [cfbGame()],
    );
    expect(result.status).toBe("matched");
    expect(result.evidence.kickoffDeltaMinutes).toBe(300);
  });

  it("fails ambiguous and unmatched CFB events closed", () => {
    const ambiguous = joinCfbBettingSplitToGame(cfbProviderSplit(), [
      cfbGame({ id: "2" }),
      cfbGame({ id: "1" }),
    ]);
    expect(ambiguous).toMatchObject({
      status: "ambiguous",
      candidateGameIds: ["1", "2"],
    });

    const unmatched = joinCfbBettingSplitToGame(cfbProviderSplit(), [
      cfbGame({ awayTeamId: "usc", homeTeamId: "ncsu" }),
    ]);
    expect(unmatched).toMatchObject({ status: "unmatched", reason: "UNMATCHED_GAME" });
  });
});
