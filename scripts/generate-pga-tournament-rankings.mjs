/**
 * Generate PGA tournament-specific player rankings dynamically.
 * 
 * Runs on Monday to generate current-tournament.json and next-tournament.json
 * using course-specific weights and current player stats.
 * 
 * Also generates power-rankings.json with season-long PR_WEIGHTS.
 * 
 * No Google Sheet dependency - all data derived from:
 * - schedule.json (tournament dates)
 * - player-stats-raw.json (player stats)
 * - course-weights.json (weights per tournament/course)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { selectLocalTarget } from "./lib/pga-field-selection.mjs";
import {
  assertMetricDirectionsDeclared,
  isLowerBetterMetric,
} from "./lib/pga-metric-direction.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");

// ─── Constants ────────────────────────────────────────────────────────────────

// Season-long power ranking weights (from PgaHub.tsx)
export const PR_WEIGHTS = {
  sgTotal: 0.55,
  sgApp: 0.09,
  sgPutt: 0.04,
  trendRank: 0.03,
  sgAtG: 0.1,
  bogeyAvoidance: 0.14,
  birdieBogeyRatio: 0.05,
  sgOTT: 0,
  drivingAccuracy: 0,
};

// Stat keys (in order, matching PgaHubShared)
export const STAT_KEYS = [
  "sgTotal",
  "sgOTT",
  "sgApp",
  "sgAtG",
  "sgPutt",
  "trendRank",
  "drivingAccuracy",
  "bogeyAvoidance",
  "birdieBogeyRatio",
];

/**
 * Direction comes from scripts/lib/pga-metric-direction.mjs -- the single
 * authoritative map. A private copy here previously omitted bogeyAvoidance,
 * so a 0.14-weighted bogey RATE was normalized higher-is-better and shipped
 * inverted Power Rankings to production. Never reintroduce a local set.
 */
function isLowerBetterStat(statKey) {
  return isLowerBetterMetric(statKey);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeEventKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findCourseWeights(courseWeights, tournamentName, courseName) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);

  // Try exact match on tournament + course
  const exact = courseWeights.find(
    (e) =>
      normalizeEventKey(e.tournament) === tournamentKey &&
      normalizeEventKey(e.course) === courseKey,
  );
  if (exact) return exact;

  // Try tournament only
  const byTournament = courseWeights.find(
    (e) => normalizeEventKey(e.tournament) === tournamentKey,
  );
  if (byTournament) return byTournament;

  // Try course only
  const byCourse = courseWeights.find((e) => normalizeEventKey(e.course) === courseKey);
  if (byCourse) return byCourse;

  // Fall back to DEFAULT
  return courseWeights.find((e) => normalizeEventKey(e.tournament) === "default") || null;
}

/**
 * Reject any positively weighted metric this ranker cannot actually score.
 *
 * Weights arrive from course-weights.json, which is edited independently of
 * STAT_KEYS. Previously only the intersection of the two was checked, so a
 * weight on a key absent from STAT_KEYS -- the realistic way a new metric gets
 * introduced -- was silently dropped: no error, no warning, and the remaining
 * weights quietly renormalized around it.
 *
 * Two distinct failures are reported separately so the fix is obvious:
 *   - weighted but not a ranking metric  -> add it to STAT_KEYS (and declare it)
 *   - weighted metric with no direction  -> declare it in the shared map
 *
 * Zero-weight keys are ignored: PR_WEIGHTS deliberately carries sgOTT and
 * drivingAccuracy at 0, and those must stay harmless.
 */
