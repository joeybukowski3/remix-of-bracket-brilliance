import { describe, expect, it } from "vitest";
import { buildMetricGridRows } from "./metricGridView";
import { buildYardageOpponentContext } from "./opponentContext";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import type { SuccessRatesArtifact } from "@/lib/nfl/successRateData";
import type { ProductionAllowedArtifact } from "@/lib/nfl/productionAllowedData";
import type { NflCurrentWeekProjectionRow, NflCurrentWeekPassingRow } from "../types/currentWeekProjection";
import type { NflYardagePlayerHistory } from "../types/yardageHistory";

/**
 * Both "ne" (the row's own team, offense side) and "sea" (the opponent,
 * defense side) carry metrics here -- deliberately, so a test can catch a
 * regression that reads the wrong side (e.g. a "Team EPA" row silently
 * showing the opponent's allowed EPA instead of the team's own).
 */
function epaArtifact(): EpaArtifact {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "nflverse", notes: [] },
    schemaVersion: "v1",
    attribution: "nflverse / nflfastR",
    currentSeason: 2026,
    priorSeason: 2025,
    seasonsUsed: [2025],
    metricKeys: [],
    metricDirections: {},
    displayDecimals: 3,
    windows: {
      "season-blend": {
        mode: "season",
        includePriorSeason: true,
        teams: {
          ne: {
            gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null },
            metrics: { "off.epaPerPass": [0.12, 6], "def.epaPerPassAllowed": [-0.2, 25] },
            totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } },
          },
          sea: {
            gamesIncluded: 8, gameIds: [], seasons: [2025], through: { season: 2025, week: 18, dateUtc: null },
            metrics: { "def.epaPerPassAllowed": [-0.05, 22], "off.epaPerPass": [0.31, 1] },
            totals: { offense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 }, defense: { offEpa: 0, offPlays: 0, passEpa: 0, passPlays: 0, rushEpa: 0, rushPlays: 0 } },
          },
        },
      },
    },
    provenance: null,
  };
}

function successArtifact(): SuccessRatesArtifact {
  return {
    _meta: {
      schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "RBSDM", attribution: "RBSDM / Ben Baldwin",
      endpoint: "https://rbsdm.com/stats", currentSeason: 2026, priorSeason: 2025, completedGameCounts: {}, notes: [],
    },
    periods: {
      "2025-last8": {
        ne: { gamesIncluded: 8, gameIds: [], metrics: { "off.passSuccessRate": { pct: 48.2, raw: 0.482, rank: 7 } } },
        sea: { gamesIncluded: 8, gameIds: [], metrics: { "def.passSuccessRateAllowed": { pct: 42.5, raw: 0.425, rank: 4 }, "off.passSuccessRate": { pct: 61.0, raw: 0.61, rank: 1 } } },
      },
    },
  };
}

function productionAllowedArtifact(): ProductionAllowedArtifact {
  return {
    _meta: { schemaVersion: "v1", generatedAt: "2026-01-01T00:00:00.000Z", source: "nflverse", season: 2025, notes: [] },
    schemaVersion: "nfl-matchup-production-allowed-v1",
    sourceSeason: 2025,
    marketPositions: { passing: ["QB"], rushing: ["ALL", "RB"], receiving: ["WR", "TE", "RB"] },
    teams: {
      SEA: { passing: { QB: { season: { yardsAllowedPerGame: 259.0, totalYardsAllowed: 4403, gamesIncluded: 17, weeksIncluded: [] }, last5: { yardsAllowedPerGame: 295.8, totalYardsAllowed: 1479, gamesIncluded: 5, weeksIncluded: [] } } } },
    },
    coverage: { passing: { QB: { season: 1, last5: 1, ofTeams: 1 } }, rushing: {}, receiving: {} },
  };
}

const abbrMap = new Map([["sea", "SEA"], ["ari", "ARI"]]);

function passingRow(overrides: Partial<NflCurrentWeekPassingRow> = {}): NflCurrentWeekProjectionRow {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1",
    season: 2026, week: 1, gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z",
    playerId: "gsis:00-0039851", playerName: "Drake Maye", team: "ne", opponent: "sea", homeAway: "away",
    position: "QB", market: "passing", status: "projected", historyStatus: "normal",
    generatedAt: "2026-08-26T14:09:24.393Z", modelVersion: "v1", fallbackProvenance: "historicalVolume",
    roleSource: "historicalVolume", roleSourceUpdatedAt: null, depthRank: 1, starterFlag: true, roleConfidence: "inferred",
    projectedYards: 245.3, directModelPrediction: 245.3,
    estimatedRange: { estimatedLow: 190, estimatedHigh: 300, nominalLevel: 0.9, intervalVersion: "v1" },
    matchupScore: null,
    hardCaseFlags: { noHistory: false, limitedHistory: false, multiQbRoleUncertain: false, committeeRole: false, zeroTargetRisk: false, teamChanged: false, roleUncertain: false },
    featureSnapshot: {
      qbAttemptsPerGame: { seasonPrior: 34.5, last3: 33.2, priorSeason: null },
      yardsPerAttempt: { seasonPrior: 8.1, last3: 7.9, priorSeason: null },
      completionPct: { seasonPrior: 0.65, last3: 0.64, priorSeason: null },
      teamPassAttemptsPerGame: { seasonPrior: 36.1, last3: 35.4, priorSeason: null },
      teamDropbackRate: { seasonPrior: 0.6, last3: 0.59, priorSeason: null },
      earlyDownNeutralPassRate: { seasonPrior: 0.55, last3: 0.54, priorSeason: null },
      passRateOverExpected: { seasonPrior: 0.02, last3: 0.01, priorSeason: null },
      market: { spread: -2.5, total: 45, impliedTeamTotal: 23.75, isDome: false },
    },
    diagnostics: { starterResolution: "sourcedDepthChart", gamesStartedPriorThisSeason: 5, sourceAmbiguous: false },
    ...overrides,
  } as NflCurrentWeekProjectionRow;
}

