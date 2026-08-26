import { describe, expect, test } from "vitest";
import {
  buildProjectedYardsHeatByKey,
  edgeHeatTone,
  matchupScoreHeatTone,
  opponentDefenseRankHeatTone,
  yardsAllowedHeatTone,
} from "./yardageHeat";
import type { ProductionAllowedArtifact } from "@/lib/nfl/productionAllowedData";
import type { NflYardageReviewRow } from "./yardageMarketJoin";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

function buildRow(overrides: Partial<NflCurrentWeekProjectionRow> & { playerName: string }): NflYardageReviewRow {
  const row = {
    market: "rushing",
    position: "RB",
    playerId: `gsis:${overrides.playerName}`,
    projectedYards: 60,
    ...overrides,
  } as unknown as NflCurrentWeekProjectionRow;
  return { row, marketInfo: { available: false }, band: null };
}

/**
 * Direction-lock tests: guards against the favorable/unfavorable mapping
 * silently flipping later. Assertions are on the semantic tone (favorable
 * vs. unfavorable vs. neutral vs. missing), not exact tone/class strings, so
 * they stay meaningful if the underlying site-wide heat scale is retuned.
 */
const FAVORABLE_TONES = new Set(["gold", "dark-green", "green", "light-green"]);
const UNFAVORABLE_TONES = new Set(["light-red", "red", "strong-red"]);

function buildArtifact(values: Record<string, number>): ProductionAllowedArtifact {
  const teams: ProductionAllowedArtifact["teams"] = {};
  for (const [abbr, yardsAllowedPerGame] of Object.entries(values)) {
    teams[abbr] = {
      passing: { QB: { season: { yardsAllowedPerGame, totalYardsAllowed: yardsAllowedPerGame * 5, gamesIncluded: 5, weeksIncluded: [1, 2, 3, 4, 5] }, last5: null } },
      rushing: { ALL: { season: null, last5: null }, RB: { season: null, last5: null } },
      receiving: { WR: { season: null, last5: null }, TE: { season: null, last5: null }, RB: { season: null, last5: null } },
    } as ProductionAllowedArtifact["teams"][string];
  }
  return {
    _meta: { schemaVersion: "1", generatedAt: "2026-01-01", source: "test", season: 2025, notes: [] },
    schemaVersion: "1",
    sourceSeason: 2025,
    marketPositions: { passing: ["QB"], rushing: ["ALL", "RB"], receiving: ["WR", "TE", "RB"] },
    teams,
    coverage: { passing: {}, rushing: {}, receiving: {} } as ProductionAllowedArtifact["coverage"],
  };
}

describe("matchupScoreHeatTone", () => {
  test("higher matchup score band -> more favorable tone", () => {
    expect(FAVORABLE_TONES.has(matchupScoreHeatTone("elite"))).toBe(true);
    expect(FAVORABLE_TONES.has(matchupScoreHeatTone("strong"))).toBe(true);
    expect(UNFAVORABLE_TONES.has(matchupScoreHeatTone("poor"))).toBe(true);
  });

  test("null/missing band -> neutral, no heat", () => {
    expect(matchupScoreHeatTone(null)).toBe("missing");
    expect(matchupScoreHeatTone(undefined)).toBe("missing");
  });
});

describe("opponentDefenseRankHeatTone", () => {
  test("weaker opponent defense rank (higher number) -> more favorable tone", () => {
    // Rank 1 = strongest defense (worst matchup); rank 32 = weakest defense (best matchup).
    expect(FAVORABLE_TONES.has(opponentDefenseRankHeatTone(32))).toBe(true);
    expect(UNFAVORABLE_TONES.has(opponentDefenseRankHeatTone(1))).toBe(true);
  });

  test("null rank -> neutral, no heat", () => {
    expect(opponentDefenseRankHeatTone(null)).toBe("missing");
    expect(opponentDefenseRankHeatTone(undefined)).toBe("missing");
  });
});

describe("edgeHeatTone", () => {
  test("positive edge -> favorable tone", () => {
    expect(FAVORABLE_TONES.has(edgeHeatTone(20))).toBe(true);
  });

  test("negative edge -> unfavorable tone", () => {
    expect(UNFAVORABLE_TONES.has(edgeHeatTone(-20))).toBe(true);
  });

  test("null/missing edge -> neutral, no heat", () => {
    expect(edgeHeatTone(null)).toBe("missing");
    expect(edgeHeatTone(undefined)).toBe("missing");
  });
});

