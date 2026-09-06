/**
 * Generate the Phase 1 historical player-week fantasy dataset (2023-2025) for
 * leakage-safe weekly POINT projection modeling research.
 *
 * This is research-input generation only. It does NOT publish rankings, does
 * NOT change any public consumer, and does NOT implement any projection
 * model (see src/lib/fantasy/weekly/README.md "Phase A defines inputs only").
 *
 * Reads ONLY committed nflverse source caches (never fetches):
 *   data/nfl/nflverse/player-week-stats/stats_player_week_{season}.csv  (2022-2025)
 *   data/nfl/nflverse/weekly-rosters/roster_weekly_{season}.csv          (2023-2025)
 *   data/nfl/nflverse/injuries/injuries_{season}.csv                    (2023-2025)
 *   data/nfl/nflverse/snap-counts/snap_counts_{season}.csv              (2023-2025)
 *   data/nfl/nflverse/epa-team-game/epa_team_game_{season}.csv          (2022-2025)
 *   data/nfl/nflverse/schedules/games.csv                               (all seasons, REG only)
 *
 * 2022 is included ONLY as prior-season context for 2023 Week 1 features. It
 * is never itself part of the target/eligible universe.
 *
 * All leakage-safety, identity resolution, eligibility, Full-PPR scoring, and
 * feature computation is delegated to the already-tested Phase A library at
 * src/lib/fantasy/weekly/**  — this script is glue: source I/O + wiring only.
 *
 * Run via tsx (imports TypeScript modules directly):
 *   npx tsx scripts/generate-fantasy-weekly-history.mts
 *   npx tsx scripts/generate-fantasy-weekly-history.mts --dry-run
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { normalizeGameStatus, normalizePracticeStatus } from "./lib/nfl-injury-sources.mjs";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import {
  normalizeHistoricalPlayerWeek,
  historicalSnapJoinKey,
  type HistoricalPlayerWeek,
  type HistoricalPlayerWeekSource,
} from "../src/lib/fantasy/weekly/history.ts";
import {
  buildHistoricalRankingUniverse,
  type HistoricalRosterWeek,
  type HistoricalInjuryWeek,
  type HistoricalScheduleTeamWeek,
} from "../src/lib/fantasy/weekly/backtest/universe.ts";
import {
  buildPregameFeatureSnapshot,
  type HistoricalTeamWeek,
  type PregameFeatureSnapshot,
} from "../src/lib/fantasy/weekly/backtest/features.ts";
import { CORE_FEATURES_BY_POSITION, featureValue, type BacktestFeatureKey } from "../src/lib/fantasy/weekly/backtest/featureRegistry.ts";
import {
  adaptStatsPlayerWeekRow,
  buildHomeAwayLookup,
  computeAppearanceHistory,
  type GameRow,
  type HomeAway,
} from "../src/lib/fantasy/weekly/backtest/historicalArtifactAssembly.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_ROOT = join(ROOT, "data", "nfl", "nflverse");
const OUTPUT_ROOT = join(ROOT, "data", "fantasy", "weekly-history");

const PRIOR_CONTEXT_SEASON = 2022;
const TARGET_SEASONS = [2023, 2024, 2025];
const ALL_STAT_SEASONS = [PRIOR_CONTEXT_SEASON, ...TARGET_SEASONS];
const ARTIFACT_SCHEMA_VERSION = "fantasy-weekly-history-artifact-v1";
const ALL_FEATURE_KEYS = [...new Set(Object.values(CORE_FEATURES_BY_POSITION).flatMap((byFamily) => Object.values(byFamily).flat()))] as BacktestFeatureKey[];

function readCsv(path: string): Record<string, string>[] {
  return parseCsv(readFileSync(path, "utf-8")) as unknown as Record<string, string>[];
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function loadPlayerWeekStats(season: number): HistoricalPlayerWeekSource[] {
  const path = join(CACHE_ROOT, "player-week-stats", `stats_player_week_${season}.csv`);
  return readCsv(path).map((row) => adaptStatsPlayerWeekRow(row));
}

function loadRosters(season: number): HistoricalRosterWeek[] {
  const path = join(CACHE_ROOT, "weekly-rosters", `roster_weekly_${season}.csv`);
  return readCsv(path).map((row) => ({
    season: Number(row.season),
    week: Number(row.week),
    team: row.team,
    gsisId: row.gsis_id || null,
    pfrId: row.pfr_id || null,
    espnId: row.espn_id || null,
    playerName: row.full_name,
    position: row.position,
    rosterStatus: row.status || null,
  }));
}

/**
 * Historical injury reports (2023-2024 especially) carry a long tail of
 * free-text practice/report values the strict live-pipeline normalizers
 * reject by design. Rather than block generation of the entire season, an
 * unrecognized value is preserved as explicit missingness (null) and
 * counted — never guessed. Counts are logged so data-quality regressions are
 * visible, matching the "preserve explicit missingness" policy.
 */
