import { describe, expect, it } from "vitest";
import {
  buildTeamGameLog,
  buildTeamPregameFeatures,
  selectLastNGames,
  selectPriorGamesInSeason,
  selectPriorSeasonGames,
  sumPlayVolumeWindow,
  type NflTeamGameLogEntry,
} from "./teamPlayVolume";
import { buildGameJoinIndex } from "./historicalOutcomes";
import type { NflPropRawGameRecord } from "./historicalOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "./types/teamPregameFeatures";

function schedule(overrides: Partial<NflPropRawGameRecord>): NflPropRawGameRecord {
  return {
    gameId: "2025_01_PHI_DAL",
    season: 2025,
    week: 1,
    seasonType: "REG",
    homeAbbr: "phi",
    awayAbbr: "dal",
    dateUtc: "2025-09-05T00:00:00.000Z",
    ...overrides,
  };
}

function playVolume(overrides: Partial<NflTeamGamePlayVolumeRecord>): NflTeamGamePlayVolumeRecord {
  return {
    gameId: "2025_01_PHI_DAL",
    season: 2025,
    week: 1,
    team: "phi",
    opponent: "dal",
    eligiblePlays: 60,
    passPlays: 30,
    rushPlays: 30,
    neutralEligiblePlays: 20,
    neutralPassPlays: 10,
    passOeSum: 5,
    passOeCount: 60,
    ...overrides,
  };
}

describe("sumPlayVolumeWindow", () => {
  it("returns an all-null empty window for zero games", () => {
    const window = sumPlayVolumeWindow([]);
    expect(window).toEqual({
      gamesIncluded: 0,
      offensivePlaysPerGame: null,
      passAttemptsPerGame: null,
      rushAttemptsPerGame: null,
      overallDropbackRate: null,
      earlyDownNeutralPassRate: null,
      neutralEligiblePlaysSample: 0,
      passRateOverExpected: null,
      passOeSample: 0,
    });
  });

  it("sums raw counters across games and divides once, never averaging per-game rates", () => {
    const games = [
      playVolume({ eligiblePlays: 60, passPlays: 30, neutralEligiblePlays: 20, neutralPassPlays: 5, passOeSum: 10, passOeCount: 60 }),
      playVolume({ eligiblePlays: 70, passPlays: 50, neutralEligiblePlays: 30, neutralPassPlays: 20, passOeSum: -20, passOeCount: 70 }),
    ];
    const window = sumPlayVolumeWindow(games);
    expect(window.gamesIncluded).toBe(2);
    expect(window.offensivePlaysPerGame).toBe((60 + 70) / 2);
    expect(window.passAttemptsPerGame).toBe((30 + 50) / 2);
    expect(window.overallDropbackRate).toBeCloseTo((30 + 50) / (60 + 70), 10);
    expect(window.earlyDownNeutralPassRate).toBeCloseTo((5 + 20) / (20 + 30), 10);
    expect(window.passRateOverExpected).toBeCloseTo((10 + -20) / (60 + 70), 10);
  });

  it("keeps a rate null (not zero) when its own denominator is zero even with games present", () => {
    const games = [playVolume({ neutralEligiblePlays: 0, neutralPassPlays: 0, passOeCount: 0, passOeSum: 0 })];
    const window = sumPlayVolumeWindow(games);
    expect(window.gamesIncluded).toBe(1);
    expect(window.earlyDownNeutralPassRate).toBeNull();
    expect(window.passRateOverExpected).toBeNull();
  });
});

