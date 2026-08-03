import { describe, it, expect } from "vitest";
import {
  EXCLUDED_POSITIONS,
  buildCrosswalk,
  isExcludedPosition,
  normalizeGameStatus,
  normalizePracticeStatus,
  normalizeReserveStatus,
  parseInjuryRows,
  parsePlayerRows,
  parseRosterRows,
  parseSnapRows,
  positionUnit,
} from "../../../scripts/lib/nfl-injury-sources.mjs";

/** Minimal injury row with every required column present. */
function injuryRow(overrides = {}) {
  return {
    season: "2025",
    season_type: "REG",
    game_type: "REG",
    team: "NE",
    week: "12",
    gsis_id: "00-0034828",
    position: "LB",
    full_name: "Harold Landry III",
    first_name: "Harold",
    last_name: "Landry",
    report_primary_injury: "Knee",
    report_secondary_injury: "",
    report_status: "Questionable",
    practice_primary_injury: "Knee",
    practice_secondary_injury: "",
    practice_status: "Full Participation in Practice",
    ...overrides,
  };
}

function rosterRow(overrides = {}) {
  return {
    season: "2025",
    week: "12",
    game_type: "REG",
    team: "NE",
    gsis_id: "00-0034828",
    pfr_id: "LandHa00",
    espn_id: "3122793",
    full_name: "Harold Landry III",
    position: "LB",
    depth_chart_position: "OLB",
    status: "ACT",
    status_description_abbr: "A01",
    ...overrides,
  };
}

function snapRow(overrides = {}) {
  return {
    game_id: "2025_11_NYJ_NE",
    pfr_game_id: "202511160nwe",
    season: "2025",
    game_type: "REG",
    week: "11",
    player: "Harold Landry",
    pfr_player_id: "LandHa00",
    position: "LB",
    team: "NE",
    opponent: "NYJ",
    offense_snaps: "0",
    offense_pct: "0",
    defense_snaps: "42",
    defense_pct: "0.74",
    st_snaps: "0",
    st_pct: "0",
    ...overrides,
  };
}

describe("game status normalization", () => {
  it("maps the three official designations", () => {
    expect(normalizeGameStatus("Out")).toBe("OUT");
    expect(normalizeGameStatus("Doubtful")).toBe("DOUBTFUL");
    expect(normalizeGameStatus("Questionable")).toBe("QUESTIONABLE");
  });

  it("treats blank as null rather than a designation", () => {
    expect(normalizeGameStatus("")).toBeNull();
    expect(normalizeGameStatus("   ")).toBeNull();
    expect(normalizeGameStatus(null)).toBeNull();
    expect(normalizeGameStatus(undefined)).toBeNull();
  });

  it("fails on an unexpected non-blank value instead of silently mapping it", () => {
    expect(() => normalizeGameStatus("Probable")).toThrow(/Unknown report_status/);
    expect(() => normalizeGameStatus("IR")).toThrow(/Unknown report_status/);
  });
});

describe("practice status normalization", () => {
  it("maps all three participation levels", () => {
    expect(normalizePracticeStatus("Did Not Participate In Practice")).toBe("DID_NOT_PARTICIPATE");
    expect(normalizePracticeStatus("Limited Participation in Practice")).toBe("LIMITED");
    expect(normalizePracticeStatus("Full Participation in Practice")).toBe("FULL");
  });

  it("treats blank as null", () => {
    expect(normalizePracticeStatus("")).toBeNull();
  });

  it("rejects an unexpected non-blank value", () => {
    expect(() => normalizePracticeStatus("Rested")).toThrow(/Unknown practice_status/);
  });
});

describe("reserve status normalization", () => {
  it("maps only RES to a generic RESERVE", () => {
    expect(normalizeReserveStatus("RES")).toBe("RESERVE");
  });

  it("never labels ACT, INA or DEV as reserve", () => {
    expect(normalizeReserveStatus("ACT")).toBeNull();
    expect(normalizeReserveStatus("INA")).toBeNull();
    // Practice squad is not an injury.
    expect(normalizeReserveStatus("DEV")).toBeNull();
    expect(normalizeReserveStatus("CUT")).toBeNull();
    expect(normalizeReserveStatus("RET")).toBeNull();
  });

  it("rejects an unknown roster status code", () => {
    expect(() => normalizeReserveStatus("ZZZ")).toThrow(/Unknown roster status/);
  });
});

