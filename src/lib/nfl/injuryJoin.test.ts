import { describe, it, expect } from "vitest";
import {
  RESERVE_RELEVANCE_MIN_SNAP_PCT,
  buildInjuryEntries,
  compareEntries,
  groupRelevantByTeam,
  isDisplayableRecord,
  isRelevant,
  resolveInjuryDescription,
  summarizeTeam,
} from "../../../scripts/lib/nfl-injury-join.mjs";

const DENOMINATORS = new Map([
  ["2025_11_NYJ_NE|NE", { gameId: "2025_11_NYJ_NE", team: "NE", week: 11, offense: 67, defense: 57 }],
  ["2025_10_NE_TB|NE", { gameId: "2025_10_NE_TB", team: "NE", week: 10, offense: 70, defense: 60 }],
]);

function injury(overrides = {}) {
  return {
    season: 2025,
    week: 12,
    team: "NE",
    gsisId: "G-LANDRY",
    playerName: "Harold Landry III",
    position: "LB",
    unit: "defense" as const,
    gameStatus: "QUESTIONABLE",
    practiceStatus: "FULL",
    reportPrimaryInjury: "Knee",
    reportSecondaryInjury: null,
    practicePrimaryInjury: "Knee",
    practiceSecondaryInjury: null,
    rawReportStatus: "Questionable",
    rawPracticeStatus: "Full Participation in Practice",
    ...overrides,
  };
}

function roster(overrides = {}) {
  return {
    season: 2025,
    week: 12,
    team: "NE",
    gsisId: "G-LANDRY",
    pfrId: "LandHa00",
    espnId: "3122793",
    position: "LB",
    depthChartPosition: "OLB",
    rosterStatus: "ACT",
    rosterStatusCode: "A01",
    reserveStatus: null,
    ...overrides,
  };
}

function snap(overrides = {}) {
  return {
    gameId: "2025_11_NYJ_NE",
    season: 2025,
    week: 11,
    team: "NE",
    opponent: "NYJ",
    pfrId: "LandHa00",
    playerName: "Harold Landry",
    position: "LB",
    offenseSnaps: 0,
    offensePct: 0,
    defenseSnaps: 42,
    defensePct: 0.74,
    stSnaps: 0,
    ...overrides,
  };
}

function build({
  injuryRows = [injury()],
  rosterRows = [roster()],
  snapRows = [snap()],
  crosswalk = new Map([["G-LANDRY", { pfrId: "LandHa00", espnId: "3122793", source: "weekly_rosters" }]]),
  week = 12,
} = {}) {
  return buildInjuryEntries({
    injuryRows,
    rosterRows,
    snapRows,
    crosswalk,
    denominators: DENOMINATORS,
    week,
  });
}

describe("exact-ID join", () => {
  it("joins gsis_id -> pfr_id -> snap rows and reports full coverage", () => {
    const { entries, join } = build();
    expect(join).toMatchObject({ total: 1, resolved: 1, unresolved: 0 });
    expect(entries[0]).toMatchObject({
      gsisId: "G-LANDRY",
      pfrId: "LandHa00",
      espnId: "3122793",
      depthChartPosition: "OLB",
    });
    expect(entries[0].snaps.lastGame.defensePct).toBeCloseTo(74, 6);
  });

  it("preserves the injury record and nulls snaps when the id does not resolve", () => {
    const { entries, join } = build({ crosswalk: new Map() });
    expect(join).toMatchObject({ total: 1, resolved: 0, unresolved: 1 });
    expect(join.unresolvedPlayers[0]).toMatchObject({ gsisId: "G-LANDRY", team: "NE" });

    const entry = entries[0];
    expect(entry.playerName).toBe("Harold Landry III");
    expect(entry.gameStatus).toBe("QUESTIONABLE");
    expect(entry.pfrId).toBeNull();
    expect(entry.snaps.lastGame.defensePct).toBeNull();
    expect(entry.snaps.season.defensePct).toBeNull();
  });

  it("never matches on player name when ids disagree", () => {
    // The snap row carries the same NAME but a different pfr id. A name-based
    // fallback would wrongly attach 74%; the exact join must yield null.
    const { entries } = build({
      crosswalk: new Map([["G-LANDRY", { pfrId: "DIFFRNT9", espnId: null, source: "players" }]]),
    });
    expect(entries[0].snaps.lastGame.defensePct).toBeNull();
    expect(entries[0].snaps.season.defensePct).toBeNull();
  });

  it("does not join snap rows belonging to another team", () => {
    const { entries } = build({ snapRows: [snap({ team: "NYJ", gameId: "2025_11_NYJ_NE" })] });
    expect(entries[0].snaps.lastGame.gameId).toBeNull();
    expect(entries[0].snaps.lastGame.defensePct).toBeNull();
  });

  it("only reports the requested week", () => {
    const { entries } = build({ injuryRows: [injury({ week: 11 }), injury({ week: 12 })], week: 12 });
    expect(entries).toHaveLength(1);
    expect(entries[0].provenance.sourceWeek).toBe(12);
  });

  it("uses the roster row for the analyzed week, not another week", () => {
    const { entries } = build({
      rosterRows: [
        roster({ week: 11, rosterStatus: "RES", reserveStatus: "RESERVE" }),
        roster({ week: 12, rosterStatus: "ACT", reserveStatus: null }),
      ],
    });
    expect(entries[0].reserveStatus).toBeNull();
    expect(entries[0].provenance.rosterStatus).toBe("ACT");
  });
});