describe("selectPriorGamesInSeason / selectLastNGames / selectPriorSeasonGames", () => {
  const games: NflPropRawGameRecord[] = [
    schedule({ gameId: "2025_01_PHI_DAL", week: 1, dateUtc: "2025-09-05T00:00:00.000Z" }),
    schedule({ gameId: "2025_02_PHI_KC", week: 2, homeAbbr: "kc", awayAbbr: "phi", dateUtc: "2025-09-14T00:00:00.000Z" }),
    schedule({ gameId: "2025_03_PHI_NYG", week: 3, homeAbbr: "phi", awayAbbr: "nyg", dateUtc: "2025-09-21T00:00:00.000Z" }),
    schedule({ gameId: "2025_04_PHI_WSH", week: 4, homeAbbr: "phi", awayAbbr: "wsh", dateUtc: "2025-09-28T00:00:00.000Z" }),
    schedule({ gameId: "2024_18_PHI_NYG", season: 2024, week: 18, homeAbbr: "phi", awayAbbr: "nyg", dateUtc: "2025-01-05T00:00:00.000Z" }),
  ];
  const index = buildGameJoinIndex(games);
  const records: NflTeamGamePlayVolumeRecord[] = [
    playVolume({ gameId: "2025_01_PHI_DAL", week: 1 }),
    playVolume({ gameId: "2025_02_PHI_KC", week: 2 }),
    playVolume({ gameId: "2025_03_PHI_NYG", week: 3 }),
    playVolume({ gameId: "2025_04_PHI_WSH", week: 4 }),
    playVolume({ gameId: "2024_18_PHI_NYG", season: 2024, week: 18 }),
  ];
  const log = buildTeamGameLog(records, index);

  it("selects only games strictly before the given date, ordered chronologically", () => {
    const prior = selectPriorGamesInSeason(log, "phi", 2025, "2025-09-28T00:00:00.000Z");
    expect(prior.map((g) => g.gameId)).toEqual(["2025_01_PHI_DAL", "2025_02_PHI_KC", "2025_03_PHI_NYG"]);
  });

  it("excludes the boundary game itself (strictly before, not on-or-before)", () => {
    const prior = selectPriorGamesInSeason(log, "phi", 2025, "2025-09-21T00:00:00.000Z");
    expect(prior.map((g) => g.gameId)).toEqual(["2025_01_PHI_DAL", "2025_02_PHI_KC"]);
  });

  it("selectLastNGames takes the most recent N from an already-sorted list, or fewer if unavailable", () => {
    const prior = selectPriorGamesInSeason(log, "phi", 2025, "2025-09-28T00:00:00.000Z");
    expect(selectLastNGames(prior, 3).map((g) => g.gameId)).toEqual(["2025_01_PHI_DAL", "2025_02_PHI_KC", "2025_03_PHI_NYG"]);
    expect(selectLastNGames(prior.slice(0, 1), 3).map((g) => g.gameId)).toEqual(["2025_01_PHI_DAL"]);
    expect(selectLastNGames([], 3)).toEqual([]);
  });

  it("selectPriorSeasonGames returns the full prior season, unfiltered by date", () => {
    const prior = selectPriorSeasonGames(log, "phi", 2024);
    expect(prior.map((g) => g.gameId)).toEqual(["2024_18_PHI_NYG"]);
  });
});

describe("buildTeamGameLog", () => {
  it("throws when a play-volume record has no matching schedule entry", () => {
    const index = buildGameJoinIndex([schedule({})]);
    const orphan = playVolume({ gameId: "2025_02_PHI_KC", week: 2 });
    expect(() => buildTeamGameLog([orphan], index)).toThrow(/No schedule entry/);
  });
});

