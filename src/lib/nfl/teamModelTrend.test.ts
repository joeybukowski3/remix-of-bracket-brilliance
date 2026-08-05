import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildPublicPowerBoard } from "@/lib/nfl/publicPowerRatings";
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
const PRESEASON = validateNflV03ReviewArtifact(
  "preseason",
  2026,
  artifactJson(2026, "preseason-power-ratings.json"),
);
const PUBLIC_BOARD = buildPublicPowerBoard({
  season: 2026,
  preseason: PRESEASON,
  sourceFullSeason: FULL,
});

function build(teamSlug: string, overrides: {
  fullSeason?: NflV03FullSeasonArtifact | null;
  finalEight?: NflV03FinalEightArtifact | null;
} = {}) {
  return buildNflTeamModelTrend({
    teamSlug,
    publicBoard: PUBLIC_BOARD,
    fullSeason: overrides.fullSeason === undefined ? FULL : overrides.fullSeason,
    finalEight: overrides.finalEight === undefined ? FINAL_EIGHT : overrides.finalEight,
  });
}

describe("NFL team current-model trend adapter", () => {
  it("uses the current v0.3.1 public board rather than static Guide values", () => {
    const slug = "buffalo-bills";
    const view = build(slug);
    const publicTeam = PUBLIC_BOARD.teams.find((team) => team.slug === slug)!;
    const guideTeam = getNflSeasonGuide(2026)!.teamBySlug.get(slug)!;

    expect(view.currentPublicRating).toBe(publicTeam.publicRating);
    expect(view.currentPublicRank).toBe(publicTeam.rank);
    expect(view.currentPublicRating).not.toBe(guideTeam.overallPct);
    expect(view.currentPublicRating).not.toBe(guideTeam.projectedWins);
    expect(view.currentRatingStateLabel).toBe("2026 preseason public board");
  });

  it("maps full-season and final-eight composites through the current public-scale helper", () => {
    const slug = "la-rams";
    const view = build(slug);
    const full = FULL.teams.find((team) => team.slug === slug)!;
    const finalEight = FINAL_EIGHT.teams.find((team) => team.slug === slug)!;

    expect(view.fullSeasonRating).toBe(publicScaleEquivalent(full.adjustedComposite));
    expect(view.finalEightRating).toBe(publicScaleEquivalent(finalEight.adjustedComposite));
    expect(view.delta).toBeCloseTo(view.finalEightRating! - view.fullSeasonRating!, 2);
  });

  it("formats positive and negative deltas with explicit signs", () => {
    const views = FINAL_EIGHT.teams.map((team) => build(team.slug));
    const positive = views.find((view) => (view.delta ?? 0) > 0)!;
    const negative = views.find((view) => (view.delta ?? 0) < 0)!;

    expect(formatNflTrendDelta(positive.delta)).toMatch(/^\+/);
    expect(formatNflTrendDelta(negative.delta)).toMatch(/^-/);
  });

  it("normalizes near-zero deltas without displaying negative zero", () => {
    expect(formatNflTrendDelta(-0.004)).toBe("0.00");
    expect(formatNflTrendDelta(0)).toBe("0.00");
  });

  it("preserves every artifact trajectory string and all 32 team identities", () => {
    const labels = new Set<string>();
    for (const team of FINAL_EIGHT.teams) {
      const view = build(team.slug);
      expect(view.teamSlug).toBe(team.slug);
      expect(view.currentPublicRating).not.toBeNull();
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
    const zero = build(slug, { fullSeason, finalEight });

    expect(zero.delta).toBe(0);
    expect(zero.l8OpponentStrength).toBe(0);

    const missing = build(slug, {
      fullSeason: {
        ...fullSeason,
        teams: fullSeason.teams.map((team) => team.slug === slug ? { ...team, adjustedComposite: null } : team),
      },
      finalEight: null,
    });
    expect(missing.fullSeasonRating).toBeNull();
    expect(missing.finalEightRating).toBeNull();
    expect(missing.delta).toBeNull();
    expect(missing.currentPublicRating).not.toBeNull();

    const nonFiniteBoard = {
      ...PUBLIC_BOARD,
      teams: PUBLIC_BOARD.teams.map((team) => team.slug === slug ? { ...team, publicRating: Number.NaN } : team),
    };
    expect(buildNflTeamModelTrend({
      teamSlug: slug,
      publicBoard: nonFiniteBoard,
      fullSeason: FULL,
      finalEight: FINAL_EIGHT,
    }).currentPublicRating).toBeNull();
  });

  it("maps only actual shared provenance metadata and fabricates no freshness fields", () => {
    const view = build("kansas-city-chiefs");

    expect(view.provenance).toMatchObject({
      sourceKind: "model",
      generatedAt: PRESEASON._meta.generatedAt,
      season: 2026,
      validationStatus: PRESEASON._meta.validationStatus,
    });
    expect(view.provenance?.sourceLabel).toContain(PRESEASON._meta.modelVersion);
    expect(view.provenance?.retrievedAt).toBeUndefined();
    expect(view.provenance?.sourceUpdatedAt).toBeUndefined();
  });
});
