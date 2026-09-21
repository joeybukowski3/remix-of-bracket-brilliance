import { describe, expect, it } from "vitest";
import type { CfbGame, CfbTeam } from "@/data/cfb/types";
import { formatCfbRecord, getCfbTeamGameContext, getRankAdvantage, getTeamTintStyle } from "./teamContext";

const team = (id: string, shortName: string) => ({ id, shortName }) as CfbTeam;
const teamById = new Map([["a", team("a", "Alpha")], ["b", team("b", "Bravo")], ["c", team("c", "Charlie")]]);
const game = (over: Partial<CfbGame>): CfbGame => ({
  id: "g", season: 2026, week: 1, date: "2026-09-05", time: null, awayTeamId: "a", homeTeamId: "b",
  neutralSite: false, venue: null, venueCity: null, venueState: null, tvNetwork: null,
  gameStatus: "scheduled", awayScore: null, homeScore: null,
  odds: {} as CfbGame["odds"], model: {} as CfbGame["model"], ...over,
});

describe("CFB team record and schedule context", () => {
  it("formats records with ties only when present", () => {
    expect(formatCfbRecord({ wins: 3, losses: 0, ties: 0 })).toBe("3-0");
    expect(formatCfbRecord({ wins: 2, losses: 1, ties: 1 })).toBe("2-1-1");
    expect(formatCfbRecord(null)).toBe("—");
  });

  it("returns the last final result and next scheduled game with AP rank labels", () => {
    const games = [
      game({ id: "1", week: 1, date: "2026-09-05", gameStatus: "final", awayScore: 31, homeScore: 20 }),
      game({ id: "2", week: 2, date: "2026-09-12", awayTeamId: "c", homeTeamId: "a" }),
    ];
    const ctx = getCfbTeamGameContext("a", games, teamById, { b: 14, c: 3 });
    expect(ctx.last).toEqual({ text: "W 31-20 @ Bravo", opponentRank: "AP #14" });
    expect(ctx.next).toEqual({ text: "vs Charlie", opponentRank: "AP #3" });
  });

  it("omits results when nothing is final and never invents opponent ranks", () => {
    const ctx = getCfbTeamGameContext("a", [game({})], teamById, {});
    expect(ctx.last).toBeNull();
    expect(ctx.next).toEqual({ text: "@ Bravo", opponentRank: null });
  });

  it("does not report a final game without scores as a result", () => {
    const ctx = getCfbTeamGameContext("a", [game({ gameStatus: "final" })], teamById, {});
    expect(ctx.last).toBeNull();
  });

  it("gives the advantage to the lower national rank; ties and missing get none", () => {
    expect(getRankAdvantage(3, 20)).toBe(1);
    expect(getRankAdvantage(20, 3)).toBe(-1);
    expect(getRankAdvantage(5, 5)).toBe(0);
    expect(getRankAdvantage(null, 5)).toBe(0);
    expect(getRankAdvantage(5, null)).toBe(0);
  });

  it("builds a restrained tint only for valid hex team colors", () => {
    expect(getTeamTintStyle("#bb0000")).toMatchObject({ backgroundColor: "#bb000014" });
    expect(getTeamTintStyle("red")).toBeNull();
    expect(getTeamTintStyle(null)).toBeNull();
  });
});
