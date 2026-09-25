/**
 * Shadow total calibration candidate (jkb-nfl-total-calibration-shadow-k08-2026): behaviour, isolation and immutability.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import { NFL_TOTAL_MODEL_VERSION } from "../../src/lib/nfl/props/totals/totalsModelContract";
import {
  DEFAULT_SHADOW_ROOT,
  NFL_TOTAL_SHADOW_K,
  NFL_TOTAL_SHADOW_MODEL_VERSION,
  archiveShadowRows,
  buildShadowRows,
  cohortFor,
  computeShadowTotal,
  ensureShadowManifest,
  gradeShadowOutcomes,
  loadPriorSeasonLeagueMean,
  readShadowOutcomes,
  readShadowRows,
  runNflTotalShadow,
  selectMarketTotal,
  shadowPredictionPath,
  validateShadowRow,
  type ShadowSlateGame,
} from "./nfl-total-shadow-calibration";

const REPO = join(__dirname, "..", "..");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "nfl-shadow-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// ---- fixtures ----------------------------------------------------------------------------------
type Fx = { records: PredictionSnapshotV1[]; slate: ShadowSlateGame[]; generatedAt: string };
/** Real, immutable production rows (append-only archive): the latest pregame snapshot of Week 3's first game. */
function productionFixture(): Fx {
  const all = readFileSync(join(REPO, "data", "nfl", "predictions", "2026", "03", "nfl-total-ridge.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as PredictionSnapshotV1);
  const gameId = all[0].game_id;
  const rows = all.filter((r) => r.game_id === gameId);
  const ts = rows.map((r) => r.prediction_timestamp).sort().at(-1) as string;
  const records = rows.filter((r) => r.prediction_timestamp === ts);
  const home = records.find((r) => r.home_away === "home") as PredictionSnapshotV1;
  const slate: ShadowSlateGame[] = [{ gameId, season: 2026, week: 3, kickoffUtc: home.kickoff_utc, neutralSite: home.neutral_site, homeAbbr: home.team, awayAbbr: home.opponent }];
  return { records, slate, generatedAt: ts };
}

function writeSeason(root: string, season: number, scores: [number, number][], opts: { finalAll?: boolean; scheduled?: number } = {}): void {
  mkdirSync(join(root, String(season)), { recursive: true });
  const results = scores.map(([h, a], i) => ({ gameId: `${season}_01_A${i}_B${i}`, week: 1, seasonType: "REG", final: opts.finalAll === false && i === 0 ? false : true, homeScore: h, awayScore: a }));
  writeFileSync(join(root, String(season), "results.json"), JSON.stringify({ results }));
  writeFileSync(join(root, String(season), "games.json"), JSON.stringify({ games: Array.from({ length: opts.scheduled ?? scores.length }, () => ({ seasonType: "REG" })) }));
}

function writeLines(root: string, gameId: string, lines: { sportsbook: string; capturedAt: string; total: number | null; id?: string }[]): void {
  mkdirSync(join(root, "2026"), { recursive: true });
  writeFileSync(join(root, "2026", `${gameId}.jsonl`), lines.map((l, i) => JSON.stringify({ id: l.id ?? `obs-${i}`, jkbGameId: gameId, provider: "the-odds-api", sportsbook: l.sportsbook, capturedAt: l.capturedAt, total: l.total === null ? null : { line: l.total }, contentHash: `h${i}` })).join("\n") + "\n");
}

// ---- formula / identity ------------------------------------------------------------------------
describe("frozen formula and identity", () => {
  it("k is exactly 0.8 and the model identifier is the shadow identity, not production", () => {
    expect(NFL_TOTAL_SHADOW_K).toBe(0.8);
    expect(NFL_TOTAL_SHADOW_MODEL_VERSION).toBe("jkb-nfl-total-calibration-shadow-k08-2026");
    expect(NFL_TOTAL_SHADOW_MODEL_VERSION).not.toBe(NFL_TOTAL_MODEL_VERSION);
    expect(NFL_TOTAL_MODEL_VERSION).toBe("jkb-nfl-total-ridge-v1.0.0");
  });

  it("computeShadowTotal is mu + 0.8*(raw - mu) and accepts no k argument", () => {
    expect(computeShadowTotal.length).toBe(2);
    for (const [raw, mu] of [[40, 46], [50.5, 46.025735294117645], [46, 46], [36.9, 45.75], [53.1, 46]] as const) {
      expect(computeShadowTotal(raw, mu)).toBe(mu + 0.8 * (raw - mu));
    }
    expect(computeShadowTotal(40, 46)).toBeCloseTo(41.2, 12);
    expect(computeShadowTotal(46.02, 46.02)).toBe(46.02); // the mean maps to itself
  });

  it("validation rejects a row with any k other than 0.8 or a shadow total that is not the exact formula", () => {
    const fx = productionFixture();
    const mean = loadPriorSeasonLeagueMean(2026);
    const [row] = buildShadowRows({ season: 2026, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "t", codeRevision: null, productionRecords: fx.records, slate: fx.slate, leagueMean: mean, marketHistoryRoot: tmp });
    expect(() => validateShadowRow(row)).not.toThrow();
    expect(() => validateShadowRow({ ...row, k: 0.7 as unknown as 0.8 })).toThrow(/k must be exactly 0.8/);
    expect(() => validateShadowRow({ ...row, shadow_total: row.shadow_total + 1e-9 })).toThrow(/exact/);
    expect(() => validateShadowRow({ ...row, model_version: "jkb-nfl-total-ridge-v1.0.0" as unknown as typeof row.model_version })).toThrow(/model identity/);
    expect(() => validateShadowRow({ ...row, generated_at: row.kickoff_utc })).toThrow(/before kickoff/);
  });

  it("the cohort rule makes Weeks 1-2 retrospective and Week 3 onward prospective", () => {
    expect(cohortFor(2026, 1)).toBe("retrospective");
    expect(cohortFor(2026, 2)).toBe("retrospective");
    expect(cohortFor(2026, 3)).toBe("prospective");
    expect(cohortFor(2026, 18)).toBe("prospective");
  });
});

// ---- prior-season league mean ------------------------------------------------------------------
describe("prior-season league mean", () => {
  it("2026 uses the completed 2025 regular season: the mean of home+away totals, recomputed independently", () => {
    const src = loadPriorSeasonLeagueMean(2026);
    const raw = JSON.parse(readFileSync(join(REPO, "public", "data", "nfl", "2025", "results.json"), "utf8")) as { results: { seasonType: string; final: boolean; homeScore: number; awayScore: number }[] };
    const reg = raw.results.filter((r) => r.seasonType === "REG" && r.final);
    const expected = reg.reduce((t, r) => t + r.homeScore + r.awayScore, 0) / reg.length;
    expect(src.season).toBe(2025);
    expect(src.mean_total_points).toBe(expected);
    expect(src.games_counted).toBe(reg.length);
    expect(src.mean_total_points).toBeCloseTo(12519 / 272, 12);
    expect(src.source_path).toBe("public/data/nfl/2025/results.json");
  });

  it("never reads the target season: changing the 2026 results cannot change the mean", () => {
    writeSeason(tmp, 2025, [[20, 24], [30, 17], [10, 13]]);
    writeSeason(tmp, 2026, [[1, 2]]);
    const before = loadPriorSeasonLeagueMean(2026, tmp);
    writeSeason(tmp, 2026, [[70, 70], [70, 70], [70, 70]]); // wildly different current-season results
    const after = loadPriorSeasonLeagueMean(2026, tmp);
    expect(after).toEqual(before);
    expect(before.mean_total_points).toBe((44 + 47 + 23) / 3);
  });

  it("fails closed when the prior season is incomplete or missing", () => {
    writeSeason(tmp, 2025, [[20, 24], [30, 17]], { finalAll: false });
    expect(() => loadPriorSeasonLeagueMean(2026, tmp)).toThrow(/not complete/);
    writeSeason(tmp, 2025, [[20, 24], [30, 17]], { scheduled: 3 });
    expect(() => loadPriorSeasonLeagueMean(2026, tmp)).toThrow(/incomplete/);
    expect(() => loadPriorSeasonLeagueMean(2030, tmp)).toThrow(/missing/);
  });
});

// ---- market at generation (evaluation-only) ----------------------------------------------------
describe("market total at generation time", () => {
  const rows = [
    { sportsbook: "fanduel", capturedAt: "2026-09-22T10:00:00.000Z", total: { line: 44.5 } },
    { sportsbook: "draftkings", capturedAt: "2026-09-22T09:00:00.000Z", total: { line: 43.5 } },
    { sportsbook: "draftkings", capturedAt: "2026-09-23T09:00:00.000Z", total: { line: 42.5 } },
    { sportsbook: "draftkings", capturedAt: "2026-09-24T22:00:00.000Z", total: { line: 41.5 } },
  ];
  it("uses the latest observation at or before generation and never a later one (closing lines are not available at generation)", () => {
    const m = selectMarketTotal(rows, "2026-09-24T12:00:00.000Z", "2026-09-25T00:15:00.000Z");
    expect(m).toMatchObject({ available: true, total: 42.5, sportsbook: "draftkings", observed_at: "2026-09-23T09:00:00.000Z", usage: "evaluation_only_never_a_model_input" });
  });
  it("ignores observations at or after kickoff and reports unavailable when nothing qualifies", () => {
    expect(selectMarketTotal(rows, "2026-09-24T23:00:00.000Z", "2026-09-24T21:00:00.000Z").total).toBe(42.5);
    expect(selectMarketTotal(rows, "2026-09-21T00:00:00.000Z", "2026-09-25T00:15:00.000Z")).toMatchObject({ available: false, total: null });
  });
  it("cannot influence the shadow total: different markets give identical shadow totals and ids", () => {
    const fx = productionFixture(); const mean = loadPriorSeasonLeagueMean(2026);
    const rootA = join(tmp, "a"); const rootB = join(tmp, "b");
    writeLines(rootA, fx.slate[0].gameId, [{ sportsbook: "draftkings", capturedAt: "2026-09-01T00:00:00.000Z", total: 30 }]);
    writeLines(rootB, fx.slate[0].gameId, [{ sportsbook: "draftkings", capturedAt: "2026-09-01T00:00:00.000Z", total: 60 }]);
    const args = { season: 2026, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "t", codeRevision: null, productionRecords: fx.records, slate: fx.slate, leagueMean: mean };
    const [a] = buildShadowRows({ ...args, marketHistoryRoot: rootA }); const [b] = buildShadowRows({ ...args, marketHistoryRoot: rootB });
    expect(a.market_at_generation.total).toBe(30); expect(b.market_at_generation.total).toBe(60);
    expect(a.shadow_total).toBe(b.shadow_total); expect(a.shadow_id).toBe(b.shadow_id);
  });
});

// ---- production untouched ----------------------------------------------------------------------
describe("production total is unchanged", () => {
  it("the raw JKB total equals the production home+away sum and the archived projected_game_total; inputs are not mutated", () => {
    const fx = productionFixture(); const mean = loadPriorSeasonLeagueMean(2026);
    const before = JSON.stringify(fx.records);
    const [row] = buildShadowRows({ season: 2026, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "t", codeRevision: null, productionRecords: fx.records, slate: fx.slate, leagueMean: mean, marketHistoryRoot: tmp });
    const home = fx.records.find((r) => r.home_away === "home")!; const away = fx.records.find((r) => r.home_away === "away")!;
    const sum = (home.projection as { projected_team_points: number }).projected_team_points + (away.projection as { projected_team_points: number }).projected_team_points;
    expect(row.raw_jkb_total).toBe(sum);
    expect(row.raw_jkb_total).toBe((home.feature_snapshot.values.prediction as { projected_game_total: number }).projected_game_total);
    expect(row.shadow_total).toBe(mean.mean_total_points + 0.8 * (sum - mean.mean_total_points));
    expect(row.production_prediction_ids).toEqual({ home: home.prediction_id, away: away.prediction_id });
    expect(row.base_model_version).toBe("jkb-nfl-total-ridge-v1.0.0");
    expect(JSON.stringify(fx.records)).toBe(before);
  });
  it("refuses any input that is not the unchanged production v1.0.0 team_total row", () => {
    const fx = productionFixture(); const mean = loadPriorSeasonLeagueMean(2026);
    const tampered = fx.records.map((r) => ({ ...r, model_version: "jkb-nfl-total-ridge-v1.1.0" }));
    expect(() => buildShadowRows({ season: 2026, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "t", codeRevision: null, productionRecords: tampered, slate: fx.slate, leagueMean: mean, marketHistoryRoot: tmp })).toThrow(/unchanged production/);
  });
  it("a shadow write touches only its own root: the default root is separate from every production and public path", () => {
    expect(DEFAULT_SHADOW_ROOT).toContain(join("data", "nfl", "shadow-predictions"));
    expect(DEFAULT_SHADOW_ROOT).not.toContain(join("data", "nfl", "predictions"));
    expect(DEFAULT_SHADOW_ROOT).not.toContain("public");
  });
  it("skips (writes nothing) for any season other than 2026 and in dry-run", () => {
    const fx = productionFixture(); writeSeason(tmp, 2025, [[20, 24], [30, 17]]);
    const base = { week: 3, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "t", codeRevision: null, productionRecords: fx.records, slate: fx.slate, shadowRoot: join(tmp, "shadow"), resultsRoot: tmp, marketHistoryRoot: tmp };
    expect(runNflTotalShadow({ ...base, season: 2025, dryRun: false }).skipped).toMatch(/2026 only/);
    const dry = runNflTotalShadow({ ...base, season: 2026, dryRun: true });
    expect(dry.rows).toHaveLength(1); expect(dry.appended).toBe(0);
    expect(existsSync(join(tmp, "shadow"))).toBe(false);
  });
});

// ---- immutability / no lookahead ---------------------------------------------------------------
describe("archived shadow predictions are immutable", () => {
  function frozenRun(root: string, resultsRoot: string, marketRoot: string) {
    const fx = productionFixture();
    return runNflTotalShadow({ season: 2026, week: 3, generatedAt: fx.generatedAt, createdAt: "2026-09-24T21:00:00.000Z", runId: "run-1", codeRevision: "abc", productionRecords: fx.records, slate: fx.slate, shadowRoot: root, resultsRoot, marketHistoryRoot: marketRoot, dryRun: false });
  }

  it("re-running with later current-season results and later markets appends nothing and leaves the file byte-identical", () => {
    const root = join(tmp, "shadow"); writeSeason(tmp, 2025, [[20, 24], [30, 17], [10, 13]]); writeSeason(tmp, 2026, [[1, 2]]);
    const gameId = productionFixture().slate[0].gameId;
    writeLines(tmp, gameId, [{ sportsbook: "draftkings", capturedAt: "2026-09-01T00:00:00.000Z", total: 44.5 }]);
    const first = frozenRun(root, tmp, tmp);
    expect(first.appended).toBe(1);
    const path = shadowPredictionPath(root, 2026, 3, "prospective"); const h1 = sha(path);
    // "the future": completed 2026 results (including this game) and a much later market move
    writeSeason(tmp, 2026, [[70, 70], [70, 70], [70, 70]]);
    writeLines(tmp, gameId, [{ sportsbook: "draftkings", capturedAt: "2026-09-01T00:00:00.000Z", total: 44.5 }, { sportsbook: "draftkings", capturedAt: "2026-09-24T20:00:00.000Z", total: 55 }]);
    const second = frozenRun(root, tmp, tmp);
    expect(second.appended).toBe(0); expect(second.duplicates).toBe(1);
    expect(sha(path)).toBe(h1);
    const stored = readShadowRows(root, 2026);
    expect(stored).toHaveLength(1);
    expect(stored[0].prior_season).toBe(2025);
    expect(stored[0].prior_season_league_mean).toBe((44 + 47 + 23) / 3);
  });

  it("grading attaches final totals as separate outcome events and never rewrites a prediction row", () => {
    const root = join(tmp, "shadow"); writeSeason(tmp, 2025, [[20, 24], [30, 17]]); writeSeason(tmp, 2026, [[1, 2]]);
    frozenRun(root, tmp, tmp);
    const path = shadowPredictionPath(root, 2026, 3, "prospective"); const h1 = sha(path);
    const gameId = readShadowRows(root, 2026)[0].game_id;
    mkdirSync(join(tmp, "2026"), { recursive: true });
    writeFileSync(join(tmp, "2026", "results.json"), JSON.stringify({ results: [{ gameId, week: 3, seasonType: "REG", final: true, homeScore: 27, awayScore: 20 }] }));
    const g1 = gradeShadowOutcomes({ root, season: 2026, now: "2026-09-29T12:00:00.000Z", resultsRoot: tmp });
    expect(g1.appended).toBe(1);
    expect(sha(path)).toBe(h1);
    const outcomes = readShadowOutcomes(root, 2026);
    expect(outcomes).toHaveLength(1); expect(outcomes[0]).toMatchObject({ game_id: gameId, final_total: 47, home_score: 27, away_score: 20 });
    expect(gradeShadowOutcomes({ root, season: 2026, now: "2026-09-30T12:00:00.000Z", resultsRoot: tmp }).appended).toBe(0);
    expect(sha(path)).toBe(h1);
  });

  it("a different raw production total is a new frozen snapshot; the earlier row is preserved", () => {
    const root = join(tmp, "shadow"); writeSeason(tmp, 2025, [[20, 24], [30, 17]]);
    const fx = productionFixture(); const mean = loadPriorSeasonLeagueMean(2026, tmp);
    const [row1] = buildShadowRows({ season: 2026, generatedAt: fx.generatedAt, createdAt: fx.generatedAt, runId: "r1", codeRevision: null, productionRecords: fx.records, slate: fx.slate, leagueMean: mean, marketHistoryRoot: tmp });
    archiveShadowRows(root, [row1]);
    const later = new Date(Date.parse(fx.generatedAt) + 3600_000).toISOString();
    const row2 = { ...row1, shadow_id: "shadow_other", raw_jkb_total: row1.raw_jkb_total + 1, shadow_total: computeShadowTotal(row1.raw_jkb_total + 1, mean.mean_total_points), generated_at: later };
    archiveShadowRows(root, [row2]);
    const stored = readShadowRows(root, 2026);
    expect(stored.map((r) => r.raw_jkb_total)).toEqual([row1.raw_jkb_total, row1.raw_jkb_total + 1]);
  });

  it("the frozen configuration cannot drift: a manifest with a different k blocks any further write", () => {
    const root = join(tmp, "shadow");
    const m = ensureShadowManifest(root, "2026-09-24T21:00:00.000Z", "abc");
    expect(m.k).toBe(0.8);
    const path = join(root, "manifest.json");
    writeFileSync(path, JSON.stringify({ ...m, k: 0.7 }));
    expect(() => ensureShadowManifest(root, "2026-09-25T00:00:00.000Z", "def")).toThrow(/frozen/);
  });
});
