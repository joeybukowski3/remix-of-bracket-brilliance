/**
 * Phase I -- consolidated leakage/safety tests exercising the FULL pipeline
 * (scoring environment + team scoring features + dataset materializer +
 * baselines + ridge) together, on a synthetic corpus engineered so that any
 * leakage would produce an obviously wrong number. Complements (does not
 * duplicate) the module-level tests in scoringEnvironment.test.ts,
 * teamScoringFeatures.test.ts, dataset.test.ts, baselines.test.ts and
 * ridgeModel.test.ts.
 */
import { describe, expect, it } from "vitest";
import { buildResearchDataset } from "./dataset";
import { buildScoringSupportIndex } from "./teamScoringFeatures";
import { fitBaseline1, scoreBaseline1 } from "./baselines";
import { fitTotalRidge, scoreTotalRidge } from "./ridgeModel";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflTotalResearchGameOutcome, NflTotalResearchScoringSupportRow } from "./types";

// A "poisoned" corpus: the TARGET game (2023 week 5) has an extreme, easily
// detectable outcome (100 points) that must never appear in any feature for
// that same game's own rows -- only in `actualTeamPoints`/`actualGameTotal`,
// which are outcome fields, never features.
const GAMES: NflTotalResearchGameOutcome[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, seasonType: "REG", homeAbbr: "mia", awayAbbr: "buf", homeScore: 17, awayScore: 20, totalPoints: 37 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "mia", homeScore: 16, awayScore: 19, totalPoints: 35 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "buf", homeScore: 14, awayScore: 23, totalPoints: 37 },
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, seasonType: "REG", homeAbbr: "buf", awayAbbr: "mia", homeScore: 100, awayScore: 100, totalPoints: 200 }, // TARGET GAME -- poisoned outcome
];

const SUPPORT: NflTotalResearchScoringSupportRow[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: 3, successNum: 25, successDen: 60, explosiveCount: 5 },
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "mia", opponent: "buf", eligiblePlays: 58, offEpaSum: -1, successNum: 22, successDen: 58, explosiveCount: 4 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, team: "mia", opponent: "nyj", eligiblePlays: 59, offEpaSum: 1, successNum: 24, successDen: 59, explosiveCount: 4 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, team: "nyj", opponent: "mia", eligiblePlays: 57, offEpaSum: -2, successNum: 21, successDen: 57, explosiveCount: 3 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, team: "buf", opponent: "nyj", eligiblePlays: 62, offEpaSum: 5, successNum: 28, successDen: 62, explosiveCount: 6 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, team: "nyj", opponent: "buf", eligiblePlays: 55, offEpaSum: -3, successNum: 20, successDen: 55, explosiveCount: 3 },
  // The TARGET game's own scoring-support rows -- poisoned to a value that would be
  // unmistakable if a windowing bug ever let the target game include itself.
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
  { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "mia", opponent: "buf", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
];

describe("full-pipeline target-game exclusion", () => {
  const dataset = buildResearchDataset({
    targetGames: GAMES,
    environmentCorpusGames: GAMES,
    scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
    environmentMode: "seasonToDateWithPriorFallback",
  });
  const targetRows = dataset.filter((r) => r.gameId === "2023_05_buf_mia");

  it("never lets the target game's own poisoned scoring-support values enter its own offense/defense windows", () => {
    for (const row of targetRows) {
      expect(row.offense.epaPerPlay).not.toBeCloseTo(9999 / 9999, 1);
      expect(row.offense.samplePlays).toBeLessThan(9999);
      expect(row.opponentDefenseAllowed.samplePlays).toBeLessThan(9999);
    }
  });

  it("never lets the target game's own 100-point outcome enter its own scoring-environment estimate", () => {
    for (const row of targetRows) {
      expect(row.scoringEnvironment.value).not.toBeNull();
      expect(row.scoringEnvironment.value!).toBeLessThan(50); // real prior games average ~18-20; 100 would be unmistakable
    }
  });

  it("still records the poisoned outcome correctly as actualTeamPoints/actualGameTotal -- outcomes are outcomes, not leaked features", () => {
    for (const row of targetRows) {
      expect(row.actualGameTotal).toBe(200);
    }
    expect(targetRows.find((r) => r.team === "buf")!.actualTeamPoints).toBe(100);
  });

  it("baseline1 and ridge scores for the target game do not reflect the poisoned outcome (stay in a plausible NFL scoring range)", () => {
    const trainRows = dataset.filter((r) => r.gameId !== "2023_05_buf_mia");
    const b1 = fitBaseline1(trainRows);
    const ridge = fitTotalRidge(trainRows, 1);
    for (const row of targetRows) {
      const b1Score = scoreBaseline1(b1, row);
      const ridgeScore = scoreTotalRidge(ridge, row);
      if (b1Score !== null) expect(b1Score).toBeLessThan(60);
      if (ridgeScore !== null) expect(Math.abs(ridgeScore)).toBeLessThan(200);
    }
  });
});

