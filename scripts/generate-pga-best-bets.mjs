import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const OUTPUT_PATH = path.join(DATA_DIR, "best-bets.json");
const API_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-4-1-fast-non-reasoning";
const FORCE = process.argv.includes("--force");

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

function buildSummary(tournamentData, powerRankings, playerStats, courseWeights, topLimit = 25) {
  const { powerByName, rawByName, rawByLastName } = buildPlayerMaps(powerRankings, playerStats);
  const weightEntry = findWeightEntry(courseWeights, tournamentData.tournamentName, tournamentData.courseName);
  const topRows = tournamentData.rows.slice(0, topLimit);

  const playerLines = topRows.map((row) => {
    const normalized = normalizeName(row.player);
    const powerRow = powerByName.get(normalized);
    const rawRow = rawByName.get(normalized) ?? rawByLastName.get(getLastNameKey(row.player)) ?? null;

    return [
      `name=${row.player}`,
      `tournamentRank=${row.rank}`,
      `powerRank=${powerRow?.rank ?? "NA"}`,
      `sgTotal=${rawRow?.sgTotal ?? row.sgTotal}`,
      `sgOTT=${rawRow?.sgOTT ?? row.sgOtt}`,
      `sgApp=${rawRow?.sgApp ?? row.sgApp}`,
      `sgAtG=${rawRow?.sgAtG ?? row.sgAtg}`,
      `sgPutt=${rawRow?.sgPutt ?? row.sgPutt}`,
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

async function callGrokWithRetry(prompt, maxRetries = 3, validate) {
  for (let index = 0; index < maxRetries; index += 1) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY || process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const content = extractMessageContent(data?.choices?.[0]?.message?.content);
      console.log("RAW RESPONSE:", content);
      const cleaned = cleanJsonText(content);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON block found in response");
      const parsed = JSON.parse(jsonMatch[0]);
      if (validate) validate(parsed, content);
      return parsed;
    } catch (error) {
      console.log(`Attempt ${index + 1} failed: ${error instanceof Error ? error.message : error}`);
      if (index < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, index) * 1500));
      } else {
        throw error;
      }
    }
  }
}

async function generatePreview(apiKey, prompt) {
  try {
    const result = await callGrokWithRetry(`${PREVIEW_SYSTEM_PROMPT}\n\n${prompt}`, 3);
    return validatePreview(result);
  } catch (error) {
    console.error("Failed to generate preview:", error instanceof Error ? error.message : error);
    return null;
  }
}

function validateSectionCount(name, value, expectedCount, rawResponse) {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    console.log(`INVALID ${name.toUpperCase()} RESPONSE:\n${rawResponse}\n`);
    throw new Error(`${name} is missing or returned ${Array.isArray(value) ? value.length : 0} picks; expected ${expectedCount}.`);
  }
  return validatePickArray(value);
}

async function generateCombinedPicks(apiKey, prompt) {
  const rawPayload = await callGrokWithRetry(prompt, 3, (parsed, rawResponse) => {
    if (!parsed.outrights || !parsed.top5 || !parsed.top10 || !parsed.top20) {
      console.log(`INVALID COMBINED PICKS RESPONSE:\n${rawResponse}\n`);
      throw new Error("Missing sections in response");
    }
  });
  const rawResponse = JSON.stringify(rawPayload, null, 2);
  return {
    outrights: validateSectionCount("outrights", rawPayload.outrights, 3, rawResponse),
    top5: validateSectionCount("top5", rawPayload.top5, 3, rawResponse),
    top10: validateSectionCount("top10", rawPayload.top10, 4, rawResponse),
    top20: validateSectionCount("top20", rawPayload.top20, 5, rawResponse),
  };
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
  const summary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 25);
  const previewSummary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 20);
  const tournamentName = tournamentData.tournamentName;
  const courseName = tournamentData.courseName;

  if (!apiKey) {
    console.warn("GROK_API_KEY is not set. Writing empty best-bets sections.");
  }

  const combinedPrompt = `You are a sharp data-driven golf betting analyst. Based on this tournament model data: ${summary}. Return ONLY a raw JSON object with no markdown, no code fences, no explanation. The object must have exactly four keys: outrights, top5, top10, top20. Each key is an array of player pick objects. outrights: 3 picks from tournament ranks 4-15, high risk high reward. top5: 3 picks mixing one from ranks 1-3 and two from ranks 4-12. top10: 4 picks prioritizing players with strong ATG and PUT scores and high floor. top20: 5 picks from ranks 8-20 prioritizing consistency over upside. Each pick object has these exact fields: player (string), tournamentRank (number), powerRank (number), topStats (array of exactly 2 strings showing stat=value), bullets (array of exactly 3 strings each referencing a specific number from the data). Do not include any text outside the JSON object.`;
  const previewPrompt = `You are writing a concise tournament betting preview for a sports analytics website. Based on this model data for ${tournamentName}: ${previewSummary}. Write three short sections with a bold label and 2-4 sentences each. Section 1 label: "The Tournament" - describe the course, what type of game it rewards, and why this event matters. Section 2 label: "How Our Model Works This Week" - explain the active course weights in plain English, which stat categories are most important at this course and why, referencing the specific weight percentages. Section 3 label: "How We're Approaching the Picks" - explain the tiered betting logic: outrights are high risk/high reward targeting model value outside the top 3, top 5 and top 10 mix floor and value, top 20 targets consistency. Keep each section to 3-4 sentences max. Sound like a sharp analyst, not a copywriter. Do not use filler phrases. Return as JSON with fields: tournamentOverview, modelExplainer, pickApproach - each a plain string of 3-4 sentences.`;

  const emptySection = [];
  let outrights = emptySection;
  let top5 = emptySection;
  let top10 = emptySection;
  let top20 = emptySection;
  let preview = null;

  if (apiKey) {
    const combined = await generateCombinedPicks(apiKey, combinedPrompt);
    outrights = combined.outrights;
    top5 = combined.top5;
    top10 = combined.top10;
    top20 = combined.top20;
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
