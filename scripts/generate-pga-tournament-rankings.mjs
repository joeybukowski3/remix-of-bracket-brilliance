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

import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");

// ─── Constants ────────────────────────────────────────────────────────────────

// Season-long power ranking weights (from PgaHub.tsx)
const PR_WEIGHTS = {
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
const STAT_KEYS = [
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

// Stats where lower is better (lower rank = better)
const LOWER_IS_BETTER_STATS = new Set(["trendrank"]);

function isLowerBetterStat(statKey) {
  return LOWER_IS_BETTER_STATS.has(statKey.toLowerCase());
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

function getMondayOfWeekEt() {
  const now = new Date();
  const etDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etDate.getDay();
  const diff = etDate.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(etDate.setDate(diff));
  return monday.toISOString().split("T")[0];
}

function getThursdayOfWeekEt() {
  const mondayStr = getMondayOfWeekEt();
  const monday = new Date(mondayStr + "T00:00:00Z");
  const thursday = new Date(monday.getTime() + 3 * 24 * 60 * 60 * 1000);
  return thursday.toISOString().split("T")[0];
}

function getSundayOfWeekEt() {
  const mondayStr = getMondayOfWeekEt();
  const monday = new Date(mondayStr + "T00:00:00Z");
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  return sunday.toISOString().split("T")[0];
}

function normalizeEventKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findCourseWeights(courseWeights, tournamentName, courseName) {
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
 * Rank players using a specific weight set.
 * Mirrors the logic from PgaHubShared.rankPlayers()
 */
function rankPlayers(players, weights) {
  if (!players || !players.length) return [];

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
function generateTournamentOutput(tournament, rankedPlayers, isCurrentWeek) {
  const output = {
    section: isCurrentWeek ? "current-tournament" : "next-tournament",
    title: isCurrentWeek ? "CURRENT TOURNAMENT MODEL" : "NEXT WEEK TOURNAMENT MODEL",
    tournamentName: tournament.name,
    courseName: tournament.courseName,
    generatedAt: new Date().toISOString(),
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

  // Calculate week boundaries
  const thursday = getThursdayOfWeekEt();
  const sunday = getSundayOfWeekEt();

  console.log(`\n📅 Week: ${thursday} to ${sunday}`);

  // Find this week's tournament
  console.log("\n🔍 Finding tournaments...");
  const thisWeekTournament = schedule.find(
    (e) => e.startDate >= thursday && e.startDate <= sunday,
  );
  const nextWeekMonday = new Date(
    new Date(thursday + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  const nextThursday = new Date(nextWeekMonday.getTime() + 3 * 24 * 60 * 60 * 1000);
  const nextSunday = new Date(nextWeekMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
  const nextThursdayStr = nextThursday.toISOString().split("T")[0];
  const nextSundayStr = nextSunday.toISOString().split("T")[0];

  const nextWeekTournament = schedule.find(
    (e) => e.startDate >= nextThursdayStr && e.startDate <= nextSundayStr,
  );

  if (!thisWeekTournament) {
    console.log("⚠️  No tournament found for this week. Exiting.");
    return;
  }

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

  const thisWeekRanked = rankPlayers(playerStats, thisWeekWeightSet);
  const thisWeekOutput = generateTournamentOutput(thisWeekTournament, thisWeekRanked, true);

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
    nextWeekOutput = generateTournamentOutput(nextWeekTournament, nextWeekRanked, false);

    console.log(
      `   ✓ Next week: ${nextWeekRanked.length} players ranked for ${nextWeekTournament.name}`,
    );
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

  if (nextWeekOutput) {
    writeFileSync(
      path.join(DATA_DIR, "next-tournament.json"),
      JSON.stringify(nextWeekOutput, null, 2),
    );
    console.log(`   ✓ next-tournament.json`);
  }

  writeFileSync(
    path.join(DATA_DIR, "power-rankings.json"),
    JSON.stringify(powerRankingsOutput, null, 2),
  );
  console.log(`   ✓ power-rankings.json`);

  console.log("\n✅ Tournament rankings generated successfully!\n");
}

main().catch((error) => {
  console.error("\n❌ Error generating tournament rankings:", error.message);
  process.exit(1);
});
