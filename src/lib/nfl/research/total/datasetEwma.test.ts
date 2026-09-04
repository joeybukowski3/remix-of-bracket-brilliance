import { describe, expect, it } from "vitest";
import { buildEwmaResearchDataset } from "./datasetEwma";
import { buildScoringSupportIndex } from "./teamScoringFeatures";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflTotalResearchGameOutcome, NflTotalResearchScoringSupportRow } from "./types";

const GAMES: NflTotalResearchGameOutcome[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, seasonType: "REG", homeAbbr: "mia", awayAbbr: "buf", homeScore: 17, awayScore: 20, totalPoints: 37 },
  // "bye week" gap: buf's next game is week 4, not week 2 -- nothing special should be required to handle this;
  // the window logic only cares about strictly-prior COMPLETED games, never calendar weeks.
  { gameId: "2022_04_buf_nyj", season: 2022, week: 4, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "buf", homeScore: 14, awayScore: 23, totalPoints: 37 },
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, seasonType: "REG", homeAbbr: "buf", awayAbbr: "mia", homeScore: 100, awayScore: 100, totalPoints: 200 }, // poisoned target game
];

const SUPPORT: NflTotalResearchScoringSupportRow[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: 3, successNum: 25, successDen: 60, explosiveCount: 5 },
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "mia", opponent: "buf", eligiblePlays: 58, offEpaSum: -1, successNum: 22, successDen: 58, explosiveCount: 4 },
  { gameId: "2022_04_buf_nyj", season: 2022, week: 4, team: "buf", opponent: "nyj", eligiblePlays: 62, offEpaSum: 5, successNum: 28, successDen: 62, explosiveCount: 6 },
  { gameId: "2022_04_buf_nyj", season: 2022, week: 4, team: "nyj", opponent: "buf", eligiblePlays: 55, offEpaSum: -3, successNum: 20, successDen: 55, explosiveCount: 3 },
  // poisoned target game's own scoring-support rows -- must never enter its own window.
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "mia", opponent: "buf", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
];

describe("buildEwmaResearchDataset", () => {
  const dataset = buildEwmaResearchDataset({
    targetGames: GAMES,
    environmentCorpusGames: GAMES,
    scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
    environmentMode: "priorSeasonOnly",
    offenseHalfLife: 4,
    defenseHalfLife: 2,
  });

  it("produces exactly two rows per game", () => {
    expect(dataset).toHaveLength(GAMES.length * 2);
  });

  it("each game's two rows sum to its actual total", () => {
    for (const game of GAMES) {
      const rows = dataset.filter((r) => r.gameId === game.gameId);
      expect(rows.reduce((s, r) => s + r.actualTeamPoints, 0)).toBe(game.totalPoints);
    }
  });

  it("handles a bye-week gap (buf's week-1 -> week-4 jump) without requiring special-case logic -- week 4's offense window still resolves from the week-1 game", () => {
    const week4Row = dataset.find((r) => r.gameId === "2022_04_buf_nyj" && r.team === "buf")!;
    // Only buf's OWN offense window is exercised by the gap (nyj has no history in this minimal fixture,
    // so its defense-allowed window is separately "insufficient" -- that's a data-sparsity fact of the
    // fixture, not a bye-week handling defect, which is what this test targets).
    expect(week4Row.offense.epaPerPlay).not.toBeNull();
    expect(week4Row.offense.sampleGames).toBe(1);
  });

  it("never lets the poisoned target game's own scoring-support rows or outcome enter its own EWMA window", () => {
    const targetRows = dataset.filter((r) => r.gameId === "2023_05_buf_mia");
    for (const row of targetRows) {
      expect(row.offense.epaPerPlay).not.toBeCloseTo(9999 / 9999, 1);
      expect(row.offense.samplePlays).toBeLessThan(100);
      expect(row.scoringEnvironment.value).toBeLessThan(50); // real prior games average ~18-20; 100 would be unmistakable
    }
  });

  it("still records the poisoned outcome correctly in actualTeamPoints/actualGameTotal", () => {
    const targetRows = dataset.filter((r) => r.gameId === "2023_05_buf_mia");
    expect(targetRows.find((r) => r.team === "buf")!.actualTeamPoints).toBe(100);
    expect(targetRows[0].actualGameTotal).toBe(200);
  });

  it("is deterministic across repeated builds", () => {
    const again = buildEwmaResearchDataset({
      targetGames: GAMES,
      environmentCorpusGames: GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "priorSeasonOnly",
      offenseHalfLife: 4,
      defenseHalfLife: 2,
    });
    expect(JSON.stringify(dataset)).toBe(JSON.stringify(again));
  });
});

describe("canonical alias handling in the EWMA dataset pipeline", () => {
  it("a team looked up under a raw alias still resolves to its canonical history", () => {
    const rows: NflTotalResearchScoringSupportRow[] = [
      { gameId: "2022_01_x", season: 2022, week: 1, team: normalizeNflTeamAbbr("ARI")!, opponent: "kc", eligiblePlays: 50, offEpaSum: 5, successNum: 20, successDen: 50, explosiveCount: 4 },
    ];
    const index = buildScoringSupportIndex(rows);
    const canonical = normalizeNflTeamAbbr("AZ")!;
    expect(canonical).toBe("ari");
    expect(index.byTeam.get(canonical)).toHaveLength(1);
  });
});