export function assertSupportedWeightedMetrics(weights, context = "PGA ranker") {
  const weighted = Object.keys(weights ?? {}).filter((key) => (weights[key] ?? 0) > 0);

  const unsupported = weighted.filter((key) => !STAT_KEYS.includes(key));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported weighted PGA metric(s) ${unsupported.map((k) => `"${k}"`).join(", ")} in ${context}. ` +
        "The metric carries a positive weight but is not a supported ranking metric, so it would be " +
        "silently ignored. Add it to STAT_KEYS and declare its direction in " +
        "scripts/lib/pga-metric-direction.mjs, or remove the weight.",
    );
  }

  // Supported metrics must still have a declared direction.
  assertMetricDirectionsDeclared(weighted, context);
}

/**
 * Rank players using a specific weight set.
 *
 * Min-max normalization per stat, then a weighted mean over whichever stats a
 * player actually has. Direction is resolved through the shared metric map, so
 * this and PgaHubShared.rankPlayers() cannot silently disagree again -- they
 * did, on bogeyAvoidance, until the direction map was centralized.
 *
 * Every stat carrying non-zero weight must have a declared direction; an
 * undeclared one throws rather than defaulting to higher-is-better.
 */
export function rankPlayers(players, weights) {
  if (!players || !players.length) return [];

  assertSupportedWeightedMetrics(weights, "generate-pga-tournament-rankings");

  // Calculate ranges for each stat
  const ranges = {};
  STAT_KEYS.forEach((key) => {
    const values = players
      .map((p) => p[key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (values.length > 0) {
      ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
    }
  });

  // A weighted stat with no usable values contributes nothing and its weight is
  // silently redistributed by the availableWeightTotal renormalization below.
  // trendRank has been null for the entire field all season this way. Warn so a
  // dead factor is visible, but do NOT fail: this is a data-supply problem, not
  // a correctness defect, and must not break scheduled generation.
  STAT_KEYS.filter((key) => (weights?.[key] ?? 0) > 0 && !ranges[key]).forEach((key) => {
    console.warn(
      `   ⚠ ${key} carries weight ${weights[key]} but has no usable values for any player; its weight is being redistributed.`,
    );
  });

  // Score each player
  const scored = players.map((player) => {
    let weightedScore = 0;
    let availableWeightTotal = 0;

    STAT_KEYS.forEach((key) => {
      const value = player[key];
      const weight = weights[key] ?? 0;
      const range = ranges[key];

      if (weight <= 0 || value == null || !range) return;

      // Normalize to 0-100
      let normalized;
      if (isLowerBetterStat(key)) {
        normalized =
          range.max === range.min
            ? 100
            : ((range.max - value) / (range.max - range.min)) * 100;
      } else {
        normalized =
          range.max === range.min
            ? 100
            : ((value - range.min) / (range.max - range.min)) * 100;
      }

      weightedScore += normalized * weight;
      availableWeightTotal += weight;
    });

    const score = availableWeightTotal > 0 ? weightedScore / availableWeightTotal : 0;
    return { ...player, score };
  });

  // Sort by score (desc), then by player name (asc)
  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.player.localeCompare(b.player);
  });

  // Add rank
  return sorted.map((player, idx) => ({
    ...player,
    rank: idx + 1,
  }));
}

/**
 * Generate a tournament JSON output with ranked players
 */
function generateTournamentOutput(tournament, rankedPlayers, isCurrentWeek, sourceInfo = {}) {
  const output = {
    section: isCurrentWeek ? "current-tournament" : "next-tournament",
    title: isCurrentWeek ? "CURRENT TOURNAMENT MODEL" : "NEXT WEEK TOURNAMENT MODEL",
    tournamentName: tournament.name,
    courseName: tournament.courseName,
    tournamentId: tournament.id ?? null,
    startDate: tournament.startDate ?? null,
    endDate: tournament.endDate ?? null,
    generatedAt: new Date().toISOString(),
    // Data-source transparency: this model is generated from online API
    // player stats, not the Google Sheet. pgaFreshness surfaces modelSource
    // in the page's status panel.
    modelAvailable: rankedPlayers.length > 0,
    modelSource: "online-api",
    statsSource: sourceInfo.statsSource ?? null,
    statsSyncedAt: sourceInfo.statsSyncedAt ?? null,
    weightsTournament: sourceInfo.weightsTournament ?? null,
    usedDefaultWeights: sourceInfo.usedDefaultWeights ?? null,
    modelNote:
      "Rankings generated from PGA Tour API player stats with course-specific weights. The Google Sheet is optional enrichment and is not required for weekly updates.",
    rows: rankedPlayers.map((player) => ({
      rank: player.rank,
      player: player.player,
      modelScore: player.score.toFixed(1),
      sgTotal: typeof player.sgTotal === "number" ? player.sgTotal.toFixed(3) : "0.000",
      sgOtt: typeof player.sgOTT === "number" ? player.sgOTT.toFixed(3) : "0.000",
      sgApp: typeof player.sgApp === "number" ? player.sgApp.toFixed(3) : "0.000",
      sgAtg: typeof player.sgAtG === "number" ? player.sgAtG.toFixed(3) : "0.000",
      sgPutt: typeof player.sgPutt === "number" ? player.sgPutt.toFixed(3) : "0.000",
    })),
  };
  return output;
}

/**
 * Generate power rankings using PR_WEIGHTS
 */
function generatePowerRankings(players) {
  const ranked = rankPlayers(players, PR_WEIGHTS);

  return {
    section: "power-rankings",
    title: "POWER RANKINGS",
    generatedAt: new Date().toISOString(),
    modelSource: "online-api",
    rows: ranked.map((player) => ({
      rank: player.rank,
      player: player.player,
      powerScore: player.score.toFixed(1),
      sgTotal: typeof player.sgTotal === "number" ? player.sgTotal.toFixed(3) : "0.000",
      sgOtt: typeof player.sgOTT === "number" ? player.sgOTT.toFixed(3) : "0.000",
      sgApp: typeof player.sgApp === "number" ? player.sgApp.toFixed(3) : "0.000",
      sgAtg: typeof player.sgAtG === "number" ? player.sgAtG.toFixed(3) : "0.000",
      sgPutt: typeof player.sgPutt === "number" ? player.sgPutt.toFixed(3) : "0.000",
      trendRank: typeof player.trendRank === "number" ? player.trendRank.toFixed(1) : null,
    })),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎯 Generating PGA Tournament Rankings\n");

  // Load source data
  console.log("📂 Loading source data...");
  const schedule = loadJson("public/data/pga/schedule.json");
  const playerStats = loadJson("public/data/pga/player-stats-raw.json");
  const courseWeights = loadJson("public/data/pga/course-weights.json");

  console.log(`   ✓ Schedule: ${schedule.length} tournaments`);
  console.log(`   ✓ Player stats: ${playerStats.length} players`);
  console.log(`   ✓ Course weights: ${courseWeights.length} entries`);

  // Current tournament: same canonical selection the field sync uses
  // (scripts/lib/pga-field-selection.mjs) so the model and the field can
  // never disagree about which event is current. The previous Thu-Sun
  // window silently soft-exited on off-weeks and missed non-Thursday
  // starts, leaving stale model files behind.
  const asOfDate = getTodayEt();
  console.log(`\n📅 As of (ET): ${asOfDate}`);

  console.log("\n🔍 Finding tournaments...");
  const thisWeekTournament = selectLocalTarget(schedule, asOfDate); // throws loudly when nothing qualifies

  const eligible = schedule
    .filter((e) => !String(e.eventType ?? "").toLowerCase().includes("alternate field"))
    .filter((e) => e.startDate && e.endDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const nextWeekTournament =
    eligible.find((e) => e.startDate > thisWeekTournament.endDate) ?? null;

  console.log(`   ✓ This week: ${thisWeekTournament.name} (${thisWeekTournament.startDate})`);
  if (nextWeekTournament) {
    console.log(
      `   ✓ Next week: ${nextWeekTournament.name} (${nextWeekTournament.startDate})`,
    );
  } else {
    console.log(`   ⚠️  No tournament found for next week`);
  }

  // Check and find weights
  console.log("\n⚖️  Checking weights...");
  const thisWeekWeights = findCourseWeights(
    courseWeights,
    thisWeekTournament.name,
    thisWeekTournament.courseName,
  );
  const thisWeekUsedDefault = !thisWeekWeights
    ? true
    : normalizeEventKey(thisWeekWeights.tournament) === "default";

  console.log(
    `   ${thisWeekUsedDefault ? "⚠️" : "✓"} This week: ${
      thisWeekWeights?.tournament || "MISSING"
    }${thisWeekUsedDefault ? " (using DEFAULT)" : ""}`,
  );

  if (nextWeekTournament) {
    const nextWeekWeights = findCourseWeights(
      courseWeights,
      nextWeekTournament.name,
      nextWeekTournament.courseName,
    );
    const nextWeekUsedDefault = !nextWeekWeights
      ? true
      : normalizeEventKey(nextWeekWeights.tournament) === "default";

    console.log(
      `   ${nextWeekUsedDefault ? "⚠️" : "✓"} Next week: ${
        nextWeekWeights?.tournament || "MISSING"
      }${nextWeekUsedDefault ? " (using DEFAULT)" : ""}`,
    );
  }

  // Generate rankings
  console.log("\n📊 Generating tournament rankings...");

  const thisWeekWeightSet = thisWeekWeights?.weights || courseWeights.find(
    (e) => normalizeEventKey(e.tournament) === "default",
  ).weights;

  const statsMetaPath = path.join(DATA_DIR, "player-stats-meta.json");
  const statsMeta = existsSync(statsMetaPath) ? JSON.parse(readFileSync(statsMetaPath, "utf8")) : {};
  const sourceInfo = {
    statsSource: statsMeta.source ?? null,
    statsSyncedAt: statsMeta.syncedAt ?? null,
    weightsTournament: thisWeekWeights?.tournament ?? "default",
    usedDefaultWeights: thisWeekUsedDefault,
  };

  const thisWeekRanked = rankPlayers(playerStats, thisWeekWeightSet);
  const thisWeekOutput = generateTournamentOutput(thisWeekTournament, thisWeekRanked, true, sourceInfo);

  console.log(
    `   ✓ This week: ${thisWeekRanked.length} players ranked for ${thisWeekTournament.name}`,
  );

  // Generate next week if it exists
  let nextWeekOutput = null;
  if (nextWeekTournament) {
    const nextWeekWeightSet = findCourseWeights(
      courseWeights,
      nextWeekTournament.name,
      nextWeekTournament.courseName,
    )?.weights || courseWeights.find((e) => normalizeEventKey(e.tournament) === "default")
      .weights;

    const nextWeekRanked = rankPlayers(playerStats, nextWeekWeightSet);
    nextWeekOutput = generateTournamentOutput(nextWeekTournament, nextWeekRanked, false, sourceInfo);

    console.log(
      `   ✓ Next week: ${nextWeekRanked.length} players ranked for ${nextWeekTournament.name}`,
    );
  } else {
    // Always write next-tournament.json so a previous run's (or a stale
    // sheet's) artifact can never linger as if it were current.
    nextWeekOutput = {
      section: "next-tournament",
      title: "NEXT WEEK TOURNAMENT MODEL",
      tournamentName: null,
      courseName: null,
      generatedAt: new Date().toISOString(),
      modelAvailable: false,
      modelSource: "online-api",
      modelNote: "No upcoming tournament found on the schedule after the current event.",
      rows: [],
    };
    console.log("   ⚠️  No next-week tournament; writing explicit placeholder.");
  }

  // Generate power rankings
  console.log(`   ✓ Power rankings: ${playerStats.length} players ranked`);
  const powerRankingsOutput = generatePowerRankings(playerStats);

  // Write outputs
  console.log("\n💾 Writing outputs...");
  await mkdir(DATA_DIR, { recursive: true });

  writeFileSync(
    path.join(DATA_DIR, "current-tournament.json"),
    JSON.stringify(thisWeekOutput, null, 2),
  );
  console.log(`   ✓ current-tournament.json`);

  writeFileSync(
    path.join(DATA_DIR, "next-tournament.json"),
    JSON.stringify(nextWeekOutput, null, 2),
  );
  console.log(`   ✓ next-tournament.json`);

  writeFileSync(
    path.join(DATA_DIR, "power-rankings.json"),
    JSON.stringify(powerRankingsOutput, null, 2),
  );
  console.log(`   ✓ power-rankings.json`);

  console.log("\n✅ Tournament rankings generated successfully!\n");
}

// Matches the direct-run pattern already used by generate-pga-best-bets.mjs and
// run-pga-best-bets-safe.mjs, so tests can import rankPlayers without the module
// generating and overwriting artifacts as a side effect of being imported.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error("\n❌ Error generating tournament rankings:", error.message);
    process.exit(1);
  });
}
