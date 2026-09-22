import { describe, expect, it } from "vitest";
import { buildMatchupMatrixBoard } from "@/lib/nfl/matchupMatrixData";
import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import type { MatchupMetricsArtifact } from "@/lib/nfl/matchupMetricsData";
import type { SuccessRatesArtifact } from "@/lib/nfl/successRateData";
import type { TrenchMetricsArtifact } from "@/lib/nfl/trenchMetricsData";

const TEAM_ABBRS = ["A", "B", "C"];

function makeCurrentRating(overrides: Partial<Record<string, { rating: number; rank: number; performanceRating: number | null; performanceRank: number | null; gamesPlayed: number }>>): CurrentRatingBoard {
  return {
    season: 2026,
    state: "live",
    teams: TEAM_ABBRS.map((abbr, index) => ({
      abbr,
      team: abbr,
      division: "AFC East",
      rating: overrides[abbr]?.rating ?? 50 + index,
      rank: overrides[abbr]?.rank ?? index + 1,
      offenseRating: 50,
      offenseRank: index + 1,
      defenseRating: 50,
      defenseRank: index + 1,
      performanceRating: overrides[abbr]?.performanceRating ?? null,
      performanceRank: overrides[abbr]?.performanceRank ?? null,
      gamesPlayed: overrides[abbr]?.gamesPlayed ?? 0,
      preseasonWeight: 1,
      performanceWeight: 0,
      state: "preseason",
      preseasonV04Rating: 50,
      preseasonOffenseRating: 50,
      preseasonDefenseRating: 50,
    })),
  };
}

function makeEpaArtifact(windows: EpaArtifact["windows"]): EpaArtifact {
  return {
    _meta: { schemaVersion: "1", generatedAt: "2026-01-01T00:00:00Z", source: "test", notes: [] },
    schemaVersion: "1",
    attribution: "test",
    currentSeason: 2026,
    priorSeason: 2025,
    seasonsUsed: [2025, 2026],
    metricKeys: ["off.epaPerPlay", "def.epaPerPlayAllowed"],
    metricDirections: {},
    displayDecimals: 3,
    windows,
    provenance: null,
  };
}