describe("position mapping", () => {
  it("assigns offensive positions to offense", () => {
    for (const position of ["QB", "RB", "FB", "WR", "TE", "T", "OT", "G", "OG", "C", "OL"]) {
      expect(positionUnit(position), position).toBe("offense");
    }
  });

  it("assigns defensive positions to defense", () => {
    for (const position of ["DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "CB", "S", "FS", "SS", "DB"]) {
      expect(positionUnit(position), position).toBe("defense");
    }
  });

  it("accepts EDGE if a source emits it but never synthesizes it", () => {
    expect(positionUnit("EDGE")).toBe("defense");
    // The injury feed's DE and LB stay exactly what the source said.
    expect(positionUnit("DE")).toBe("defense");
    expect(positionUnit("LB")).toBe("defense");
  });

  it("excludes K, P and LS", () => {
    expect(EXCLUDED_POSITIONS).toEqual(["K", "P", "LS"]);
    for (const position of ["K", "P", "LS", "k", "p", "ls"]) {
      expect(isExcludedPosition(position), position).toBe(true);
      expect(positionUnit(position), position).toBeNull();
    }
  });

  it("returns null for an unrecognized label rather than guessing a unit", () => {
    expect(positionUnit("XYZ")).toBeNull();
    expect(positionUnit("")).toBeNull();
  });
});

describe("injury row parsing", () => {
  it("parses a valid designated row with both statuses separated", () => {
    const { rows } = parseInjuryRows([injuryRow()], { season: 2025 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gsisId: "00-0034828",
      team: "NE",
      week: 12,
      position: "LB",
      unit: "defense",
      gameStatus: "QUESTIONABLE",
      practiceStatus: "FULL",
      reportPrimaryInjury: "Knee",
    });
  });

  it("keeps a blank game status as null while retaining the practice note", () => {
    const { rows } = parseInjuryRows(
      [
        injuryRow({
          report_status: "",
          report_primary_injury: "",
          practice_primary_injury: "Not injury related - resting player",
        }),
      ],
      { season: 2025 }
    );
    expect(rows[0].gameStatus).toBeNull();
    expect(rows[0].practiceStatus).toBe("FULL");
    expect(rows[0].practicePrimaryInjury).toBe("Not injury related - resting player");
  });

  it("preserves the raw source values for provenance", () => {
    const { rows } = parseInjuryRows([injuryRow()], { season: 2025 });
    expect(rows[0].rawReportStatus).toBe("Questionable");
    expect(rows[0].rawPracticeStatus).toBe("Full Participation in Practice");
  });

  it("rejects an unknown report_status", () => {
    expect(() => parseInjuryRows([injuryRow({ report_status: "Probable" })], { season: 2025 })).toThrow(
      /Unknown report_status/
    );
  });

  it("skips rows with no gsis_id rather than joining on a name", () => {
    const { rows, skipped } = parseInjuryRows([injuryRow({ gsis_id: "" })], { season: 2025 });
    expect(rows).toHaveLength(0);
    expect(skipped.missingGsisId).toBe(1);
  });

  it("excludes K, P and LS entirely", () => {
    const { rows, skipped } = parseInjuryRows(
      [injuryRow({ position: "K" }), injuryRow({ position: "P" }), injuryRow({ position: "LS" })],
      { season: 2025 }
    );
    expect(rows).toHaveLength(0);
    expect(skipped.excludedPosition).toBe(3);
  });

  it("drops postseason rows", () => {
    const { rows, skipped } = parseInjuryRows([injuryRow({ season_type: "POST" })], { season: 2025 });
    expect(rows).toHaveLength(0);
    expect(skipped.nonRegularSeason).toBe(1);
  });

  it("fails when a row belongs to a different season", () => {
    expect(() => parseInjuryRows([injuryRow({ season: "2024" })], { season: 2025 })).toThrow(
      /!= requested/
    );
  });

  it("fails when a required column is missing", () => {
    const row = injuryRow();
    delete row.report_status;
    expect(() => parseInjuryRows([row], { season: 2025 })).toThrow(/missing required columns/);
  });
});

describe("roster row parsing", () => {
  it("parses ACT, INA, DEV and RES with only RES becoming Reserve", () => {
    const rows = [
      rosterRow({ status: "ACT", gsis_id: "a" }),
      rosterRow({ status: "INA", gsis_id: "b" }),
      rosterRow({ status: "DEV", gsis_id: "c", status_description_abbr: "P01" }),
      rosterRow({ status: "RES", gsis_id: "d", status_description_abbr: "R01" }),
    ];
    const parsed = parseRosterRows(rows, { season: 2025 }).rows;
    expect(parsed.map((row) => row.reserveStatus)).toEqual([null, null, null, "RESERVE"]);
    expect(parsed.map((row) => row.rosterStatus)).toEqual(["ACT", "INA", "DEV", "RES"]);
  });

  it("keeps the RES sub-code for provenance without labelling it IR or PUP", () => {
    const parsed = parseRosterRows(
      [rosterRow({ status: "RES", status_description_abbr: "R04" })],
      { season: 2025 }
    ).rows;
    expect(parsed[0].rosterStatusCode).toBe("R04");
    expect(parsed[0].reserveStatus).toBe("RESERVE");
    expect(JSON.stringify(parsed[0])).not.toMatch(/\b(IR|PUP|NFI)\b/);
  });

  it("rejects an unknown roster status code", () => {
    expect(() => parseRosterRows([rosterRow({ status: "WAT" })], { season: 2025 })).toThrow(
      /Unknown roster status/
    );
  });

  it("carries the depth-chart position separately from the source position", () => {
    const parsed = parseRosterRows([rosterRow()], { season: 2025 }).rows;
    expect(parsed[0].position).toBe("LB");
    expect(parsed[0].depthChartPosition).toBe("OLB");
  });
});

describe("crosswalk", () => {
  it("maps gsis_id to pfr_id from the roster", () => {
    const rosters = parseRosterRows([rosterRow()], { season: 2025 }).rows;
    const { crosswalk } = buildCrosswalk(rosters, []);
    expect(crosswalk.get("00-0034828")).toMatchObject({
      pfrId: "LandHa00",
      espnId: "3122793",
      source: "weekly_rosters",
    });
  });

  it("falls back to the players file when the roster leaves pfr_id blank", () => {
    const rosters = parseRosterRows([rosterRow({ pfr_id: "", espn_id: "" })], { season: 2025 }).rows;
    const { rows: players } = parsePlayerRows([
      { gsis_id: "00-0034828", pfr_id: "LandHa00", espn_id: "3122793", display_name: "Harold Landry III", position: "LB" },
    ]);
    const { crosswalk } = buildCrosswalk(rosters, players);
    expect(crosswalk.get("00-0034828")).toMatchObject({ pfrId: "LandHa00", source: "players" });
  });

  it("prefers the roster value and reports a conflicting players id", () => {
    const rosters = parseRosterRows([rosterRow()], { season: 2025 }).rows;
    const { rows: players } = parsePlayerRows([
      { gsis_id: "00-0034828", pfr_id: "OTHER99", espn_id: "", display_name: "x", position: "LB" },
    ]);
    const { crosswalk, conflicts } = buildCrosswalk(rosters, players);
    expect(crosswalk.get("00-0034828").pfrId).toBe("LandHa00");
    expect(conflicts).toEqual([
      { gsisId: "00-0034828", kept: "LandHa00", rejected: "OTHER99", source: "players" },
    ]);
  });

  it("tolerates a duplicate consistent mapping across many weeks", () => {
    const rosters = parseRosterRows(
      [rosterRow({ week: "10" }), rosterRow({ week: "11" }), rosterRow({ week: "12" })],
      { season: 2025 }
    ).rows;
    const { crosswalk, conflicts } = buildCrosswalk(rosters, []);
    expect(crosswalk.size).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it("ignores players rows missing either id", () => {
    const { rows } = parsePlayerRows([
      { gsis_id: "", pfr_id: "X", espn_id: "", display_name: "", position: "" },
      { gsis_id: "Y", pfr_id: "", espn_id: "", display_name: "", position: "" },
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("snap row parsing", () => {
  it("parses offensive and defensive snaps and percentages separately", () => {
    const { rows } = parseSnapRows([snapRow()], { season: 2025 });
    expect(rows[0]).toMatchObject({
      pfrId: "LandHa00",
      offenseSnaps: 0,
      offensePct: 0,
      defenseSnaps: 42,
      defensePct: 0.74,
      gameId: "2025_11_NYJ_NE",
      week: 11,
    });
  });

  it("keeps special-teams snaps in their own field", () => {
    const { rows } = parseSnapRows([snapRow({ st_snaps: "17", st_pct: "0.65" })], { season: 2025 });
    expect(rows[0].stSnaps).toBe(17);
    // There is no combined or ST-inclusive percentage anywhere on the row.
    expect(Object.keys(rows[0])).not.toContain("totalPct");
    expect(Object.keys(rows[0])).not.toContain("stPct");
  });

  it("keeps a genuine zero on each unit", () => {
    const { rows } = parseSnapRows(
      [snapRow({ offense_snaps: "0", offense_pct: "0", defense_snaps: "0", defense_pct: "0" })],
      { season: 2025 }
    );
    expect(rows[0].offenseSnaps).toBe(0);
    expect(rows[0].offensePct).toBe(0);
    expect(rows[0].defenseSnaps).toBe(0);
    expect(rows[0].defensePct).toBe(0);
  });

  it("skips rows with no pfr_player_id", () => {
    const { rows, skipped } = parseSnapRows([snapRow({ pfr_player_id: "" })], { season: 2025 });
    expect(rows).toHaveLength(0);
    expect(skipped.missingPfrId).toBe(1);
  });

  it("drops postseason rows", () => {
    const { rows, skipped } = parseSnapRows([snapRow({ game_type: "WC" })], { season: 2025 });
    expect(rows).toHaveLength(0);
    expect(skipped.nonRegularSeason).toBe(1);
  });

  it("rejects a malformed percentage", () => {
    expect(() => parseSnapRows([snapRow({ defense_pct: "74" })], { season: 2025 })).toThrow(
      /expected a 0-1 fraction/
    );
  });
});
