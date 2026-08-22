/** Offline Phase B research generator. Experimental scores never enter public data. */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import { buildFeatureCoverage } from "../src/lib/fantasy/weekly/backtest/coverage.ts";
import type { BacktestFeatureKey } from "../src/lib/fantasy/weekly/backtest/featureRegistry.ts";
import { buildPregameFeatureDataset, type HistoricalTeamWeek } from "../src/lib/fantasy/weekly/backtest/features.ts";
import { runPositionBacktest } from "../src/lib/fantasy/weekly/backtest/models.ts";
import {
  buildHistoricalRankingUniverse,
  type HistoricalInjuryWeek,
  type HistoricalRosterWeek,
  type HistoricalScheduleTeamWeek,
} from "../src/lib/fantasy/weekly/backtest/universe.ts";
import {
  assertCutoffBeforeTarget,
  evaluateBacktestReadiness,
  PHASE_B_DATASET_VERSION,
  validateHistoricalOutcomeCoverage,
} from "../src/lib/fantasy/weekly/backtest/validation.ts";
import type { HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_DIR = join(ROOT, "data", "fantasy", "backtests");
const HISTORY_PATH = join(ROOT, "data", "fantasy", "weekly", "player-week-history-2023-2025.json");
const REQUIRED_SEASONS = [2023, 2024, 2025];
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE"];
const ALL_FEATURES: BacktestFeatureKey[] = [
  "priorSeasonPpg", "seasonToDatePpg", "last3Ppg", "last3SnapShare", "last3PassAttempts",
  "last3RushAttempts", "last3Targets", "last3TargetShare", "last3AirYardsShare",
  "priorSeasonFpaPerGame", "currentSeasonFpaPerGame", "offensiveEpaPerPlay",
  "passingEpaPerPlay", "rushingEpaPerPlay", "playsPerGame", "opponentEpaAllowedPerPlay",
  "teamImpliedTotal", "gameTotal",
];

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; retrievedDateUtc?: string; [key: string]: unknown };
type CacheManifest = { schemaVersion?: string; source?: string; files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function writeAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function readManifest(relativeDir: string): CacheManifest | null {
  const path = join(ROOT, relativeDir, "manifest.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as CacheManifest : null;
}

function manifestSeasons(relativeDir: string): number[] {
  return (readManifest(relativeDir)?.files ?? [])
    .map((entry) => entry.season)
    .filter((season): season is number => season != null)
    .sort((a, b) => a - b);
}

function verifiedRows(relativeDir: string, season: number, requiredHeaders: readonly string[]): { rows: CsvRow[]; entry: CacheEntry } {
  const manifest = readManifest(relativeDir);
  const entry = manifest?.files?.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`${relativeDir}: missing ${season} manifest entry`);
  const path = join(ROOT, relativeDir, entry.filename);
  if (!existsSync(path)) throw new Error(`${relativeDir}: manifest file ${entry.filename} is missing`);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text, { requiredHeaders: [...requiredHeaders] });
  if (problems.length) throw new Error(`${relativeDir} ${season}: ${problems.join("; ")}`);
  return { rows: parseCsv(text) as CsvRow[], entry };
}

