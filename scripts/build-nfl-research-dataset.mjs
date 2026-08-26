/**
 * Phase 11A: attempts to build the leakage-safe JKB-vs-sportsbook research
 * dataset from whatever real data currently exists. This is NOT a
 * synthetic/demo run -- it reads the actual Phase 10B/10C live-paper-trading
 * market archive, the actual current-week projection artifact (if one has
 * been generated), and the actual results feed, and reports exactly how
 * many rows are joinable and how many are graded (have a real actualYards).
 *
 * Historical provenance is intentionally unused: the Phase 11A historical
 * gate found zero usable 2023-2025 NFL yardage-prop rows in ParlayAPI's
 * archive (see the Phase 11A report). `historicalProviderArchive` rows are
 * therefore never produced by this script today -- only
 * `livePaperTradingArchive` rows are, joined from Phase 10B/10C's own
 * archive. No fabricated result is ever written.
 *
 * Never computes edge/EV/recommendations -- see nfl-research-join.mjs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildResearchRow, PROVENANCE } from "./lib/nfl-research-join.mjs";
import { parseArchiveJsonl } from "./lib/nfl-market-archive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARCHIVE_PATH = path.join(ROOT, "data/nfl/props/market-archive/nfl-yardage-market-archive.jsonl");
const GAMES_PATH = path.join(ROOT, "public/data/nfl/2026/games.json");
const RESULTS_PATH = path.join(ROOT, "public/data/nfl/2026/results.json");
const PROJECTIONS_PATH = path.join(ROOT, "public/data/nfl/2026/yardage-projections.json");
const OUTPUT_PATH = path.join(ROOT, "artifacts/nfl-research-dataset-2026.json");

const CANONICAL_TO_RESEARCH_MARKET = { passingYards: "passing", rushingYards: "rushing", receivingYards: "receiving" };

const READINESS_GATE_LINE_THRESHOLDS = { passing: 20, rushing: 40, receiving: 80 };
/** Operational recommendation, not a statistical minimum: enough GRADED (post-game) player-games per market to run the section-4/5/6 evaluations at all, roughly the line-volume gate sustained across a handful of completed weeks. */
const RECOMMENDED_GRADED_SAMPLE = { passing: 60, rushing: 120, receiving: 240 };

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function main() {
  const archiveRecords = existsSync(ARCHIVE_PATH) ? parseArchiveJsonl(readFileSync(ARCHIVE_PATH, "utf8")) : [];
  const games = loadJson(GAMES_PATH, { games: [] }).games ?? [];
  const results = loadJson(RESULTS_PATH, { results: [] }).results ?? [];
  const projectionsArtifact = loadJson(PROJECTIONS_PATH, null);
  const projectionRows = projectionsArtifact?.rows ?? [];

  const gameById = new Map(games.map((g) => [g.gameId, g]));
  const projectionByKey = new Map(projectionRows.map((r) => [`${r.playerId}|${r.market}|${r.week}`, r]));

  const rows = [];
  const rejections = [];

  for (const observation of archiveRecords) {
    const market = CANONICAL_TO_RESEARCH_MARKET[observation.canonicalMarket];
    if (!market) continue;
    const game = gameById.get(observation.gameId);
    if (!game) {
      rejections.push({ playerId: observation.playerId, market, reason: "game_not_found" });
      continue;
    }
    const projection = projectionByKey.get(`${observation.playerId}|${market}|${observation.week}`);
    if (!projection) {
      rejections.push({ playerId: observation.playerId, market, reason: "no_projection_artifact_row" });
      continue;
    }

    const { row, rejected } = buildResearchRow({
      provenance: PROVENANCE.LIVE_PAPER_TRADING,
      market,
      playerId: observation.playerId,
      playerName: observation.playerName,
      team: observation.team,
      opponent: observation.opponent,
      gameId: observation.gameId,
      season: game.season,
      week: observation.week,
      observedAt: observation.observedAt,
      commenceTime: game.dateUtc,
      bookmaker: observation.bookmaker,
      projectionYards: projection.projectedYards,
      matchupScore: projection.matchupScore,
      estimatedRange: projection.estimatedRange,
      historyStatus: projection.historyStatus,
      hardCaseFlags: projection.hardCaseFlags,
      roleSource: projection.roleSource,
      sportsbookLine: observation.point,
      overPrice: observation.overPrice,
      underPrice: observation.underPrice,
      actualYards: null, // no graded results source exists yet -- see report.
    });

    if (row) rows.push(row);
    else rejections.push({ playerId: observation.playerId, market, reason: rejected });
  }

  const byMarket = { passing: [], rushing: [], receiving: [] };
  for (const row of rows) byMarket[row.market].push(row);

  const canonicalLineCountsByMarket = archiveRecords.reduce(
    (acc, r) => {
      const m = CANONICAL_TO_RESEARCH_MARKET[r.canonicalMarket];
      if (m) acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    },
    { passing: 0, rushing: 0, receiving: 0 },
  );

  const report = {
    generatedAt: new Date().toISOString(),
    schemaVersion: "nfl-research-dataset-v1",
    inputs: {
      archiveRecordCount: archiveRecords.length,
      projectionArtifactFound: projectionsArtifact != null,
      projectionRowCount: projectionRows.length,
      completedGameCount: results.length,
    },
    joinedRowCountByMarket: { passing: byMarket.passing.length, rushing: byMarket.rushing.length, receiving: byMarket.receiving.length },
    gradedRowCountByMarket: {
      passing: byMarket.passing.filter((r) => r.actualYards != null).length,
      rushing: byMarket.rushing.filter((r) => r.actualYards != null).length,
      receiving: byMarket.receiving.filter((r) => r.actualYards != null).length,
    },
    rejections,
    liveSampleNeeded: {
      note: "Operational recommendation, not a statistical minimum -- see Phase 11A report.",
      lineVolumeGate: READINESS_GATE_LINE_THRESHOLDS,
      currentCanonicalLineCounts: canonicalLineCountsByMarket,
      recommendedGradedSampleForEvaluation: RECOMMENDED_GRADED_SAMPLE,
      currentGradedSample: {
        passing: byMarket.passing.filter((r) => r.actualYards != null).length,
        rushing: byMarket.rushing.filter((r) => r.actualYards != null).length,
        receiving: byMarket.receiving.filter((r) => r.actualYards != null).length,
      },
    },
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify({ ...report, rows }, null, 2), "utf8");

  console.log(`Archive observations: ${archiveRecords.length}`);
  console.log(`Projection artifact found: ${report.inputs.projectionArtifactFound} (${projectionRows.length} rows)`);
  console.log(`Completed games (results.json): ${results.length}`);
  console.log(`Joined rows by market: passing=${report.joinedRowCountByMarket.passing} rushing=${report.joinedRowCountByMarket.rushing} receiving=${report.joinedRowCountByMarket.receiving}`);
  console.log(`Graded rows by market: passing=${report.gradedRowCountByMarket.passing} rushing=${report.gradedRowCountByMarket.rushing} receiving=${report.gradedRowCountByMarket.receiving}`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