/** 6 leakage-safe historical games, most-recent-first (matching the generator's own sort), actual yards descending game-to-game for a deterministic Last-5-vs-Last-10 split. */
function playerHistory(): NflYardagePlayerHistory {
  const games = [300, 280, 260, 240, 220, 100].map((actualYards, i) => ({
    gameId: `g${i}`,
    season: 2025,
    week: 18 - i,
    dateUtc: `2025-12-${28 - i}T21:00:00.000Z`,
    opponentAbbr: "mia",
    homeAway: "home" as const,
    oppDefRank: 10,
    oppDefRankPoolSize: 32,
    oppYdsAllowAvg: 230,
    stat: { completions: 20, attempts: 30, passingTds: 2, interceptions: 0 },
    actualYards,
    gameScore: { result: "W" as const, teamScore: 24, oppScore: 17 },
    vegasLine: null,
  }));
  return { playerId: "gsis:00-0039851", playerName: "Drake Maye", market: "passing", position: "QB", games };
}

describe("buildMetricGridRows", () => {
  it("passing: renders all 6 rows, player/offense-oriented -- never a duplicated opponent-allowed figure", () => {
    const context = buildYardageOpponentContext({
      team: "ne", opponent: "sea", market: "passing", position: "QB",
      epa: epaArtifact(), success: successArtifact(), productionAllowed: productionAllowedArtifact(),
      abbrToNflverseAbbr: abbrMap,
    });
    const rows = buildMetricGridRows(passingRow(), context, playerHistory());

    expect(rows.map((r) => r.key)).toEqual([
      "last10YdsPerGame", "last5YdsPerGame", "teamEpa", "ownYardsPerOpportunity", "teamSuccessRate", "vsDefenseEdge",
    ]);

    // Last 10 / Last 5 Yds/Gm come from the PLAYER's own actual-yards history log, never opponent-allowed data.
    const last10Row = rows.find((r) => r.key === "last10YdsPerGame")!;
    expect(last10Row.value).toBe(((300 + 280 + 260 + 240 + 220 + 100) / 6).toFixed(1));
    expect(last10Row.rank).toBeNull(); // no established per-player rank exists anywhere in this codebase.

    const last5Row = rows.find((r) => r.key === "last5YdsPerGame")!;
    expect(last5Row.value).toBe(((300 + 280 + 260 + 240 + 220) / 5).toFixed(1));
    expect(last5Row.rank).toBeNull();

    // Team EPA is the row's own team's OFFENSE EPA (0.12, rank 6) -- never the opponent's allowed EPA (-0.05, rank 22).
    const epaRow = rows.find((r) => r.key === "teamEpa")!;
    expect(epaRow.value).toContain("0.12");
    expect(epaRow.rank).toBe(6);

    // Team Success Rate is the row's own team's OFFENSE success rate (48.2%, rank 7) -- never the opponent's allowed rate.
    const successRow = rows.find((r) => r.key === "teamSuccessRate")!;
    expect(successRow.value).toContain("48.2");
    expect(successRow.rank).toBe(7);

    // Player's own Yards/Attempt has no established per-player rank anywhere in this codebase --
    // the value renders, but the rank is always null, never fabricated.
    const ownRow = rows.find((r) => r.key === "ownYardsPerOpportunity")!;
    expect(ownRow.value).toBe("8.1");
    expect(ownRow.rank).toBeNull();

    // The genuine offense-vs-defense comparison -- this one legitimately touches the opponent side.
    const edgeRow = rows.find((r) => r.key === "vsDefenseEdge")!;
    expect(edgeRow.rank).toBeNull();
  });

  it("renders N/A values with no rank when both the opponent context and player history are missing -- never a fabricated rank", () => {
    const rows = buildMetricGridRows(passingRow(), undefined, null);
    for (const row of rows) {
      expect(row.rank).toBeNull();
    }
    expect(rows.find((r) => r.key === "last10YdsPerGame")!.value).toBe("N/A");
    expect(rows.find((r) => r.key === "teamEpa")!.value).toBe("N/A");
  });

  it("averages over however many games are actually available when fewer than 5/10 exist", () => {
    const shortHistory: NflYardagePlayerHistory = { ...playerHistory(), games: playerHistory().games.slice(0, 2) };
    const rows = buildMetricGridRows(passingRow(), undefined, shortHistory);
    const expectedAvg = ((300 + 280) / 2).toFixed(1);
    expect(rows.find((r) => r.key === "last10YdsPerGame")!.value).toBe(expectedAvg);
    expect(rows.find((r) => r.key === "last5YdsPerGame")!.value).toBe(expectedAvg);
  });

  it("never mutates the row's own projectedYards or any model output", () => {
    const row = passingRow();
    const before = JSON.stringify(row);
    buildMetricGridRows(row, undefined, playerHistory());
    expect(JSON.stringify(row)).toBe(before);
  });
});
