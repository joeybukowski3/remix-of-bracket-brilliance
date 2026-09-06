import { describe, expect, it } from "vitest";
import {
  adaptCurrentRatingsToSnapshot,
  deriveCurrentCutoffUtc,
  parseThroughSeason,
  type CoachEffectiveOverride,
  type CurrentRatingsArtifact,
} from "./nfl-coach-rating-current-adapter";
import { buildCoachingContext } from "./nfl-game-context";

const ARTIFACT: CurrentRatingsArtifact = {
  _meta: { season: 2026, generatedAt: "2026-09-06T15:38:21.304Z" },
  ratingVersion: "coaching-v1.0.0",
  sourceCutoff: "completed games through 2025 season",
  coaches: [
    {
      coach_id: "sean-mcvay",
      coach: "Sean McVay",
      team: "lar",
      coaching_rating: 59,
      career_wl: "102-63",
      tenure_wl: "102-63",
      season_wl: "0-0",
      career_ats: "89-72-4",
      last17_ats: "9-8",
      tenure_year: 10,
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

const KICKOFF_2026_W1 = "2026-09-10T00:20:00.000Z";

describe("parseThroughSeason / deriveCurrentCutoffUtc", () => {
  it("parses the prose cutoff and derives a leak-safe pregame instant", () => {
    expect(parseThroughSeason("completed games through 2025 season")).toBe(2025);
    expect(parseThroughSeason("garbage")).toBeNull();
    expect(parseThroughSeason(null)).toBeNull();
    expect(deriveCurrentCutoffUtc(2025)).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("adaptCurrentRatingsToSnapshot", () => {
  it("adapts a valid current/upcoming 2026 game", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: ARTIFACT,
      targetSeason: 2026,
      targetWeek: 1,
      gameKickoffUtc: KICKOFF_2026_W1,
    });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.snapshot.season).toBe(2026);
    expect(result.snapshot.week).toBe(1);
    expect(result.snapshot.generated_from_cutoff).toBe("2026-03-01T00:00:00.000Z");
    expect(result.snapshot.rating_version).toBe("coaching-v1.0.0");
    const lar = result.snapshot.coaches.find((c) => c.team === "lar");
    expect(lar?.coaching_rating).toBe(59);
    expect(lar?.recent_ats).toBe("9-8"); // last17_ats mapped through
    // first-year / small-sample flags preserved
    expect(result.snapshot.coaches.every((c) => c.first_year === false)).toBe(true);
  });

  it("refuses when the source cutoff is missing/unparseable", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: { ...ARTIFACT, sourceCutoff: "n/a" },
      targetSeason: 2026,
      targetWeek: 1,
      gameKickoffUtc: KICKOFF_2026_W1,
    });
    expect(result).toEqual({ status: "SOURCE_UNAVAILABLE", reason: "unparseable_source_cutoff" });
  });

  it("refuses a full-offseason-stale current artifact", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: { ...ARTIFACT, sourceCutoff: "completed games through 2024 season" },
      targetSeason: 2026,
      targetWeek: 1,
      gameKickoffUtc: KICKOFF_2026_W1,
    });
    expect(result).toEqual({ status: "SOURCE_UNAVAILABLE", reason: "stale_current_ratings" });
  });

  it("refuses a historical game — never serves the current artifact for 2016–2025", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: ARTIFACT,
      targetSeason: 2021,
      targetWeek: 3,
      gameKickoffUtc: "2021-09-26T17:00:00.000Z",
    });
    expect(result).toEqual({
      status: "SOURCE_UNAVAILABLE",
      reason: "historical_game_refuses_current_artifact",
    });
  });

  it("refuses when the derived cutoff is not strictly before kickoff", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: ARTIFACT,
      targetSeason: 2026,
      targetWeek: 1,
      gameKickoffUtc: "2026-02-01T00:00:00.000Z",
    });
    expect(result).toEqual({
      status: "SOURCE_UNAVAILABLE",
      reason: "source_cutoff_not_before_kickoff",
    });
  });

  it("yields COACH_UNRATED via buildCoachingContext when a matchup team's coach is absent", () => {
    const result = adaptCurrentRatingsToSnapshot({
      artifact: ARTIFACT,
      targetSeason: 2026,
      targetWeek: 1,
      gameKickoffUtc: KICKOFF_2026_W1,
    });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    const context = buildCoachingContext({
      snapshot: result.snapshot,
      homeTeam: "lar",
      awayTeam: "nyj", // not in the artifact
      gameKickoffUtc: KICKOFF_2026_W1,
    });
    expect(context.coaching_context_status).toBe("COACH_UNRATED");
    expect(context.home_coach).toBe("Sean McVay");
    expect(context.away_coach).toBeNull();
  });

  describe("current-season coach-change overrides", () => {
    const override: CoachEffectiveOverride = {
      coach_id: "interim-guy",
      coach_name: "Interim Guy",
      team: "lar",
      effective_season: 2026,
      effective_week: 8,
      kind: "interim",
    };

    it("keeps the old coach for a week BEFORE the change", () => {
      const result = adaptCurrentRatingsToSnapshot({
        artifact: ARTIFACT,
        targetSeason: 2026,
        targetWeek: 7,
        gameKickoffUtc: KICKOFF_2026_W1,
        overrides: [override],
      });
      expect(result.status).toBe("OK");
      if (result.status !== "OK") return;
      expect(result.snapshot.coaches.find((c) => c.team === "lar")?.coach).toBe("Sean McVay");
    });

    it("uses the new coach ON the effective week and later", () => {
      for (const week of [8, 14]) {
        const result = adaptCurrentRatingsToSnapshot({
          artifact: ARTIFACT,
          targetSeason: 2026,
          targetWeek: week,
          gameKickoffUtc: KICKOFF_2026_W1,
          overrides: [override],
        });
        expect(result.status).toBe("OK");
        if (result.status !== "OK") continue;
        const lar = result.snapshot.coaches.find((c) => c.team === "lar");
        expect(lar?.coach).toBe("Interim Guy");
        expect(lar?.interim).toBe(true);
        expect(lar?.coaching_rating).toBe(50);
        expect(lar?.first_year).toBe(true);
      }
    });
  });
});
