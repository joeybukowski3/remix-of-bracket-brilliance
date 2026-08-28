import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDraftKingsNflClassicCsv } from "@/lib/nfl/dfs/draftKingsCsv";
import { DK_NFL_CLASSIC_HEADERS } from "@/lib/nfl/dfs/contracts";

const FIXTURE_PATH = join(__dirname, "__fixtures__", "draftkings-nfl-classic.csv");
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, "utf8");

const HEADER_LINE = DK_NFL_CLASSIC_HEADERS.join(",");

function withRows(...rows: string[]) {
  return [HEADER_LINE, ...rows].join("\n");
}

describe("parseDraftKingsNflClassicCsv — valid NFL Classic fixture", () => {
  it("accepts the sanitized real-derived fixture", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(result.accepted).toBe(true);
    expect(result.contestFormat).toBe("NFL_CLASSIC");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("preserves the exact headers in order", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(result.headers).toEqual([...DK_NFL_CLASSIC_HEADERS]);
  });

  it("parses all supported positions", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(result.summary.positions).toEqual(["DST", "QB", "RB", "TE", "WR"]);
  });

  it("validates FLEX eligibility roster-position syntax for RB/WR/TE", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const rb = result.rows.find((row) => row.position === "RB");
    const wr = result.rows.find((row) => row.position === "WR");
    const te = result.rows.find((row) => row.position === "TE");
    expect(rb?.rosterPosition).toBe("RB/FLEX");
    expect(wr?.rosterPosition).toBe("WR/FLEX");
    expect(te?.rosterPosition).toBe("TE/FLEX");
  });

  it("parses DST rows with team/mascot display name", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const dst = result.rows.find((row) => row.position === "DST" && row.teamAbbrev === "NO");
    expect(dst?.name).toBe("Saints");
    expect(dst?.rosterPosition).toBe("DST");
  });

  it("preserves blank Status as null and normalizes Q/D/OUT/IR", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const blankStatus = result.rows.find((row) => row.dkId === "39001101");
    const q = result.rows.find((row) => row.dkId === "39001102");
    const d = result.rows.find((row) => row.dkId === "39001104");
    const out = result.rows.find((row) => row.dkId === "39001202");
    const ir = result.rows.find((row) => row.dkId === "39001204");
    expect(blankStatus?.status).toBeNull();
    expect(q?.status).toBe("Q");
    expect(d?.status).toBe("D");
    expect(out?.status).toBe("OUT");
    expect(ir?.status).toBe("IR");
  });

  it("preserves raw Game Info and parses deterministic subfields", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const row = result.rows.find((r) => r.dkId === "39001101");
    expect(row?.gameInfoRaw).toBe("NO@DET 09/13/2026 01:00PM ET");
    expect(row?.game).toEqual({
      awayTeam: "NO",
      homeTeam: "DET",
      date: "09/13/2026",
      time: "01:00PM",
      timezone: "ET",
    });
  });

  it("preserves the DraftKings source ID as dkId", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const row = result.rows.find((r) => r.dkId === "39001101");
    expect(row?.dkId).toBe("39001101");
  });

  it("preserves AvgPointsPerGame and maps blank to null", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const populated = result.rows.find((r) => r.dkId === "39001101");
    const blank = result.rows.find((r) => r.dkId === "39001305");
    expect(populated?.avgPointsPerGame).toBe(19.86);
    expect(blank?.avgPointsPerGame).toBeNull();
  });

  it("parses positive integer salaries", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    result.rows.forEach((row) => {
      expect(Number.isInteger(row.salary)).toBe(true);
      expect(row.salary).toBeGreaterThan(0);
    });
  });

  it("summarizes multiple games and teams", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(result.summary.teams).toEqual(["BUF", "DET", "KC", "NO"]);
    expect(result.summary.games).toEqual(["KC@BUF 09/13/2026 04:25PM ET", "NO@DET 09/13/2026 01:00PM ET"]);
  });
});

describe("parseDraftKingsNflClassicCsv — CSV structure", () => {
  it("rejects an empty file", () => {
    const result = parseDraftKingsNflClassicCsv("");
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "EMPTY_FILE")).toBe(true);
  });

  it("rejects a whitespace-only file", () => {
    const result = parseDraftKingsNflClassicCsv("   \n\t \n  ");
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "EMPTY_FILE")).toBe(true);
  });

  it("rejects a header-only file", () => {
    const result = parseDraftKingsNflClassicCsv(HEADER_LINE);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "HEADER_ONLY_FILE")).toBe(true);
  });

  it("rejects a file missing required columns", () => {
    const csv = "Position,Name,Salary\nQB,Derek Sample,7200";
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_REQUIRED_COLUMN")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "UNSUPPORTED_CONTEST_FORMAT")).toBe(true);
  });

  it("rejects a file with a duplicate header", () => {
    const csv = [
      "Position,Name + ID,Name,ID,Roster Position,Salary,Salary,Game Info,TeamAbbrev,AvgPointsPerGame,Status",
      "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,",
    ].join("\n");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "DUPLICATE_HEADER")).toBe(true);
  });

  it("accepts reordered headers", () => {
    const csv = [
      "Name,Position,ID,Name + ID,Salary,Roster Position,TeamAbbrev,Game Info,Status,AvgPointsPerGame",
      "Derek Sample,QB,39001101,Derek Sample (39001101),7200,QB,NO,NO@DET 09/13/2026 01:00PM ET,,19.86",
    ].join("\n");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.rows[0]?.name).toBe("Derek Sample");
    expect(result.rows[0]?.salary).toBe(7200);
  });

  it("tolerates an extra unknown column with a non-blocking diagnostic", () => {
    const csv = [
      `${HEADER_LINE},ExtraColumn`,
      "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,,ignored-value",
    ].join("\n");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "UNKNOWN_COLUMN" && d.severity === "warning")).toBe(true);
  });

  it("handles a quoted comma within a field", () => {
    const csv = withRows(
      'QB,"Sample, Derek (39001101)",Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,',
    );
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.rows[0]?.namePlusId).toBe("Sample, Derek (39001101)");
  });

  it("handles an escaped quote within a field", () => {
    const csv = withRows(
      'QB,"Derek ""The Sample"" Anderson (39001101)",Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,',
    );
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.rows[0]?.namePlusId).toBe('Derek "The Sample" Anderson (39001101)');
  });

  it("does not silently drop a malformed row width", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_ROW_WIDTH")).toBe(true);
    expect(result.rows).toEqual([]);
  });
});

