import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurrentRatingBoard, CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import {
  buildNflTeamModelTrend,
  formatNflTrendDelta,
} from "@/lib/nfl/teamModelTrend";
import {
  publicScaleEquivalent,
  validateNflV03ReviewArtifact,
  type NflV03FinalEightArtifact,
  type NflV03FullSeasonArtifact,
} from "@/lib/nfl/v03Review";

const ROOT = resolve(__dirname, "../../..");

function artifactJson(season: number, filename: string): unknown {
  return JSON.parse(
    readFileSync(join(ROOT, "public", "data", "nfl", String(season), filename), "utf8"),
  );
}

const FULL = validateNflV03ReviewArtifact(
  "fullSeason",
  2025,
  artifactJson(2025, "full-season-team-metrics.json"),
);
const FINAL_EIGHT = validateNflV03ReviewArtifact(
  "finalEight",
  2025,
  artifactJson(2025, "final-eight-team-metrics.json"),
);

function currentRow(overrides: Partial<CurrentRatingRow> = {}): CurrentRatingRow {
  return {
    abbr: "buf",
    team: "Buffalo Bills",
    division: "AFC East",
    rating: 67.5,
    rank: 4,
    evidenceWeight: 0,
    performanceDelta: null,
    gamesPlayed: 0,
    preseasonV04Rating: 67.5,
    preseasonV03Rating: 60,
    currentV03Rating: null,
    state: "preseason",
    ...overrides,
  };
}

function currentBoard(teams: CurrentRatingRow[]): CurrentRatingBoard {
  return { season: 2026, state: teams.some((t) => t.gamesPlayed > 0) ? "live" : "preseason", teams };
}

function build(
  teamSlug: string,
  teamAbbr: string,
  overrides: {
    currentRating?: CurrentRatingBoard | null;
    fullSeason?: NflV03FullSeasonArtifact | null;
    finalEight?: NflV03FinalEightArtifact | null;
  } = {},
) {
  return buildNflTeamModelTrend({
    teamSlug,
    teamAbbr,
    currentRating: overrides.currentRating === undefined
      ? currentBoard([currentRow({ abbr: teamAbbr })])
      : overrides.currentRating,
    fullSeason: overrides.fullSeason === undefined ? FULL : overrides.fullSeason,
    finalEight: overrides.finalEight === undefined ? FINAL_EIGHT : overrides.finalEight,
  });
}

