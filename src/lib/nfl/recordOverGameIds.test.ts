import { describe, expect, it } from "vitest";
import { recordOverGameIds, formatWinLossTie, type NflResultRecord } from "@/lib/nfl/standings";

function result(partial: Partial<NflResultRecord> & { gameId: string }): NflResultRecord {
  return {
    season: 2025,
    week: 1,
    seasonType: "REG",
    homeAbbr: "buf",
    awayAbbr: "mia",
    homeScore: 24,
    awayScore: 20,
    winner: "buf",
    final: true,
    ...partial,
  };
}

describe("recordOverGameIds", () => {
  const results: NflResultRecord[] = [
    result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "nyj", winner: "buf" }),
    result({ gameId: "g2", homeAbbr: "ne", awayAbbr: "buf", winner: "ne" }),
    result({ gameId: "g3", homeAbbr: "buf", awayAbbr: "mia", winner: "TIE" }),
    result({ gameId: "g4", homeAbbr: "buf", awayAbbr: "kc", winner: "buf", final: false }),
    result({ gameId: "g5", homeAbbr: "buf", awayAbbr: "cin", winner: "buf", seasonType: "WC" }),
    result({ gameId: "g6", homeAbbr: "dal", awayAbbr: "phi", winner: "dal" }),
  ];

  it("tallies only final regular-season games in the requested set that the team played", () => {
    const record = recordOverGameIds(results, "buf", ["g1", "g2", "g3", "g4", "g5", "g6"]);
    expect(record).toEqual({ wins: 1, losses: 1, ties: 1 });
    expect(formatWinLossTie(record)).toBe("1-1-1");
  });

  it("restricts to the passed game ids (a smaller period window)", () => {
    expect(recordOverGameIds(results, "buf", ["g1"])).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(recordOverGameIds(results, "buf", [])).toEqual({ wins: 0, losses: 0, ties: 0 });
  });

  it("formats a clean two-part record with no ties", () => {
    expect(formatWinLossTie({ wins: 12, losses: 5, ties: 0 })).toBe("12-5");
  });
});