describe("yardsAllowedHeatTone", () => {
  test("higher opponent yards allowed -> more favorable tone", () => {
    const artifact = buildArtifact({ LA: 320, SEA: 180, DAL: 250, NE: 90 });
    const bestMatchupTone = yardsAllowedHeatTone(artifact, "passing", "QB", "season", "LA");
    const worstMatchupTone = yardsAllowedHeatTone(artifact, "passing", "QB", "season", "NE");
    expect(FAVORABLE_TONES.has(bestMatchupTone)).toBe(true);
    expect(UNFAVORABLE_TONES.has(worstMatchupTone)).toBe(true);
  });

  test("missing artifact or team -> neutral, no heat", () => {
    expect(yardsAllowedHeatTone(null, "passing", "QB", "season", "LA")).toBe("missing");
    const artifact = buildArtifact({ LA: 320 });
    expect(yardsAllowedHeatTone(artifact, "passing", "QB", "season", undefined)).toBe("missing");
    expect(yardsAllowedHeatTone(artifact, "passing", "QB", "season", "SEA")).toBe("missing");
  });
});

describe("buildProjectedYardsHeatByKey", () => {
  test("highest projection in a market+position pool receives favorable heat", () => {
    const entries = [
      buildRow({ playerName: "Low", market: "rushing", position: "RB", projectedYards: 40 }),
      buildRow({ playerName: "Mid", market: "rushing", position: "RB", projectedYards: 70 }),
      buildRow({ playerName: "High", market: "rushing", position: "RB", projectedYards: 110 }),
    ];
    const tones = buildProjectedYardsHeatByKey(entries);
    expect(FAVORABLE_TONES.has(tones.get("rushing-gsis:High")!)).toBe(true);
  });

  test("lowest projection in a market+position pool receives unfavorable heat", () => {
    const entries = [
      buildRow({ playerName: "Low", market: "rushing", position: "RB", projectedYards: 40 }),
      buildRow({ playerName: "Mid", market: "rushing", position: "RB", projectedYards: 70 }),
      buildRow({ playerName: "High", market: "rushing", position: "RB", projectedYards: 110 }),
    ];
    const tones = buildProjectedYardsHeatByKey(entries);
    expect(UNFAVORABLE_TONES.has(tones.get("rushing-gsis:Low")!)).toBe(true);
  });

  test("position pools stay independent -- a low-volume position doesn't inherit a high-volume position's scale", () => {
    // QB rushing rows run much higher than RB rushing rows here; without pool
    // separation the RB's projection would look uniformly unfavorable next
    // to every QB scramble total.
    const entries = [
      buildRow({ playerName: "ScramblerA", market: "rushing", position: "QB", projectedYards: 300 }),
      buildRow({ playerName: "ScramblerB", market: "rushing", position: "QB", projectedYards: 280 }),
      buildRow({ playerName: "BellcowRB", market: "rushing", position: "RB", projectedYards: 90 }),
      buildRow({ playerName: "MidRB", market: "rushing", position: "RB", projectedYards: 55 }),
      buildRow({ playerName: "BackupRB", market: "rushing", position: "RB", projectedYards: 20 }),
    ];
    const tones = buildProjectedYardsHeatByKey(entries);
    // BellcowRB is the top of its own RB pool -- favorable, despite being far below both QBs.
    expect(FAVORABLE_TONES.has(tones.get("rushing-gsis:BellcowRB")!)).toBe(true);
    // BackupRB is the bottom of the RB pool -- unfavorable.
    expect(UNFAVORABLE_TONES.has(tones.get("rushing-gsis:BackupRB")!)).toBe(true);
  });

  test("null projection receives missing/no heat", () => {
    const entries = [
      buildRow({ playerName: "Known", market: "receiving", position: "WR", projectedYards: 80 }),
      buildRow({ playerName: "Unknown", market: "receiving", position: "WR", projectedYards: null as unknown as number }),
    ];
    const tones = buildProjectedYardsHeatByKey(entries);
    expect(tones.get("receiving-gsis:Unknown")).toBe("missing");
  });
});