describe("NFL team current-model trend adapter", () => {
  it("sources current OVR/rank/state ONLY from the universal current-rating board, never from raw v0.3.1 overall", () => {
    const slug = "buffalo-bills";
    const abbr = "buf";
    const board = currentBoard([
      currentRow({ abbr, rating: 72.4, rank: 4, preseasonV04Rating: 68.2, state: "live", gamesPlayed: 6 }),
    ]);
    const view = build(slug, abbr, { currentRating: board });
    const guideTeam = getNflSeasonGuide(2026)!.teamBySlug.get(slug)!;

    expect(view.currentUniversalRating).toBe(72.4);
    expect(view.currentUniversalRank).toBe(4);
    expect(view.currentUniversalRating).not.toBe(guideTeam.overallPct);
    expect(view.currentRatingSeason).toBe(2026);
    expect(view.currentUniversalStateLabel).toBe("2026 season-to-date");
  });

  it("computes since-preseason movement as current universal rating minus the immutable v0.4 preseason anchor", () => {
    const board = currentBoard([
      currentRow({ abbr: "buf", rating: 72.4, preseasonV04Rating: 68.2, state: "live", gamesPlayed: 6 }),
    ]);
    const view = build("buffalo-bills", "buf", { currentRating: board });

    expect(view.preseasonV04Rating).toBe(68.2);
    expect(view.sincePreseasonDelta).toBeCloseTo(4.2, 5);
  });

  it("labels preseason vs live state from the team's own row, not board-level state", () => {
    // Board is "live" overall (another team has played), but this team has not.
    const board = currentBoard([
      currentRow({ abbr: "buf", state: "preseason", gamesPlayed: 0 }),
      currentRow({ abbr: "mia", state: "live", gamesPlayed: 3 }),
    ]);
    const view = build("buffalo-bills", "buf", { currentRating: board });
    expect(view.currentUniversalStateLabel).toBe("2026 preseason projection");
    expect(view.sincePreseasonDelta).toBe(0);
  });

  it("falls back to null current OVR/rank when the team is absent from the universal board, never substituting v0.3.1", () => {
    const board = currentBoard([currentRow({ abbr: "mia" })]);
    const view = build("buffalo-bills", "buf", { currentRating: board });

    expect(view.currentUniversalRating).toBeNull();
    expect(view.currentUniversalRank).toBeNull();
    expect(view.sincePreseasonDelta).toBeNull();
    expect(view.preseasonV04Rating).toBeNull();
    expect(view.currentUniversalStateLabel).toBeNull();
  });

  it("returns nulls (not a raw v0.3.1 fallback) when the universal board has not loaded", () => {
    const view = build("buffalo-bills", "buf", { currentRating: null });
    expect(view.currentUniversalRating).toBeNull();
    expect(view.currentUniversalRank).toBeNull();
    expect(view.currentRatingSeason).toBeNull();
  });

  it("maps full-season and final-eight composites through the current public-scale helper (2025 context, unrelated to universal OVR)", () => {
    const slug = "la-rams";
    const view = build(slug, "lar");
    const full = FULL.teams.find((team) => team.slug === slug)!;
    const finalEight = FINAL_EIGHT.teams.find((team) => team.slug === slug)!;

    expect(view.fullSeasonRating).toBe(publicScaleEquivalent(full.adjustedComposite));
    expect(view.finalEightRating).toBe(publicScaleEquivalent(finalEight.adjustedComposite));
    expect(view.delta).toBeCloseTo(view.finalEightRating! - view.fullSeasonRating!, 2);
  });

  it("formats positive and negative deltas with explicit signs", () => {
    const views = FINAL_EIGHT.teams.map((team) => build(team.slug, team.abbr));
    const positive = views.find((view) => (view.delta ?? 0) > 0)!;
    const negative = views.find((view) => (view.delta ?? 0) < 0)!;

    expect(formatNflTrendDelta(positive.delta)).toMatch(/^\+/);
    expect(formatNflTrendDelta(negative.delta)).toMatch(/^-/);
  });

  it("normalizes near-zero deltas without displaying negative zero", () => {
    expect(formatNflTrendDelta(-0.004)).toBe("0.00");
    expect(formatNflTrendDelta(0)).toBe("0.00");
  });

  it("preserves every artifact trajectory string and all 32 team identities (2025 context, unaffected by the universal migration)", () => {
    const labels = new Set<string>();
    for (const team of FINAL_EIGHT.teams) {
      const view = build(team.slug, team.abbr);
      expect(view.teamSlug).toBe(team.slug);
      expect(view.trajectoryLabel).toBe(team.trajectoryLabel);
      labels.add(view.trajectoryLabel!);
    }

    expect(labels).toEqual(new Set([
      "Late Riser",
      "Late Decline",
      "Stable",
      "Schedule-Inflated Surge",
    ]));
  });

  it("keeps zero valid and treats missing or non-finite values as unavailable", () => {
    const slug = FULL.teams[0].slug;
    const abbr = FULL.teams[0].abbr;
    const fullSeason: NflV03FullSeasonArtifact = {
      ...FULL,
      teams: FULL.teams.map((team) => team.slug === slug ? { ...team, adjustedComposite: 0 } : team),
    };
    const finalEight: NflV03FinalEightArtifact = {
      ...FINAL_EIGHT,
      teams: FINAL_EIGHT.teams.map((team) => team.slug === slug
        ? { ...team, adjustedComposite: 0, l8OpponentStrength: 0 }
        : team),
    };
    const zero = build(slug, abbr, { fullSeason, finalEight });

    expect(zero.delta).toBe(0);
    expect(zero.l8OpponentStrength).toBe(0);

    const missing = build(slug, abbr, {
      fullSeason: {
        ...fullSeason,
        teams: fullSeason.teams.map((team) => team.slug === slug ? { ...team, adjustedComposite: null } : team),
      },
      finalEight: null,
    });
    expect(missing.fullSeasonRating).toBeNull();
    expect(missing.finalEightRating).toBeNull();
    expect(missing.delta).toBeNull();
    expect(missing.currentUniversalRating).not.toBeNull();

    const nonFiniteBoard = currentBoard([currentRow({ abbr, rating: Number.NaN })]);
    expect(build(slug, abbr, { currentRating: nonFiniteBoard }).currentUniversalRating).toBeNull();
  });

  it("maps only actual shared provenance metadata and fabricates no freshness fields", () => {
    const view = build("kansas-city-chiefs", "kc");

    expect(view.provenance).toMatchObject({
      sourceKind: "model",
      generatedAt: FULL._meta.generatedAt,
      season: 2026,
      validationStatus: FULL._meta.validationStatus,
    });
    expect(view.provenance?.sourceLabel).toContain("2026 preseason projection");
    expect(view.provenance?.retrievedAt).toBeUndefined();
    expect(view.provenance?.sourceUpdatedAt).toBeUndefined();
  });
});
