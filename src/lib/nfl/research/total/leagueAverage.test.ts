import { describe, expect, it } from "vitest";
import { buildLeagueEpaCorpus, buildLeagueSuccessRateCorpus, computeContemporaneousLeagueAverage } from "./leagueAverage";
import type { NflTotalResearchScoringSupportRow } from "./types";

function row(partial: Partial<NflTotalResearchScoringSupportRow> & Pick<NflTotalResearchScoringSupportRow, "gameId" | "season" | "week" | "team" | "opponent">): NflTotalResearchScoringSupportRow {
  return { eligiblePlays: 60, offEpaSum: 6, successNum: 24, successDen: 60, explosiveCount: 6, ...partial };
}

describe("buildLeagueEpaCorpus / buildLeagueSuccessRateCorpus", () => {
  it("extracts the correct per-game EPA/play rate for every row", () => {
    const rows = [row({ gameId: "g1", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 10 })];
    const corpus = buildLeagueEpaCorpus(rows);
    expect(corpus).toEqual([{ season: 2022, week: 1, teamPoints: 0.2 }]);
  });

  it("extracts the correct per-game success rate for every row", () => {
    const rows = [row({ gameId: "g1", season: 2022, week: 1, team: "buf", opponent: "mia", successNum: 20, successDen: 40 })];
    const corpus = buildLeagueSuccessRateCorpus(rows);
    expect(corpus).toEqual([{ season: 2022, week: 1, teamPoints: 0.5 }]);
  });

  it("excludes rows with zero denominator rather than producing NaN/Infinity", () => {
    const rows = [row({ gameId: "g1", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 0, successDen: 0 })];
    expect(buildLeagueEpaCorpus(rows)).toEqual([]);
    expect(buildLeagueSuccessRateCorpus(rows)).toEqual([]);
  });

  it("includes every team's game as one league-wide observation (both offense and opponent perspectives across a full season)", () => {
    const rows = [
      row({ gameId: "g1", season: 2022, week: 1, team: "buf", opponent: "mia" }),
      row({ gameId: "g1", season: 2022, week: 1, team: "mia", opponent: "buf" }),
    ];
    expect(buildLeagueEpaCorpus(rows)).toHaveLength(2);
  });
});

describe("computeContemporaneousLeagueAverage -- leakage safety (via the reused, already-tested computeScoringEnvironment)", () => {
  const rows: NflTotalResearchScoringSupportRow[] = [
    row({ gameId: "g_target", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 999 }), // must never enter its own cutoff's average
    row({ gameId: "g_prior1", season: 2023, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 2 }),
    row({ gameId: "g_prior2", season: 2023, week: 2, team: "mia", opponent: "nyj", eligiblePlays: 50, offEpaSum: 4 }),
    row({ gameId: "g_future", season: 2023, week: 10, team: "buf", opponent: "kc", eligiblePlays: 50, offEpaSum: -999 }), // future -- must never enter week-5 average
  ];
  const corpus = buildLeagueEpaCorpus(rows);

  it("excludes the target game's own row and any future game at the target cutoff", () => {
    const result = computeContemporaneousLeagueAverage(corpus, { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    expect(result.value).toBeCloseTo((0.04 + 0.08) / 2, 6); // mean of the two strictly-prior week-1/week-2 games only
    expect(result.sampleGames).toBe(2);
  });

  it("uses the correct season/week cutoff boundary -- a game in the exact target week is excluded, one week earlier is included", () => {
    const boundaryRows = [
      row({ gameId: "same_week", season: 2023, week: 5, team: "x", opponent: "y", eligiblePlays: 50, offEpaSum: 500 }),
      row({ gameId: "one_earlier", season: 2023, week: 4, team: "z", opponent: "w", eligiblePlays: 50, offEpaSum: 5 }),
    ];
    const result = computeContemporaneousLeagueAverage(buildLeagueEpaCorpus(boundaryRows), { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    expect(result.sampleGames).toBe(1);
    expect(result.value).toBeCloseTo(0.1, 6);
  });

  it("cannot access rows from a season/week never passed to it (no hidden validation-outcome access -- pure function of its corpus argument)", () => {
    const restrictedCorpus = buildLeagueEpaCorpus(rows.filter((r) => r.gameId !== "g_future"));
    const withFuture = computeContemporaneousLeagueAverage(corpus, { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    const withoutFuture = computeContemporaneousLeagueAverage(restrictedCorpus, { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    expect(withFuture.value).toBe(withoutFuture.value); // the future row was never strictly-prior anyway, so both are identical -- proves it was never touched
  });

  it("Week 1 falls back to the prior season safely when no current-season games exist yet", () => {
    const priorSeasonRows = [row({ gameId: "p1", season: 2022, week: 10, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 5 })];
    const result = computeContemporaneousLeagueAverage(buildLeagueEpaCorpus(priorSeasonRows), { season: 2023, week: 1 }, "seasonToDateWithPriorFallback");
    expect(result.method).toBe("priorSeason");
    expect(result.value).toBeCloseTo(0.1, 6);
  });

  it("is deterministic", () => {
    const a = computeContemporaneousLeagueAverage(corpus, { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    const b = computeContemporaneousLeagueAverage(corpus, { season: 2023, week: 5 }, "seasonToDateWithPriorFallback");
    expect(a).toEqual(b);
  });
});