describe("buildTeamPregameFeatures", () => {
  const games: NflPropRawGameRecord[] = [
    schedule({ gameId: "2025_01_PHI_DAL", week: 1, dateUtc: "2025-09-05T00:00:00.000Z" }),
    schedule({ gameId: "2025_02_PHI_KC", week: 2, homeAbbr: "kc", awayAbbr: "phi", dateUtc: "2025-09-14T00:00:00.000Z" }),
    schedule({ gameId: "2025_03_PHI_NYG", week: 3, homeAbbr: "phi", awayAbbr: "nyg", dateUtc: "2025-09-21T00:00:00.000Z" }),
    schedule({ gameId: "2024_18_PHI_NYG", season: 2024, week: 18, homeAbbr: "phi", awayAbbr: "nyg", dateUtc: "2025-01-05T00:00:00.000Z" }),
  ];
  const index = buildGameJoinIndex(games);

  it("Week 1 has zero current-season games and, when available, a full prior-season aggregate", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [
      playVolume({ gameId: "2025_01_PHI_DAL", week: 1 }),
      playVolume({ gameId: "2024_18_PHI_NYG", season: 2024, week: 18, eligiblePlays: 65 }),
    ];
    const log = buildTeamGameLog(records, index);
    const week1Target = records[0];
    const features = buildTeamPregameFeatures(week1Target, index, log);
    expect(features.gamesPlayedPriorThisSeason).toBe(0);
    expect(features.seasonPrior.gamesIncluded).toBe(0);
    expect(features.last3.gamesIncluded).toBe(0);
    expect(features.hasPriorSeason).toBe(true);
    expect(features.priorSeason.gamesIncluded).toBe(1);
    expect(features.priorSeason.offensivePlaysPerGame).toBe(65);
  });

  it("Week 2 season-to-date/last3 contain exactly the Week 1 game", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [
      playVolume({ gameId: "2025_01_PHI_DAL", week: 1, team: "phi", opponent: "dal" }),
      playVolume({ gameId: "2025_02_PHI_KC", week: 2, team: "phi", opponent: "kc" }),
    ];
    const log = buildTeamGameLog(records, index);
    const week2Target = records[1];
    const features = buildTeamPregameFeatures(week2Target, index, log);
    expect(features.gamesPlayedPriorThisSeason).toBe(1);
    expect(features.seasonPrior.gamesIncluded).toBe(1);
    expect(features.last3.gamesIncluded).toBe(1);
  });

  it("Week 3 season-to-date/last3 contain exactly Weeks 1-2", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [
      playVolume({ gameId: "2025_01_PHI_DAL", week: 1 }),
      playVolume({ gameId: "2025_02_PHI_KC", week: 2, opponent: "kc" }),
      playVolume({ gameId: "2025_03_PHI_NYG", week: 3, opponent: "nyg" }),
    ];
    const log = buildTeamGameLog(records, index);
    const week3Target = records[2];
    const features = buildTeamPregameFeatures(week3Target, index, log);
    expect(features.gamesPlayedPriorThisSeason).toBe(2);
    expect(features.seasonPrior.gamesIncluded).toBe(2);
    expect(features.last3.gamesIncluded).toBe(2);
  });

  it("carries homeAway/gameDateUtc/opponent from the schedule join", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [playVolume({ gameId: "2025_01_PHI_DAL", week: 1 })];
    const log = buildTeamGameLog(records, index);
    const features = buildTeamPregameFeatures(records[0], index, log);
    expect(features.homeAway).toBe("home");
    expect(features.gameDateUtc).toBe("2025-09-05T00:00:00.000Z");
    expect(features.opponent).toBe("dal");
  });

  it("ADVERSARIAL LEAKAGE: changing the target game's own plays never changes its pregame feature row", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [
      playVolume({ gameId: "2025_01_PHI_DAL", week: 1 }),
      playVolume({ gameId: "2025_02_PHI_KC", week: 2, opponent: "kc" }),
      playVolume({ gameId: "2025_03_PHI_NYG", week: 3, opponent: "nyg" }),
    ];
    const log = buildTeamGameLog(records, index);
    const baseline = buildTeamPregameFeatures(records[2], index, log);

    const mutatedTarget: NflTeamGamePlayVolumeRecord = {
      ...records[2],
      eligiblePlays: 999,
      passPlays: 900,
      rushPlays: 99,
      neutralEligiblePlays: 500,
      neutralPassPlays: 499,
      passOeSum: 123456,
      passOeCount: 999,
    };
    const mutatedRecords = [records[0], records[1], mutatedTarget];
    const mutatedLog = buildTeamGameLog(mutatedRecords, index);
    const afterMutation = buildTeamPregameFeatures(mutatedTarget, index, mutatedLog);

    expect(afterMutation).toEqual(baseline);
  });

  it("ADVERSARIAL LEAKAGE: a future game's plays never enter an earlier week's window", () => {
    const records: NflTeamGamePlayVolumeRecord[] = [
      playVolume({ gameId: "2025_01_PHI_DAL", week: 1 }),
      playVolume({ gameId: "2025_02_PHI_KC", week: 2, opponent: "kc" }),
    ];
    const log = buildTeamGameLog(records, index);
    const week1Features = buildTeamPregameFeatures(records[0], index, log);

    const mutatedFutureGame: NflTeamGamePlayVolumeRecord = {
      ...records[1],
      eligiblePlays: 999,
      passPlays: 999,
      neutralEligiblePlays: 999,
      neutralPassPlays: 999,
      passOeSum: 999999,
      passOeCount: 999,
    };
    const mutatedRecords = [records[0], mutatedFutureGame];
    const mutatedLog = buildTeamGameLog(mutatedRecords, index);
    const week1FeaturesAfter = buildTeamPregameFeatures(mutatedRecords[0], index, mutatedLog);

    expect(week1FeaturesAfter).toEqual(week1Features);
  });

  it("throws when the target game itself has no schedule entry", () => {
    const orphanTarget = playVolume({ gameId: "2099_99_XXX_YYY", week: 1, team: "zzz" });
    expect(() => buildTeamPregameFeatures(orphanTarget, index, [])).toThrow(/No schedule entry for target game/);
  });
});
