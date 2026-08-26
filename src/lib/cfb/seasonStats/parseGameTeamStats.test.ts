import { describe, expect, it } from "vitest";
import { extractGameTeamStatLine, parseSplitStat } from "./parseGameTeamStats";

describe("parseSplitStat", () => {
  it("parses a made-attempted string", () => {
    expect(parseSplitStat("4-11")).toEqual({ made: 4, attempted: 11 });
  });

  it("parses completionAttempts shape", () => {
    expect(parseSplitStat("11-15")).toEqual({ made: 11, attempted: 15 });
  });

  it("returns null for missing input", () => {
    expect(parseSplitStat(undefined)).toBeNull();
  });

  it("returns null for a malformed string", () => {
    expect(parseSplitStat("not-a-split-stat-1")).toBeNull();
    expect(parseSplitStat("5")).toBeNull();
    expect(parseSplitStat("")).toBeNull();
  });

  it("returns null when made exceeds attempted", () => {
    expect(parseSplitStat("12-11")).toBeNull();
  });

  it("accepts a zero-for-zero split", () => {
    expect(parseSplitStat("0-0")).toEqual({ made: 0, attempted: 0 });
  });
});

describe("extractGameTeamStatLine", () => {
  it("parses a full realistic CFBD team-stats row", () => {
    const line = extractGameTeamStatLine([
      { category: "firstDowns", stat: "19" },
      { category: "thirdDownEff", stat: "4-11" },
      { category: "totalYards", stat: "350" },
      { category: "netPassingYards", stat: "143" },
      { category: "completionAttempts", stat: "11-15" },
      { category: "rushingYards", stat: "207" },
      { category: "rushingAttempts", stat: "43" },
      { category: "turnovers", stat: "3" },
    ]);
    expect(line).toEqual({
      totalYards: 350,
      rushingYards: 207,
      rushingAttempts: 43,
      passingYards: 143,
      passCompletions: 11,
      passAttempts: 15,
      offensivePlays: 58,
      thirdDownConversions: 4,
      thirdDownAttempts: 11,
      turnovers: 3,
    });
  });

  it("nulls only the missing category, not the whole line", () => {
    const line = extractGameTeamStatLine([{ category: "totalYards", stat: "300" }]);
    expect(line.totalYards).toBe(300);
    expect(line.thirdDownConversions).toBeNull();
    expect(line.thirdDownAttempts).toBeNull();
    expect(line.passAttempts).toBeNull();
    expect(line.offensivePlays).toBeNull();
  });

  it("is case/format tolerant on category names", () => {
    const line = extractGameTeamStatLine([{ category: "Total Yards", stat: "300" }]);
    expect(line.totalYards).toBe(300);
  });

  it("returns an all-null line for an empty stats array", () => {
    const line = extractGameTeamStatLine([]);
    expect(Object.values(line).every((value) => value === null)).toBe(true);
  });
});
