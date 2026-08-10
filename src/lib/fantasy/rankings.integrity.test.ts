import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FANTASY_RANKINGS, FANTASY_POSITIONS, type FantasyPosition } from "@/lib/fantasy/rankings";

const ROOT = resolve(__dirname, "../../..");
const parsed = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")) as {
  teams: Array<{ abbr: string }>;
};
const CANONICAL_TEAM_ABBR = new Set(parsed.teams.map((team) => team.abbr));

/** Workbook free agents: drafted players with no team in Team Context. */
const FA_PLAYERS = ["Stefon Diggs", "Deebo Samuel", "Tyreek Hill"];

const POSITION_METRIC_KEYS: Record<FantasyPosition, readonly string[]> = {
  QB: ["passerRatingRank", "rushingYardsPerGameRank", "passTdPerAttemptRank"],
  RB: ["touchesRank", "redZoneTouchesRank", "ypcRank"],
  WR: ["targetPercentRank", "airYardsPerGameRank", "targetsPerGameRank"],
  TE: ["targetShareRank", "targetsPerRouteRunRank", "yprrRank"],
};

describe("2026 fantasy rankings data integrity", () => {
  const { rows, season, scoring, updatedAt, source } = FANTASY_RANKINGS;

  it("contains all 250 rows in workbook order with sequential unique ranks", () => {
    expect(rows).toHaveLength(250);
    rows.forEach((row, index) => {
      expect(row.overallRank).toBe(index + 1);
      expect(row.player.trim().length).toBeGreaterThan(0);
    });
    expect(new Set(rows.map((row) => row.player)).size).toBe(250);
  });

  it("carries the published set metadata", () => {
    expect(season).toBe(2026);
    expect(scoring).toBe("PPR");
    expect(source).toBe("JoeKnowsBall");
    expect(updatedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(updatedAt!))).toBe(false);
  });

  it("uses only valid positions with the expected per-position counts", () => {
    const counts: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const row of rows) {
      expect(FANTASY_POSITIONS).toContain(row.position);
      counts[row.position] += 1;
    }
    expect(counts).toEqual({ QB: 31, RB: 85, WR: 100, TE: 34 });
  });

  it("has unique, complete position ranks", () => {
    for (const position of FANTASY_POSITIONS) {
      const positionRanks = rows
        .filter((row) => row.position === position)
        .map((row) => row.positionRank);
      expect(positionRanks.every((rank) => typeof rank === "number")).toBe(true);
      expect(new Set(positionRanks).size).toBe(positionRanks.length);
    }
  });

  it("keeps the 12-team mock-draft structure: rounds 1-21 with a partial round 21", () => {
    for (const row of rows) {
      expect(row.draftRound).toBeGreaterThanOrEqual(1);
      expect(row.draftRound).toBeLessThanOrEqual(21);
      expect(row.roundPick).toBeGreaterThanOrEqual(1);
      expect(row.roundPick).toBeLessThanOrEqual(12);
    }
    expect(rows.filter((row) => row.draftRound === 21)).toHaveLength(10);
    expect(rows.filter((row) => row.draftRound === 1)).toHaveLength(12);
  });

  it("populates the workbook's always-present main columns for every row", () => {
    for (const row of rows) {
      expect(typeof row.positionRank).toBe("number");
      expect(typeof row.draftRound).toBe("number");
      expect(typeof row.roundPick).toBe("number");
      expect(typeof row.averageRank).toBe("number");
      expect(typeof row.warRank).toBe("number");
    }
  });

  it("normalizes teams to the site's canonical 32 abbreviations", () => {
    const teamless = rows.filter((row) => row.team == null);
    expect(teamless.map((row) => row.player).sort()).toEqual([...FA_PLAYERS].sort());
    for (const row of rows) {
      if (row.team == null) continue;
      expect(CANONICAL_TEAM_ABBR.has(row.team), `unknown team code ${row.team}`).toBe(true);
    }
  });

  it("carries team context only for players with a team", () => {
    for (const row of rows) {
      const hasTeam = row.team != null;
      expect(row.strengthOfSchedule != null).toBe(hasTeam);
      expect(row.offensiveLineRank != null).toBe(hasTeam);
      expect(row.playoffWeek15Opponent != null).toBe(hasTeam);
      expect(row.playoffWeek16Opponent != null).toBe(hasTeam);
      expect(row.playoffWeek17Opponent != null).toBe(hasTeam);
    }
  });

  it("formats playoff opponents as home-or-away NFL abbreviations", () => {
    for (const row of rows) {
      for (const opponent of [row.playoffWeek15Opponent, row.playoffWeek16Opponent, row.playoffWeek17Opponent]) {
        if (opponent == null) continue;
        expect(opponent).toMatch(/^(@?)[A-Z]{2,3}$/);
      }
    }
  });

  it("limits Vegas prop ranks to quarterbacks and running backs", () => {
    const withVegas = rows.filter((row) => row.vegasRank != null);
    expect(withVegas.length).toBeGreaterThan(0);
    for (const row of withVegas) {
      expect(["QB", "RB"]).toContain(row.position);
    }
    for (const row of rows.filter((row) => row.team == null)) {
      expect(row.vegasRank).toBeUndefined();
    }
  });

  it("keeps position metrics within each position's verified field set", () => {
    const withMetrics = rows.filter((row) => row.metrics != null);
    expect(withMetrics.length).toBeGreaterThan(0);
    expect(new Set(withMetrics.map((row) => row.position)).size).toBe(4);
    for (const row of withMetrics) {
      const allowed = POSITION_METRIC_KEYS[row.position];
      for (const key of Object.keys(row.metrics!)) {
        expect(allowed, `metric ${key} not valid for ${row.position}`).toContain(key);
      }
    }
  });

  it("omits FantasyPros projection ranks for free agents", () => {
    for (const row of rows.filter((row) => row.team == null)) {
      expect(row.projectionRank).toBeUndefined();
    }
  });
});
