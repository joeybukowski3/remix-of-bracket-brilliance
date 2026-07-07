import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  NFL_GUIDE_TEAMS,
  NFL_GUIDE_PLAYOFFS,
  NFL_GUIDE_SUPER_BOWL_PICK,
  NFL_GUIDE_BOUNCE_BACKS,
  NFL_GUIDE_REGRESSION_CANDIDATES,
  NFL_GUIDE_TEAM_BY_SLUG,
} from "@/lib/nfl/guide2026";
import {
  computeMarketConfidence,
  computeMarketLean,
  computeModelVsMarketGap,
  computeRegressionSignal,
  computeScheduleLabel,
  computeUnitIdentity,
  HIGH_CONFIDENCE_THRESHOLD,
  MARKET_LEAN_THRESHOLD,
} from "@/lib/nfl/guideLabels";
import { getNflSeasonGuide, NFL_SEASON_GUIDES } from "@/lib/nfl/guideData";
import { NFL_SECTION_NAV_ITEMS } from "@/lib/nfl/sectionNav";
import parityFixture from "./__fixtures__/guide2026-parity.json";

const ROOT = resolve(__dirname, "../../..");
const CANONICAL = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")).teams as {
  slug: string;
  abbr: string;
}[];
const CANONICAL_SLUGS = new Set(CANONICAL.map((t) => t.slug));
const CANONICAL_ABBRS = new Set(CANONICAL.map((t) => t.abbr));
const GUIDE = getNflSeasonGuide(2026)!;

describe("normalized guide: canonical team mapping", () => {
  it("every guide team maps to a canonical teams.json slug and abbr", () => {
    for (const team of GUIDE.teams) {
      expect(CANONICAL_SLUGS.has(team.slug), `slug ${team.slug}`).toBe(true);
      expect(CANONICAL_ABBRS.has(team.abbr), `abbr ${team.abbr}`).toBe(true);
    }
  });

  it("every canonical team appears exactly once", () => {
    expect(GUIDE.teams).toHaveLength(32);
    const slugs = GUIDE.teams.map((t) => t.slug);
    const abbrs = GUIDE.teams.map((t) => t.abbr);
    expect(new Set(slugs).size).toBe(32);
    expect(new Set(abbrs).size).toBe(32);
    for (const canonical of CANONICAL) {
      expect(slugs, `missing ${canonical.slug}`).toContain(canonical.slug);
    }
  });

  it("all pick slugs resolve to guide teams", () => {
    const allPickSlugs = [
      ...GUIDE.picks.AFC.divisionWinners,
      ...GUIDE.picks.AFC.wildCards,
      GUIDE.picks.AFC.conferenceChampion,
      ...GUIDE.picks.NFC.divisionWinners,
      ...GUIDE.picks.NFC.wildCards,
      GUIDE.picks.NFC.conferenceChampion,
      GUIDE.picks.superBowlPick,
      ...GUIDE.picks.bounceBacks,
      ...GUIDE.picks.regressionCandidates,
    ];
    for (const slug of allPickSlugs) expect(GUIDE.teamBySlug.has(slug), slug).toBe(true);
  });
});

describe("behavior parity with pre-normalization snapshot", () => {
  it("all computed team values match the committed parity fixture", () => {
    const current = NFL_GUIDE_TEAMS.map((t) => ({
      slug: t.slug, abbr: t.abbr, division: t.division, conference: t.conference,
      powerRank: t.powerRank, offRank: t.offRank, defRank: t.defRank, scheduleRank: t.scheduleRank,
      projectedWins: t.projectedWins, winTotal: t.winTotal, modelEdge: t.modelEdge,
      marketLean: t.marketLean, marketConfidence: t.marketConfidence,
      regressionGap: t.regressionGap, regressionSignal: t.regressionSignal,
      scheduleLabel: t.scheduleLabel, unitIdentity: t.unitIdentity,
    }));
    expect(current).toEqual(parityFixture.teams);
  });

  it("playoff picks, Super Bowl pick and regression lists match the fixture", () => {
    expect(NFL_GUIDE_PLAYOFFS.AFC.divisionWinners.map((t) => t.slug)).toEqual(parityFixture.playoffs.AFC.divisionWinners);
    expect(NFL_GUIDE_PLAYOFFS.NFC.wildCards.map((t) => t.slug)).toEqual(parityFixture.playoffs.NFC.wildCards);
    expect(NFL_GUIDE_SUPER_BOWL_PICK.slug).toBe(parityFixture.superBowlPick);
    expect(NFL_GUIDE_BOUNCE_BACKS.map((t) => t.slug)).toEqual(parityFixture.bounceBacks);
    expect(NFL_GUIDE_REGRESSION_CANDIDATES.map((t) => t.slug)).toEqual(parityFixture.regressionCandidates);
  });

  it("normalized guide mirrors guide2026 values (migrated, not invented)", () => {
    for (const team of NFL_GUIDE_TEAMS) {
      const normalized = GUIDE.teamBySlug.get(team.slug)!;
      expect(normalized.projectedWins).toBe(team.projectedWins);
      expect(normalized.marketWinTotal).toBe(team.winTotal);
      expect(normalized.modelVsMarketGap).toBe(team.modelEdge);
      expect(normalized.recommendationLabel).toBe(team.marketLean);
      expect(normalized.confidenceLabel).toBe(team.marketConfidence);
      expect(normalized.editorialSummary).toBe(team.summary);
      expect(normalized.keyQuestions).toEqual(team.questions);
    }
  });
});

