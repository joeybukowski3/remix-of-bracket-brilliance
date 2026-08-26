import { describe, expect, it } from "vitest";
import {
  parseFantasyProsAdpCsv,
  parseFantasyProsAdpRecord,
  parseFantasyProsPlayerField,
  parseFantasyProsPositionRank,
} from "@/lib/fantasy/fantasyProsAdpParser";

// Values below are copied verbatim from the supplied 2026-08-25 export
// (data/fantasy/2026-fantasypros-adp.csv), not invented.
const TITLE_LINE = '"Real-Time ADP — Redraft PPR, All, 12-team — Last updated 50 minutes ago"';
const HEADER_LINE = "RK,Name,POS.RK,REAL-TIME,TREND (24H),TREND (7D),PICK NUM.,ESPN,YAHOO,SLEEPER";

function sampleCsv(...dataLines: string[]): string {
  return [TITLE_LINE, "", HEADER_LINE, ...dataLines].join("\n");
}

describe("parseFantasyProsPlayerField", () => {
  it("splits a standard name/team/bye field", () => {
    expect(parseFantasyProsPlayerField("Jahmyr Gibbs DET (6)")).toEqual({
      player: "Jahmyr Gibbs",
      team: "DET",
      byeWeek: 6,
    });
  });

  it("preserves Jr./Sr./II/III suffixes as part of the name", () => {
    expect(parseFantasyProsPlayerField("James Cook III BUF (7)")).toEqual({
      player: "James Cook III",
      team: "BUF",
      byeWeek: 7,
    });
    expect(parseFantasyProsPlayerField("Travis Etienne Jr. NO (8)")).toEqual({
      player: "Travis Etienne Jr.",
      team: "NO",
      byeWeek: 8,
    });
    expect(parseFantasyProsPlayerField("Kyle Pitts Sr. ATL (11)")).toEqual({
      player: "Kyle Pitts Sr.",
      team: "ATL",
      byeWeek: 11,
    });
    expect(parseFantasyProsPlayerField("Patrick Mahomes II KC (5)")).toEqual({
      player: "Patrick Mahomes II",
      team: "KC",
      byeWeek: 5,
    });
  });

  it("maps the free-agent form to a null team and null bye week", () => {
    expect(parseFantasyProsPlayerField("Tyreek Hill FA ()")).toEqual({
      player: "Tyreek Hill",
      team: null,
      byeWeek: null,
    });
  });
});

describe("parseFantasyProsPositionRank", () => {
  it("splits position and rank", () => {
    expect(parseFantasyProsPositionRank("RB1")).toEqual({ position: "RB", positionRank: 1 });
    expect(parseFantasyProsPositionRank("WR32")).toEqual({ position: "WR", positionRank: 32 });
    expect(parseFantasyProsPositionRank("DST19")).toEqual({ position: "DST", positionRank: 19 });
  });

  it("returns null for an unparseable field", () => {
    expect(parseFantasyProsPositionRank("")).toBeNull();
  });
});

describe("parseFantasyProsAdpRecord", () => {
  it("parses a QB/RB/WR/TE row and reads REAL-TIME as the ADP value", () => {
    const row = parseFantasyProsAdpRecord({
      RK: "1",
      Name: "Jahmyr Gibbs DET (6)",
      "POS.RK": "RB1",
      "REAL-TIME": "1.3",
      "TREND (24H)": "0.1",
      "TREND (7D)": "0.2",
      "PICK NUM.": "1.01",
      ESPN: "1",
      YAHOO: "",
      SLEEPER: "1",
    });
    expect(row).toEqual({
      fantasyProsOverallRank: 1,
      player: "Jahmyr Gibbs",
      team: "DET",
      byeWeek: 6,
      position: "RB",
      fantasyProsPositionRank: 1,
      adp: 1.3,
    });
  });

  it("never reads PICK NUM. as the ADP value", () => {
    const row = parseFantasyProsAdpRecord({
      RK: "1",
      Name: "Jahmyr Gibbs DET (6)",
      "POS.RK": "RB1",
      "REAL-TIME": "1.3",
      "TREND (24H)": "0.1",
      "TREND (7D)": "0.2",
      "PICK NUM.": "1.01",
      ESPN: "1",
      YAHOO: "",
      SLEEPER: "1",
    });
    expect(row?.adp).not.toBe(1.01);
  });

  it("excludes DST rows", () => {
    const row = parseFantasyProsAdpRecord({
      RK: "266",
      Name: "Kansas City Chiefs KC (5)",
      "POS.RK": "DST19",
      "REAL-TIME": "174.6",
      "TREND (24H)": "-0.3",
      "TREND (7D)": "-0.1",
      "PICK NUM.": "23.02",
      ESPN: "166",
      YAHOO: "",
      SLEEPER: "211",
    });
    expect(row).toBeNull();
  });

  it("excludes K rows", () => {
    const row = parseFantasyProsAdpRecord({
      RK: "267",
      Name: "Cairo Santos CHI (10)",
      "POS.RK": "K21",
      "REAL-TIME": "175.3",
      "TREND (24H)": "-3.1",
      "TREND (7D)": "-1.3",
      "PICK NUM.": "23.03",
      ESPN: "190",
      YAHOO: "",
      SLEEPER: "217",
    });
    expect(row).toBeNull();
  });
});

describe("parseFantasyProsAdpCsv", () => {
  it("skips the title line and the blank separator line", () => {
    const rows = parseFantasyProsAdpCsv(
      sampleCsv("1,Jahmyr Gibbs DET (6),RB1,1.3,0.1,0.2,1.01,1,,1"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].player).toBe("Jahmyr Gibbs");
    expect(rows[0].adp).toBe(1.3);
  });

  it("parses multiple rows and drops DST/K rows", () => {
    const rows = parseFantasyProsAdpCsv(
      sampleCsv(
        "1,Jahmyr Gibbs DET (6),RB1,1.3,0.1,0.2,1.01,1,,1",
        "3,Ja'Marr Chase CIN (6),WR1,3.2,0.1,-0.1,1.03,3,,3",
        "266,Kansas City Chiefs KC (5),DST19,174.6,-0.3,-0.1,23.02,166,,211",
        "267,Cairo Santos CHI (10),K21,175.3,-3.1,-1.3,23.03,190,,217",
      ),
    );
    expect(rows.map((row) => row.player)).toEqual(["Jahmyr Gibbs", "Ja'Marr Chase"]);
  });

  it("is deterministic across repeated parses of the same text", () => {
    const csv = sampleCsv(
      "1,Jahmyr Gibbs DET (6),RB1,1.3,0.1,0.2,1.01,1,,1",
      "9,James Cook III BUF (7),RB5,10,1.4,-0.2,1.09,12,,10",
    );
    expect(parseFantasyProsAdpCsv(csv)).toEqual(parseFantasyProsAdpCsv(csv));
  });
});
