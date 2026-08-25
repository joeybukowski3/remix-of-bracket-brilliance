import { describe, expect, it } from "vitest";
import { CFB_PROVENANCE, getAllTeams } from "../index";
import { getTeamMetadataById } from "../teamMetadata";
import {
  CFB_AP_POLL_2026,
  CFB_AP_RANKS_2026,
  CFB_CFP_POLL_2026,
  CFB_CFP_RANKS_2026,
  CFB_IS_CFP_POLL_ACTIVE,
  CFB_OFFICIAL_RANKINGS_2026,
} from "./officialRankings";

/**
 * Contract tests for the committed official-rankings artifact as it exists in
 * the repo right now. These must hold both while the artifact is empty (no
 * poll ingested) and after a real AP/CFP poll has been published into it — so
 * they assert invariants, never specific team names or ranks.
 */
describe("committed official rankings artifact", () => {
  it("declares the expected season and CFBD source", () => {
    expect(CFB_OFFICIAL_RANKINGS_2026.season).toBe(2026);
    expect(CFB_OFFICIAL_RANKINGS_2026.source).toBe("cfbd:/rankings");
  });

  it("never carries a fabricated publication timestamp", () => {
    const generatedAt = CFB_OFFICIAL_RANKINGS_2026.generatedAt;
    expect(generatedAt === null || !Number.isNaN(Date.parse(generatedAt))).toBe(true);
  });

  for (const [kind, poll, map] of [
    ["AP", CFB_AP_POLL_2026, CFB_AP_RANKS_2026],
    ["CFP", CFB_CFP_POLL_2026, CFB_CFP_RANKS_2026],
  ] as const) {
    it(`${kind}: is either absent or a valid, fully mapped 1-25 poll`, () => {
      if (poll === null) {
        expect(Object.keys(map)).toHaveLength(0);
        return;
      }
      const ranks = Object.values(poll.ranks);
      expect(ranks).toHaveLength(25);
      // Tie-aware sequence walk: official polls share a rank on a genuine tie
      // and skip the slots it consumes (the real 2026 preseason AP poll has two
      // teams at #14 and no #15), so this walks positions rather than asserting
      // the rank multiset is exactly 1..25.
      let position = 1;
      for (const rank of [...new Set(ranks)].sort((a, b) => a - b)) {
        expect(rank).toBe(position);
        position += ranks.filter((value) => value === rank).length;
      }
      expect(position).toBe(26);
      expect(Math.min(...ranks)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...ranks)).toBeLessThanOrEqual(25);
      expect(new Set(Object.keys(poll.ranks)).size).toBe(25);
      // Every ranked team must exist in FBS production metadata — this is what
      // keeps an FCS or unmapped school out of the artifact.
      for (const teamId of Object.keys(poll.ranks)) {
        expect(getTeamMetadataById(teamId)).toBeDefined();
      }
      expect(poll.pollName.length).toBeGreaterThan(0);
    });
  }

  it("never assigns a rank of 26 or higher to any team", () => {
    for (const team of getAllTeams()) {
      for (const rank of [team.ratings.apRank, team.ratings.cfpRank]) {
        if (rank === null) continue;
        expect(rank).toBeGreaterThanOrEqual(1);
        expect(rank).toBeLessThanOrEqual(25);
      }
    }
  });

  it("flows official ranks through composeTeam onto exactly the ranked teams", () => {
    const teams = getAllTeams();
    const apRanked = teams.filter((team) => team.ratings.apRank !== null);
    expect(apRanked).toHaveLength(Object.keys(CFB_AP_RANKS_2026).length);
    for (const team of apRanked) {
      expect(team.ratings.apRank).toBe(CFB_AP_RANKS_2026[team.id]);
    }
    const cfpRanked = teams.filter((team) => team.ratings.cfpRank !== null);
    expect(cfpRanked).toHaveLength(Object.keys(CFB_CFP_RANKS_2026).length);
  });

  it("activates CFP priority only when a real CFP poll exists", () => {
    expect(CFB_IS_CFP_POLL_ACTIVE).toBe(
      CFB_CFP_POLL_2026 !== null && Object.keys(CFB_CFP_RANKS_2026).length > 0,
    );
  });
});

describe("CFB provenance — official poll vs internal JKB rank", () => {
  it("reports official-ranking status separately from the JKB ratings source", () => {
    expect(CFB_PROVENANCE.ratingsSource).toBe("generated-v1.1-market-anchor");
    expect(CFB_PROVENANCE.officialRankingsSource).toBe(
      CFB_PROVENANCE.officialRankingsPoll.activePoll ? "api" : "unavailable",
    );
  });

  it("names the active official poll and its kind consistently with the artifact", () => {
    const active = CFB_IS_CFP_POLL_ACTIVE ? CFB_CFP_POLL_2026 : CFB_AP_POLL_2026;
    expect(CFB_PROVENANCE.officialRankingsPoll.activePoll).toBe(active?.pollName ?? null);
    expect(CFB_PROVENANCE.officialRankingsPoll.week).toBe(active?.week ?? null);
    expect(CFB_PROVENANCE.officialRankingsPoll.activeKind).toBe(
      CFB_IS_CFP_POLL_ACTIVE ? "cfp" : CFB_AP_POLL_2026 ? "ap" : null,
    );
  });

  it("never labels the internal JKB power rank as an AP or CFP ranking", () => {
    const notes = CFB_PROVENANCE.notes.join(" ");
    expect(notes).toMatch(/JKB/);
    expect(notes).not.toMatch(/AP rank(?:ing)?s? (?:are|is) (?:the )?JKB/i);
    // The JKB fallback must always be described as internal/labeled, and the
    // official polls must always be attributed to AP/CFP.
    expect(notes).toMatch(/CFP .*priority over AP|AP .*official/i);
    expect(CFB_PROVENANCE.officialRankingsPoll.activeKind).not.toBe("jkb");
  });
});
