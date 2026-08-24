import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { weekBatchesFromGames } from "../src/lib/cfb/research/ingestion/fetchPlays";
import { normalizeResearchGames } from "../src/lib/cfb/research/normalize/normalizeGames";
import { normalizeResearchPlays } from "../src/lib/cfb/research/normalize/normalizePlays";
import {
  auditPlayTeamIdentity,
  buildSeasonPlayTeamIdentityReport,
  countInconsistentMappings,
} from "../src/lib/cfb/research/derived/playTeamIdentityAudit";
import { buildPlayMetricRow } from "../src/lib/cfb/research/derived/playMetricRow";
import { buildTeamGameMetrics } from "../src/lib/cfb/research/derived/teamGameAggregation";
import { buildSeasonPlayTypeReportFromTally } from "../src/lib/cfb/research/derived/reporting/playTypeReport";
import { buildPhase1SeasonCoverageReport } from "../src/lib/cfb/research/derived/reporting/phase1CoverageReport";
import {
  CFB_RESEARCH_BACKFILL_SEASONS,
  CFB_RESEARCH_MANIFESTS_DIR,
  CFB_RESEARCH_RAW_DIR,
} from "../src/lib/cfb/research/config/researchConfig";
import { CFB_RESEARCH_DERIVED_DIR } from "../src/lib/cfb/research/derived/derivedConfig";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw, CfbResearchGame } from "../src/lib/cfb/research/types";
import type {
  CfbDerivedTeamGameMetrics,
  CfbResearchPlayCategory,
  PlayTeamIdentityAuditRow,
} from "../src/lib/cfb/research/derived/types";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_ROOT = resolve(ROOT, CFB_RESEARCH_RAW_DIR);
const DERIVED_ROOT = resolve(ROOT, CFB_RESEARCH_DERIVED_DIR);
const MANIFESTS_ROOT = resolve(ROOT, CFB_RESEARCH_MANIFESTS_DIR);

// Section 2 gate thresholds. Hard-stop only on a drastic failure — a small
// residual unresolved/ambiguous rate for non-FBS/exotic games is expected
// and does not block Phase 1; a large one would indicate the name-matching
// approach itself is broken and must not be silently used for metrics.
const IDENTITY_RESOLUTION_HARD_STOP_PCT = 90;
const IDENTITY_RESOLUTION_WARN_PCT = 99;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function homeAwayNeutral(game: CfbResearchGame, teamExternalId: string): "home" | "away" | "neutral" {
  if (game.neutralSite) return "neutral";
  return game.homeExternalId === teamExternalId ? "home" : "away";
}