function loadInjuries(season: number): { rows: HistoricalInjuryWeek[]; unrecognizedCount: number } {
  const path = join(CACHE_ROOT, "injuries", `injuries_${season}.csv`);
  let unrecognizedCount = 0;
  const safeNormalize = <T,>(fn: (raw: string, context: string) => T, raw: string, context: string): T | null => {
    try {
      return fn(raw, context);
    } catch {
      unrecognizedCount += 1;
      return null;
    }
  };
  const rows = readCsv(path)
    .filter((row) => row.gsis_id)
    .map((row) => ({
      season: Number(row.season),
      week: Number(row.week),
      gsisId: row.gsis_id,
      reportStatus: safeNormalize(normalizeGameStatus, row.report_status, `injuries ${season}`),
      practiceStatus: safeNormalize(normalizePracticeStatus, row.practice_status, `injuries ${season}`),
    }));
  return { rows, unrecognizedCount };
}

type SnapRow = { season: number; week: number; team: string; pfrId: string; offenseSnaps: number; offensePct: number };

function loadSnapCounts(season: number): SnapRow[] {
  const path = join(CACHE_ROOT, "snap-counts", `snap_counts_${season}.csv`);
  if (!existsSync(path)) return [];
  return readCsv(path)
    .filter((row) => row.pfr_player_id && row.offense_snaps !== "")
    .map((row) => ({
      season: Number(row.season),
      week: Number(row.week),
      team: row.team,
      pfrId: row.pfr_player_id,
      offenseSnaps: Number(row.offense_snaps),
      offensePct: row.offense_pct === "" ? NaN : Number(row.offense_pct),
    }));
}

function loadEpaTeamGame(season: number): HistoricalTeamWeek[] {
  const path = join(CACHE_ROOT, "epa-team-game", `epa_team_game_${season}.csv`);
  if (!existsSync(path)) return [];
  return readCsv(path).map((row) => ({
    season: Number(row.season),
    week: Number(row.week),
    team: normalizeNflTeamAbbr(row.team) ?? row.team,
    opponent: normalizeNflTeamAbbr(row.opponent) ?? row.opponent,
    offensiveEpa: Number(row.off_epa),
    offensivePlays: Number(row.off_plays),
    passingEpa: Number(row.pass_epa),
    passingPlays: Number(row.pass_plays),
    rushingEpa: Number(row.rush_epa),
    rushingPlays: Number(row.rush_plays),
  }));
}

function loadGames(): GameRow[] {
  const path = join(CACHE_ROOT, "schedules", "games.csv");
  return readCsv(path).map((row) => ({
    season: Number(row.season),
    week: Number(row.week),
    awayTeam: normalizeNflTeamAbbr(row.away_team) ?? row.away_team,
    homeTeam: normalizeNflTeamAbbr(row.home_team) ?? row.home_team,
    neutral: row.location.trim().toLowerCase() !== "home",
  }));
}

// ---------------------------------------------------------------------------
// Derived lookups
// ---------------------------------------------------------------------------

/** GSIS -> PFR crosswalk, week-effective (a player's PFR id is season/week stable in the roster file). */
function buildGsisToPfr(rosters: readonly HistoricalRosterWeek[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rosters) {
    if (!row.gsisId || !row.pfrId) continue;
    map.set(`${row.season}|${row.week}|${row.gsisId}`, row.pfrId);
  }
  return map;
}

