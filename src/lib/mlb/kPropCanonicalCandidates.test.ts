import { describe, expect, it } from "vitest";
import { buildCanonicalKCandidatePool } from "@/lib/mlb/kPropCanonicalCandidates";
import { buildPitcherStrikeoutRows } from "@/lib/mlb/mlbSocialSelection";
import { buildKPropBestBets } from "@/lib/mlb/kPropBestBets";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

const games: HrDashboardGame[] = [
  { gameKey: "PHI@ATL", matchup: "PHI @ ATL", awayTeam: "PHI", homeTeam: "ATL", stadium: "Truist Park", roofType: "open", temperature: 78, precipitation: 0, windSpeed: 5, windDirection: "out", conditions: "clear", parkFactor: 1, gameStartTime: "2026-08-20T23:20:00Z" },
  { gameKey: "DET@CLE", matchup: "DET @ CLE", awayTeam: "DET", homeTeam: "CLE", stadium: "Progressive Field", roofType: "open", temperature: 72, precipitation: 0, windSpeed: 8, windDirection: "in", conditions: "clear", parkFactor: 0.97, gameStartTime: "2026-08-20T23:10:00Z" },
];

const pitchers: HrDashboardPitcher[] = [
  {
    gameKey: "PHI@ATL", gameId: 9001, pitcher: "Zack Wheeler", pitcherId: 1001, team: "PHI", opponent: "ATL",
    hand: "R", ballpark: "Truist Park", parkFactor: 1, xera: null, hardHitRate: null, flyBallRate: null, barrelRate: null,
    kRate: 29, bbRate: 6, whiffRate: 32, last7HR: 1, hrPerStart: 0.5, hrVs: 5, hitsVs: 40, kVs: 78,
    kLine: 6.5, kOddsOver: "+105", kOddsUnder: "-125", kOddsBook: "draftkings",
    projectedIP: 6.1, projectedK9: 10.5, projectedKs: 7.4,
    workloadRole: "starter", projectionSource: "v2", publicRecommendationEligible: true,
    workloadConfidenceGrade: "A", workloadFlags: [],
  },
  {
    gameKey: "DET@CLE", gameId: 9002, pitcher: "Tarik Skubal", pitcherId: 1002, team: "DET", opponent: "CLE",
    hand: "L", ballpark: "Progressive Field", parkFactor: 0.97, xera: null, hardHitRate: null, flyBallRate: null, barrelRate: null,
    kRate: 31, bbRate: 5, whiffRate: 34, last7HR: 0, hrPerStart: 0.3, hrVs: 3, hitsVs: 35, kVs: 82,
    kLine: 7.5, kOddsOver: "-140", kOddsUnder: "+115", kOddsBook: "draftkings",
    projectedIP: 5.2, projectedK9: 8.5, projectedKs: 4.9,
    workloadRole: "starter", projectionSource: "v2", publicRecommendationEligible: true,
    workloadConfidenceGrade: "A", workloadFlags: [],
  },
];

const batters: HrDashboardBatter[] = [];

describe("buildCanonicalKCandidatePool parity with the site's Top Over/Under Plays", () => {
  it("returns the same pitcher/side/line/odds/projection set as buildKPropBestBets for a deterministic fixture", () => {
    const rows = buildPitcherStrikeoutRows(batters, games, pitchers);
    const { overs, unders } = buildKPropBestBets(rows, 3);
    const candidates = buildCanonicalKCandidatePool(batters, games, pitchers);

    expect(candidates).toHaveLength(overs.length + unders.length);

    for (const bet of [...overs, ...unders]) {
      const match = candidates.find((c) => c.pitcher === bet.pitcher && c.direction === (bet.side === "over" ? "OVER" : "UNDER"));
      expect(match, `expected a canonical candidate for ${bet.pitcher} (${bet.side})`).toBeTruthy();
      // pitcher / team / opponent / side
      expect(match?.pitcher).toBe(bet.pitcher);
      expect(match?.team).toBe(bet.team);
      expect(match?.opponent).toBe(bet.opponent);
      expect(match?.direction).toBe(bet.side === "over" ? "OVER" : "UNDER");
      // strikeout line / projection
      expect(match?.kLine).toBe(bet.line);
      expect(match?.projectedKs).toBe(bet.projectedKs);
      // odds -- for THIS side specifically
      expect(bet.side === "over" ? match?.oddsOver : match?.oddsUnder).toBe(bet.odds);
      // K Score (matchupScore) / Edge (projectionEdge) -- sourced from the
      // SAME KBestBet the site rendered, never recomputed
      expect(match?.kScore).toBe(bet.matchupScore);
      expect(match?.edge).toBe(bet.projectionEdge);
    }
  });

  it("includes both Overs and Unders -- never Overs-only", () => {
    const candidates = buildCanonicalKCandidatePool(batters, games, pitchers);
    expect(candidates.some((c) => c.direction === "OVER")).toBe(true);
    expect(candidates.some((c) => c.direction === "UNDER")).toBe(true);
  });

  it("carries gameId/gameStartTime through from the full row, not fabricated", () => {
    const candidates = buildCanonicalKCandidatePool(batters, games, pitchers);
    const wheeler = candidates.find((c) => c.pitcher === "Zack Wheeler");
    expect(wheeler?.gameId).toBe(9001);
    expect(wheeler?.gameStartTime).toBe("2026-08-20T23:20:00Z");
  });

  it("is sorted by valueScore descending across both sides combined", () => {
    const candidates = buildCanonicalKCandidatePool(batters, games, pitchers);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].valueScore).toBeGreaterThanOrEqual(candidates[i].valueScore);
    }
  });
});
