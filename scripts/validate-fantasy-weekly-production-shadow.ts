/** Replays the frozen D1 transition through the D2 production authority without fitting or tuning. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import type { PregameFeatureSnapshot } from "../src/lib/fantasy/weekly/backtest/features.ts";
import { historicalTransitionScore } from "../src/lib/fantasy/weekly/backtest/phaseD1.ts";
import { buildWeeklyFantasyRankingArtifact, type ProductionRankingCandidate } from "../src/lib/fantasy/weekly/productionAuthority.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "data", "fantasy", "backtests", "weekly-feature-dataset-v1.json");
const OUTPUT = join(ROOT, "data", "fantasy", "backtests", "phase-d2", "production-shadow-parity-v1.json");
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE"];
const HASH = "c".repeat(64);

function generatedAt() {
  const raw = process.argv.find((value) => value.startsWith("--generated-at="))?.slice(15) ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(raw))) throw new Error("--generated-at must be ISO");
  return raw;
}

function source(rank: number, value: number, name: string) {
  return { rank, projectedPpg: value, source: name, sourceVersion: "D1-shadow-v1", sourceHash: HASH, inputAsOf: "2026-08-20T00:00:00.000Z" };
}

function candidate(row: PregameFeatureSnapshot, rank: number): ProductionRankingCandidate {
  const prior = row.baseline.priorSeasonPpg;
  const current = row.baseline.rollingPpg.seasonToDate;
  return {
    playerKey: row.playerId,
    identity: { resolved: true, playerId: row.playerId, playerName: row.playerName, position: row.position },
    team: row.team, opponent: row.opponent, homeAway: "home",
    availability: { status: "active", practiceStatus: null, sourceSeason: row.season, sourceWeek: row.week, sourceAsOf: "2026-08-20T00:00:00.000Z", isStale: false, staleReasons: [] },
    historyGames: row.baseline.rollingPpg.priorGames,
    preseasonRos: prior == null ? null : source(rank, prior, "D1-prior-season-proxy"),
    currentSeason: current == null ? null : source(rank, current, "D1-current-season"),
    historicalFallback: null,
    context: { matchupGrade: null, fpaRank: null, fantasyPointsAllowed: null, marketTotal: null, impliedTeamTotal: null, teamEnvironment: {} },
  };
}

function main() {
  const timestamp = generatedAt();
  const rows = (JSON.parse(readFileSync(INPUT, "utf8")) as { rows: PregameFeatureSnapshot[] }).rows.filter((row) => row.season === 2024 || row.season === 2025);
  const groups = [];
  let comparedRows = 0;
  for (const season of [2024, 2025]) for (let week = 1; week <= 18; week += 1) for (const position of POSITIONS) {
    const group = rows.filter((row) => row.season === season && row.week === week && row.position === position);
    const reference = group.flatMap((row) => {
      const result = historicalTransitionScore(row, 2);
      return result.score == null ? [] : [{ playerId: row.playerId, score: result.score, authority: result.authority === "current-season" ? "current-season" : "preseason-ros" }];
    }).sort((left, right) => right.score - left.score || left.playerId.localeCompare(right.playerId));
    const artifact = buildWeeklyFantasyRankingArtifact({
      season, week, generatedAt: timestamp, inputAsOf: "2026-08-20T00:00:00.000Z",
      candidates: group.map((row, index) => candidate(row, index + 1)),
      provenance: [{ source: "D1-shadow", sourceVersion: "v1", sourceHash: HASH, inputAsOf: "2026-08-20T00:00:00.000Z" }],
    });
    const production = artifact.rankings[position];
    const mismatches = reference.flatMap((row, index) => {
      const actual = production[index];
      return actual?.playerId === row.playerId && actual.baselineValue === row.score && actual.baselineAuthority === row.authority
        ? [] : [{ index, reference: row, production: actual ? { playerId: actual.playerId, score: actual.baselineValue, authority: actual.baselineAuthority } : null }];
    });
    if (production.length !== reference.length) mismatches.push({ index: -1, reference: { playerId: `count:${reference.length}`, score: 0, authority: "preseason-ros" as const }, production: null });
    comparedRows += reference.length;
    groups.push({ season, week, position, referenceRows: reference.length, productionRows: production.length, mismatches: mismatches.length });
  }
  const mismatchGroups = groups.filter((group) => group.mismatches > 0);
  const report = {
    schemaVersion: "weekly-fantasy-production-shadow-parity-v1", generatedAt: timestamp,
    policy: "D1 threshold=2, no blending; 2024 validation and untouched 2025 holdout replayed without refit",
    seasons: [2024, 2025], groups: groups.length, comparedRows,
    mismatchGroups: mismatchGroups.length, mismatches: mismatchGroups.reduce((sum, group) => sum + group.mismatches, 0),
    parity: mismatchGroups.length === 0, groupResults: groups,
  };
  if (!report.parity) throw new Error(`D2 production authority diverged from D1 in ${report.mismatchGroups} groups.`);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  renameSync(temporary, OUTPUT);
  console.log(JSON.stringify({ output: OUTPUT, parity: report.parity, groups: report.groups, comparedRows: report.comparedRows }, null, 2));
}

main();