function buildSnapLookup(snapRows: readonly SnapRow[]): Map<string, { offensiveSnaps: number; snapShare: number }> {
  const map = new Map<string, { offensiveSnaps: number; snapShare: number }>();
  for (const row of snapRows) {
    if (!Number.isFinite(row.offensePct)) continue;
    const key = historicalSnapJoinKey(row.season, row.week, row.pfrId, row.team);
    map.set(key, { offensiveSnaps: row.offenseSnaps, snapShare: row.offensePct });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

type AppearanceState = "played" | "eligible-no-stats";
type EligibilityAudit = ReturnType<typeof buildHistoricalRankingUniverse>["audit"];

type HistoricalArtifactRow = {
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  playerId: string;
  playerName: string;
  season: number;
  week: number;
  position: string;
  team: string;
  opponent: string;
  homeAway: HomeAway;
  eligible: true;
  availabilityStatus: string;
  appearanceState: AppearanceState;
  priorGamesCount: number;
  eligibleWeeksCount: number;
  weeksSinceLastAppearance: number | null;
  actualFullPprFantasyPoints: number;
  /**
   * Flattened leakage-safe (through week N-1) feature values, keyed by the
   * same BacktestFeatureKey names src/lib/fantasy/weekly/backtest/featureRegistry.ts
   * candidate models read. Every value here traces to buildPregameFeatureSnapshot
   * (src/lib/fantasy/weekly/backtest/features.ts) — this script stores its
   * output, it does not compute features itself. Full per-row provenance
   * (cutoffs, market exclusion reasons) is reproducible on demand from this
   * committed artifact plus the source caches; it is not duplicated here to
   * keep the committed artifact a compact training matrix rather than a
   * research-output dump (see Phase 1 cache policy).
   */
  features: Partial<Record<BacktestFeatureKey, number | null>>;
  missingFeatureCount: number;
};

function buildArtifactForSeason(
  season: number,
  universeRows: readonly HistoricalPlayerWeek[],
  fullHistory: readonly HistoricalPlayerWeek[],
  teamHistory: readonly HistoricalTeamWeek[],
  homeAwayLookup: Map<string, HomeAway>,
  availability: Map<string, string>,
): HistoricalArtifactRow[] {
  const seasonRows = universeRows.filter((row) => row.season === season);
  // Track appearance state per player in chronological order for weeksSinceLastAppearance / priorGamesCount / eligibleWeeksCount.
  const byPlayer = new Map<string, HistoricalPlayerWeek[]>();
  for (const row of universeRows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.season * 100 + a.week - (b.season * 100 + b.week));

  return seasonRows.map((row): HistoricalArtifactRow => {
    const key = `${row.season}|${row.week}|${row.playerId}`;
    const history = byPlayer.get(row.playerId) ?? [];
    const appearance = computeAppearanceHistory(row, history);

    const snapshot = buildPregameFeatureSnapshot(row, fullHistory, { teamHistory });
    const features = Object.fromEntries(ALL_FEATURE_KEYS.map((key) => [key, featureValue(snapshot, key)])) as Partial<Record<BacktestFeatureKey, number | null>>;

    return {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      playerId: row.playerId,
      playerName: row.playerName,
      season: row.season,
      week: row.week,
      position: row.position,
      team: row.team,
      opponent: row.opponent,
      homeAway: homeAwayLookup.get(`${row.season}|${row.week}|${row.team}`) ?? "unknown",
      eligible: true,
      availabilityStatus: availability.get(key) ?? "unknown",
      appearanceState: appearance.appearanceState,
      priorGamesCount: appearance.priorGamesCount,
      eligibleWeeksCount: appearance.eligibleWeeksCount,
      weeksSinceLastAppearance: appearance.weeksSinceLastAppearance,
      actualFullPprFantasyPoints: row.actualFantasyPoints,
      features,
      missingFeatureCount: snapshot.missingFeatures.length,
    };
  });
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[fantasy:weekly-history] building ${TARGET_SEASONS.join(",")} (prior context ${PRIOR_CONTEXT_SEASON})${dryRun ? " (dry run)" : ""}`);

  // --- Raw outcome history (all stat rows, 2022-2025) ---
  const outcomeRowsBySeason = new Map<number, HistoricalPlayerWeek[]>();
  for (const season of ALL_STAT_SEASONS) {
    const rawRows = loadPlayerWeekStats(season);
    const rosters = TARGET_SEASONS.includes(season) ? loadRosters(season) : [];
    const gsisToPfr = buildGsisToPfr(rosters);
    const snapLookup = buildSnapLookup(loadSnapCounts(season));
    const normalized: HistoricalPlayerWeek[] = [];
    for (const raw of rawRows) {
      const gsisId = String(raw.player_id ?? "");
      const week = Number(raw.week);
      const pfrId = gsisToPfr.get(`${season}|${week}|${gsisId}`) ?? null;
      const team = normalizeNflTeamAbbr(String(raw.recent_team ?? "")) ?? String(raw.recent_team ?? "");
      const snap = pfrId ? snapLookup.get(historicalSnapJoinKey(season, week, pfrId, team)) ?? null : null;
      const row = normalizeHistoricalPlayerWeek(raw, { pfrId }, snap);
      if (row) normalized.push(row);
    }
    outcomeRowsBySeason.set(season, normalized);
    console.log(`[fantasy:weekly-history] ${season}: ${rawRows.length} raw stat rows -> ${normalized.length} resolved outcomes`);
  }
  const fullOutcomeHistory = [...outcomeRowsBySeason.values()].flat();

  // --- Team environment history (2022-2025, for leakage-safe N-1 lookback) ---
  const teamHistory = ALL_STAT_SEASONS.flatMap((season) => loadEpaTeamGame(season));

  // --- Schedule for eligibility (derived from EPA team-game cache: every played, non-bye team-week) ---
  const scheduleBySeasons = new Map<number, HistoricalScheduleTeamWeek[]>();
  for (const season of TARGET_SEASONS) {
    scheduleBySeasons.set(
      season,
      loadEpaTeamGame(season).map((row) => ({ season: row.season, week: row.week, team: row.team, opponent: row.opponent })),
    );
  }

  const games = loadGames();
  const homeAwayLookup = buildHomeAwayLookup(games);

  const seasonOutputs: Record<number, HistoricalArtifactRow[]> = {};
  const seasonAudits: Record<number, EligibilityAudit> = {};
  let combinedUniverse: HistoricalPlayerWeek[] = [];

  for (const season of TARGET_SEASONS) {
    const injuries = loadInjuries(season);
    if (injuries.unrecognizedCount > 0) {
      console.log(`[fantasy:weekly-history] ${season}: ${injuries.unrecognizedCount} injury rows had unrecognized status text -> preserved as null`);
    }
    const { rows, availability, audit } = buildHistoricalRankingUniverse({
      outcomes: outcomeRowsBySeason.get(season) ?? [],
      rosters: loadRosters(season),
      injuries: injuries.rows,
      schedule: scheduleBySeasons.get(season) ?? [],
    });
    seasonAudits[season] = audit;
    combinedUniverse = [...combinedUniverse, ...rows];
    // Lookback context = prior-season raw outcomes (2022 for 2023) + all universe rows built so far.
    const priorSeasonOutcomes = outcomeRowsBySeason.get(season - 1) ?? [];
    const lookbackHistory = [...priorSeasonOutcomes, ...combinedUniverse];
    seasonOutputs[season] = buildArtifactForSeason(
      season,
      rows,
      lookbackHistory,
      teamHistory,
      homeAwayLookup,
      availability as Map<string, string>,
    );
  }

  // --- Coverage report across all target seasons (computed from the compact
  // flattened feature maps already stored per row, not a re-fetch of full snapshots) ---
  const allOutputRows = Object.values(seasonOutputs).flat();
  const coverageGroups = new Map<string, HistoricalArtifactRow[]>();
  for (const row of allOutputRows) {
    const key = `${row.season}|${row.week}|${row.position}`;
    const group = coverageGroups.get(key) ?? [];
    group.push(row);
    coverageGroups.set(key, group);
  }
  const coverage = [...coverageGroups.entries()]
    .flatMap(([key, group]) => {
      const [seasonStr, weekStr, position] = key.split("|");
      return ALL_FEATURE_KEYS.map((feature) => {
        const available = group.filter((row) => row.features[feature] != null).length;
        return {
          season: Number(seasonStr), week: Number(weekStr), position, feature,
          rows: group.length, available, missing: group.length - available,
          coverage: group.length ? available / group.length : 0,
        };
      });
    })
    .sort((a, b) => a.season - b.season || a.week - b.week || a.position.localeCompare(b.position) || a.feature.localeCompare(b.feature));

  // --- Write artifacts ---
  const manifestFiles: Array<{ season: number; filename: string; rowCount: number; byteSize: number; sha256: string }> = [];
  for (const season of TARGET_SEASONS) {
    const filename = `${season}.json`;
    const text = `${JSON.stringify({ schemaVersion: ARTIFACT_SCHEMA_VERSION, season, rowCount: seasonOutputs[season].length, audit: seasonAudits[season], rows: seasonOutputs[season] }, null, 2)}\n`;
    manifestFiles.push({ season, filename, rowCount: seasonOutputs[season].length, byteSize: Buffer.byteLength(text, "utf-8"), sha256: sha256Hex(text) });
    if (!dryRun) writeAtomic(join(OUTPUT_ROOT, filename), text);
    console.log(`[fantasy:weekly-history] ${season}: ${seasonOutputs[season].length} eligible player-week rows (${seasonAudits[season].statOutcomeRows} played, ${seasonAudits[season].eligibleZeroRows} eligible-zero)`);
  }

  const coverageText = `${JSON.stringify({ schemaVersion: "fantasy-weekly-history-coverage-v1", generatedFromRowCount: allOutputRows.length, coverage }, null, 2)}\n`;
  if (!dryRun) writeAtomic(join(OUTPUT_ROOT, "coverage.json"), coverageText);

  const manifestText = `${JSON.stringify(
    {
      schemaVersion: "fantasy-weekly-history-manifest-v1",
      generatedAt: new Date().toISOString(),
      priorContextSeason: PRIOR_CONTEXT_SEASON,
      targetSeasons: TARGET_SEASONS,
      scoringVersion: "jkb-full-ppr-v1.0.0",
      files: [...manifestFiles, { season: null, filename: "coverage.json", rowCount: allOutputRows.length, byteSize: Buffer.byteLength(coverageText, "utf-8"), sha256: sha256Hex(coverageText) }],
    },
    null,
    2,
  )}\n`;
  if (!dryRun) writeAtomic(join(OUTPUT_ROOT, "manifest.json"), manifestText);

  console.log("[fantasy:weekly-history] done");
}

main().catch((err) => {
  console.error(`[fantasy:weekly-history] FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
