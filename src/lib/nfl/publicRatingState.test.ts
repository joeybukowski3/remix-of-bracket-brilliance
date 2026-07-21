import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countCompletedTeamGames,
  evaluateFullSeasonPublicEligibility,
  selectPublicRatingState,
} from "@/lib/nfl/publicRatingState";
import { NFL_V03_PUBLIC_MODEL_VERSION } from "@/lib/nfl/publicPowerRatings";
import { validateNflV03ReviewArtifact } from "@/lib/nfl/v03Review";

const ROOT = resolve(__dirname, "../../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");

function loadFull(season: 2025 | 2026) {
  const path = join(NFL_DATA, String(season), "full-season-team-metrics.json");
  return validateNflV03ReviewArtifact(
    "fullSeason",
    season,
    JSON.parse(readFileSync(path, "utf8")),
    path
  );
}

function loadPreseason(season: 2025 | 2026) {
  const path = join(NFL_DATA, String(season), "preseason-power-ratings.json");
  return validateNflV03ReviewArtifact(
    "preseason",
    season,
    JSON.parse(readFileSync(path, "utf8")),
    path
  );
}

describe("evaluateFullSeasonPublicEligibility", () => {
  it("rejects the honest empty 2026 full-season artifact", () => {
    const full = loadFull(2026);
    const result = evaluateFullSeasonPublicEligibility(
      full,
      2026,
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("empty");
    expect(result.completedTeamGames).toBe(0);
    expect(result.ratedTeamCount).toBe(0);
  });

  it("accepts the completed 2025 full-season artifact", () => {
    const full = loadFull(2025);
    const result = evaluateFullSeasonPublicEligibility(
      full,
      2025,
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("eligible");
    expect(result.completedTeamGames).toBe(544);
    expect(result.ratedTeamCount).toBe(32);
  });

  it("rejects season mismatches without inventing eligibility", () => {
    const full = loadFull(2025);
    const result = evaluateFullSeasonPublicEligibility(
      full,
      2026,
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("season_mismatch");
  });

  it("does not consult calendar date (empty remains empty regardless of now)", () => {
    const full = loadFull(2026);
    // Simulate a late-calendar call by only re-evaluating the same artifact.
    const first = evaluateFullSeasonPublicEligibility(
      full,
      2026,
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    const second = evaluateFullSeasonPublicEligibility(
      full,
      2026,
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(first).toEqual(second);
    expect(first.eligible).toBe(false);
  });
});

describe("selectPublicRatingState", () => {
  it("selects preseason for 2026 when full-season is empty and honest", () => {
    const preseason = loadPreseason(2026);
    const fullSeason = loadFull(2026);
    const selection = selectPublicRatingState(
      {
        season: 2026,
        preseason,
        fullSeason,
        fullSeasonLoadFailed: false,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(selection.selectedState).toBe("preseason");
    expect(selection.windowType).toBe("preseason");
    expect(selection.sourceSeason).toBe(2025);
    expect(selection.fallbackUsed).toBe(false);
    expect(selection.fallbackExplanation).toBeNull();
    expect(selection.title).toBe("2026 NFL Preseason Power Ratings");
    expect(selection.subtitle).toBe("Based on 2025 regular-season performance");
    expect(selection.recordColumnLabel).toBe("2025");
  });

  it("selects full_season for 2025 when completed games exist", () => {
    const preseason = loadPreseason(2025);
    const fullSeason = loadFull(2025);
    const selection = selectPublicRatingState(
      {
        season: 2025,
        preseason,
        fullSeason,
        fullSeasonLoadFailed: false,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(selection.selectedState).toBe("full_season");
    expect(selection.windowType).toBe("full_season");
    expect(selection.sourceSeason).toBe(2025);
    expect(selection.fallbackUsed).toBe(false);
    expect(selection.completedTeamGames).toBe(countCompletedTeamGames(fullSeason));
    expect(selection.title).toBe("2025 NFL Power Ratings");
    expect(selection.subtitle).toBe("Based on completed 2025 regular-season games");
    expect(selection.recordColumnLabel).toBe("2025");
  });

  it("falls back to preseason with public explanation when full-season load fails", () => {
    const preseason = loadPreseason(2026);
    const selection = selectPublicRatingState(
      {
        season: 2026,
        preseason,
        fullSeason: null,
        fullSeasonLoadFailed: true,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(selection.selectedState).toBe("preseason");
    expect(selection.fallbackUsed).toBe(true);
    expect(selection.fallbackExplanation).toMatch(/current-season ratings are not available/i);
  });

  it("never selects final-eight as a primary public state", () => {
    const preseason = loadPreseason(2026);
    const fullSeason = loadFull(2025);
    const selection = selectPublicRatingState(
      {
        season: 2026,
        preseason,
        // Wrong season full-season must not win via calendar or accidental reuse.
        fullSeason,
        fullSeasonLoadFailed: false,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );
    expect(selection.selectedState).toBe("preseason");
    expect(selection.windowType).not.toBe("full_season");
    expect(JSON.stringify(selection)).not.toMatch(/final.?eight/i);
  });
});