async function deriveSeason(season: number) {
  const rawDir = resolve(RAW_ROOT, String(season));
  const rawGames = readJson<CfbdResearchGameRaw[]>(resolve(rawDir, "games.json"));
  const normalizedGames = normalizeResearchGames(rawGames);
  const gameById = new Map(normalizedGames.map((g) => [g.gameId, g]));
  const batches = weekBatchesFromGames(rawGames);

  const identityRows: PlayTeamIdentityAuditRow[] = [];
  let inconsistentMappingCount = 0;
  const rawTypeTally = new Map<string, { category: CfbResearchPlayCategory; count: number }>();
  let invalidClockCount = 0;
  const teamGames: CfbDerivedTeamGameMetrics[] = [];
  let totalPlaysProcessed = 0;

  for (const batch of batches) {
    const playsPath = resolve(
      rawDir,
      "plays",
      `${batch.seasonType}-week${String(batch.week).padStart(2, "0")}.json`,
    );
    const rawPlays = readJson<CfbdResearchPlayRaw[]>(playsPath);
    totalPlaysProcessed += rawPlays.length;

    const batchIdentity = auditPlayTeamIdentity(rawPlays, rawGames);
    identityRows.push(...batchIdentity);
    inconsistentMappingCount += countInconsistentMappings(rawPlays, rawGames);

    const resolutionByGame = new Map<string, { resolved: number; total: number }>();
    for (const row of batchIdentity) {
      const entry = resolutionByGame.get(row.gameId) ?? { resolved: 0, total: 0 };
      entry.total += 1;
      if (row.status === "resolved") entry.resolved += 1;
      resolutionByGame.set(row.gameId, entry);
    }

    const normalizedPlays = normalizeResearchPlays(rawPlays, rawGames, season, batch.week);
    const playTextById = new Map(rawPlays.map((p) => [p.id, p.playText ?? null]));

    for (const play of normalizedPlays) {
      if (play.clockMinutes === null || play.clockSeconds === null) invalidClockCount += 1;
    }

    const metricRows = normalizedPlays.map((play) =>
      buildPlayMetricRow({ play, playText: playTextById.get(play.playId) ?? null }),
    );
    for (const row of metricRows) {
      const existing = rawTypeTally.get(row.rawPlayType ?? "(null)");
      if (existing) existing.count += 1;
      else rawTypeTally.set(row.rawPlayType ?? "(null)", { category: row.category, count: 1 });
    }

    const playsByGame = new Map<string, typeof metricRows>();
    for (const row of metricRows) {
      if (!playsByGame.has(row.gameId)) playsByGame.set(row.gameId, []);
      playsByGame.get(row.gameId)!.push(row);
    }

    for (const [gameId, plays] of playsByGame) {
      const game = gameById.get(gameId);
      if (!game) continue;
      const resolution = resolutionByGame.get(gameId);
      const identityResolutionPct =
        !resolution || resolution.total === 0 ? 0 : Math.round((resolution.resolved / resolution.total) * 10_000) / 100;

      for (const side of [
        { teamExternalId: game.homeExternalId, teamId: game.homeTeamId, oppExternalId: game.awayExternalId, oppTeamId: game.awayTeamId, classification: game.homeClassification, oppClassification: game.awayClassification, score: game.homeScore },
        { teamExternalId: game.awayExternalId, teamId: game.awayTeamId, oppExternalId: game.homeExternalId, oppTeamId: game.homeTeamId, classification: game.awayClassification, oppClassification: game.homeClassification, score: game.awayScore },
      ]) {
        const offensivePlays = plays.filter((p) => p.offenseExternalId === side.teamExternalId);
        teamGames.push(
          buildTeamGameMetrics({
            game,
            teamExternalId: side.teamExternalId,
            teamId: side.teamId,
            opponentExternalId: side.oppExternalId,
            opponentTeamId: side.oppTeamId,
            classification: side.classification,
            opponentClassification: side.oppClassification,
            homeAwayNeutral: homeAwayNeutral(game, side.teamExternalId),
            finalTeamScore: side.score,
            offensivePlays,
            totalNormalizedPlayCount: plays.length,
            identityResolutionPct,
          }),
        );
      }
    }
  }

  // --- Play-team identity QA (Section 2) ---
  const identityReport = buildSeasonPlayTeamIdentityReport(season, identityRows, inconsistentMappingCount);
  if (identityReport.resolutionPct < IDENTITY_RESOLUTION_HARD_STOP_PCT) {
    throw new Error(
      `[cfb:research:derive] ${season}: play-team identity resolution ${identityReport.resolutionPct}% is ` +
        `below the hard-stop threshold (${IDENTITY_RESOLUTION_HARD_STOP_PCT}%) — STOPPING before deriving metrics.`,
    );
  }
  if (identityReport.resolutionPct < IDENTITY_RESOLUTION_WARN_PCT) {
    console.warn(
      `[cfb:research:derive] ${season}: WARNING — identity resolution ${identityReport.resolutionPct}% is below the ${IDENTITY_RESOLUTION_WARN_PCT}% watch threshold`,
    );
  }

  // --- Play classification / play-type QA (Section 3) ---
  const playTypeReport = buildSeasonPlayTypeReportFromTally(season, rawTypeTally);

  // --- Phase 1 coverage report (Section 14) ---
  const coverageReport = buildPhase1SeasonCoverageReport({
    season,
    teamGames,
    unknownPlayTypeCount: playTypeReport.byCategory.unknown,
    invalidClockCount,
    unresolvedTeamIdentityCount: identityReport.unresolvedPlays,
  });

  writeAtomic(
    resolve(DERIVED_ROOT, String(season), "team-game-metrics.json"),
    `${JSON.stringify(teamGames, null, 2)}\n`,
  );

  console.log(
    `[cfb:research:derive] ${season}: ${totalPlaysProcessed} plays processed, ${teamGames.length} team-game rows, ` +
      `identity resolution ${identityReport.resolutionPct}%, unknown play types ${playTypeReport.unknownRawPlayTypes.length}`,
  );

  return { identityReport, playTypeReport, coverageReport };
}

async function main() {
  const requestedSeasons = process.argv
    .slice(2)
    .filter((arg) => /^\d{4}$/.test(arg))
    .map(Number);
  const seasons = requestedSeasons.length > 0 ? requestedSeasons : [...CFB_RESEARCH_BACKFILL_SEASONS];

  const identityReports = [];
  const playTypeReports = [];
  const coverageReports = [];

  for (const season of seasons) {
    const start = Date.now();
    const result = await deriveSeason(season);
    identityReports.push(result.identityReport);
    playTypeReports.push(result.playTypeReport);
    coverageReports.push(result.coverageReport);
    console.log(`[cfb:research:derive] ${season} done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  writeAtomic(
    resolve(MANIFESTS_ROOT, "play-team-identity-qa.json"),
    `${JSON.stringify({ schemaVersion: "jkb-cfb-phase1-identity-qa-v1", seasons: identityReports }, null, 2)}\n`,
  );
  writeAtomic(
    resolve(MANIFESTS_ROOT, "play-type-qa.json"),
    `${JSON.stringify({ schemaVersion: "jkb-cfb-phase1-play-type-qa-v1", seasons: playTypeReports }, null, 2)}\n`,
  );
  writeAtomic(
    resolve(MANIFESTS_ROOT, "phase1-metric-coverage.json"),
    `${JSON.stringify({ schemaVersion: "jkb-cfb-phase1-metric-coverage-v1", seasons: coverageReports }, null, 2)}\n`,
  );

  console.log(`[cfb:research:derive] done: ${seasons.length} seasons derived`);
}

main().catch((error) => {
  console.error(`[cfb:research:derive] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
