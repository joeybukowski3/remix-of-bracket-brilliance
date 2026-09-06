import { describe, expect, it } from "vitest";
import {
  buildMatchupCoachingContext,
  isCoachingRatingsArtifact,
  resolveCoachingAdvantage,
  type CoachingRatingsArtifact,
} from "./coachingRatingsView";

const artifact: CoachingRatingsArtifact = {
  schemaVersion: "nfl-coaching-ratings-v1",
  ratingVersion: "coaching-v1.0.0",
  sourceCutoff: "completed games through 2025 season",
  _meta: { generatedAt: "2026-09-06T15:38:21.304Z" },
  coaches: [
    {
      coach_id: "sean-mcvay",
      coach: "Sean McVay",
      team: "lar",
      coaching_rating: 59,
      career_wl: "102-63",
      career_ats: "89-72-4",
      last17_ats: "9-8",
      tenure_year: 9,
      small_sample: false,
      first_year: false,
      interim: false,
    },
    {
      coach_id: "kyle-shanahan",
      coach: "Kyle Shanahan",
      team: "sf",
      coaching_rating: 51,
      career_wl: "91-72",
      career_ats: "83-79-1",
      last17_ats: "8-9",
      tenure_year: 10,
      small_sample: false,
      first_year: false,
      interim: false,
    },
  ],
};

describe("resolveCoachingAdvantage", () => {
  it("returns EVEN inside the frozen threshold", () => {
    expect(resolveCoachingAdvantage(53, 51)).toEqual({ advantage: "even", differential: 2 });
    expect(resolveCoachingAdvantage(54, 50)).toEqual({ advantage: "even", differential: 4 });
  });

  it("returns the advantaged side beyond the threshold", () => {
    expect(resolveCoachingAdvantage(55, 50)).toEqual({ advantage: "home", differential: 5 });
    expect(resolveCoachingAdvantage(50, 58)).toEqual({ advantage: "away", differential: -8 });
  });

  it("never derives a differential against a missing rating", () => {
    expect(resolveCoachingAdvantage(59, null)).toEqual({ advantage: null, differential: null });
  });
});

describe("buildMatchupCoachingContext", () => {
  it("maps both coaches into the shared contract", () => {
    const context = buildMatchupCoachingContext(artifact, "LAR", "SF");
    expect(context.coaching_context_status).toBe("OK");
    expect(context.home_coach).toBe("Sean McVay");
    expect(context.away_coach).toBe("Kyle Shanahan");
    expect(context.home_coaching_rating).toBe(59);
    expect(context.coaching_advantage_team).toBe("home");
    expect(context.coaching_differential).toBe(8);
    expect(context.home_coach_context?.recent_ats).toBe("9-8");
    expect(context.rating_version).toBe("coaching-v1.0.0");
  });

  it("reports COACH_UNRATED but keeps the known side when one team is missing", () => {
    const context = buildMatchupCoachingContext(artifact, "lar", "zzz");
    expect(context.coaching_context_status).toBe("COACH_UNRATED");
    expect(context.home_coach).toBe("Sean McVay");
    expect(context.away_coach).toBeNull();
    expect(context.away_coaching_rating).toBeNull();
    expect(context.coaching_differential).toBeNull();
  });

  it("reports SOURCE_UNAVAILABLE when the artifact never loaded", () => {
    const context = buildMatchupCoachingContext(null, "lar", "sf");
    expect(context.coaching_context_status).toBe("SOURCE_UNAVAILABLE");
    expect(context.home_coaching_rating).toBeNull();
    expect(context.rating_version).toBeNull();
  });
});

describe("isCoachingRatingsArtifact", () => {
  it("rejects payloads without a coaches array", () => {
    expect(isCoachingRatingsArtifact({ ratingVersion: "coaching-v1.0.0" })).toBe(false);
    expect(isCoachingRatingsArtifact(null)).toBe(false);
    expect(isCoachingRatingsArtifact(artifact)).toBe(true);
  });
});
