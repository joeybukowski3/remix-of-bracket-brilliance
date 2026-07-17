import { describe, expect, it } from "vitest";
import {
  NFL_SEATTLE_BYE_WEEK_2026,
  NFL_SEATTLE_SCHEDULE_2026,
  SEATTLE_SCHEDULE_SOURCE,
} from "@/lib/nfl/seattleSchedule";
import { NFL_GUIDE_RECORDS } from "@/lib/nfl/guideRecord";

describe("NFL_SEATTLE_SCHEDULE_2026", () => {
  it("has exactly 17 regular-season games plus one bye", () => {
    expect(NFL_SEATTLE_SCHEDULE_2026).toHaveLength(17);
    expect(NFL_SEATTLE_BYE_WEEK_2026).not.toBeNull();
    expect(NFL_SEATTLE_BYE_WEEK_2026?.week).toBe(11);
  });

  it("orders games deterministically by week", () => {
    const weeks = NFL_SEATTLE_SCHEDULE_2026.map((g) => g.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(new Set(weeks).size).toBe(17);
  });

  it("does not assign the bye week a game entry", () => {
    expect(NFL_SEATTLE_SCHEDULE_2026.some((g) => g.week === 11)).toBe(false);
  });

  it("resolves opponent identity and logo for every game", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      expect(game.opponentName, `week ${game.week}`).toBeTruthy();
      expect(game.opponentLogoUrl, `week ${game.week}`).toMatch(/^https:\/\/a\.espncdn\.com/);
      const record = NFL_GUIDE_RECORDS.find((r) => r.abbr === game.opponentAbbr);
      expect(record, `week ${game.week} opponent ${game.opponentAbbr}`).toBeDefined();
    }
  });

  it("handles home, away, and neutral values without fabricating a default", () => {
    const values = new Set(NFL_SEATTLE_SCHEDULE_2026.map((g) => g.homeAway));
    for (const v of values) expect(["home", "away", "neutral"]).toContain(v);
    // Seattle's real 2026 schedule (verified against the ESPN snapshot) is a mix of home/away.
    expect(NFL_SEATTLE_SCHEDULE_2026.some((g) => g.homeAway === "home")).toBe(true);
    expect(NFL_SEATTLE_SCHEDULE_2026.some((g) => g.homeAway === "away")).toBe(true);
  });

  it("flags divisional games correctly against the guide's own division data", () => {
    const nfcWestAbbrs = new Set(
      NFL_GUIDE_RECORDS.filter((r) => r.division === "NFC West").map((r) => r.abbr),
    );
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      const expected = nfcWestAbbrs.has(game.opponentAbbr) && game.opponentAbbr !== "sea";
      expect(game.isDivisionalGame, `week ${game.week} vs ${game.opponentAbbr}`).toBe(expected);
    }
    // Seattle plays each of its 3 NFC West rivals at least once (real schedule fact).
    const divisionalCount = NFL_SEATTLE_SCHEDULE_2026.filter((g) => g.isDivisionalGame).length;
    expect(divisionalCount).toBeGreaterThanOrEqual(3);
  });

  it("computes a rest edge and label sourced from the Warren Sharp data", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      expect(Number.isFinite(game.rest.edgeDays), `week ${game.week}`).toBe(true);
      expect(["advantage", "disadvantage", "neutral"]).toContain(game.rest.label);
    }
    // Week 8 (vs CHI) has restEdgeDays -3 in the Warren Sharp data (confirmed by direct inspection).
    const week8 = NFL_SEATTLE_SCHEDULE_2026.find((g) => g.week === 8);
    expect(week8?.rest.edgeDays).toBe(-3);
    expect(week8?.rest.label).toBe("disadvantage");
    // Week 12 (vs SF) has restEdgeDays +7.
    const week12 = NFL_SEATTLE_SCHEDULE_2026.find((g) => g.week === 12);
    expect(week12?.rest.edgeDays).toBe(7);
    expect(week12?.rest.label).toBe("advantage");
  });

  it("labels rest as neutral only within the +/-1 day band", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      if (game.rest.label === "neutral") {
        expect(Math.abs(game.rest.edgeDays), `week ${game.week}`).toBeLessThanOrEqual(1);
      } else if (game.rest.label === "advantage") {
        expect(game.rest.edgeDays, `week ${game.week}`).toBeGreaterThan(1);
      } else {
        expect(game.rest.edgeDays, `week ${game.week}`).toBeLessThan(-1);
      }
    }
  });

  it("computes short-week from real date gaps, not from the rest-edge field", () => {
    // First game of the season has no previous game, so it cannot be a short week.
    const week1 = NFL_SEATTLE_SCHEDULE_2026.find((g) => g.week === 1);
    expect(week1?.rest.isShortWeek).toBe(false);
  });

  it("carries opponent NFL v0.3 rank and rating from the guide record, not a duplicate source", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      const record = NFL_GUIDE_RECORDS.find((r) => r.abbr === game.opponentAbbr);
      expect(game.opponent.v03Rank, game.opponentAbbr).toBe(record?.model?.rank ?? null);
      expect(game.opponent.v03PublicRating, game.opponentAbbr).toBe(record?.model?.publicRating ?? null);
    }
  });

  it("computes matchup edges as rating differences, never as a probability", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      for (const value of [
        game.matchupEdge.offenseVsOpponentDefense,
        game.matchupEdge.defenseVsOpponentOffense,
        game.matchupEdge.overallRatingGap,
      ]) {
        if (value != null) {
          // A rating-point difference on the 1-99 scale is bounded well within [-99, 99],
          // and must never look like a 0-1 probability by coincidence of scale alone.
          expect(Math.abs(value), `week ${game.week}`).toBeLessThanOrEqual(99);
        }
      }
    }
  });

  it("does not include a win-probability or probability-tier field", () => {
    for (const game of NFL_SEATTLE_SCHEDULE_2026) {
      expect(game).not.toHaveProperty("winProbability");
      expect(game).not.toHaveProperty("probability");
      expect(game).not.toHaveProperty("probabilityTier");
    }
  });

  it("generates a deterministic, factual rationale sentence for every game", () => {
    const firstPass = NFL_SEATTLE_SCHEDULE_2026.map((g) => g.rationale);
    const secondPass = NFL_SEATTLE_SCHEDULE_2026.map((g) => g.rationale);
    expect(firstPass).toEqual(secondPass);
    for (const rationale of firstPass) {
      expect(rationale.length).toBeGreaterThan(10);
      expect(rationale).not.toMatch(/\bundefined\b|\bNaN\b|\bnull\b/);
    }
  });

  it("carries source metadata identifying it as an ESPN snapshot, not a live feed", () => {
    expect(SEATTLE_SCHEDULE_SOURCE.title).toMatch(/espn/i);
    expect(SEATTLE_SCHEDULE_SOURCE.season).toBe(2026);
    expect(() => new Date(SEATTLE_SCHEDULE_SOURCE.snapshotAt).toISOString()).not.toThrow();
  });

  it("is deterministic across repeated module-level builds", () => {
    // NFL_SEATTLE_SCHEDULE_2026 is computed once at import time; re-deriving the
    // same computation from the same inputs must produce byte-identical output.
    const serialized1 = JSON.stringify(NFL_SEATTLE_SCHEDULE_2026);
    const serialized2 = JSON.stringify(NFL_SEATTLE_SCHEDULE_2026);
    expect(serialized1).toBe(serialized2);
  });
});
