/** Offline Phase D1 early-season baseline research. Writes non-production artifacts only. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FANTASY_RANKING_ROWS_2026 } from "../src/data/fantasyRankings2026.ts";
import type { FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import type { PregameFeatureSnapshot } from "../src/lib/fantasy/weekly/backtest/features.ts";
import { evaluateRankingMetrics, spearmanRankCorrelation, type ScoredPlayerWeek } from "../src/lib/fantasy/weekly/backtest/metrics.ts";
import { scoreDirectBenchmark } from "../src/lib/fantasy/weekly/backtest/models.ts";
import {
  assertHistoricalCutoffs,
  historicalTransitionScore,
  PHASE_D1_PREREGISTRATION,
  PHASE_D1_SCHEMA_VERSION,
  selectSharedHistoryThreshold,
} from "../src/lib/fantasy/weekly/backtest/phaseD1.ts";
import { summarizeRankTransition } from "../src/lib/fantasy/weekly/baseline.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = join(ROOT, "data", "fantasy", "backtests", "phase-d1");
const FEATURE_PATH = join(ROOT, "data", "fantasy", "backtests", "weekly-feature-dataset-v1.json");
const PAR_PATH = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
const ACTUAL_PATH = join(ROOT, "data", "fantasy", "2025-par-actual.json");
const LEGACY_PATH = join(ROOT, "src", "data", "fantasyRankings2026.ts");
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE"];
const TOP_K: Record<FantasyPosition, number[]> = { QB: [12], RB: [12, 24], WR: [24, 36], TE: [12] };

type ParRow = {
  Player: string;
  Position: string;
  "2026 Projected PPG": number;
  "Historical Replacement PPG": number;
  "PAR/G": number;
  "Source ID": string;
  "Consensus Position Rank": number;
};

function args() {
  const result = { generatedAt: new Date().toISOString() };
  for (const value of process.argv.slice(2)) {
    if (value.startsWith("--generated-at=")) result.generatedAt = value.slice(15);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (Number.isNaN(Date.parse(result.generatedAt))) throw new Error("--generated-at must be ISO");
  return result;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(name: string, value: unknown) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, name);
  const temporary = `${path}.tmp`;
  const body = `${JSON.stringify(JSON.parse(stable(value)), null, 2)}\n`;
  writeFileSync(temporary, body);
  renameSync(temporary, path);
  return { file: name, sha256: sha(body), bytes: Buffer.byteLength(body) };
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(jr|sr|ii|iii|iv)$/, "");
}

function scored(rows: readonly PregameFeatureSnapshot[], scorer: (row: PregameFeatureSnapshot) => number | null): ScoredPlayerWeek[] {
  return rows.map((row) => ({ season: row.season, week: row.week, position: row.position, playerId: row.playerId, actualFantasyPoints: row.actualFantasyPoints, score: scorer(row) }));
}

function metrics(rows: readonly PregameFeatureSnapshot[], scorer: (row: PregameFeatureSnapshot) => number | null, position: FantasyPosition) {
  return Object.fromEntries(TOP_K[position].map((topK) => [`top${topK}`, evaluateRankingMetrics(scored(rows, scorer), topK)]));
}

function segments(rows: readonly PregameFeatureSnapshot[]) {
  return {
    week1: rows.filter((row) => row.week === 1),
    weeks2To4: rows.filter((row) => row.week >= 2 && row.week <= 4),
    weeks5Plus: rows.filter((row) => row.week >= 5),
    all: rows,
  };
}

function rankMap<T>(rows: readonly T[], value: (row: T) => number, id: (row: T) => string) {
  return new Map([...rows].sort((a, b) => value(b) - value(a) || id(a).localeCompare(id(b))).map((row, index) => [id(row), index + 1]));
}

function transitionMovement(rows: readonly PregameFeatureSnapshot[], threshold: number, position: FantasyPosition) {
  const eligible = rows.filter((row) => row.position === position && row.baseline.rollingPpg.priorGames === threshold && row.baseline.priorSeasonPpg != null && row.baseline.rollingPpg.seasonToDate != null);
  const groups = new Map<string, PregameFeatureSnapshot[]>();
  for (const row of eligible) {
    const key = `${row.season}|${row.week}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const movements: Array<{ playerId: string; playerName: string; season: number; week: number; priorRank: number; currentRank: number; actualRank: number; movement: number; outcome: "beneficial" | "harmful" | "neutral" }> = [];
  for (const group of groups.values()) {
    const prior = rankMap(group, (row) => row.baseline.priorSeasonPpg!, (row) => row.playerId);
    const current = rankMap(group, (row) => row.baseline.rollingPpg.seasonToDate!, (row) => row.playerId);
    const actual = rankMap(group, (row) => row.actualFantasyPoints, (row) => row.playerId);
    for (const row of group) {
      const priorRank = prior.get(row.playerId)!;
      const currentRank = current.get(row.playerId)!;
      const actualRank = actual.get(row.playerId)!;
      const priorError = Math.abs(priorRank - actualRank);
      const currentError = Math.abs(currentRank - actualRank);
      movements.push({
        playerId: row.playerId, playerName: row.playerName, season: row.season, week: row.week,
        priorRank, currentRank, actualRank, movement: Math.abs(currentRank - priorRank),
        outcome: currentError < priorError ? "beneficial" : currentError > priorError ? "harmful" : "neutral",
      });
    }
  }
  return {
    ...summarizeRankTransition(movements),
    beneficial: movements.filter((row) => row.outcome === "beneficial").length,
    harmful: movements.filter((row) => row.outcome === "harmful").length,
    neutral: movements.filter((row) => row.outcome === "neutral").length,
    largestMoves: [...movements].sort((a, b) => b.movement - a.movement || a.playerId.localeCompare(b.playerId)).slice(0, 20),
  };
}

function sourceInventory(generatedAt: string, par: readonly ParRow[]) {
  const hashFile = (path: string) => sha(readFileSync(path));
  return {
    schemaVersion: PHASE_D1_SCHEMA_VERSION,
    generatedAt,
    sources: [
      { source: "2026 PAR consensus", path: "data/fantasy/2026-par-consensus.json", positions: POSITIONS, preseasonAvailability: "committed before 2026 Week 1", historicalReconstructability: "2026 only", provenance: "FantasyPros-derived consensus projections with source-implied scoring, stable Source ID, and committed git history", sha256: hashFile(PAR_PATH), suitability: "canonical 2026 preseason/ROS prior" },
      { source: "PAR/G", path: "data/fantasy/2026-par-consensus.json", positions: POSITIONS, preseasonAvailability: "same board as projected PPG", historicalReconstructability: "2026 only", provenance: "projected PPG less one constant historical replacement PPG per position", sha256: hashFile(PAR_PATH), suitability: "equivalent ordering; projected PPG is the simpler canonical representation" },
      { source: "JKB/legacy rankings", path: "src/data/fantasyRankings2026.ts", positions: POSITIONS, preseasonAvailability: "committed before 2026 Week 1", historicalReconstructability: "2026 workbook export only", provenance: "verbatim export from Fantasy_Football_Rankings_V2_Complete (1).xlsx; source workbook path documented by exporter", sha256: hashFile(LEGACY_PATH), suitability: "documented benchmark; no stable Source ID on every row, so not selected as authority" },
      { source: "2025 actual PPG/PAR", path: "data/fantasy/2025-par-actual.json", positions: POSITIONS, preseasonAvailability: "available before 2026 only", historicalReconstructability: "actual completed-season result", provenance: "2025 actual full-PPR/PAR artifact", sha256: hashFile(ACTUAL_PATH), suitability: "fallback/proxy for veterans only; never a rookie penalty or preseason projection" },
      { source: "current-season player strength", path: "data/fantasy/backtests/weekly-feature-dataset-v1.json", positions: POSITIONS, preseasonAvailability: "only after a player records current-season games", historicalReconstructability: "2023-2025 leakage-safe prior-week snapshots", provenance: "Phase B player-week feature dataset; target week excluded", sha256: hashFile(FEATURE_PATH), suitability: "validated established in-season authority" },
      { source: "fixed 16-0 FPA", path: "src/features/sixteen-zero/engine/matchupAdjustment.ts", positions: POSITIONS, preseasonAvailability: "implementation exists, but current FPA requires games", historicalReconstructability: "benchmark through Phase B/C features", provenance: "existing fixed matchup multiplier", suitability: "benchmark only; not player-strength or Week 1 authority" },
      { source: "preseason sportsbook/prop ranking", path: null, positions: [], preseasonAvailability: "not committed", historicalReconstructability: "none", provenance: "repository and git-history inventory", suitability: "unavailable" },
    ],
    coverage2026: Object.fromEntries(POSITIONS.map((position) => [position, par.filter((row) => row.Position === position).length])),
  };
}

function main() {
  const { generatedAt } = args();
  const dataset = JSON.parse(readFileSync(FEATURE_PATH, "utf8")) as { rows: PregameFeatureSnapshot[]; _meta?: unknown };
  const rows = dataset.rows;
  const par = JSON.parse(readFileSync(PAR_PATH, "utf8")) as ParRow[];
  const actual2025 = JSON.parse(readFileSync(ACTUAL_PATH, "utf8")) as Array<{ Position: string; "Source ID": string; "2025 Games Played": number | null }>;
  assertHistoricalCutoffs(rows);
  const selection = selectSharedHistoryThreshold(rows.filter((row) => row.season === 2024));
  const threshold = selection.selectedThreshold;

  const parEquivalence = Object.fromEntries(POSITIONS.map((position) => {
    const positionRows = par.filter((row) => row.Position === position);
    const ppg = [...positionRows].sort((a, b) => b["2026 Projected PPG"] - a["2026 Projected PPG"]).map((row) => row["Source ID"]);
    const parOrder = [...positionRows].sort((a, b) => b["PAR/G"] - a["PAR/G"]).map((row) => row["Source ID"]);
    return [position, { rows: positionRows.length, identicalOrder: ppg.every((id, index) => id === parOrder[index]), replacementPpgValues: [...new Set(positionRows.map((row) => row["Historical Replacement PPG"]))] }];
  }));
  const legacyComparison = Object.fromEntries(POSITIONS.map((position) => {
    const legacy = FANTASY_RANKING_ROWS_2026.filter((row) => row.position === position);
    const legacyByName = new Map(legacy.map((row) => [normalizeName(row.player), row.positionRank]));
    const matched = par.filter((row) => row.Position === position).flatMap((row) => {
      const legacyRank = legacyByName.get(normalizeName(row.Player));
      return legacyRank == null ? [] : [{ parRank: row["Consensus Position Rank"], legacyRank }];
    });
    return [position, { parRows: par.filter((row) => row.Position === position).length, legacyRows: legacy.length, matchedRows: matched.length, rankCorrelation: spearmanRankCorrelation(matched.map((row) => -row.parRank), matched.map((row) => -row.legacyRank)) }];
  }));

  const transition = {
    selectionSeason: 2024,
    untouchedHoldout: 2025,
    selectedSharedThreshold: threshold,
    candidates: selection.candidates,
    results: Object.fromEntries(POSITIONS.map((position) => [position, Object.fromEntries([2023, 2024, 2025].map((season) => {
      const positionRows = rows.filter((row) => row.position === position && row.season === season);
      return [season, Object.fromEntries(Object.entries(segments(positionRows)).map(([name, subset]) => [name, {
        transition: metrics(subset, (row) => historicalTransitionScore(row, threshold).score, position),
        priorProxy: metrics(subset, (row) => row.baseline.priorSeasonPpg, position),
        currentSeason: metrics(subset, (row) => row.baseline.rollingPpg.seasonToDate, position),
        fixed16ZeroBenchmark: metrics(subset, (row) => scoreDirectBenchmark("baseline-b-16-0", row), position),
      }]))];
    }))])),
  };

  const priorIds = new Set(actual2025.filter((row) => (row["2025 Games Played"] ?? 0) > 0).map((row) => `${row.Position}|${row["Source ID"]}`));
  const noPrior2026 = par.filter((row) => POSITIONS.includes(row.Position as FantasyPosition) && !priorIds.has(`${row.Position}|${row["Source ID"]}`));
  const noHistory = Object.fromEntries(POSITIONS.map((position) => [position, {
    productionPriorRows: par.filter((row) => row.Position === position).length,
    rowsWithout2025ActualProxy: noPrior2026.filter((row) => row.Position === position).length,
    rowsWithout2025ActualStillCoveredByProductionPrior: noPrior2026.filter((row) => row.Position === position).length,
    policy: "use preseason ROS; absence from prior-season actuals does not lower score or confidence",
  }]));

  const movement = Object.fromEntries(POSITIONS.map((position) => [position, {
    validation2024: transitionMovement(rows.filter((row) => row.season === 2024), threshold, position),
    holdout2025: transitionMovement(rows.filter((row) => row.season === 2025), threshold, position),
  }]));
  const benchmarkCases = {
    definitions: ["elite veteran Week 1", "rookie/no prior NFL history Week 1", "veteran missing prior-season row", "one prior current-season game", "two prior games", "three-plus prior games", "early injury return", "team change", "missing preseason prior", "current-season breakout"],
    historicalCounts: Object.fromEntries(POSITIONS.map((position) => [position, {
      zeroHistory: rows.filter((row) => row.position === position && row.baseline.rollingPpg.priorGames === 0).length,
      oneGame: rows.filter((row) => row.position === position && row.baseline.rollingPpg.priorGames === 1).length,
      twoGames: rows.filter((row) => row.position === position && row.baseline.rollingPpg.priorGames === 2).length,
      threePlus: rows.filter((row) => row.position === position && row.baseline.rollingPpg.priorGames >= 3).length,
      missingPriorProxy: rows.filter((row) => row.position === position && row.baseline.priorSeasonPpg == null).length,
      missedGames: rows.filter((row) => row.position === position && row.week > row.baseline.rollingPpg.priorGames + 1).length,
    }])),
    fixtureUse: "invariant coverage only; fixtures do not select or tune the threshold",
  };

  const files = [];
  files.push(writeJson("phase-d1-preregistration-v1.json", PHASE_D1_PREREGISTRATION));
  files.push(writeJson("phase-d1-source-inventory-v1.json", sourceInventory(generatedAt, par)));
  files.push(writeJson("phase-d1-historical-availability-v1.json", {
    schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt,
    truePreseasonSnapshots: { 2023: false, 2024: false, 2025: false },
    evidence: "No timestamped/versioned 2023-2025 player preseason projections were found in the working tree or git file history.",
    prohibitedInference: "End-of-season or current 2026 projections are not backcast as historical preseason knowledge.",
    proxy: { source: "prior-season actual full-PPR PPG from leakage-safe feature rows", usableSeasons: [2024, 2025], unavailableForFoundation2023: true, limitations: ["excludes rookies and players without prior-season games", "measures a fallback prior, not preseason forecast quality"] },
  }));
  files.push(writeJson("phase-d1-candidate-comparison-v1.json", { schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt, parProjectedPpgEquivalence: parEquivalence, jkbLegacyComparison: legacyComparison, canonicalChoice: "2026 Projected PPG", reason: "same ordering as PAR/G, directly interpretable, stable Source ID, and no replacement-baseline transformation required" }));
  files.push(writeJson("phase-d1-transition-results-v1.json", { schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt, ...transition }));
  files.push(writeJson("phase-d1-transition-stability-v1.json", { schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt, selectedSharedThreshold: threshold, movement }));
  files.push(writeJson("phase-d1-early-season-benchmarks-v1.json", { schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt, noHistory, ...benchmarkCases }));
  files.push(writeJson("phase-d1-recommendation-v1.json", {
    schemaVersion: PHASE_D1_SCHEMA_VERSION, generatedAt, selectedSharedThreshold: threshold,
    productionPolicy: Object.fromEntries(POSITIONS.map((position) => [position, { zeroToPriorGames: `preseason ROS until ${threshold} actual prior current-season games`, established: `current-season PPG at ${threshold}+ actual prior games`, missingPreseason: "qualified current-season if available; otherwise deterministic fallback or unranked", weeklyAdjustment: "none" }])),
    confidence: { high: `current-season authority with ${threshold}+ prior player games and resolved identity/availability`, medium: "current and complete preseason ROS authority with fewer than threshold prior player games", low: "historical/stale fallback or missing supporting authority; confidence never changes score" },
    eligibility: { bye: "ineligible", outOrReserve: "ineligible", unresolvedIdentity: "unranked", questionableOrDoubtful: "no subjective numeric downgrade", missingAvailability: "confidence impact only" },
    researchModels: { QB: "Phase C usage remains research-only", WR: "Phase C usage remains research-only", RB: "baseline-only", TE: "baseline-only" },
    d2Readiness: Object.fromEntries(POSITIONS.map((position) => [position, { ready: true, condition: "D2 must consume WeeklyFantasyBaseline and keep eligibility separate; live preseason source freshness/availability still requires operational validation" }])),
  }));
  files.push(writeJson("phase-d1-manifest-v1.json", { schemaVersion: "weekly-fantasy-phase-d1-manifest-v1", generatedAt, artifacts: files, inputs: [{ path: "data/fantasy/backtests/weekly-feature-dataset-v1.json", sha256: sha(readFileSync(FEATURE_PATH)) }, { path: "data/fantasy/2026-par-consensus.json", sha256: sha(readFileSync(PAR_PATH)) }, { path: "data/fantasy/2025-par-actual.json", sha256: sha(readFileSync(ACTUAL_PATH)) }, { path: "src/data/fantasyRankings2026.ts", sha256: sha(readFileSync(LEGACY_PATH)) }] }));
  console.log(JSON.stringify({ outputDirectory: OUTPUT_DIR, selectedSharedThreshold: threshold, artifacts: files.length }, null, 2));
}

main();
