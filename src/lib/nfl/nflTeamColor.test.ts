import { describe, expect, it } from "vitest";
import { nflTeamColor, nflTeamColorFor } from "@/lib/nfl/nflTeamColor";

describe("nflTeamColor", () => {
  it("resolves a canonical abbreviation to a hex colour", () => {
    const color = nflTeamColor("sf");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("is case-insensitive and accepts feed aliases", () => {
    expect(nflTeamColor("SF")).toBe(nflTeamColor("sf"));
    expect(nflTeamColor("was")).toBe(nflTeamColor("wsh"));
    expect(nflTeamColor("jac")).toBe(nflTeamColor("jax"));
  });

  it("returns null for an unknown or empty abbreviation", () => {
    expect(nflTeamColor("zzz")).toBeNull();
    expect(nflTeamColor("")).toBeNull();
    expect(nflTeamColor(null)).toBeNull();
    expect(nflTeamColor(undefined)).toBeNull();
  });

  it("resolves every one of the 32 canonical NFL abbreviations", () => {
    const abbrs = [
      "sea", "lar", "den", "ne", "buf", "gb", "hou", "jax", "det", "lac",
      "ind", "bal", "phi", "sf", "min", "no", "chi", "kc", "atl", "pit",
      "tb", "dal", "nyg", "cle", "ari", "wsh", "mia", "cin", "car", "lv",
      "nyj", "ten",
    ];
    for (const abbr of abbrs) {
      expect(nflTeamColor(abbr), abbr).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("nflTeamColorFor", () => {
  it("prefers a valid colour carried on the team record", () => {
    expect(nflTeamColorFor({ abbr: "sf", color: "#abcdef" })).toBe("#abcdef");
  });

  it("falls back to the abbreviation lookup when the record has no colour", () => {
    expect(nflTeamColorFor({ abbr: "sf", color: null })).toBe(nflTeamColor("sf"));
  });

  it("returns null when nothing resolves", () => {
    expect(nflTeamColorFor({ abbr: "zzz" })).toBeNull();
    expect(nflTeamColorFor(null)).toBeNull();
  });
});
