/**
 * Regression coverage for the HR shared-selector extraction: SocialTableHR
 * used to inline its own filter/sort/slice; it now delegates to
 * selectTopSocialHrRows(batters, { max: 8 }) (src/lib/mlb/hrPropSocialSelection.ts).
 * This proves the rendered behavior is unchanged, and that the website's
 * top-8 selection and the daily card's top-6 selection (same function,
 * different max) share identical ordering.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SocialTableHR } from "@/pages/MlbGameDetail";
import { selectTopSocialHrRows } from "@/lib/mlb/hrPropSocialSelection";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

function batter(overrides: Partial<HrDashboardBatter> & { player: string; hrScore: number }): HrDashboardBatter {
  return {
    gameKey: "TOR@WSH",
    playerId: null,
    gameId: null,
    lineupStatus: "projected",
    battingOrder: null,
    starterConfirmed: null,
    position: null,
    team: "WSH",
    opponent: "TOR",
    opposingPitcher: "Some Pitcher",
    opposingPitcherId: null,
    pitcherHand: "R",
    ballpark: "Nationals Park",
    parkFactor: 0.98,
    atBats: 200,
    barrelRate: 10,
    hardHitRate: 40,
    exitVelo: 90,
    iso: 0.2,
    hrFBRatio: 12,
    pullRate: 40,
    xba: 0.25,
    kRate: 22,
    bbRate: 9,
    whiffRate: 25,
    last7HR: 1,
    last30HR: 4,
    opposingPitcherHrVs: 50,
    opposingPitcherHitsVs: 50,
    opposingPitcherKVs: 50,
    weatherBoost: 0,
    hrScoreRank: 1,
    angleTags: [],
    ...overrides,
  } as HrDashboardBatter;
}

describe("SocialTableHR", () => {
  it("renders the top 8 batters by hrScore, matching selectTopSocialHrRows(batters, { max: 8 })", () => {
    const batters = Array.from({ length: 10 }, (_, i) => batter({ player: `Player ${i}`, hrScore: 100 - i }));
    const { container } = render(<SocialTableHR batters={batters} />);

    // SocialTableHR renders both a mobile and a desktop block with identical
    // data-hr-player rows (jsdom doesn't apply the sm:hidden media query) --
    // scope to the mobile block only so each player is counted once.
    const mobileBlock = container.querySelector(".sm\\:hidden");
    const rows = Array.from(mobileBlock?.querySelectorAll("[data-hr-player]") ?? []).map((el) => el.getAttribute("data-hr-player"));
    const expected = selectTopSocialHrRows(batters, { max: 8 }).map((r) => r.player);
    expect(rows).toEqual(expected);
    expect(rows).toHaveLength(8);
  });

  it("excludes elite-barrel-rate and small-sample batters exactly like the shared selector", () => {
    const batters = [
      batter({ player: "Elite Contact", hrScore: 99, barrelRate: 30 }),
      batter({ player: "Small Sample", hrScore: 98, atBats: 10 }),
      batter({ player: "Eligible", hrScore: 60 }),
    ];
    const { container } = render(<SocialTableHR batters={batters} />);
    // SocialTableHR renders both a mobile and a desktop block with identical
    // data-hr-player rows (jsdom doesn't apply the sm:hidden media query) --
    // scope to the mobile block only so each player is counted once.
    const mobileBlock = container.querySelector(".sm\\:hidden");
    const rows = Array.from(mobileBlock?.querySelectorAll("[data-hr-player]") ?? []).map((el) => el.getAttribute("data-hr-player"));
    expect(rows).toEqual(["Eligible"]);
  });

  it("website top-8 and card top-6 selections share identical ordering (card is a strict prefix)", () => {
    const batters = Array.from({ length: 10 }, (_, i) => batter({ player: `Player ${i}`, hrScore: 100 - i }));
    const websiteTop8 = selectTopSocialHrRows(batters, { max: 8 });
    const cardTop6 = selectTopSocialHrRows(batters, { max: 6 });
    expect(websiteTop8.slice(0, 6).map((r) => r.player)).toEqual(cardTop6.map((r) => r.player));
  });
});