describe("last-game null vs zero", () => {
  it("reports 0% when the player dressed and took no unit snaps", () => {
    const { entries } = build({
      injuryRows: [injury({ unit: "offense", position: "WR" })],
      snapRows: [snap({ offenseSnaps: 0, offensePct: 0, defenseSnaps: 0, defensePct: 0 })],
    });
    expect(entries[0].snaps.lastGame.played).toBe(true);
    expect(entries[0].snaps.lastGame.offensePct).toBe(0);
  });

  it("reports null when the player is absent from the team's last game", () => {
    // The team played 2025_11_NYJ_NE; this player has only a week 10 row.
    const { entries } = build({
      snapRows: [snap(), snap({ gameId: "2025_10_NE_TB", week: 10, pfrId: "OTHER99" })],
      crosswalk: new Map([["G-LANDRY", { pfrId: "OTHER99", espnId: null, source: "players" }]]),
    });
    expect(entries[0].snaps.lastGame.gameId).toBe("2025_11_NYJ_NE");
    expect(entries[0].snaps.lastGame.played).toBe(false);
    expect(entries[0].snaps.lastGame.defensePct).toBeNull();
  });

  it("anchors last game to the team's schedule, not the player's last appearance", () => {
    const { entries } = build({
      snapRows: [
        snap({ gameId: "2025_10_NE_TB", week: 10, defenseSnaps: 55, defensePct: 0.92 }),
        snap({ pfrId: "SOMEONE1" }),
      ],
    });
    expect(entries[0].snaps.lastGame.gameId).toBe("2025_11_NYJ_NE");
    expect(entries[0].snaps.lastGame.defensePct).toBeNull();
  });
});

describe("status model", () => {
  it("keeps game, practice and reserve status separate", () => {
    const { entries } = build({
      injuryRows: [injury({ gameStatus: "OUT", practiceStatus: "DID_NOT_PARTICIPATE" })],
      rosterRows: [roster({ rosterStatus: "RES", rosterStatusCode: "R01", reserveStatus: "RESERVE" })],
    });
    expect(entries[0].gameStatus).toBe("OUT");
    expect(entries[0].practiceStatus).toBe("DID_NOT_PARTICIPATE");
    expect(entries[0].reserveStatus).toBe("RESERVE");
  });

  it("does not turn a rest note into an injury when there is no designation", () => {
    const record = injury({
      gameStatus: null,
      reportPrimaryInjury: null,
      practicePrimaryInjury: "Not injury related - resting player",
    });
    expect(resolveInjuryDescription(record)).toBeNull();

    const { entries } = build({ injuryRows: [record] });
    expect(entries[0].injuryDescription).toBeNull();
    expect(isDisplayableRecord(entries[0])).toBe(false);
    expect(isRelevant(entries[0])).toBe(false);
  });

  it("prefers report_primary_injury for the game description", () => {
    expect(
      resolveInjuryDescription(injury({ reportPrimaryInjury: "Knee", practicePrimaryInjury: "Ankle" }))
    ).toBe("Knee");
  });

  it("shows a reserve player with no game designation", () => {
    const { entries } = build({
      injuryRows: [injury({ gameStatus: null, practiceStatus: null })],
      rosterRows: [roster({ rosterStatus: "RES", rosterStatusCode: "R01", reserveStatus: "RESERVE" })],
    });
    expect(entries[0].gameStatus).toBeNull();
    expect(isDisplayableRecord(entries[0])).toBe(true);
  });
});