describe("buildMatchupMatrixBoard", () => {
  it("uses the artifact's own published rank for Rankings mode in 2026-Only and Last 8, never a recomputed one", () => {
    const epaArtifact = makeEpaArtifact({
      "season-current": {
        mode: "season",
        includePriorSeason: false,
        teams: {
          A: { gamesIncluded: 2, gameIds: [], seasons: [2026], through: { season: 2026, week: 2, dateUtc: null }, metrics: { "off.epaPerPlay": [0.1, 9] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
        },
      },
    });
    const board = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS,
      mode: "2026-only",
      currentRating: makeCurrentRating({}),
      epaArtifact,
      conventionalArtifact: null,
      successArtifact: null,
      trenchArtifact: null,
    });
    const cell = board.getCell("A", "offEpa");
    expect(cell.value).toBe(0.1);
    expect(cell.rank).toBe(9); // artifact-published rank, verbatim
  });

  it("excludes prior-season data entirely in 2026-Only mode", () => {
    const epaArtifact = makeEpaArtifact({
      "season-current": {
        mode: "season",
        includePriorSeason: false,
        teams: {
          A: { gamesIncluded: 1, gameIds: [], seasons: [2026], through: { season: 2026, week: 1, dateUtc: null }, metrics: { "off.epaPerPlay": [0.2, 1] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
        },
      },
      "prior-season-full": {
        mode: "priorSeasonFull",
        includePriorSeason: true,
        teams: {
          A: { gamesIncluded: 17, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null }, metrics: { "off.epaPerPlay": [-0.9, 32] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
        },
      },
    });
    const board = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS,
      mode: "2026-only",
      currentRating: makeCurrentRating({}),
      epaArtifact,
      conventionalArtifact: null,
      successArtifact: null,
      trenchArtifact: null,
    });
    // 0.2, not a blend with the -0.9 prior-season value.
    expect(board.getCell("A", "offEpa").value).toBe(0.2);
  });

  it("computes a new direction-aware rank for Blended mode, since no canonical rank exists for the composite", () => {
    const epaArtifact = makeEpaArtifact({
      "season-current": {
        mode: "season", includePriorSeason: false,
        teams: {
          A: { gamesIncluded: 6, gameIds: [], seasons: [2026], through: { season: 2026, week: 6, dateUtc: null }, metrics: { "off.epaPerPlay": [0.3, 1] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
          B: { gamesIncluded: 6, gameIds: [], seasons: [2026], through: { season: 2026, week: 6, dateUtc: null }, metrics: { "off.epaPerPlay": [0.0, 2] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
          C: { gamesIncluded: 6, gameIds: [], seasons: [2026], through: { season: 2026, week: 6, dateUtc: null }, metrics: { "off.epaPerPlay": [-0.3, 3] }, totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } } },
        },
      },
      "prior-season-full": {
        mode: "priorSeasonFull", includePriorSeason: true,
        teams: {},
      },
    });
    // All three teams at 6+ games, so Blended == pure 2026-current (prior phased out entirely).
    const board = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS,
      mode: "blended",
      currentRating: makeCurrentRating({ A: { rating: 50, rank: 1, performanceRating: null, performanceRank: null, gamesPlayed: 6 }, B: { rating: 50, rank: 2, performanceRating: null, performanceRank: null, gamesPlayed: 6 }, C: { rating: 50, rank: 3, performanceRating: null, performanceRank: null, gamesPlayed: 6 } }),
      epaArtifact,
      conventionalArtifact: null,
      successArtifact: null,
      trenchArtifact: null,
    });
    expect(board.getCell("A", "offEpa").rank).toBe(1);
    expect(board.getCell("C", "offEpa").rank).toBe(3);
  });

  it("keeps Success Rate season-to-date across every Data Window mode", () => {
    const successArtifact: SuccessRatesArtifact = {
      _meta: { schemaVersion: "1", generatedAt: "2026-01-01T00:00:00Z", source: "test", attribution: "test", endpoint: "test", currentSeason: 2026, priorSeason: 2025, completedGameCounts: { "2026": { A: 3 } }, notes: [] },
      periods: {
        "2026-season": { A: { gamesIncluded: 3, gameIds: [], metrics: { "off.successRate": { pct: 55, raw: 0.55, rank: 4 } } } },
      },
    };
    const buildFor = (mode: "blended" | "2026-only" | "last8") =>
      buildMatchupMatrixBoard({
        teamAbbrs: TEAM_ABBRS,
        mode,
        currentRating: makeCurrentRating({ A: { rating: 50, rank: 1, performanceRating: null, performanceRank: null, gamesPlayed: 3 } }),
        epaArtifact: null,
        conventionalArtifact: null,
        successArtifact,
        trenchArtifact: null,
      });
    const blended = buildFor("blended").getCell("A", "offSr");
    const twentySix = buildFor("2026-only").getCell("A", "offSr");
    const last8 = buildFor("last8").getCell("A", "offSr");
    expect(blended.value).toBe(55);
    expect(twentySix.value).toBe(55);
    expect(last8.value).toBe(55);
    expect(blended.windowSensitive).toBe(false);
  });

  it("uses ESPN's own published rank for trench metrics, never a recomputed one", () => {
    const trenchArtifact: TrenchMetricsArtifact = {
      schemaVersion: "1", generatedAt: "2026-01-01T00:00:00Z", source: "test", attribution: "test",
      metricColumns: {},
      seasons: {
        "2026": {
          articleId: "x", throughWeek: 3, sourceUpdatedText: null, sourceLastModified: null,
          teams: { A: { espnSlug: "a", metrics: { "off.runBlockWinRate": { valuePct: 71, espnRank: 5 } } } },
        },
      },
      provenance: null,
    };
    const board = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS,
      mode: "2026-only",
      currentRating: makeCurrentRating({ A: { rating: 50, rank: 1, performanceRating: null, performanceRank: null, gamesPlayed: 2 } }),
      epaArtifact: null,
      conventionalArtifact: null,
      successArtifact: null,
      trenchArtifact,
    });
    const cell = board.getCell("A", "blocking");
    expect(cell.rank).toBe(5); // ESPN's own published rank, verbatim
    expect(cell.value).toBe(71);
  });

  it("falls back to the 2025 trench season when the 2026 season has no entry yet for that team", () => {
    const trenchArtifact: TrenchMetricsArtifact = {
      schemaVersion: "1", generatedAt: "2026-01-01T00:00:00Z", source: "test", attribution: "test",
      metricColumns: {},
      seasons: {
        "2025": {
          articleId: "x", throughWeek: 18, sourceUpdatedText: null, sourceLastModified: null,
          teams: { A: { espnSlug: "a", metrics: { "off.runBlockWinRate": { valuePct: 60, espnRank: 10 } } } },
        },
        "2026": {
          articleId: "y", throughWeek: 2, sourceUpdatedText: null, sourceLastModified: null,
          teams: {}, // pipeline hasn't published this team's 2026 row yet
        },
      },
      provenance: null,
    };
    const cell = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS, mode: "2026-only",
      currentRating: makeCurrentRating({ A: { rating: 50, rank: 1, performanceRating: null, performanceRank: null, gamesPlayed: 2 } }),
      epaArtifact: null, conventionalArtifact: null, successArtifact: null, trenchArtifact,
    }).getCell("A", "blocking");
    expect(cell.value).toBe(60);
    expect(cell.rank).toBe(10);
  });

  it("falls back to the 2025 Last 8 success-rate period when 2026 season data isn't published yet for that team", () => {
    const successArtifact: SuccessRatesArtifact = {
      _meta: { schemaVersion: "1", generatedAt: "2026-01-01T00:00:00Z", source: "test", attribution: "test", endpoint: "test", currentSeason: 2026, priorSeason: 2025, completedGameCounts: { "2026": { A: 2 } }, notes: [] },
      periods: {
        "2025-last8": { A: { gamesIncluded: 8, gameIds: [], metrics: { "off.successRate": { pct: 48, raw: 0.48, rank: 15 } } } },
        // "2026-season" intentionally has no entry for A yet.
        "2026-season": {},
      },
    };
    const cell = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS, mode: "blended",
      currentRating: makeCurrentRating({ A: { rating: 50, rank: 1, performanceRating: null, performanceRank: null, gamesPlayed: 2 } }),
      epaArtifact: null, conventionalArtifact: null, successArtifact, trenchArtifact: null,
    }).getCell("A", "offSr");
    expect(cell.value).toBe(48);
  });

  it("falls back OVR's Last 8 to the 2026-to-date performanceRating, since no rolling-8 OVR composite exists", () => {
    const currentRating = makeCurrentRating({
      A: { rating: 62, rank: 1, performanceRating: 58, performanceRank: 3, gamesPlayed: 3 },
    });
    const last8 = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS, mode: "last8", currentRating,
      epaArtifact: null, conventionalArtifact: null, successArtifact: null, trenchArtifact: null,
    }).getCell("A", "ovr");
    const twentySixOnly = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS, mode: "2026-only", currentRating,
      epaArtifact: null, conventionalArtifact: null, successArtifact: null, trenchArtifact: null,
    }).getCell("A", "ovr");
    expect(last8.value).toBe(58);
    expect(last8.value).toBe(twentySixOnly.value);
    expect(last8.windowSensitive).toBe(false);
  });

  it("gives OVR a stable native value across every Data Window mode", () => {
    const currentRating = makeCurrentRating({
      A: { rating: 82.6, rank: 4, performanceRating: 82.6, performanceRank: 4, gamesPlayed: 6 },
    });
    for (const mode of ["blended", "2026-only", "last8"] as const) {
      const cell = buildMatchupMatrixBoard({
        teamAbbrs: TEAM_ABBRS, mode, currentRating,
        epaArtifact: null, conventionalArtifact: null, successArtifact: null, trenchArtifact: null,
      }).getCell("A", "ovr");
      expect(cell.value).toBe(82.6);
      expect(cell.formattedValue).toBe("82.6");
    }
  });

  it("ranks a full 32-team league so #1 is best and #32 is worst, direction-aware for a lower-is-better metric", () => {
    const abbrs = Array.from({ length: 32 }, (_, i) => `T${i + 1}`);
    // T1 allows the fewest EPA/play (best defense) ... T32 allows the most (worst defense).
    const teams: Record<string, { gamesIncluded: number; gameIds: string[]; seasons: number[]; through: { season: number; week: number; dateUtc: string | null }; metrics: Record<string, readonly [number, number | null]>; totals: unknown }> = {};
    abbrs.forEach((abbr, index) => {
      teams[abbr] = {
        gamesIncluded: 6, gameIds: [], seasons: [2026], through: { season: 2026, week: 6, dateUtc: null },
        metrics: { "def.epaPerPlayAllowed": [-0.3 + index * 0.02, null] },
        totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } },
      };
    });
    const epaArtifact = makeEpaArtifact({
      "season-current": { mode: "season", includePriorSeason: false, teams: teams as EpaArtifact["windows"][string]["teams"] },
    });
    const board = buildMatchupMatrixBoard({
      teamAbbrs: abbrs, mode: "blended",
      currentRating: { season: 2026, state: "live", teams: abbrs.map((abbr, index) => ({
        abbr, team: abbr, division: "AFC East", rating: 50, rank: index + 1, offenseRating: 50, offenseRank: index + 1,
        defenseRating: 50, defenseRank: index + 1, performanceRating: null, performanceRank: null, gamesPlayed: 6,
        preseasonWeight: 0, performanceWeight: 1, state: "live", preseasonV04Rating: 50, preseasonOffenseRating: 50, preseasonDefenseRating: 50,
      })) },
      epaArtifact, conventionalArtifact: null, successArtifact: null, trenchArtifact: null,
    });
    expect(board.getCell("T1", "defEpa").rank).toBe(1); // lowest EPA allowed = best defense = #1
    expect(board.getCell("T32", "defEpa").rank).toBe(32);
  });

  it("renders N/A rather than inventing a value for a team missing from every artifact", () => {
    const board = buildMatchupMatrixBoard({
      teamAbbrs: TEAM_ABBRS, mode: "blended", currentRating: null,
      epaArtifact: null, conventionalArtifact: null, successArtifact: null, trenchArtifact: null,
    });
    const cell = board.getCell("A", "offEpa");
    expect(cell.value).toBeNull();
    expect(cell.formattedValue).toBe("N/A");
    expect(cell.rank).toBeNull();
  });
});
