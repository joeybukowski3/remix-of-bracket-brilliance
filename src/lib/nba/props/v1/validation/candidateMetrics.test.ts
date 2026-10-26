import { describe, expect, it } from "vitest";
import { CANONICAL_TEAM_CODES } from "../../canonical";
import type { StatProjection } from "../../projection";
import { walkForward, type BacktestRow, type WalkRow } from "../backtest/walkForward";
import { compareAll, compareMeasure, isMaterialWorsening, reportChallenger, seasonSegmentOf, subgroupKeys, type MeasureComparison } from "./candidateMetrics";
import { CANDIDATE_IDS, MATERIAL_MIN_ROWS, projectCandidate } from "./frozenPlan";

const proj = (minutes: number, pts: number, reb = 5, ast = 3): StatProjection => ({ minutes, pts, reb, ast });

/** A scored row with the baseline and the three challengers; invented numbers. */
function row(over: { date?: string; player?: string; baseline?: StatProjection; A?: StatProjection; B?: StatProjection; AB?: StatProjection; actual?: Partial<BacktestRow["actual"]>; previousSeasonGames?: number; seasonPriorGames?: number } = {}): BacktestRow {
  const baseline = over.baseline ?? proj(30, 15);
  return {
    season: "2025-26", gameDate: over.date ?? "2025-12-01", gameId: `g-${over.date}-${over.player}`, playerId: over.player ?? "p1", team: "BOS", isHome: true,
    priorGames: 25, seasonPriorGames: over.seasonPriorGames ?? 25, previousSeasonGames: over.previousSeasonGames ?? 60, historyTier: "full",
    flags: { teamChangedRecently: false, returningFromAbsence: false, roleChange: false }, teamRestDays: 2, marginAbs: 5, expectedAbsMargin: 3, opponentDefense: 0,
    predictions: { v0: baseline, naive_l5: baseline, naive_l10: baseline, naive_season_to_date: baseline },
    candidates: { baseline, A: over.A ?? baseline, B: over.B ?? baseline, AB: over.AB ?? baseline },
    actual: { minutes: 30, pts: 15, reb: 5, ast: 3, ...over.actual },
  };
}

describe("compareMeasure", () => {
  it("reports each side's MAE and bias, and the paired difference (negative favours the challenger)", () => {
    const rows = [row({ baseline: proj(30, 20), A: proj(30, 16), actual: { pts: 15 } }), row({ date: "2025-12-02", player: "p2", baseline: proj(30, 10), A: proj(30, 14), actual: { pts: 16 } })];
    const c = compareMeasure(rows, "A", "pts");
    expect(c).toMatchObject({ rows: 2, baselineMae: (5 + 6) / 2, candidateMae: (1 + 2) / 2, baselineBias: (5 - 6) / 2, candidateBias: (1 - 2) / 2 });
    expect(c.difference.meanDiff).toBe(((1 - 5) + (2 - 6)) / 2);
  });

  it("uses only rows where both sides are defined", () => {
    const hole = row({ player: "p2" });
    hole.candidates.A = { minutes: null, pts: null, reb: null, ast: null };
    expect(compareMeasure([row(), hole], "A", "pts").rows).toBe(1);
  });

  it("returns no mean for no rows", () => {
    expect(compareMeasure([], "A", "pts")).toMatchObject({ rows: 0, baselineMae: null, candidateMae: null });
  });
});

describe("isMaterialWorsening: the frozen rule", () => {
  const comparison = (over: Partial<MeasureComparison> & { diff?: number | null; ci?: [number, number] | null } = {}): MeasureComparison => ({
    rows: over.rows ?? MATERIAL_MIN_ROWS, baselineMae: over.baselineMae ?? 5, candidateMae: 5, baselineBias: 0, candidateBias: 0,
    difference: { n: 300, clusters: 20, meanDiff: over.diff === undefined ? 0.2 : over.diff, se: 0.05, ci95: over.ci === undefined ? [0.1, 0.3] : over.ci, clusteredBy: "player", playerClusters: 20, weekClusters: 20 },
  });

  it("flags a subgroup that is significantly worse and at least 2% worse than its baseline MAE", () => {
    expect(isMaterialWorsening(comparison())).toBe(true);
    expect(isMaterialWorsening(comparison({ diff: 0.1, ci: [0.01, 0.19] }))).toBe(true);
  });

  it("does not flag a subgroup that is too small, not significant, less than 2% worse, or better", () => {
    expect(isMaterialWorsening(comparison({ rows: MATERIAL_MIN_ROWS - 1 }))).toBe(false);
    expect(isMaterialWorsening(comparison({ ci: [-0.05, 0.4] }))).toBe(false);
    expect(isMaterialWorsening(comparison({ diff: 0.05, ci: [0.01, 0.09] }))).toBe(false);
    expect(isMaterialWorsening(comparison({ diff: -0.2, ci: [-0.3, -0.1] }))).toBe(false);
    expect(isMaterialWorsening(comparison({ ci: null }))).toBe(false);
  });
});

describe("seasonSegmentOf", () => {
  it("splits the season's distinct game dates into three equal thirds", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row({ date: `2025-12-${String(i + 1).padStart(2, "0")}`, player: `p${i}` }));
    const segment = seasonSegmentOf(rows);
    expect(rows.map(segment)).toEqual(["1 early third", "1 early third", "1 early third", "2 middle third", "2 middle third", "2 middle third", "3 late third", "3 late third", "3 late third"]);
  });
});

