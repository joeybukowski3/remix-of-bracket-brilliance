import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NFL_DIVISIONS, NFL_DIVISION_ORDER } from "@/data/nflPreseason2026";
import { slugifyNflTeam } from "@/lib/nfl/guide2026";
import { buildNflMeta, NFL_SCHEMA_VERSION, toNflJsonFileString } from "../../../scripts/lib/nfl-data-meta.mjs";

type CanonicalTeam = {
  id: string;
  slug: string;
  abbr: string;
  nflverseAbbr: string;
  name: string;
  fullName: string;
  shortName: string;
  conference: "AFC" | "NFC";
  division: string;
  primaryColor: string;
  logoUrl: string;
  isDome: boolean;
  latitude: number;
  longitude: number;
};

const ROOT = resolve(__dirname, "../../..");
const parsed = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")) as {
  _meta: { schemaVersion: string; source: string; generatedAt: string; notes: string[] };
  teams: CanonicalTeam[];
};
const TEAMS = parsed.teams;

describe("canonical NFL teams (public/data/nfl/teams.json)", () => {
  it("contains exactly 32 teams, 16 per conference, 4 per division", () => {
    expect(TEAMS).toHaveLength(32);
    expect(TEAMS.filter((t) => t.conference === "AFC")).toHaveLength(16);
    expect(TEAMS.filter((t) => t.conference === "NFC")).toHaveLength(16);
    for (const division of NFL_DIVISION_ORDER) {
      expect(TEAMS.filter((t) => t.division === division)).toHaveLength(4);
    }
  });

  it("has unique id, slug, abbr and nflverseAbbr across all teams", () => {
    for (const key of ["id", "slug", "abbr", "nflverseAbbr"] as const) {
      const values = TEAMS.map((t) => t[key]);
      expect(new Set(values).size, `duplicate ${key}`).toBe(32);
    }
  });

  it("keeps conference consistent with the division label", () => {
    for (const team of TEAMS) {
      expect(team.division.startsWith(team.conference), `${team.abbr} division/conference mismatch`).toBe(true);
    }
  });

  it("slug matches slugifyNflTeam(name) so team dashboard links resolve", () => {
    for (const team of TEAMS) {
      expect(team.slug).toBe(slugifyNflTeam(team.name));
    }
  });

  it("abbr, name, color and division agree with the site's existing NFL_DIVISIONS data", () => {
    for (const division of NFL_DIVISION_ORDER) {
      for (const siteTeam of NFL_DIVISIONS[division] ?? []) {
        const canonical = TEAMS.find((t) => t.abbr === siteTeam.abbr);
        expect(canonical, `missing canonical team for ${siteTeam.abbr}`).toBeDefined();
        expect(canonical!.division).toBe(division);
        expect(canonical!.name).toBe(siteTeam.team);
        expect(canonical!.primaryColor).toBe(siteTeam.color);
      }
    }
  });

  it("maps nflverse codes correctly, including the LA/WAS special cases", () => {
    const byAbbr = new Map(TEAMS.map((t) => [t.abbr, t]));
    expect(byAbbr.get("lar")!.nflverseAbbr).toBe("LA");
    expect(byAbbr.get("wsh")!.nflverseAbbr).toBe("WAS");
    expect(byAbbr.get("jax")!.nflverseAbbr).toBe("JAX");
    for (const team of TEAMS) {
      expect(team.nflverseAbbr).toMatch(/^[A-Z]{2,3}$/);
    }
  });

  it("has plausible stadium coordinates and abbr-derived logo URLs", () => {
    for (const team of TEAMS) {
      expect(team.latitude).toBeGreaterThan(24);
      expect(team.latitude).toBeLessThan(49);
      expect(team.longitude).toBeGreaterThan(-125);
      expect(team.longitude).toBeLessThan(-66);
      expect(team.logoUrl).toBe(`https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbr}.png`);
      expect(typeof team.isDome).toBe("boolean");
    }
  });

  it("carries a valid _meta block", () => {
    expect(parsed._meta.schemaVersion).toBe(NFL_SCHEMA_VERSION);
    expect(parsed._meta.source).toContain("canonical");
    expect(Number.isNaN(Date.parse(parsed._meta.generatedAt))).toBe(false);
    expect(Array.isArray(parsed._meta.notes)).toBe(true);
  });
});

describe("buildNflMeta helper", () => {
  it("builds a complete meta block with defaults", () => {
    const meta = buildNflMeta({ source: "nflverse (nfldata games.csv)", season: 2025 });
    expect(meta.schemaVersion).toBe(NFL_SCHEMA_VERSION);
    expect(meta.source).toBe("nflverse (nfldata games.csv)");
    expect(meta.season).toBe(2025);
    expect(meta.week).toBeNull();
    expect(meta.modelVersion).toBeNull();
    expect(meta.notes).toEqual([]);
    expect(Number.isNaN(Date.parse(meta.generatedAt))).toBe(false);
  });

  it("copies notes instead of sharing the caller's array", () => {
    const notes = ["preseason only"];
    const meta = buildNflMeta({ source: "test", notes });
    notes.push("mutated");
    expect(meta.notes).toEqual(["preseason only"]);
  });

  it("rejects missing source, bad season, bad week and bad notes", () => {
    expect(() => buildNflMeta({ source: "" })).toThrow(/source/);
    expect(() => buildNflMeta({ source: "x", season: 1897 })).toThrow(/season/);
    expect(() => buildNflMeta({ source: "x", week: -1 })).toThrow(/week/);
    expect(() => buildNflMeta({ source: "x", notes: [42] })).toThrow(/notes/);
    expect(() => buildNflMeta({ source: "x", generatedAt: "not-a-date" })).toThrow(/generatedAt/);
  });

  it("serializes deterministically with trailing newline", () => {
    const payload = { _meta: buildNflMeta({ source: "x", generatedAt: "2026-07-07T00:00:00.000Z" }), rows: [1, 2] };
    const a = toNflJsonFileString(payload);
    const b = toNflJsonFileString(payload);
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(JSON.parse(a).rows).toEqual([1, 2]);
  });
});
