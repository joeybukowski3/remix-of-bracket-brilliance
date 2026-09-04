/**
 * Research <-> production scoring-support parity.
 *
 * The NFL total model was locked (Phase A-Q) against the research-only
 * compact scoring-support cache at
 * `data/nfl/research/nfl-total-model/scoring_support_team_game_<season>.csv`.
 * Live/weekly predictions instead read the maintained production cache at
 * `data/nfl/nflverse/scoring-support-team-game/...`, refreshed by
 * `scripts/refresh-nfl-scoring-support-cache.mjs`.
 *
 * Both builders share ONE aggregation engine
 * (`scripts/lib/nfl-scoring-support-core.mjs`), so equivalent historical
 * inputs must yield byte-identical feature rows. This test proves it two
 * ways:
 *   1. Engine equivalence on a hand-built fixture PBP table (independent of
 *      any committed file).
 *   2. The committed production CSVs reproduce the committed research CSVs
 *      row-for-row, and the derived EWMA feature vectors are identical, for
 *      every season in the research corpus.
 *
 * If this ever fails, production and research have silently diverged and it
 * must be diagnosed, not patched around.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- pure .mjs engine, no type declarations
import { aggregateScoringSupportRows, SCORING_SUPPORT_PBP_COLUMNS } from "../../../../../scripts/lib/nfl-scoring-support-core.mjs";
import { buildScoringSupportIndex, buildNflTotalFeatures } from "./totalsFeatures";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { computeEwmaWindow } from "@/lib/nfl/research/total/ewmaWindow";
import type { NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const RESEARCH_DIR = join(ROOT, "data", "nfl", "research", "nfl-total-model");
const PRODUCTION_DIR = join(ROOT, "data", "nfl", "nflverse", "scoring-support-team-game");
const SEASONS = [2021, 2022, 2023, 2024, 2025];

function idx(): Record<string, number> {
  return Object.fromEntries((SCORING_SUPPORT_PBP_COLUMNS as string[]).map((c, i) => [c, i]));
}

function cells(map: Record<string, string | number>): string[] {
  const columns = SCORING_SUPPORT_PBP_COLUMNS as string[];
  return columns.map((c) => String(map[c] ?? ""));
}

function parseRows(text: string): NflTotalResearchScoringSupportRow[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const r = Object.fromEntries(header.map((h, i) => [h, line.split(",")[i]]));
    return {
      gameId: r.game_id, season: Number(r.season), week: Number(r.week),
      team: normalizeNflTeamAbbr(r.team)!, opponent: normalizeNflTeamAbbr(r.opponent)!,
      eligiblePlays: Number(r.eligible_plays), offEpaSum: Number(r.off_epa_sum),
      successNum: Number(r.success_num), successDen: Number(r.success_den), explosiveCount: Number(r.explosive_count),
    };
  });
}

describe("scoring-support research/production parity", () => {
  it("shared engine produces the documented offense/success/explosive aggregate from raw PBP", () => {
    const rows = [
      // KC offense vs BUF, week 3, 2024: 2 pass (1 explosive 20yd, 1 success 8/8), 1 rush (explosive 12yd)
      cells({ game_id: "2024_03_KC_BUF", season: 2024, season_type: "REG", week: 3, posteam: "KC", defteam: "BUF", down: 1, ydstogo: 10, yards_gained: 20, pass: 1, rush: 0, two_point_attempt: 0, epa: 1.5 }),
      cells({ game_id: "2024_03_KC_BUF", season: 2024, season_type: "REG", week: 3, posteam: "KC", defteam: "BUF", down: 3, ydstogo: 8, yards_gained: 8, pass: 1, rush: 0, two_point_attempt: 0, epa: 0.9 }),
      cells({ game_id: "2024_03_KC_BUF", season: 2024, season_type: "REG", week: 3, posteam: "KC", defteam: "BUF", down: 2, ydstogo: 10, yards_gained: 12, pass: 0, rush: 1, two_point_attempt: 0, epa: 0.7 }),
      // excluded: two-point attempt, missing EPA, playoff row
      cells({ game_id: "2024_03_KC_BUF", season: 2024, season_type: "REG", week: 3, posteam: "KC", defteam: "BUF", down: 0, ydstogo: 0, yards_gained: 2, pass: 1, rush: 0, two_point_attempt: 1, epa: 0.1 }),
      cells({ game_id: "2024_03_KC_BUF", season: 2024, season_type: "REG", week: 3, posteam: "KC", defteam: "BUF", down: 1, ydstogo: 10, yards_gained: 3, pass: 1, rush: 0, two_point_attempt: 0, epa: "NA" }),
      cells({ game_id: "2024_19_KC_BUF", season: 2024, season_type: "POST", week: 19, posteam: "KC", defteam: "BUF", down: 1, ydstogo: 10, yards_gained: 5, pass: 1, rush: 0, two_point_attempt: 0, epa: 0.2 }),
    ];
    const { rows: agg } = aggregateScoringSupportRows(rows, idx());
    expect(agg).toHaveLength(1);
    expect(agg[0]).toMatchObject({
      game_id: "2024_03_KC_BUF", season: 2024, week: 3, team: "kc", opponent: "buf",
      eligible_plays: 3, success_num: 3, success_den: 3, explosive_count: 2,
    });
    expect(agg[0].off_epa_sum).toBeCloseTo(3.1, 10);
  });

  for (const season of SEASONS) {
    it(`${season}: committed production CSV reproduces the research CSV byte-for-byte`, () => {
      const researchPath = join(RESEARCH_DIR, `scoring_support_team_game_${season}.csv`);
      const productionPath = join(PRODUCTION_DIR, `scoring_support_team_game_${season}.csv`);
      expect(existsSync(researchPath)).toBe(true);
      expect(existsSync(productionPath)).toBe(true);
      expect(readFileSync(productionPath, "utf-8")).toBe(readFileSync(researchPath, "utf-8"));
    });
  }

  it("EWMA feature vectors are identical whether built from the research or the production cache", () => {
    const research = buildScoringSupportIndex(SEASONS.flatMap((s) => parseRows(readFileSync(join(RESEARCH_DIR, `scoring_support_team_game_${s}.csv`), "utf-8"))));
    const production = buildScoringSupportIndex(SEASONS.flatMap((s) => parseRows(readFileSync(join(PRODUCTION_DIR, `scoring_support_team_game_${s}.csv`), "utf-8"))));
    const sample = [
      { season: 2023, week: 10, home: "buf", away: "cin" },
      { season: 2024, week: 5, home: "kc", away: "no" },
      { season: 2025, week: 12, home: "dal", away: "phi" },
    ];
    for (const g of sample) {
      for (const side of ["home", "away"] as const) {
        const [team, opp] = side === "home" ? [g.home, g.away] : [g.away, g.home];
        const r = buildNflTotalFeatures(research, team, opp, { season: g.season, week: g.week }, side);
        const p = buildNflTotalFeatures(production, team, opp, { season: g.season, week: g.week }, side);
        expect(p).toEqual(r);
        // and directly against the research EWMA primitive
        const off = computeEwmaWindow(research.byTeam.get(team) ?? [], { season: g.season, week: g.week }, 6);
        expect(p.offenseEpaPerPlay).toBe(off.epaPerPlay);
      }
    }
  });
});
