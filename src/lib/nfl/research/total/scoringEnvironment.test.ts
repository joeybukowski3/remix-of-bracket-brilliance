import { describe, expect, it } from "vitest";
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "./scoringEnvironment";

const CORPUS: ScoringEnvironmentObservation[] = [
  // 2020 season: mean team points = 20
  { season: 2020, week: 1, teamPoints: 10 },
  { season: 2020, week: 1, teamPoints: 30 },
  { season: 2020, week: 2, teamPoints: 20 },
  { season: 2020, week: 2, teamPoints: 20 },
  // 2021 season: mean team points = 24
  { season: 2021, week: 1, teamPoints: 20 },
  { season: 2021, week: 1, teamPoints: 28 },
  { season: 2021, week: 2, teamPoints: 24 },
  { season: 2021, week: 2, teamPoints: 24 },
  // 2022 season-to-date (weeks 1-2 only, week 3 is the cutoff target)
  { season: 2022, week: 1, teamPoints: 40 },
  { season: 2022, week: 1, teamPoints: 40 },
  { season: 2022, week: 2, teamPoints: 30 },
  { season: 2022, week: 2, teamPoints: 30 },
];

describe("computeScoringEnvironment", () => {
  describe("priorSeasonOnly", () => {
    it("uses the immediately prior season's full average, even for that season's own Week 1", () => {
      const week1 = computeScoringEnvironment(CORPUS, { season: 2022, week: 1 }, "priorSeasonOnly");
      expect(week1.value).toBeCloseTo(24, 5);
      expect(week1.method).toBe("priorSeason");
      expect(week1.sampleGames).toBe(4);

      // Week 3 of 2022 still uses 2021's full-season average -- it never reacts to 2022's own games.
      const week3 = computeScoringEnvironment(CORPUS, { season: 2022, week: 3 }, "priorSeasonOnly");
      expect(week3.value).toBeCloseTo(24, 5);
      expect(week3.method).toBe("priorSeason");
    });

    it("falls back to the all-time prior mean when no immediately-prior season exists", () => {
      // Corpus's earliest season is 2020; querying 2021 with only 2020 as history still resolves via priorSeason (2020 exists).
      // To exercise the true allTimeFallback branch, query a cutoff two seasons past a gap.
      const sparse: ScoringEnvironmentObservation[] = [{ season: 2018, week: 1, teamPoints: 22 }];
      const result = computeScoringEnvironment(sparse, { season: 2020, week: 1 }, "priorSeasonOnly");
      expect(result.method).toBe("allTimeFallback");
      expect(result.value).toBeCloseTo(22, 5);
    });

    it("returns insufficient with no fabricated value when no prior history exists at all", () => {
      const result = computeScoringEnvironment([], { season: 2020, week: 1 }, "priorSeasonOnly");
      expect(result.value).toBeNull();
      expect(result.method).toBe("insufficient");
      expect(result.sampleGames).toBe(0);
    });
  });

  describe("seasonToDateWithPriorFallback", () => {
    it("falls back to the prior season for that season's own Week 1", () => {
      const result = computeScoringEnvironment(CORPUS, { season: 2022, week: 1 }, "seasonToDateWithPriorFallback");
      expect(result.method).toBe("priorSeason");
      expect(result.value).toBeCloseTo(24, 5);
    });

    it("uses season-to-date once at least one current-season game is complete", () => {
      // Cutoff week 3: 2022 weeks 1-2 are strictly prior -> mean(40,40,30,30) = 35.
      const result = computeScoringEnvironment(CORPUS, { season: 2022, week: 3 }, "seasonToDateWithPriorFallback");
      expect(result.method).toBe("seasonToDate");
      expect(result.value).toBeCloseTo(35, 5);
      expect(result.sampleGames).toBe(4);
    });

    it("never includes the target week's own games in season-to-date", () => {
      // Cutoff week 2: only week 1 of 2022 (40,40) is strictly prior.
      const result = computeScoringEnvironment(CORPUS, { season: 2022, week: 2 }, "seasonToDateWithPriorFallback");
      expect(result.method).toBe("seasonToDate");
      expect(result.value).toBeCloseTo(40, 5);
      expect(result.sampleGames).toBe(2);
    });
  });

  describe("rollingWindow", () => {
    it("uses the trailing N observations chronologically, crossing season boundaries", () => {
      const result = computeScoringEnvironment(CORPUS, { season: 2022, week: 3 }, "rollingWindow", { rollingWindowGames: 4 });
      // Trailing 4 strictly-prior observations before 2022 week 3: 2022 wk1 (40,40), wk2 (30,30).
      expect(result.method).toBe("rollingWindow");
      expect(result.sampleGames).toBe(4);
      expect(result.value).toBeCloseTo(35, 5);
    });

    it("uses whatever is available (never fabricates) when fewer than N observations exist", () => {
      const result = computeScoringEnvironment(CORPUS, { season: 2020, week: 2 }, "rollingWindow", { rollingWindowGames: 272 });
      expect(result.sampleGames).toBe(2);
      expect(result.value).toBeCloseTo(20, 5);
    });
  });

  it("never lets a mode read the target game's own points, even when identical values exist earlier in the corpus", () => {
    const trap: ScoringEnvironmentObservation[] = [
      { season: 2022, week: 1, teamPoints: 999 }, // strictly prior -- fine to include
      { season: 2022, week: 5, teamPoints: -999 }, // the "target game" itself -- must NEVER be included
    ];
    const result = computeScoringEnvironment(trap, { season: 2022, week: 5 }, "seasonToDateWithPriorFallback");
    expect(result.value).toBeCloseTo(999, 5);
    expect(result.sampleGames).toBe(1);
  });
});
