import { describe, expect, it } from "vitest";
import type { CfbSeasonRecord } from "@/data/cfb/types";
import {
  formatCfbKickoffLabel,
  formatCfbOpponentRecord,
  formatCfbScheduleDateTime,
} from "./schedulePresentation";

function record(wins: number, losses: number, ties = 0): CfbSeasonRecord {
  return {
    teamId: "opponent",
    wins,
    losses,
    ties,
    conferenceWins: 0,
    conferenceLosses: 0,
    conferenceTies: 0,
    atsWins: null,
    atsLosses: null,
    overs: null,
    unders: null,
  };
}

describe("formatCfbScheduleDateTime", () => {
  it("converts a canonical UTC kickoff to Eastern Daylight Time", () => {
    expect(formatCfbScheduleDateTime("2026-09-05", "20:30")).toBe("September 5 · 4:30 PM ET");
  });

  it("uses America/New_York daylight-saving rules after the fall transition", () => {
    expect(formatCfbScheduleDateTime("2026-11-28", "20:30")).toBe("November 28 · 3:30 PM ET");
  });

  it("renders a date-only event without inventing a kickoff time or year", () => {
    const result = formatCfbScheduleDateTime("2026-09-26", null);
    expect(result).toBe("September 26");
    expect(result).not.toContain("2026-09-26");
    expect(result).not.toContain("ET");
  });
});

describe("formatCfbKickoffLabel", () => {
  it("renders a compact Eastern-time kickoff label for tight card layouts", () => {
    expect(formatCfbKickoffLabel("2026-09-05", "20:30")).toBe("Sep 5 · 4:30 PM ET");
  });

  it("uses America/New_York daylight-saving rules after the fall transition", () => {
    expect(formatCfbKickoffLabel("2026-11-28", "20:30")).toBe("Nov 28 · 3:30 PM ET");
  });

  it("renders a date-only event without inventing a kickoff time or year", () => {
    const result = formatCfbKickoffLabel("2026-09-26", null);
    expect(result).toBe("Sep 26");
    expect(result).not.toContain("2026-09-26");
    expect(result).not.toContain("ET");
  });
});

describe("formatCfbOpponentRecord", () => {
  it("reflects preseason and mocked post-game canonical record state independently", () => {
    expect(formatCfbOpponentRecord(record(0, 0))).toBe("0-0");
    expect(formatCfbOpponentRecord(record(3, 1))).toBe("3-1");
    expect(formatCfbOpponentRecord(record(7, 2))).toBe("7-2");
  });

  it("returns an em dash when an external opponent has no canonical record", () => {
    expect(formatCfbOpponentRecord(undefined)).toBe("—");
  });
});
