import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CFB_AP_RANKS_2026,
  CFB_PROVENANCE,
  getAllTeams,
  getTeamBySlug,
  isPreseasonPhase,
} from "./index";

describe("CFB data architecture", () => {
  it("composes layered team data with logos", () => {
    const uga = getTeamBySlug("georgia");
    expect(uga).toBeDefined();
    expect(uga!.logo).toContain("espncdn.com");
    expect(uga!.ratings.jkbRank).toBeGreaterThanOrEqual(1);
    // AP rank is whatever the official artifact currently publishes for this
    // team (null when unranked) — never a hardcoded value, which would go
    // stale every time a new weekly poll lands.
    expect(uga!.ratings.apRank).toBe(CFB_AP_RANKS_2026["uga"] ?? null);
    expect(uga!.ratings.sosPlayedRank).toBeNull();
    expect(uga!.ratings.sosRemainingRank).not.toBeNull();
    expect(uga!.record.wins).toBe(0);
    expect(uga!.stats.pointsPerGame).toBeNull();
  });

  it("marks generated market-anchor ratings and live schedule provenance explicitly", () => {
    expect(CFB_PROVENANCE.ratingsSource).toBe("generated-v1.1-market-anchor");
    expect(CFB_PROVENANCE.scheduleSource).toBe("live");
    expect(isPreseasonPhase()).toBe(true);
  });

  it("loads AP only from the independent official-rankings source, never the generated ratings row", () => {
    const loader = readFileSync(resolve("src/data/cfb/season2026/ratings.ts"), "utf8");
    expect(loader).toContain("CFB_AP_RANKS_2026[row.teamId] ?? null");
    expect(loader).not.toContain("apRank: row.apRank");
    // Every composed team's apRank mirrors the official artifact exactly:
    // ranked teams take their published rank, everyone else stays null. This
    // holds whether or not a poll has been published, so it never goes stale.
    for (const team of getAllTeams()) {
      expect(team.ratings.apRank).toBe(CFB_AP_RANKS_2026[team.id] ?? null);
    }
    const ranked = getAllTeams().filter((team) => team.ratings.apRank !== null);
    expect(ranked).toHaveLength(Object.keys(CFB_AP_RANKS_2026).length);
  });

  it("includes exactly 138 FBS teams across required conferences", () => {
    const teams = getAllTeams();
    expect(teams).toHaveLength(138);
    const confs = new Set(teams.map((t) => t.conference));
    for (const id of [
      "sec",
      "big-ten",
      "big-12",
      "acc",
      "american",
      "pac-12",
      "mountain-west",
      "sun-belt",
      "mac",
      "conference-usa",
      "independents",
    ]) {
      expect(confs.has(id as never)).toBe(true);
    }
  });
});
