import { describe, it, expect } from "vitest";
import {
  buildComparisonRows,
  deriveAdvantages,
  deriveAngles,
  NO_ANGLE_MESSAGE,
  OFFENSE_DEFENSE_MISMATCH_PCT,
  POWER_GAP_RANK_MODERATE,
  type ComparisonDirection,
} from "@/lib/nfl/matchupComparison";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

// Minimal full guide team; override only the fields a test cares about.
function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a",
    abbr: "taa",
    teamName: "Team A",
    division: "AFC East",
    conference: "AFC",
    color: "#000000",
    projectedWins: 8.5,
    marketWinTotal: 8.5,
    modelVsMarketGap: 0,
    recommendationLabel: "Pass",
    confidenceLabel: "Low",
    regressionGap: 0,
    regressionSignal: "Neutral",
    powerRank: 16,
    offenseRank: 16,
    defenseRank: 16,
    scheduleRank: 16,
    scheduleLabel: "Average",
    record2025: "8-9",
    overallPct: 0,
    offensePct: 0,
    defensePct: 0,
    headline: "",
    editorialSummary: "",
    strengths: [],
    concerns: [],
    keyQuestions: [],
    ...overrides,
  } as NflMatchupTeam;
}

function makeMatchup(away: Partial<NflGuideTeamNormalized>, home: Partial<NflGuideTeamNormalized>): NflMatchup {
  return {
    slug: "away-at-home",
    gameId: "g1",
    season: 2026,
    week: 1,
    seasonType: "REG",
    kickoffUtc: "2026-09-13T17:00:00.000Z",
    stadium: "Test Stadium",
    away: makeTeam({ slug: "away", abbr: "awy", teamName: "Away", ...away }),
    home: makeTeam({ slug: "home", abbr: "hom", teamName: "Home", ...home }),
    neutralSite: false,
    spread: null,
  };
}

function rowByKey(matchup: NflMatchup, key: string) {
  return buildComparisonRows(matchup).find((r) => r.key === key)!;
}

describe("buildComparisonRows — comparison directions", () => {
  it("higher-is-better awards the higher rating", () => {
    const m = makeMatchup({ overallPct: 5 }, { overallPct: 2 });
    const row = rowByKey(m, "overallRating");
    expect(row.direction).toBe<ComparisonDirection>("higher-is-better");
    expect(row.advantage).toBe("away");
    expect(row.awayValue).toBe("+5.0%");
  });

  it("lower-is-better awards the lower rank", () => {
    const m = makeMatchup({ powerRank: 3 }, { powerRank: 20 });
    const row = rowByKey(m, "overallRank");
    expect(row.direction).toBe<ComparisonDirection>("lower-is-better");
    expect(row.advantage).toBe("away");
    expect(row.awayValue).toBe("#3");
  });

  it("context-only rows never award an advantage", () => {
    const m = makeMatchup({ scheduleRank: 1 }, { scheduleRank: 32 });
    const row = rowByKey(m, "scheduleRank");
    expect(row.direction).toBe<ComparisonDirection>("context-only");
    expect(row.advantage).toBe("none");
  });

  it("identity rows (conference/division) are direction none", () => {
    const m = makeMatchup({}, {});
    expect(rowByKey(m, "conference").direction).toBe<ComparisonDirection>("none");
    expect(rowByKey(m, "division").advantage).toBe("none");
  });
});

describe("buildComparisonRows — ties and missing values", () => {
  it("ties do not award a false advantage", () => {
    const m = makeMatchup({ powerRank: 10 }, { powerRank: 10 });
    expect(rowByKey(m, "overallRank").advantage).toBe("even");
  });

  it("missing values render N/A and award no advantage (not zero)", () => {
    const m = makeMatchup({ marketWinTotal: null }, { marketWinTotal: 9.5 });
    const row = rowByKey(m, "marketWinTotal");
    expect(row.awayValue).toBe("N/A");
    expect(row.advantage).toBe("none");
  });

  it("a missing rank on one side yields no advantage", () => {
    const m = makeMatchup({ offenseRank: null as unknown as number }, { offenseRank: 5 });
    expect(rowByKey(m, "offenseRank").advantage).toBe("none");
  });
});

describe("deriveAdvantages", () => {
  it("produces deterministic advantage notes from clear edges", () => {
    const m = makeMatchup(
      { powerRank: 2, offenseRank: 1, defenseRank: 8, projectedWins: 11 },
      { powerRank: 18, offenseRank: 20, defenseRank: 12, projectedWins: 7 }
    );
    const notes = deriveAdvantages(m);
    const first = deriveAdvantages(m);
    expect(notes).toEqual(first); // deterministic
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes.every((n) => n.teamSlug === "away")).toBe(true);
    expect(notes[0].text).toContain("Away");
  });

  it("omits advantages for even or missing metrics", () => {
    const m = makeMatchup(
      { powerRank: 10, offenseRank: 10, defenseRank: 10, projectedWins: 8 },
      { powerRank: 10, offenseRank: 10, defenseRank: 10, projectedWins: 8 }
    );
    expect(deriveAdvantages(m)).toEqual([]);
  });
});

describe("deriveAngles", () => {
  it("flags an offense-vs-defense mismatch above threshold", () => {
    const m = makeMatchup(
      { offensePct: OFFENSE_DEFENSE_MISMATCH_PCT + 2 },
      { defensePct: -3 }
    );
    const angles = deriveAngles(m);
    const od = angles.find((a) => a.key === "awayOffenseVsHomeDefense");
    expect(od).toBeTruthy();
    expect(od?.favoredSlug).toBe("away");
    expect(od?.sourceMetrics).toContain("offenseRating");
  });

  it("does not fabricate an angle when metrics are missing", () => {
    const m = makeMatchup(
      { offensePct: null as unknown as number, powerRank: null as unknown as number, marketWinTotal: null },
      { defensePct: null as unknown as number, powerRank: null as unknown as number, marketWinTotal: null }
    );
    const angles = deriveAngles(m);
    expect(angles.some((a) => a.key === "awayOffenseVsHomeDefense")).toBe(false);
    expect(angles.some((a) => a.key === "powerGap")).toBe(false);
  });

  it("detects a division matchup", () => {
    const m = makeMatchup({ division: "AFC West", conference: "AFC" }, { division: "AFC West", conference: "AFC" });
    const angles = deriveAngles(m);
    expect(angles.some((a) => a.key === "division")).toBe(true);
  });

  it("labels interconference games without a division angle", () => {
    const m = makeMatchup({ division: "AFC East", conference: "AFC" }, { division: "NFC West", conference: "NFC" });
    const angles = deriveAngles(m);
    expect(angles.some((a) => a.key === "division")).toBe(false);
    expect(angles.find((a) => a.key === "conference")?.label).toBe("Interconference matchup");
  });

  it("is deterministic and honors the power-gap threshold", () => {
    const m = makeMatchup({ powerRank: 2 }, { powerRank: 2 + POWER_GAP_RANK_MODERATE });
    const a1 = deriveAngles(m);
    const a2 = deriveAngles(m);
    expect(a1).toEqual(a2);
    expect(a1.some((a) => a.key === "powerGap")).toBe(true);
  });

  it("exposes a fallback message constant for empty results", () => {
    expect(NO_ANGLE_MESSAGE).toMatch(/no strong model-defined angle/i);
  });
});
