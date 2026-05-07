import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const OUTPUT_PATH = path.join(DATA_DIR, "best-bets.json");
const API_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-4-1-fast-non-reasoning";
const FORCE = process.argv.includes("--force");

const SYSTEM_PROMPT = "You are a sharp data-driven golf betting analyst. You have access to a proprietary PGA Tour player model. Your job is to identify value plays based strictly on the model data provided. Be concise. Do not write paragraphs. Use short bullet points referencing specific stat ranks and model scores. Avoid generic phrases like \"strong ball striker\" or \"has been playing well lately\". Every point must reference a specific number from the data. Output only valid JSON with no markdown.";

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

function formatDateEt(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function normalizeName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getLastNameKey(value) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.at(-1) ?? "";
}

function normalizeEventKey(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTopTwoStatLabels(player) {
  const candidates = [
    { label: "SG Total", value: Number(player.sgTotal) },
    { label: "SG OTT", value: Number(player.sgOtt ?? player.sgOTT) },
    { label: "SG APP", value: Number(player.sgApp) },
    { label: "SG ATG", value: Number(player.sgAtg ?? player.sgAtG) },
    { label: "SG PUT", value: Number(player.sgPutt) },
  ].filter((entry) => Number.isFinite(entry.value));

  return candidates
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((entry) => `${entry.label} ${entry.value.toFixed(3)}`);
}

function buildPlayerMaps(powerRankings, playerStats) {
  const powerByName = new Map();
  const rawByName = new Map();
  const rawByLastName = new Map();

  powerRankings.rows.forEach((row) => {
    powerByName.set(normalizeName(row.player), row);
  });

  playerStats.forEach((row) => {
    const normalized = normalizeName(row.player);
    rawByName.set(normalized, row);

    const lastName = getLastNameKey(row.player);
    if (lastName && !rawByLastName.has(lastName)) {
      rawByLastName.set(lastName, row);
    }
  });

  return { powerByName, rawByName, rawByLastName };
}

function findWeightEntry(courseWeights, tournamentName, courseName) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);

  return (
    courseWeights.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey && normalizeEventKey(entry.course) === courseKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.course) === courseKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.tournament) === "default")
    ?? null
  );
}

function buildSummary(tournamentData, powerRankings, playerStats, courseWeights) {
  const { powerByName, rawByName, rawByLastName } = buildPlayerMaps(powerRankings, playerStats);
  const weightEntry = findWeightEntry(courseWeights, tournamentData.tournamentName, tournamentData.courseName);
  const topRows = tournamentData.rows.slice(0, 30);

  const playerLines = topRows.map((row) => {
    const normalized = normalizeName(row.player);
    const powerRow = powerByName.get(normalized);
    const rawRow = rawByName.get(normalized) ?? rawByLastName.get(getLastNameKey(row.player)) ?? null;

    const drivingAccuracy = rawRow?.drivingAccuracy;
    const bogeyAvoidance = rawRow?.bogeyAvoidance;
    const birdieBogeyRatio = rawRow?.birdieBogeyRatio;

    return [
      `#${row.rank} ${row.player}`,
      `modelScore=${row.modelScore}`,
      `powerRank=${powerRow?.rank ?? "NA"}`,
      `powerScore=${powerRow?.modelScore ?? "NA"}`,
      `SGT=${row.sgTotal}`,
      `OTT=${row.sgOtt}`,
      `APP=${row.sgApp}`,
      `ATG=${row.sgAtg}`,
      `PUT=${row.sgPutt}`,
      `DRV%=${Number.isFinite(drivingAccuracy) ? Number(drivingAccuracy).toFixed(2) : "NA"}`,
      `BOG=${Number.isFinite(bogeyAvoidance) ? Number(bogeyAvoidance).toFixed(4) : "NA"}`,
      `B/B=${Number.isFinite(birdieBogeyRatio) ? Number(birdieBogeyRatio).toFixed(2) : "NA"}`,
    ].join(" | ");
  });

  const weightLines = weightEntry
    ? [
        `SG Total ${ (weightEntry.weights.sgTotal * 100).toFixed(1)}%`,
        `SG OTT ${(weightEntry.weights.sgOTT * 100).toFixed(1)}%`,
        `SG APP ${(weightEntry.weights.sgApp * 100).toFixed(1)}%`,
        `SG ATG ${(weightEntry.weights.sgAtG * 100).toFixed(1)}%`,
        `SG PUT ${(weightEntry.weights.sgPutt * 100).toFixed(1)}%`,
        `Driving Accuracy ${(weightEntry.weights.drivingAccuracy * 100).toFixed(1)}%`,
        `Bogey Avoidance ${(weightEntry.weights.bogeyAvoidance * 100).toFixed(1)}%`,
        `Birdie/Bogey Ratio ${(weightEntry.weights.birdieBogeyRatio * 100).toFixed(1)}%`,
      ].join(" | ")
    : "No course weights found.";

  return [
    `Tournament: ${tournamentData.tournamentName}`,
    `Course: ${tournamentData.courseName}`,
    `Course Weights: ${weightLines}`,
    "Top 30 Tournament Model:",
    ...playerLines,
  ].join("\n");
}

