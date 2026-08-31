import { describe, expect, it } from "vitest";
import { resolveSportsDataIoNflTeamAbbr } from "./sportsDataIoNflTeamIdentity";
import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";

describe("resolveSportsDataIoNflTeamAbbr", () => {
  it("passes a plain abbreviation through, upper-cased", () => {
    expect(resolveSportsDataIoNflTeamAbbr("sf")).toBe("SF");
    expect(resolveSportsDataIoNflTeamAbbr("LAR")).toBe("LAR");
  });

  it("maps a full club name to its SportsDataIO abbreviation", () => {
    expect(resolveSportsDataIoNflTeamAbbr("Washington Commanders")).toBe("WAS");
    expect(resolveSportsDataIoNflTeamAbbr("los angeles rams")).toBe("LAR");
    expect(resolveSportsDataIoNflTeamAbbr("San Francisco 49ers")).toBe("SF");
  });

  it("returns null for empty or unrecognised input (no fuzzy matching)", () => {
    expect(resolveSportsDataIoNflTeamAbbr(null)).toBeNull();
    expect(resolveSportsDataIoNflTeamAbbr("")).toBeNull();
    expect(resolveSportsDataIoNflTeamAbbr("   ")).toBeNull();
    expect(resolveSportsDataIoNflTeamAbbr("31")).toBeNull();
    expect(resolveSportsDataIoNflTeamAbbr("Rams")).toBeNull();
    expect(resolveSportsDataIoNflTeamAbbr("LA Rams")).toBeNull();
  });

  it("resolves the alias abbreviations onto the canonical nflverse token", () => {
    const canonical = (value: string) => normalizeNflTeamAbbr(resolveSportsDataIoNflTeamAbbr(value));
    expect(canonical("LAR")).toBe("lar");
    expect(canonical("Los Angeles Rams")).toBe("lar");
    expect(canonical("WAS")).toBe("wsh");
    expect(canonical("Washington Commanders")).toBe("wsh");
    expect(canonical("JAX")).toBe("jax");
    expect(canonical("ARI")).toBe("ari");
    expect(canonical("Arizona Cardinals")).toBe("ari");
    expect(canonical("LAC")).toBe("lac");
  });
});