function numberField(row: CsvRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key} in historical source.`);
  return value;
}

function availablePositionCoverage(
  relativeDir: string,
  seasons: readonly number[],
  idField: string,
): Array<{ season: number; week: number; position: FantasyPosition; rows: number; players: number }> {
  return seasons.flatMap((season) => {
    const source = verifiedRows(relativeDir, season, ["season", "week", "position", idField]);
    const rows = source.rows.filter((row) =>
      (!row.season_type || row.season_type.toUpperCase() === "REG") &&
      (!row.game_type || row.game_type.toUpperCase() === "REG")
    );
    return [...new Set(rows.map((row) => numberField(row, "week")))].sort((a, b) => a - b).flatMap((week) =>
      POSITIONS.map((position) => {
        const matching = rows.filter((row) => numberField(row, "week") === week && row.position.toUpperCase() === position);
        return { season, week, position, rows: matching.length, players: new Set(matching.map((row) => row[idField]).filter(Boolean)).size };
      })
    );
  });
}

function practiceStatus(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "NOTE") return null;
  if (normalized === "DID NOT PARTICIPATE IN PRACTICE") return "DID_NOT_PARTICIPATE";
  if (normalized === "LIMITED PARTICIPATION IN PRACTICE") return "LIMITED";
  if (normalized === "FULL PARTICIPATION IN PRACTICE") return "FULL";
  throw new Error(`Unknown historical practice status: ${value}`);
}

function loadResearchInputs() {
  const rosters: HistoricalRosterWeek[] = [];
  const injuries: HistoricalInjuryWeek[] = [];
  const schedule: HistoricalScheduleTeamWeek[] = [];
  const teamHistory: HistoricalTeamWeek[] = [];
  const sourceFiles: unknown[] = [];
  for (const season of REQUIRED_SEASONS) {
    const roster = verifiedRows("data/nfl/nflverse/weekly-rosters", season, [
      "season", "week", "team", "gsis_id", "full_name", "position", "status",
    ]);
    const injury = verifiedRows("data/nfl/nflverse/injuries", season, [
      "season", "week", "gsis_id", "report_status", "practice_status",
    ]);
    const teamStats = verifiedRows("data/nfl/nflverse/stats-team-week", season, [
      "season", "week", "team", "opponent_team", "season_type",
    ]);
    const epa = verifiedRows("data/nfl/nflverse/epa-team-game", season, [
      "season", "week", "team", "opponent", "off_epa", "off_plays", "pass_epa", "pass_plays", "rush_epa", "rush_plays",
    ]);
    rosters.push(...roster.rows.filter((row) => row.game_type.toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), team: row.team,
      gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, espnId: row.espn_id || null,
      playerName: row.full_name, position: row.position, rosterStatus: row.status || null,
    })));
    injuries.push(...injury.rows.filter((row) => String(row.season_type || row.game_type).toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), gsisId: row.gsis_id,
      reportStatus: row.report_status || null, practiceStatus: practiceStatus(row.practice_status),
    })));
    schedule.push(...teamStats.rows.filter((row) => row.season_type.toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), team: row.team, opponent: row.opponent_team,
    })));
    teamHistory.push(...epa.rows.map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), team: row.team,
      opponent: row.opponent, offensiveEpa: numberField(row, "off_epa"), offensivePlays: numberField(row, "off_plays"),
      passingEpa: numberField(row, "pass_epa"), passingPlays: numberField(row, "pass_plays"),
      rushingEpa: numberField(row, "rush_epa"), rushingPlays: numberField(row, "rush_plays"),
    })));
    sourceFiles.push({ season, roster: roster.entry, injury: injury.entry, teamStats: teamStats.entry, epa: epa.entry });
  }
  return { rosters, injuries, schedule, teamHistory, sourceFiles };
}

function main() {
  const { generatedAt } = parseArgs(process.argv);
  const marketPath = join(ROOT, "public", "data", "nfl", "matchup-market.json");
  const market = existsSync(marketPath)
    ? JSON.parse(readFileSync(marketPath, "utf8")) as { provenance?: { seasonsParsed?: number[]; perRowTimestampAvailable?: boolean } }
    : null;
  const sources = {
    playerStatsSeasons: manifestSeasons("data/nfl/nflverse/stats-player-week"),
    weeklyRosterSeasons: manifestSeasons("data/nfl/nflverse/weekly-rosters"),
    injurySeasons: manifestSeasons("data/nfl/nflverse/injuries"),
    snapCountSeasons: manifestSeasons("data/nfl/nflverse/snap-counts"),
    teamStatsSeasons: manifestSeasons("data/nfl/nflverse/stats-team-week"),
    teamEpaSeasons: manifestSeasons("data/nfl/nflverse/epa-team-game"),
    marketSeasons: market?.provenance?.seasonsParsed ?? [],
    marketPregameTimestampVerified: market?.provenance?.perRowTimestampAvailable === true,
  };
  const readiness = evaluateBacktestReadiness(sources);
  const sourceCoverage = {
    playerStats: availablePositionCoverage("data/nfl/nflverse/stats-player-week", sources.playerStatsSeasons, "player_id"),
    weeklyRosters: availablePositionCoverage("data/nfl/nflverse/weekly-rosters", sources.weeklyRosterSeasons.filter((season) => REQUIRED_SEASONS.includes(season)), "gsis_id"),
    injuries: availablePositionCoverage("data/nfl/nflverse/injuries", sources.injurySeasons.filter((season) => REQUIRED_SEASONS.includes(season)), "gsis_id"),
    snapCounts: availablePositionCoverage("data/nfl/nflverse/snap-counts", sources.snapCountSeasons.filter((season) => REQUIRED_SEASONS.includes(season)), "pfr_player_id"),
  };
  const readinessArtifact = {
    _meta: {
      schemaVersion: "weekly-fantasy-phase-b-readiness-v1", generatedAt,
      source: "local cache manifests; source files are hash-verified before model generation",
    },
    status: readiness.readyForPrimaryBacktest && existsSync(HISTORY_PATH) ? "ready" : "blocked",
    sources,
    sourceCoverage,
    sourceManifests: {
      playerStats: readManifest("data/nfl/nflverse/stats-player-week"),
      weeklyRosters: readManifest("data/nfl/nflverse/weekly-rosters"),
      injuries: readManifest("data/nfl/nflverse/injuries"),
      snapCounts: readManifest("data/nfl/nflverse/snap-counts"),
      teamStats: readManifest("data/nfl/nflverse/stats-team-week"),
      teamEpa: readManifest("data/nfl/nflverse/epa-team-game"),
      market: market?.provenance ?? null,
    },
    readiness,
    historyArtifactPresent: existsSync(HISTORY_PATH),
    primaryMarketPolicy: "Excluded unless a per-row timestamp proves the line was captured before kickoff.",
    commands: [
      "npm run fantasy:player-week-cache -- --seasons=2023,2024,2025",
      "npm run nfl:injury-cache -- --seasons=2023,2024,2025",
      "npm run fantasy:player-week-history -- --generated-at=<ISO_TIMESTAMP>",
      "npm run fantasy:weekly-backtest -- --generated-at=<SAME_ISO_TIMESTAMP>",
    ],
  };
  writeAtomic(join(RESEARCH_DIR, "phase-b-readiness.json"), readinessArtifact);
  if (readinessArtifact.status !== "ready") {
    console.error(`[fantasy:weekly-backtest] blocked: ${[...readiness.missing, ...(!existsSync(HISTORY_PATH) ? ["history-artifact"] : [])].join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const historyArtifact = JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as {
    _meta: { scoringVersion: string; scoringAudit: unknown; sourceFiles: unknown };
    rows: HistoricalPlayerWeek[];
  };
  if (historyArtifact._meta.scoringVersion !== FANTASY_SCORING_VERSION) {
    throw new Error(`History scoring version ${historyArtifact._meta.scoringVersion} is not ${FANTASY_SCORING_VERSION}.`);
  }
  const inputs = loadResearchInputs();
  const universe = buildHistoricalRankingUniverse({
    outcomes: historyArtifact.rows, rosters: inputs.rosters, injuries: inputs.injuries, schedule: inputs.schedule,
  });
  const outcomeCoverage = validateHistoricalOutcomeCoverage(universe.rows);
  if (!outcomeCoverage.complete) throw new Error(outcomeCoverage.errors.slice(0, 20).join("; "));
  const features = buildPregameFeatureDataset(universe.rows, { teamHistory: inputs.teamHistory });
  for (const row of features) assertCutoffBeforeTarget(row);
  const coverage = buildFeatureCoverage(features, ALL_FEATURES);
  const results = POSITIONS.flatMap((position) => runPositionBacktest(features, position, { includeMarket: false }));
  const comparisonSummary = POSITIONS.flatMap((position) => {
    const positionResults = results.filter((row) => row.position === position);
    const baseline = positionResults.find((row) => row.family === "baseline-a")!;
    const fixedFpa = positionResults.find((row) => row.family === "baseline-b-16-0")!;
    return positionResults.map((row) => ({
      position,
      family: row.family,
      holdoutSpearman: row.holdout.spearman,
      spearmanDeltaVsBaseline: row.holdout.spearman == null || baseline.holdout.spearman == null
        ? null : row.holdout.spearman - baseline.holdout.spearman,
      spearmanDeltaVsFixedFpa: row.holdout.spearman == null || fixedFpa.holdout.spearman == null
        ? null : row.holdout.spearman - fixedFpa.holdout.spearman,
      holdoutCoverage: row.holdout.coverage,
      earlySpearman: row.holdoutEarly.spearman,
      lateSpearman: row.holdoutLate.spearman,
    }));
  });

  writeAtomic(join(RESEARCH_DIR, "weekly-feature-dataset-v1.json"), {
    _meta: {
      schemaVersion: PHASE_B_DATASET_VERSION, generatedAt, scoringVersion: FANTASY_SCORING_VERSION,
      selectionUniverse: "ACT weekly roster rows excluding reported OUT/reserve/bye before outcome join",
      marketIncluded: false,
      sourceFiles: inputs.sourceFiles,
      outcomeSourceFiles: historyArtifact._meta.sourceFiles,
      leakagePolicy: "Every rolling feature cutoff is strictly earlier than its target player-week.",
    },
    universeAudit: universe.audit,
    outcomeCoverage: outcomeCoverage.coverage,
    rows: features,
  });
  writeAtomic(join(RESEARCH_DIR, "feature-coverage-v1.json"), {
    _meta: { schemaVersion: "weekly-backtest-feature-coverage-v1", generatedAt }, rows: coverage,
  });
  writeAtomic(join(RESEARCH_DIR, "leakage-audit-v1.json"), {
    _meta: { schemaVersion: "weekly-backtest-leakage-audit-v1", generatedAt },
    rowsAudited: features.length,
    violations: 0,
    rule: "Every player, matchup, and team cutoff must be strictly earlier than its target player-week; market rows require a verified pre-kickoff timestamp.",
  });
  writeAtomic(join(RESEARCH_DIR, "model-comparison-v1.json"), {
    _meta: {
      schemaVersion: "weekly-backtest-model-comparison-v1", generatedAt,
      split: { training: 2023, validation: 2024, holdout: 2025 },
      target: "ordinal weekly ranking; internal regression output is not a published fantasy-points projection",
      marketExcluded: true,
    },
    scoringAudit: historyArtifact._meta.scoringAudit,
    results,
    comparisonSummary,
  });
  console.log(`[fantasy:weekly-backtest] generated ${features.length} leakage-audited feature rows and ${results.length} comparisons`);
}

main();