/** An invented three-season league, so the real projectors run on real features. */
function league(): WalkRow[] {
  const teams = CANONICAL_TEAM_CODES.slice(0, 4);
  let seed = 99;
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const rows: WalkRow[] = [];
  for (const [season, startYear, days] of [["2024-25", 2024, 30], ["2025-26", 2025, 30]] as const) {
    for (let day = 0; day < days; day += 1) {
      const date = new Date(Date.UTC(startYear, 10, 1) + day * 2 * 86_400_000).toISOString().slice(0, 10);
      const pairs: Array<[string, string]> = day % 2 === 0 ? [[teams[0], teams[1]], [teams[2], teams[3]]] : [[teams[0], teams[2]], [teams[1], teams[3]]];
      for (const [home, away] of pairs) {
        for (const [team, opponent, isHome] of [[home, away, true], [away, home, false]] as const) {
          // Slots 1-4 play every game in both seasons; slot 7 is a rookie who only appears in 2025-26.
          for (const slot of season === "2025-26" ? [1, 2, 3, 4, 7] : [1, 2, 3, 4]) {
            const minutes = Math.round(34 - slot * 3 + noise() * 6);
            rows.push({ season, seasonType: "regular", gameId: `${season}-${date}-${home}`, gameDate: date, team, opponent, isHome, playerId: `${team}-${slot}`, playerName: `Demo ${team} ${slot}`, minutes, pts: Math.round(minutes * 0.5 + noise() * 4), reb: Math.round(minutes * 0.15 + noise() * 2), ast: Math.round(minutes * 0.08 + noise() * 2) });
          }
        }
      }
    }
  }
  return rows;
}

describe("the candidates on real features", () => {
  const projectors = Object.fromEntries(CANDIDATE_IDS.map((id) => [id, (f: Parameters<typeof projectCandidate>[1], p: Parameters<typeof projectCandidate>[2]) => projectCandidate(id, f, p)]));
  const result = walkForward(league(), { targetSeasons: ["2025-26"], projectors });
  const keys = subgroupKeys(result.rows);

  it("scores the same targets for every candidate, and the baseline equals the public v0 prediction", () => {
    expect(result.rows.length).toBeGreaterThan(300);
    for (const r of result.rows) {
      expect(Object.keys(r.candidates).sort()).toEqual(["A", "AB", "B", "baseline"]);
      expect(r.candidates.baseline).toEqual(r.predictions.v0);
    }
  });

  it("changes minutes under A only for the players the subgroup says the fixed prior applies to, and never under B", () => {
    for (const r of result.rows) {
      const applies = keys.fixedPriorApplies(r) === "A applies (fixed prior in use)";
      if (!applies) expect(r.candidates.A.minutes).toBe(r.candidates.baseline.minutes);
      expect(r.candidates.B.minutes).toBe(r.candidates.baseline.minutes);
    }
    const rookies = result.rows.filter((r) => keys.fixedPriorApplies(r) === "A applies (fixed prior in use)");
    expect(rookies.length).toBeGreaterThan(20);
    expect(rookies.every((r) => r.playerId.endsWith("-7"))).toBe(true);
    expect(rookies.some((r) => r.candidates.A.minutes !== r.candidates.baseline.minutes)).toBe(true);
  });

  it("recognizes a qualifying previous season from 2024-25 for returning players and none for the rookie", () => {
    const veteran = result.rows.find((r) => r.playerId.endsWith("-1"));
    const rookie = result.rows.find((r) => r.playerId.endsWith("-7"));
    expect(keys.previousSeason(veteran as BacktestRow)).toBe("qualifying previous season");
    expect(keys.previousSeason(rookie as BacktestRow)).toBe("no previous season");
  });

  it("is unchanged for 2025-26 targets when 2025-26 games after the target are deleted: 2024-25 context is the only outside input", () => {
    const rows = league();
    const cutoff = result.rows[Math.floor(result.rows.length / 2)].gameDate;
    const truncated = walkForward(rows.filter((r) => r.gameDate <= cutoff), { targetSeasons: ["2025-26"], projectors });
    const full = new Map(result.rows.map((r) => [`${r.gameId}|${r.playerId}`, r]));
    for (const r of truncated.rows) expect(full.get(`${r.gameId}|${r.playerId}`)?.candidates).toEqual(r.candidates);
  });

  it("builds a full report for a challenger, with the later half and every subgroup table", () => {
    const report = reportChallenger(result.rows, "A");
    expect(report.laterHalfStarts).not.toBeNull();
    expect(Object.keys(report.subgroups)).toEqual(expect.arrayContaining(["projectedMinutesTier", "priorGames", "seasonSegment", "previousSeason", "fixedPriorApplies", "month"]));
    expect(report.overall.minutes.rows).toBe(result.rows.length);
    expect(report.laterHalf.minutes.rows).toBeLessThan(result.rows.length);
    expect(compareAll(result.rows, "B").minutes.difference.meanDiff).toBe(0);
  });
});

describe("reportChallenger finds a material worsening", () => {
  it("lists a large subgroup where the challenger is clearly worse, and nothing when it is not", () => {
    const rows = Array.from({ length: 600 }, (_, i) => row({
      date: `2025-12-${String((i % 28) + 1).padStart(2, "0")}`, player: `p${i % 30}`, previousSeasonGames: i % 2 === 0 ? 60 : 0,
      baseline: proj(30, 15), A: i % 2 === 0 ? proj(30, 15) : proj(34, 15), actual: { minutes: 30 + (i % 3) },
    }));
    const report = reportChallenger(rows, "A");
    const hit = report.materialWorsening.find((w) => w.segmentation === "previousSeason" && w.subgroup === "no previous season" && w.measure === "minutes");
    expect(hit).toBeDefined();
    expect(hit?.rows).toBe(300);
    const fine = reportChallenger(rows.map((r) => ({ ...r, candidates: { ...r.candidates, A: r.candidates.baseline } })), "A");
    expect(fine.materialWorsening).toEqual([]);
  });
});