describe("relevance", () => {
  function reserveEntry(seasonPct: number | null, lastPct: number | null, depth: string | null = "OLB") {
    return {
      unit: "defense" as const,
      gameStatus: null,
      reserveStatus: "RESERVE",
      depthChartPosition: depth,
      playerName: "X",
      snaps: {
        lastGame: { offensePct: null, defensePct: lastPct },
        season: { offensePct: null, defensePct: seasonPct },
      },
    };
  }

  it("always shows a designated player regardless of snap share", () => {
    const { entries } = build({ snapRows: [] });
    expect(entries[0].snaps.season.defensePct).toBeNull();
    expect(isRelevant(entries[0])).toBe(true);
  });

  it("shows a reserve player above the season threshold", () => {
    expect(isRelevant(reserveEntry(78.6, null))).toBe(true);
  });

  it("shows a reserve player above the last-game threshold", () => {
    expect(isRelevant(reserveEntry(10, 51))).toBe(true);
  });

  it("hides a fringe reserve player below both thresholds", () => {
    expect(isRelevant(reserveEntry(1.3, 0))).toBe(false);
    expect(isRelevant(reserveEntry(13.9, null))).toBe(false);
  });

  it("keeps a reserve starter with no snap data via depth chart", () => {
    expect(isRelevant(reserveEntry(null, null, "G"))).toBe(true);
    expect(isRelevant(reserveEntry(null, null, null))).toBe(false);
  });

  it("uses a centrally tunable threshold", () => {
    expect(RESERVE_RELEVANCE_MIN_SNAP_PCT).toBe(25);
    expect(isRelevant(reserveEntry(22, null))).toBe(false);
    expect(isRelevant(reserveEntry(22, null), { minSnapPct: 20 })).toBe(true);
  });

  it("never uses special-teams participation to qualify a player", () => {
    // A special-teams-only player has 0 on both units regardless of ST volume.
    expect(isRelevant(reserveEntry(0, 0))).toBe(false);
  });
});

describe("sorting and summary", () => {
  function entry(gameStatus: string | null, seasonPct: number, name: string, reserve = false) {
    return {
      unit: "defense" as const,
      gameStatus,
      reserveStatus: reserve ? "RESERVE" : null,
      playerName: name,
      depthChartPosition: "LB",
      snaps: {
        lastGame: { offensePct: null, defensePct: seasonPct },
        season: { offensePct: null, defensePct: seasonPct },
      },
    };
  }

  it("orders OUT, DOUBTFUL, QUESTIONABLE then RESERVE", () => {
    const list = [
      entry(null, 90, "Reserve Guy", true),
      entry("QUESTIONABLE", 90, "Q"),
      entry("OUT", 10, "O"),
      entry("DOUBTFUL", 10, "D"),
    ].sort(compareEntries);
    expect(list.map((row) => row.playerName)).toEqual(["O", "D", "Q", "Reserve Guy"]);
  });

  it("ranks by season exposure within a status group", () => {
    const list = [entry("OUT", 20, "Low"), entry("OUT", 80, "High")].sort(compareEntries);
    expect(list.map((row) => row.playerName)).toEqual(["High", "Low"]);
  });

  it("falls back to a stable name order when exposure ties", () => {
    const list = [entry("OUT", 50, "Zeta"), entry("OUT", 50, "Alpha")].sort(compareEntries);
    expect(list.map((row) => row.playerName)).toEqual(["Alpha", "Zeta"]);
  });

  it("counts designations without producing any impact score", () => {
    const summary = summarizeTeam([
      entry("OUT", 50, "a"),
      entry("OUT", 50, "b"),
      entry("DOUBTFUL", 50, "c"),
      entry("QUESTIONABLE", 50, "d"),
      entry(null, 50, "e", true),
    ]);
    expect(summary).toEqual({ out: 2, doubtful: 1, questionable: 1, reserve: 1 });
    expect(Object.keys(summary)).not.toContain("impact");
  });

  it("groups relevant entries by team", () => {
    const { entries } = build();
    const grouped = groupRelevantByTeam(entries);
    expect([...grouped.keys()]).toEqual(["NE"]);
    expect(grouped.get("NE")).toHaveLength(1);
  });
});