describe("canonical team alias handling end to end", () => {
  it("normalizes every documented alias to the same canonical code the dataset pipeline expects", () => {
    expect(normalizeNflTeamAbbr("JAC")).toBe("jax");
    expect(normalizeNflTeamAbbr("JAX")).toBe("jax");
    expect(normalizeNflTeamAbbr("LA")).toBe("lar");
    expect(normalizeNflTeamAbbr("LAR")).toBe("lar");
    expect(normalizeNflTeamAbbr("WAS")).toBe("wsh");
    expect(normalizeNflTeamAbbr("WSH")).toBe("wsh");
    expect(normalizeNflTeamAbbr("AZ")).toBe("ari");
    expect(normalizeNflTeamAbbr("ARI")).toBe("ari");
  });

  it("a team recorded under two different alias spellings across seasons still accumulates one continuous history", () => {
    const rows: NflTotalResearchScoringSupportRow[] = [
      { gameId: "2022_01_x", season: 2022, week: 1, team: normalizeNflTeamAbbr("ARI")!, opponent: "kc", eligiblePlays: 50, offEpaSum: 5, successNum: 20, successDen: 50, explosiveCount: 4 },
    ];
    const index = buildScoringSupportIndex(rows);
    // A later lookup using the "AZ" alias must resolve to the SAME canonical key ("ari") and see this history.
    const canonicalTarget = normalizeNflTeamAbbr("AZ")!;
    expect(canonicalTarget).toBe("ari");
    expect(index.byTeam.get(canonicalTarget)).toHaveLength(1);
  });
});

describe("fail-closed on zero usable training rows", () => {
  it("fitBaseline1 throws rather than silently producing NaN when every row is insufficient", () => {
    const emptyDataset = buildResearchDataset({
      targetGames: [GAMES[0]], // this game's own rows have zero prior history -> insufficient
      environmentCorpusGames: [GAMES[0]],
      scoringSupportIndex: buildScoringSupportIndex([]),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    expect(() => fitBaseline1(emptyDataset)).toThrow(/zero usable training rows/);
  });

  it("fitTotalRidge throws rather than silently producing NaN when every row is insufficient", () => {
    const emptyDataset = buildResearchDataset({
      targetGames: [GAMES[0]],
      environmentCorpusGames: [GAMES[0]],
      scoringSupportIndex: buildScoringSupportIndex([]),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    expect(() => fitTotalRidge(emptyDataset, 1)).toThrow(/zero usable training rows/);
  });
});

describe("deterministic fitting across repeated runs", () => {
  it("rebuilding the dataset and refitting from the same inputs is byte-for-byte reproducible", () => {
    const buildOnce = () =>
      buildResearchDataset({
        targetGames: GAMES,
        environmentCorpusGames: GAMES,
        scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
        environmentMode: "seasonToDateWithPriorFallback",
      });
    const a = buildOnce();
    const b = buildOnce();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const ridgeA = fitTotalRidge(a, 1);
    const ridgeB = fitTotalRidge(b, 1);
    expect(ridgeA.coefficients).toEqual(ridgeB.coefficients);
    expect(ridgeA.intercept).toBe(ridgeB.intercept);
  });
});