async function callGrok(apiKey, userPrompt) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Grok API returned no message content.");
  }

  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function generateSection(apiKey, label, prompt) {
  try {
    const result = await callGrok(apiKey, prompt);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error(`Failed to generate ${label}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

function pickTournamentData(currentTournament, nextTournament) {
  const today = new Date();
  const isMondayEt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(today) === "Monday";
  if (nextTournament?.rows?.length) {
    console.log(isMondayEt ? "Using next-tournament data for Monday generation." : "Using next-tournament data for manual or mid-week generation.");
    return nextTournament;
  }
  return currentTournament;
}

function shouldSkip(outputPath, force) {
  if (force || !existsSync(outputPath)) return false;

  try {
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    if (!existing?.generatedAt) return false;
    const hasContent = ["outrights", "top5", "top10", "top20"].some(
      (key) => Array.isArray(existing[key]) && existing[key].length > 0,
    );
    if (!hasContent) return false;
    return formatDateEt(existing.generatedAt) === getTodayEt();
  } catch {
    return false;
  }
}

async function main() {
  if (shouldSkip(OUTPUT_PATH, FORCE)) {
    console.log("best-bets.json already generated today. Skipping. Pass --force to regenerate.");
    return;
  }

  const nextTournament = loadJson("public/data/pga/next-tournament.json");
  const currentTournament = loadJson("public/data/pga/current-tournament.json");
  const powerRankings = loadJson("public/data/pga/power-rankings.json");
  const playerStats = loadJson("public/data/pga/player-stats-raw.json");
  const courseWeights = loadJson("public/data/pga/course-weights.json");
  const tournamentData = pickTournamentData(currentTournament, nextTournament);

  if (!tournamentData?.rows?.length) {
    throw new Error("No tournament rows available to generate best bets.");
  }

  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const summary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights);
  const tournamentName = tournamentData.tournamentName;
  const courseName = tournamentData.courseName;

  if (!apiKey) {
    console.warn("GROK_API_KEY is not set. Writing empty best-bets sections.");
  }

  const promptBase = `Based on this tournament model data for ${tournamentName} at ${courseName}: ${summary}`;
  const outrightsPrompt = `${promptBase}. Identify 3 outright winner best bets. These should be high risk high reward plays - players ranked 4 through 15 in the tournament model who represent value over favorites. For each pick return: player name, their tournament model rank, power ranking rank, their two strongest stat categories with values, and exactly 3 bullet points explaining the pick using only numbers from the data. Return as JSON array with fields: player, tournamentRank, powerRank, topStats (array of 2 strings), bullets (array of 3 strings).`;
  const top5Prompt = `${promptBase}. Identify 3 top-5 finish best bets. Mix one chalk play (top 3 model rank) and two value plays (ranks 5-12). Return same JSON shape.`;
  const top10Prompt = `${promptBase}. Identify 4 top-10 finish best bets. Prioritize players with high floor stats - strong ATG, BOG, and consistent APP scores. Avoid boom-or-bust profiles. Return same JSON shape.`;
  const top20Prompt = `${promptBase}. Identify 5 top-20 finish best bets. These are safe floor plays - players ranked 8 through 20 in the tournament model with no significant red cells in ATG or PUT. Prioritize consistency over upside. Return same JSON shape.`;

  const emptySection = [];
  const [outrights, top5, top10, top20] = apiKey
    ? await Promise.all([
        generateSection(apiKey, "outrights", outrightsPrompt),
        generateSection(apiKey, "top5", top5Prompt),
        generateSection(apiKey, "top10", top10Prompt),
        generateSection(apiKey, "top20", top20Prompt),
      ])
    : [emptySection, emptySection, emptySection, emptySection];

  const payload = {
    tournament: tournamentName,
    course: courseName,
    generatedAt: new Date().toISOString(),
    outrights,
    top5,
    top10,
    top20,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