describe("label utility preserves existing behavior", () => {
  it("Over/Under/Pass thresholds match the guide's historical behavior", () => {
    expect(computeMarketLean(null)).toBe("Pass");
    expect(computeMarketLean(0.7)).toBe("Pass");
    expect(computeMarketLean(MARKET_LEAN_THRESHOLD)).toBe("Over");
    expect(computeMarketLean(-MARKET_LEAN_THRESHOLD)).toBe("Under");
    expect(computeMarketLean(-0.5)).toBe("Pass");
    expect(computeMarketLean(2.4)).toBe("Over");
  });

  it("confidence thresholds match (Low < 0.75, High >= 1.75)", () => {
    expect(computeMarketConfidence(null)).toBe("Low");
    expect(computeMarketConfidence(0.5)).toBe("Low");
    expect(computeMarketConfidence(0.75)).toBe("Medium");
    expect(computeMarketConfidence(-1.2)).toBe("Medium");
    expect(computeMarketConfidence(HIGH_CONFIDENCE_THRESHOLD)).toBe("High");
    expect(computeMarketConfidence(-2)).toBe("High");
  });

  it("model-vs-market gap rounds to one decimal and handles missing totals", () => {
    expect(computeModelVsMarketGap(10.2, 9.5)).toBeCloseTo(0.7);
    expect(computeModelVsMarketGap(8, 9.5)).toBeCloseTo(-1.5);
    expect(computeModelVsMarketGap(10, null)).toBeNull();
  });

  it("regression, schedule and unit labels match existing behavior", () => {
    expect(computeRegressionSignal(1.5)).toBe("Bounce Back");
    expect(computeRegressionSignal(-1.5)).toBe("Regression");
    expect(computeRegressionSignal(1.4)).toBe("Stable");
    expect(computeScheduleLabel(null)).toBe("Not available");
    expect(computeScheduleLabel(8)).toBe("Hard");
    expect(computeScheduleLabel(25)).toBe("Soft");
    expect(computeScheduleLabel(16)).toBe("Average");
    expect(computeUnitIdentity(1, 20)).toBe("offense-led profile");
    expect(computeUnitIdentity(20, 1)).toBe("defense-led profile");
    expect(computeUnitIdentity(10, 14)).toBe("balanced profile");
  });

  it("every team's stored labels equal recomputation through the utility", () => {
    for (const team of NFL_GUIDE_TEAMS) {
      expect(team.marketLean).toBe(computeMarketLean(team.modelEdge));
      expect(team.marketConfidence).toBe(computeMarketConfidence(team.modelEdge));
      expect(team.regressionSignal).toBe(computeRegressionSignal(team.regressionGap));
    }
  });
});

describe("routing and safety", () => {
  it("sample team slugs resolve (guide uses la-rams, not los-angeles-rams)", () => {
    for (const slug of ["kansas-city-chiefs", "buffalo-bills", "washington-commanders", "la-rams"]) {
      expect(NFL_GUIDE_TEAM_BY_SLUG.has(slug), slug).toBe(true);
      expect(GUIDE.teamBySlug.has(slug), slug).toBe(true);
    }
  });

  it("malformed or non-guide slugs resolve to undefined (page redirects to /nfl/guide)", () => {
    expect(NFL_GUIDE_TEAM_BY_SLUG.get("los-angeles-rams")).toBeUndefined();
    expect(NFL_GUIDE_TEAM_BY_SLUG.get("not-a-team")).toBeUndefined();
    expect(GUIDE.teamBySlug.get("not-a-team")).toBeUndefined();
    expect(getNflSeasonGuide(1999)).toBeNull();
  });

  it("section nav still includes the guide routes", () => {
    const routes = NFL_SECTION_NAV_ITEMS.map((item) => item.to);
    expect(routes).toContain("/nfl/guide");
    expect(routes).toContain("/nfl/standings");
    expect(routes).toContain("/nfl/schedule");
  });

  it("guide data modules do not consume power-ratings.json", () => {
    for (const file of ["src/lib/nfl/guideData.ts", "src/lib/nfl/guideLabels.ts", "src/lib/nfl/guide2026.ts"]) {
      const source = readFileSync(join(ROOT, file), "utf-8");
      // Comments may mention the file (to say it is off-limits); actual
      // imports/reads of it are what must not exist.
      expect(source, file).not.toMatch(/(import|from|fetch|readFile|require)[^\n]*power-ratings/);
    }
  });

  it("introduces no betting-edge language in normalized data", () => {
    const serialized = JSON.stringify({ ...NFL_SEASON_GUIDES[2026], teamBySlug: undefined, teamByAbbr: undefined });
    expect(serialized).not.toMatch(/bettingEdge|CLV|sportsbook|guaranteed|lock of the/i);
  });
});
