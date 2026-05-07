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
const PREVIEW_SYSTEM_PROMPT = "You are writing a concise tournament betting preview for a sports analytics website. Stay factual, sharp, and concise. Do not use filler. Output only valid JSON with no markdown.";

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

function buildSummary(tournamentData, powerRankings, playerStats, courseWeights, topLimit = 30) {
  const { powerByName, rawByName, rawByLastName } = buildPlayerMaps(powerRankings, playerStats);
  const weightEntry = findWeightEntry(courseWeights, tournamentData.tournamentName, tournamentData.courseName);
  const topRows = tournamentData.rows.slice(0, topLimit);

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
    `Top ${topLimit} Tournament Model:`,
    ...playerLines,
  ].join("\n");
}

function extractMessageContent(rawContent) {
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function extractJsonSnippet(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstArray = trimmed.indexOf("[");
  const firstObject = trimmed.indexOf("{");
  const firstIndex = [firstArray, firstObject].filter((value) => value >= 0).sort((left, right) => left - right)[0];
  if (firstIndex === undefined) {
    throw new Error("No JSON opening bracket found in Grok response.");
  }

  const opening = trimmed[firstIndex];
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstIndex; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstIndex, index + 1);
      }
    }
  }

  throw new Error("Could not find a complete JSON block in Grok response.");
}

function cleanJsonText(rawText) {
  return rawText.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
}

function parseJsonPayload(rawText, label) {
  const cleaned = cleanJsonText(rawText);
  try {
    return JSON.parse(cleaned);
  } catch {
    const snippet = cleanJsonText(extractJsonSnippet(rawText));
    try {
      return JSON.parse(snippet);
    } catch (error) {
      throw new Error(`${label} JSON parse failed. ${error instanceof Error ? error.message : error}`);
    }
  }
}

function validatePickArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => ({
        player: entry?.player ?? "",
        tournamentRank: Number(entry?.tournamentRank ?? 0),
        powerRank: Number(entry?.powerRank ?? 0),
        topStats: Array.isArray(entry?.topStats) ? entry.topStats.slice(0, 2).map(String) : [],
        bullets: Array.isArray(entry?.bullets) ? entry.bullets.slice(0, 3).map(String) : [],
      })).filter((entry) => entry.player && entry.topStats.length && entry.bullets.length)
    : [];
}

function validatePreview(value) {
  if (!value || typeof value !== "object") return null;
  const tournamentOverview = typeof value.tournamentOverview === "string" ? value.tournamentOverview.trim() : "";
  const modelExplainer = typeof value.modelExplainer === "string" ? value.modelExplainer.trim() : "";
  const pickApproach = typeof value.pickApproach === "string" ? value.pickApproach.trim() : "";
  if (!tournamentOverview || !modelExplainer || !pickApproach) return null;
  return { tournamentOverview, modelExplainer, pickApproach };
}

async function callGrok(apiKey, systemPrompt, userPrompt, label) {
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const rawText = await response.text();
  console.log("RAW RESPONSE:", rawText);

  if (!response.ok) {
    throw new Error(`Grok API ${response.status}: ${rawText}`);
  }

  const json = JSON.parse(rawText);
  const content = extractMessageContent(json?.choices?.[0]?.message?.content);
  if (!content || typeof content !== "string") {
    throw new Error("Grok API returned no message content.");
  }
  return parseJsonPayload(content, label);
}

async function generateSection(apiKey, label, prompt) {
  try {
    const result = await callGrok(apiKey, SYSTEM_PROMPT, prompt, label);
    const picks = validatePickArray(result);
    if (!Array.isArray(result) || picks.length === 0) {
      console.log(`${label.toUpperCase()} PARSED EMPTY:`, JSON.stringify(result, null, 2));
    }
    return picks;
  } catch (error) {
    console.error(`Failed to generate ${label}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function generatePreview(apiKey, prompt) {
  try {
    const result = await callGrok(apiKey, PREVIEW_SYSTEM_PROMPT, prompt, "preview");
    return validatePreview(result);
  } catch (error) {
    console.error("Failed to generate preview:", error instanceof Error ? error.message : error);
    return null;
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
  const summary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 30);
  const previewSummary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 20);
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
  const previewPrompt = `You are writing a concise tournament betting preview for a sports analytics website. Based on this model data for ${tournamentName}: ${previewSummary}. Write three short sections with a bold label and 2-4 sentences each. Section 1 label: "The Tournament" - describe the course, what type of game it rewards, and why this event matters. Section 2 label: "How Our Model Works This Week" - explain the active course weights in plain English, which stat categories are most important at this course and why, referencing the specific weight percentages. Section 3 label: "How We're Approaching the Picks" - explain the tiered betting logic: outrights are high risk/high reward targeting model value outside the top 3, top 5 and top 10 mix floor and value, top 20 targets consistency. Keep each section to 3-4 sentences max. Sound like a sharp analyst, not a copywriter. Do not use filler phrases. Return as JSON with fields: tournamentOverview, modelExplainer, pickApproach - each a plain string of 3-4 sentences.`;

  const emptySection = [];
  let outrights = emptySection;
  let top5 = emptySection;
  let top10 = emptySection;
  let top20 = emptySection;
  let preview = null;

  if (apiKey) {
    outrights = await generateSection(apiKey, "outrights", outrightsPrompt);
    await new Promise((r) => setTimeout(r, 1500));
    top5 = await generateSection(apiKey, "top5", top5Prompt);
    await new Promise((r) => setTimeout(r, 1500));
    top10 = await generateSection(apiKey, "top10", top10Prompt);
    await new Promise((r) => setTimeout(r, 1500));
    top20 = await generateSection(apiKey, "top20", top20Prompt);
    await new Promise((r) => setTimeout(r, 1500));
    preview = await generatePreview(apiKey, previewPrompt);
  }

  const payload = {
    tournament: tournamentName,
    course: courseName,
    generatedAt: new Date().toISOString(),
    preview,
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