describe("parseDraftKingsNflClassicCsv — row validation", () => {
  it("rejects a blank Position", () => {
    const csv = withRows(",Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_REQUIRED_VALUE" && d.field === "position")).toBe(true);
  });

  it("rejects an unsupported Position", () => {
    const csv = withRows("K,Derek Sample (39001101),Derek Sample,39001101,K,4000,NO@DET 09/13/2026 01:00PM ET,NO,5.0,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_POSITION")).toBe(true);
  });

  it("rejects a blank Name", () => {
    const csv = withRows("QB,(39001101),,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_REQUIRED_VALUE" && d.field === "name")).toBe(true);
  });

  it("rejects a blank ID", () => {
    const csv = withRows("QB,Derek Sample (),Derek Sample,,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_DK_ID")).toBe(true);
  });

  it("rejects a malformed ID", () => {
    const csv = withRows("QB,Derek Sample (abc),Derek Sample,abc,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_DK_ID")).toBe(true);
  });

  it("rejects a duplicate ID", () => {
    const csv = withRows(
      "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,",
      "QB,Miles Anderson (39001101),Miles Anderson,39001101,QB,6900,NO@DET 09/13/2026 01:00PM ET,DET,18.42,",
    );
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "DUPLICATE_DK_ID")).toBe(true);
    expect(result.summary.duplicateDkIds).toEqual(["39001101"]);
    expect(result.rows).toHaveLength(1);
  });

  it("rejects a blank TeamAbbrev", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_REQUIRED_VALUE" && d.field === "teamAbbrev")).toBe(true);
  });

  it("rejects a zero Salary", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,0,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_SALARY")).toBe(true);
  });

  it("rejects a negative Salary", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,-100,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_SALARY")).toBe(true);
  });

  it("rejects a decimal Salary", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200.50,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_SALARY")).toBe(true);
  });

  it("rejects a nonnumeric Salary", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,abc,NO@DET 09/13/2026 01:00PM ET,NO,19.86,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "INVALID_SALARY")).toBe(true);
  });

  it("flags a malformed AvgPointsPerGame with a non-blocking warning", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,not-a-number,");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.rows[0]?.avgPointsPerGame).toBeNull();
    expect(result.diagnostics.some((d) => d.code === "INVALID_AVG_POINTS" && d.severity === "warning")).toBe(true);
  });

  it("preserves and surfaces an unknown Status without rejecting the row", () => {
    const csv = withRows("QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,GTD");
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(true);
    expect(result.rows[0]?.status).toBe("GTD");
    expect(result.diagnostics.some((d) => d.code === "UNKNOWN_STATUS" && d.severity === "warning")).toBe(true);
  });
});

describe("parseDraftKingsNflClassicCsv — contest format detection", () => {
  it("accepts a valid NFL Classic file", () => {
    const result = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(result.contestFormat).toBe("NFL_CLASSIC");
    expect(result.accepted).toBe(true);
  });

  it("rejects a Showdown/Captain-mode fixture via CPT roster position markers", () => {
    const csv = withRows(
      "QB,Derek Sample (39001101),Derek Sample,39001101,CPT,10800,NO@DET 09/13/2026 01:00PM ET,NO,29.79,",
      "QB,Derek Sample (39001101),Derek Sample,39001101,FLEX,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,",
    );
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.contestFormat).toBe("SHOWDOWN");
    expect(result.diagnostics.some((d) => d.code === "UNSUPPORTED_CONTEST_FORMAT")).toBe(true);
  });

  it("rejects an unrelated CSV", () => {
    const csv = "Date,Home,Away\n09/13/2026,DET,NO";
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.contestFormat).toBe("UNKNOWN");
  });

  it("rejects a PGA-style Name,Salary fixture as NFL Classic", () => {
    const csv = "Name,Salary\nDerek Sample,10000";
    const result = parseDraftKingsNflClassicCsv(csv);
    expect(result.accepted).toBe(false);
    expect(result.contestFormat).toBe("UNKNOWN");
    expect(result.diagnostics.some((d) => d.code === "UNSUPPORTED_CONTEST_FORMAT")).toBe(true);
  });
});

describe("parseDraftKingsNflClassicCsv — determinism", () => {
  it("returns equivalent output for the same input parsed twice", () => {
    const first = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    const second = parseDraftKingsNflClassicCsv(FIXTURE_CSV);
    expect(second).toEqual(first);
  });

  it("orders diagnostics deterministically", () => {
    const csv = withRows(
      "K,Derek Sample (39001101),Derek Sample,39001101,K,0,NO@DET 09/13/2026 01:00PM ET,NO,19.86,",
      "QB,Miles Anderson (39001102),Miles Anderson,39001102,QB,abc,NO@DET 09/13/2026 01:00PM ET,DET,18.42,",
    );
    const first = parseDraftKingsNflClassicCsv(csv);
    const second = parseDraftKingsNflClassicCsv(csv);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });
});
