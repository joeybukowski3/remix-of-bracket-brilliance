import { describe, expect, it } from "vitest";
import { CANONICAL_TEAM_CODES } from "./canonical";
import { NEUTRAL_BRAND, PLAYER_WASH_AMOUNT, TEAM_BRANDS, brandFor, contrastRatio, readableOn, teamLogoUrl, tintOnWhite } from "./teamBrand";

const WHITE = "#FFFFFF";
const INK = "#0F172A"; // slate-900, the player name color

describe("team brands", () => {
  it("covers all 30 franchises and nothing else", () => {
    expect(Object.keys(TEAM_BRANDS).sort()).toEqual([...CANONICAL_TEAM_CODES].sort());
  });

  it.each(CANONICAL_TEAM_CODES)("%s: the accent line and the badge fill are legible", (code) => {
    const { primary } = TEAM_BRANDS[code];
    // A non-text accent needs 3:1 against the white row.
    expect(contrastRatio(primary, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it.each(CANONICAL_TEAM_CODES)("%s: the fallback badge lettering meets AA on the team color", (code) => {
    const { primary } = TEAM_BRANDS[code];
    expect(contrastRatio(readableOn(primary), primary)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CANONICAL_TEAM_CODES)("%s: dark ink on the player wash stays above AA", (code) => {
    expect(contrastRatio(INK, tintOnWhite(TEAM_BRANDS[code].primary, PLAYER_WASH_AMOUNT))).toBeGreaterThanOrEqual(7);
  });

  it("maps franchise codes to the logo slug the image host uses", () => {
    expect(teamLogoUrl("GSW")).toBe("https://a.espncdn.com/i/teamlogos/nba/500/gs.png");
    expect(teamLogoUrl("NYK")).toBe("https://a.espncdn.com/i/teamlogos/nba/500/ny.png");
    expect(teamLogoUrl("UTA")).toBe("https://a.espncdn.com/i/teamlogos/nba/500/utah.png");
    expect(teamLogoUrl("WAS")).toBe("https://a.espncdn.com/i/teamlogos/nba/500/wsh.png");
  });

  it("accepts alternate spellings and never colors an unknown team by guess", () => {
    expect(brandFor("PHO")).toBe(TEAM_BRANDS.PHX);
    expect(brandFor("XXX")).toBe(NEUTRAL_BRAND);
    expect(brandFor(null)).toBe(NEUTRAL_BRAND);
    expect(teamLogoUrl("XXX")).toBeNull();
    expect(teamLogoUrl(null)).toBeNull();
  });

  it("computes WCAG contrast and an opaque wash", () => {
    expect(contrastRatio("#000000", WHITE)).toBeCloseTo(21, 0);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(tintOnWhite("#000000", 0.16)).toBe("#D6D6D6");
    expect(tintOnWhite("#FF0000", 0)).toBe("#FFFFFF");
    expect(tintOnWhite("#FF0000", 1)).toBe("#FF0000");
  });
});
