import { describe, expect, it } from "vitest";
import {
  CFB_CONFERENCES,
  CFB_CONFERENCE_ORDER,
  CFB_FBS_TEAM_COUNT,
  CFB_GAMES_2026,
  CFB_PROVENANCE,
  CFB_TEAM_METADATA,
  getAllTeams,
  getTeamsByConference,
} from "./index";
import {
  CFB_CONTEXT_2026,
  CFB_RECORDS_2026,
  CFB_V1_RATINGS_2026,
  CFB_STATS_2026,
} from "./season2026";
import { getCfbTeamLogoUrl } from "./logos";
import { sortConferenceStandings } from "@/lib/cfb/standings";
import type { CfbConferenceId } from "./types";

const VALID_CONFERENCES = new Set(Object.keys(CFB_CONFERENCES) as CfbConferenceId[]);

describe("CFB 2026 FBS data integrity", () => {
  const teams = CFB_TEAM_METADATA;
  const teamIds = new Set(teams.map((t) => t.id));

  it("contains exactly 138 unique FBS teams", () => {
    expect(CFB_FBS_TEAM_COUNT).toBe(138);
    expect(teams).toHaveLength(138);
    expect(getAllTeams()).toHaveLength(138);
    expect(new Set(teams.map((t) => t.id)).size).toBe(138);
  });

  it("has unique team IDs, slugs, and abbreviations", () => {
    const ids = teams.map((t) => t.id);
    const slugs = teams.map((t) => t.slug);
    const abbrs = teams.map((t) => t.abbreviation);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });

  it("assigns every team a recognized conference", () => {
    for (const team of teams) {
      expect(VALID_CONFERENCES.has(team.conference)).toBe(true);
    }
    for (const confId of CFB_CONFERENCE_ORDER) {
      expect(VALID_CONFERENCES.has(confId)).toBe(true);
    }
  });

  it("conference membership counts total 138 (2026 alignment)", () => {
    const counts: Record<string, number> = {};
    for (const team of teams) {
      counts[team.conference] = (counts[team.conference] ?? 0) + 1;
    }
    expect(counts).toMatchObject({
      acc: 17,
      american: 14,
      "big-12": 16,
      "big-ten": 18,
      "conference-usa": 10,
      mac: 13,
      "mountain-west": 10,
      "pac-12": 8,
      sec: 16,
      "sun-belt": 14,
      independents: 2,
    });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(138);
  });

  it("includes the five previously missing 2026 FBS programs", () => {
    const ids = new Set(teams.map((t) => t.id));
    for (const id of ["uab", "del", "most", "sac", "ndsu"]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(teams.find((t) => t.id === "uab")?.conference).toBe("american");
    expect(teams.find((t) => t.id === "del")?.conference).toBe("conference-usa");
    expect(teams.find((t) => t.id === "most")?.conference).toBe("conference-usa");
    expect(teams.find((t) => t.id === "sac")?.conference).toBe("mac");
    expect(teams.find((t) => t.id === "ndsu")?.conference).toBe("mountain-west");
  });

  it("applies 2026 realignment moves for conference movers", () => {
    expect(teams.find((t) => t.id === "txst")?.conference).toBe("pac-12");
    expect(teams.find((t) => t.id === "ute")?.conference).toBe("mountain-west");
    expect(teams.find((t) => t.id === "lt")?.conference).toBe("sun-belt");
    expect(teams.find((t) => t.id === "niu")?.conference).toBe("mountain-west");
    expect(teams.find((t) => t.id === "umass")?.conference).toBe("mac");
  });

  it("every non-null rating references a valid team", () => {
    expect(CFB_V1_RATINGS_2026).toHaveLength(138);
    for (const row of CFB_V1_RATINGS_2026) {
      expect(teamIds.has(row.teamId)).toBe(true);
      expect(row.jkbPowerRating).not.toBeNull();
      expect(row.offensiveRating).not.toBeNull();
      expect(row.defensiveRating).not.toBeNull();
    }
    expect(CFB_V1_RATINGS_2026.map((row) => row.jkbRank).sort((a, b) => (a ?? 999) - (b ?? 999))).toEqual(Array.from({ length: 138 }, (_, index) => index + 1));
    expect(CFB_V1_RATINGS_2026.filter((row) => (row.jkbRank ?? 999) <= 25)).toHaveLength(25);
  });

  it("every record, stats, and context object references a valid team", () => {
    expect(CFB_RECORDS_2026).toHaveLength(138);
    expect(CFB_STATS_2026).toHaveLength(138);
    expect(CFB_CONTEXT_2026).toHaveLength(138);
    for (const row of [...CFB_RECORDS_2026, ...CFB_STATS_2026, ...CFB_CONTEXT_2026]) {
      expect(teamIds.has(row.teamId)).toBe(true);
    }
  });

  it("uses the complete cached schedule and preserves external FCS opponents", () => {
    expect(CFB_GAMES_2026).toHaveLength(888);
    for (const game of CFB_GAMES_2026) {
      expect(teamIds.has(game.awayTeamId) || game.awayClassification === "fcs").toBe(true);
      expect(teamIds.has(game.homeTeamId) || game.homeClassification === "fcs").toBe(true);
      expect(game.awayTeamId).not.toBe(game.homeTeamId);
    }
  });

  it("conference standings contain only teams assigned to that conference", () => {
    for (const confId of CFB_CONFERENCE_ORDER) {
      const confTeams = getTeamsByConference(confId);
      const sorted = sortConferenceStandings(confTeams);
      expect(sorted.every((t) => t.conference === confId)).toBe(true);
      expect(sorted).toHaveLength(confTeams.length);
    }
  });

  it("marks generated ratings and authenticated schedule provenance explicitly", () => {
    expect(CFB_PROVENANCE.ratingsSource).toBe("generated-v1.1-market-anchor");
    expect(CFB_PROVENANCE.scheduleSource).toBe("live");
  });
});

describe("CFB logo mapping integrity", () => {
  it("has unique positive espnIds and builds CDN URLs centrally", () => {
    const espnIds = CFB_TEAM_METADATA.map((t) => t.espnId);
    expect(espnIds.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    expect(new Set(espnIds).size).toBe(espnIds.length);

    for (const team of CFB_TEAM_METADATA) {
      const url = getCfbTeamLogoUrl(team.espnId, team.id);
      expect(url).toContain(`/ncaa/500/${team.espnId}.png`);
      expect(url.startsWith("https://a.espncdn.com/")).toBe(true);
    }
  });

  it("uses verified ESPN ids for new 2026 FBS members", () => {
    const byId = Object.fromEntries(CFB_TEAM_METADATA.map((t) => [t.id, t.espnId]));
    expect(byId.uab).toBe(5);
    expect(byId.del).toBe(48);
    expect(byId.most).toBe(2623);
    expect(byId.sac).toBe(16);
    expect(byId.ndsu).toBe(2449);
    expect(byId.ore).toBe(2483); // Oregon corrected earlier (Houston is 248)
    expect(byId.hou).toBe(248);
  });
});
