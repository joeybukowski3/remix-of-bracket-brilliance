import { describe, expect, it } from "vitest";
import {
  NFL_GUIDE_CONFERENCES,
  NFL_GUIDE_DIVISIONS,
  NFL_GUIDE_DIVISION_ORDER,
  NFL_GUIDE_MODEL_STATUS,
  NFL_GUIDE_RECORDS,
  NFL_GUIDE_RECORD_BY_SLUG,
  formatNflRecord,
} from "@/lib/nfl/guideRecord";
import { NFL_PRESEASON_RATINGS_META } from "@/lib/nfl/guideSources";

describe("NFL guide canonical records", () => {
  it("represents all 32 teams with unique abbreviations and slugs", () => {
    expect(NFL_GUIDE_RECORDS).toHaveLength(32);
    expect(new Set(NFL_GUIDE_RECORDS.map((team) => team.abbr)).size).toBe(32);
    expect(new Set(NFL_GUIDE_RECORDS.map((team) => team.slug)).size).toBe(32);
    expect(new Set(NFL_GUIDE_RECORDS.map((team) => team.id)).size).toBe(32);
  });

  it("maps 16 teams per conference and 4 per division", () => {
    for (const { conference, divisions } of NFL_GUIDE_CONFERENCES) {
      const teams = divisions.flatMap((entry) => entry.teams);
      expect(teams, conference).toHaveLength(16);
      expect(teams.every((team) => team.conference === conference)).toBe(true);
    }
    for (const { division, teams } of NFL_GUIDE_DIVISIONS) {
      expect(teams, division).toHaveLength(4);
      expect(teams.every((team) => team.division === division)).toBe(true);
    }
  });

  it("orders divisions deterministically", () => {
    expect(NFL_GUIDE_DIVISIONS.map((entry) => entry.division)).toEqual([...NFL_GUIDE_DIVISION_ORDER]);
  });

  it("orders teams deterministically by model rank", () => {
    const ranks = NFL_GUIDE_RECORDS.map((team) => team.model?.rank ?? Number.POSITIVE_INFINITY);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(NFL_GUIDE_RECORDS[0]?.model?.rank).toBe(1);
  });

  it("resolves a logo URL for every team", () => {
    for (const team of NFL_GUIDE_RECORDS) {
      expect(team.logoUrl, team.abbr).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/.+\.png$/);
      expect(team.logoUrl, team.abbr).toContain(team.abbr);
    }
  });

  it("exposes every team by slug", () => {
    for (const team of NFL_GUIDE_RECORDS) {
      expect(NFL_GUIDE_RECORD_BY_SLUG.get(team.slug)?.abbr).toBe(team.abbr);
    }
  });

  it("carries v0.3 model ratings on a 1-99 public scale", () => {
    for (const team of NFL_GUIDE_RECORDS) {
      expect(team.model, team.abbr).not.toBeNull();
      const model = team.model!;
      for (const rating of [model.publicRating, model.offenseRating, model.defenseRating]) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(99);
      }
    }
    expect(new Set(NFL_GUIDE_RECORDS.map((team) => team.model!.rank)).size).toBe(32);
  });

  it("carries the completed prior season from the generated metrics artifact", () => {
    for (const team of NFL_GUIDE_RECORDS) {
      expect(team.previousSeason, team.abbr).not.toBeNull();
      const previous = team.previousSeason!;
      expect(previous.wins + previous.losses + previous.ties).toBe(17);
    }
  });

  it("surfaces model provenance including the stage-1 validation status", () => {
    expect(NFL_GUIDE_MODEL_STATUS.modelVersion).toBe("nfl-power-v0.3.0");
    expect(NFL_GUIDE_MODEL_STATUS.validationStatus).toBe("stage-1");
    expect(NFL_GUIDE_MODEL_STATUS.season).toBe(2026);
    expect(NFL_GUIDE_MODEL_STATUS.sourceSeason).toBe(2025);
    expect(NFL_GUIDE_MODEL_STATUS.generatedAt).toBe(NFL_PRESEASON_RATINGS_META?.generatedAt);
    expect(() => new Date(NFL_GUIDE_MODEL_STATUS.generatedAt!).toISOString()).not.toThrow();
  });

  it("never fabricates a market win total when the source has none", () => {
    for (const team of NFL_GUIDE_RECORDS) {
      if (team.market) expect(team.market.winTotal).toBeGreaterThan(0);
    }
  });

  it("formats records without a ties segment when there are no ties", () => {
    expect(formatNflRecord({ wins: 12, losses: 5, ties: 0 } as never)).toBe("12-5");
    expect(formatNflRecord({ wins: 8, losses: 8, ties: 1 } as never)).toBe("8-8-1");
  });
});
