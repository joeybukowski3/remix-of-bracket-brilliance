import { describe, expect, it } from "vitest";
import { resolveCurrentOpponents } from "./currentOpponents";
import type { NflGameRecord } from "@/lib/nfl/standings";

function makeGame(overrides: Partial<NflGameRecord>): NflGameRecord {
  return {
    gameId: overrides.gameId ?? "test-game",
    season: overrides.season ?? 2026,
    week: overrides.week ?? 1,
    seasonType: overrides.seasonType ?? "REG",
    dateUtc: overrides.dateUtc ?? "2026-09-08T17:00:00.000Z",
    homeTeam: overrides.homeTeam ?? "Buffalo Bills",
    awayTeam: overrides.awayTeam ?? "Miami Dolphins",
    homeAbbr: overrides.homeAbbr ?? "BUF",
    awayAbbr: overrides.awayAbbr ?? "MIA",
    status: overrides.status ?? "final",
    stadium: overrides.stadium ?? null,
    neutralSite: overrides.neutralSite ?? false,
  };
}

describe("resolveCurrentOpponents", () => {
  it("assigns @ to the away team and vs to the home team", () => {
    const lookup = resolveCurrentOpponents([makeGame({ week: 1 })], 1);
    expect(lookup.get("buf")).toEqual({ opponent: "mia", location: "vs" });
    expect(lookup.get("mia")).toEqual({ opponent: "buf", location: "@" });
  });

  it("normalizes broadcast-style aliases to canonical lowercase abbreviations", () => {
    const lookup = resolveCurrentOpponents(
      [makeGame({ homeAbbr: "WSH", awayAbbr: "JAC", week: 1 })],
      1,
    );
    expect(lookup.get("wsh")).toEqual({ opponent: "jax", location: "vs" });
    expect(lookup.get("jax")).toEqual({ opponent: "wsh", location: "@" });
  });

  it("only resolves games from the requested week", () => {
    const lookup = resolveCurrentOpponents(
      [makeGame({ week: 1, homeAbbr: "BUF", awayAbbr: "MIA" }), makeGame({ week: 2, homeAbbr: "NYJ", awayAbbr: "NE", gameId: "wk2" })],
      2,
    );
    expect(lookup.has("buf")).toBe(false);
    expect(lookup.get("nyj")).toEqual({ opponent: "ne", location: "vs" });
  });

  it("excludes preseason and playoff games", () => {
    const lookup = resolveCurrentOpponents(
      [
        makeGame({ week: 1, seasonType: "PRE", homeAbbr: "BUF", awayAbbr: "MIA" }),
        makeGame({ week: 1, seasonType: "WC", homeAbbr: "NYJ", awayAbbr: "NE", gameId: "playoff" }),
      ],
      1,
    );
    expect(lookup.size).toBe(0);
  });
});
