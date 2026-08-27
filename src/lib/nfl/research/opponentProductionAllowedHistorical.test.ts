import { describe, expect, it } from "vitest";
import {
  buildHistoricalProductionAllowedGameLog,
  resolveHistoricalProductionAllowedWindow,
  selectPriorGamesAsOpponent,
} from "./opponentProductionAllowedHistorical";

const dates: Record<string, string> = {
  "2024|1|den": "2024-09-08T17:00:00Z",
  "2024|2|den": "2024-09-15T17:00:00Z",
  "2024|3|den": "2024-09-22T17:00:00Z",
  "2024|1|kc": "2024-09-08T17:00:00Z",
  "2024|2|sea": "2024-09-15T17:00:00Z",
  "2024|3|lac": "2024-09-22T17:00:00Z",
};
const dateResolver = (season: number, week: number, team: string) => dates[`${season}|${week}|${team}`] ?? null;

describe("buildHistoricalProductionAllowedGameLog", () => {
  it("aggregates rushing ALL/RB and receiving WR/TE/RB per team-game", () => {
    const log = buildHistoricalProductionAllowedGameLog(
      [
        { season: 2024, week: 1, gameId: "g1", team: "den", opponent: "kc", position: "RB", rushingYards: 60 },
        { season: 2024, week: 1, gameId: "g1", team: "den", opponent: "kc", position: "QB", rushingYards: 10 },
      ],
      [
        { season: 2024, week: 1, gameId: "g1", team: "den", opponent: "kc", position: "WR", receivingYards: 80 },
        { season: 2024, week: 1, gameId: "g1", team: "den", opponent: "kc", position: "TE", receivingYards: 20 },
      ],
      dateResolver,
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      team: "den", opponent: "kc", rushingYardsAll: 70, rushingYardsRB: 60,
      receivingYardsWR: 80, receivingYardsTE: 20, receivingYardsRB: 0,
    });
  });

  it("drops a row whose game date cannot be resolved, rather than defaulting it", () => {
    const log = buildHistoricalProductionAllowedGameLog(
      [{ season: 2024, week: 99, gameId: "gX", team: "den", opponent: "kc", position: "RB", rushingYards: 50 }],
      [],
      dateResolver,
    );
    expect(log).toHaveLength(0);
  });
});

describe("selectPriorGamesAsOpponent / resolveHistoricalProductionAllowedWindow", () => {
  const log = buildHistoricalProductionAllowedGameLog(
    [
      { season: 2024, week: 1, gameId: "g1", team: "kc", opponent: "den", position: "RB", rushingYards: 100 },
      { season: 2024, week: 2, gameId: "g2", team: "sea", opponent: "den", position: "RB", rushingYards: 60 },
      { season: 2024, week: 3, gameId: "g3", team: "lac", opponent: "den", position: "RB", rushingYards: 40 },
    ],
    [],
    dateResolver,
  );

  it("never includes the target game's own opponent-row or any later game", () => {
    // Target: den's week-2 game, kickoff 2024-09-15. Only week-1 (kickoff 09-08) may count.
    const prior = selectPriorGamesAsOpponent(log, "den", 2024, dates["2024|2|den"]);
    expect(prior.map((g) => g.week)).toEqual([1]);
  });

  it("resolves seasonPrior as the average of strictly-prior games, chronologically", () => {
    // Target: den's week-3 game (09-22). Prior = week1 (kc, 100) + week2 (sea, 60).
    const window = resolveHistoricalProductionAllowedWindow(log, "den", 2024, dates["2024|3|den"], "rushingYardsRB");
    expect(window.seasonPrior).toBe(80); // (100+60)/2
  });

  it("returns null (never a fabricated fallback) when zero prior games exist", () => {
    const window = resolveHistoricalProductionAllowedWindow(log, "den", 2024, dates["2024|1|den"], "rushingYardsRB");
    expect(window.seasonPrior).toBeNull();
    expect(window.last5).toBeNull();
  });

  it("priorSeason uses only the entirely-prior season's full total, never the current season", () => {
    const priorSeasonLog = buildHistoricalProductionAllowedGameLog(
      [{ season: 2023, week: 1, gameId: "gp", team: "kc", opponent: "den", position: "RB", rushingYards: 55 }],
      [],
      () => "2023-09-10T17:00:00Z",
    );
    const combined = [...log, ...priorSeasonLog];
    const window = resolveHistoricalProductionAllowedWindow(combined, "den", 2024, dates["2024|1|den"], "rushingYardsRB");
    expect(window.priorSeason).toBe(55);
    expect(window.seasonPrior).toBeNull(); // still zero 2024 games before week 1
  });
});
