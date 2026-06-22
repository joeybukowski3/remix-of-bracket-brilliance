import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const OUTPUT_PATH = path.join(DATA_DIR, "best-bets.json");
const ODDS_OUTPUT_PATH = path.join(DATA_DIR, "pga-odds.json");
const API_URL = "https://api.x.ai/v1/chat/completions";
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const MODEL = "grok-4-1-fast-non-reasoning";
const FORCE = process.argv.includes("--force");

const PREVIEW_SYSTEM_PROMPT =
  "You are writing a concise tournament betting preview for a sports analytics website. Stay factual, sharp, and concise. Do not use filler. Output only valid JSON with no markdown.";

// ─── Utilities ───────────────────────────────────────────────────────────────

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

function formatAmericanOdds(price) {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return price > 0 ? `+${price}` : `${price}`;
}

function impliedProbability(americanOdds) {
  const n = Number(americanOdds);
  if (!Number.isFinite(n)) return null;
  const prob = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  return `${(prob * 100).toFixed(1)}%`;
}

// ─── Odds API ────────────────────────────────────────────────────────────────

async function fetchOdds(oddsApiKey, tournamentName) {
  if (!oddsApiKey) {
    console.warn("ODDS_API_KEY not set — skipping odds fetch.");
    return {};
  }

  try {
    // Step 1: find the right sport key
    const sportsRes = await fetch(`${ODDS_BASE}/sports/?apiKey=${oddsApiKey}`);
    const sports = await sportsRes.json();
    const golfSports = sports.filter(
      (s) => s.group?.toLowerCase().includes("golf") || s.key?.toLowerCase().includes("golf")
    );
    console.log("Golf sports found:", golfSports.map((s) => s.key).join(", "));

    // Prefer a sport key that matches the tournament name, fall back to any active golf key
    const tournamentKey = normalizeEventKey(tournamentName);
    let sportKey =
      golfSports.find((s) => normalizeEventKey(s.title).includes(tournamentKey))?.key ??
      golfSports.find((s) => s.key.includes("pga_championship"))?.key ??
      golfSports.find((s) => s.key.includes("pga_tour"))?.key ??
      golfSports.find((s) => s.active)?.key ??
      null;

    if (!sportKey) {
      console.warn("No active golf sport key found on The Odds API.");
      return {};
    }
    console.log("Using sport key:", sportKey);

    // Step 2: fetch outright winner odds
    const outrightRes = await fetch(
      `${ODDS_BASE}/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=us&markets=outrights&oddsFormat=american`
    );
    const outrightData = await outrightRes.json();

    // Build odds lookup keyed by normalized player name
    const oddsLookup = {};

    if (Array.isArray(outrightData)) {
      // Pick the bookmaker with the most outcomes (typically DraftKings or FanDuel)
      const event = outrightData[0];
      if (event?.bookmakers?.length) {
        const bestBook = event.bookmakers.reduce((best, bk) =>
          (bk.markets?.[0]?.outcomes?.length ?? 0) > (best.markets?.[0]?.outcomes?.length ?? 0)
            ? bk
            : best
        );
        console.log("Using bookmaker:", bestBook.title);
        bestBook.markets?.[0]?.outcomes?.forEach((outcome) => {
          const key = normalizeName(outcome.name);
          const lastName = getLastNameKey(outcome.name);
          const entry = { outright: formatAmericanOdds(outcome.price) };
          oddsLookup[key] = entry;
          if (lastName && !oddsLookup[`_last_${lastName}`]) {
            oddsLookup[`_last_${lastName}`] = entry;
          }
        });
        console.log(`Loaded outright odds for ${Object.keys(oddsLookup).length} players.`);
      }
    }

    // Step 3: attempt player prop markets (top 5 / top 10 / top 20)
    if (Array.isArray(outrightData) && outrightData[0]?.id) {
      const eventId = outrightData[0].id;
      for (const market of ["player_top_5_finisher", "player_top_10_finisher", "player_top_20_finisher"]) {
        const marketKey = market.includes("top_5") ? "top5"
          : market.includes("top_10") ? "top10"
          : "top20";
        try {
          const propRes = await fetch(
            `${ODDS_BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${oddsApiKey}&regions=us&markets=${market}&oddsFormat=american`
          );
          const propData = await propRes.json();
          if (propData?.bookmakers?.length) {
            const bestBook = propData.bookmakers[0];
            bestBook.markets?.[0]?.outcomes?.forEach((outcome) => {
              const key = normalizeName(outcome.name);
              const lastName = getLastNameKey(outcome.name);
              if (oddsLookup[key]) {
                oddsLookup[key][marketKey] = formatAmericanOdds(outcome.price);
              }
              if (lastName && oddsLookup[`_last_${lastName}`]) {
                oddsLookup[`_last_${lastName}`][marketKey] = formatAmericanOdds(outcome.price);
              }
            });
            console.log(`Loaded ${marketKey} odds.`);
          }
        } catch (err) {
          console.warn(`Could not fetch ${market}:`, err.message);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Save raw odds for reference
    writeFileSync(ODDS_OUTPUT_PATH, `${JSON.stringify(oddsLookup, null, 2)}\n`, "utf8");
    console.log(`Wrote ${ODDS_OUTPUT_PATH}`);
    return oddsLookup;
  } catch (err) {
    console.error("Odds fetch failed:", err.message);
    return {};
  }
}

function lookupOdds(oddsLookup, playerName) {
  const key = normalizeName(playerName);
  const lastName = getLastNameKey(playerName);
  return oddsLookup[key] ?? oddsLookup[`_last_${lastName}`] ?? null;
}

function attachOddsToPickArray(picks, oddsLookup) {
  return picks.map((pick) => {
    const odds = lookupOdds(oddsLookup, pick.player);
    return { ...pick, odds: odds ?? null };
  });
}

// ─── Value Bets ──────────────────────────────────────────────────────────────

async function generateValueBets(apiKey, allPicks, oddsLookup) {
  if (!apiKey) return [];

  // Attach odds to all picks for the value bets prompt
  const picksWithOdds = {
    outrights: attachOddsToPickArray(allPicks.outrights, oddsLookup),
    top5: attachOddsToPickArray(allPicks.top5, oddsLookup),
    top10: attachOddsToPickArray(allPicks.top10, oddsLookup),
    top20: attachOddsToPickArray(allPicks.top20, oddsLookup),
  };

  // Only include players that actually have odds
  const allPicksFlat = [
    ...picksWithOdds.outrights.map((p) => ({ ...p, market: "outright" })),
    ...picksWithOdds.top5.map((p) => ({ ...p, market: "top5" })),
    ...picksWithOdds.top10.map((p) => ({ ...p, market: "top10" })),
    ...picksWithOdds.top20.map((p) => ({ ...p, market: "top20" })),
  ].filter((p) => p.odds && p.odds[p.market === "outright" ? "outright" : p.market]);

  if (!allPicksFlat.length) {
    console.warn("No odds available for value bets analysis — skipping.");
    return [];
  }

  const picksSummary = allPicksFlat
    .map((p) => {
      const marketOdds = p.odds[p.market === "outright" ? "outright" : p.market] ?? "N/A";
      return `player=${p.player} market=${p.market} odds=${marketOdds} tournamentRank=${p.tournamentRank} powerRank=${p.powerRank}`;
    })
    .join("\n");

  const prompt = `You are a sharp golf betting analyst identifying value bets. Here are the model picks with their American odds:\n${picksSummary}\n\nIdentify the 3 best value bets where the model ranking significantly outperforms what the odds imply — meaning the player ranks much higher in our model than their odds suggest. Return ONLY a raw JSON array named valueBets with no markdown. Each element has these exact fields: player (string), market (string: outright/top5/top10/top20), americanOdds (string like "+650"), modelRank (number), impliedProbability (string like "13.3%"), modelEdge (string: one sentence explaining why our model likes them more than the market does, referencing specific stat ranks).`;

  try {
    const result = await callGrokWithRetry(prompt, 3, undefined, "value-bets");
    const arr = Array.isArray(result) ? result : result?.valueBets;
    if (!Array.isArray(arr) || !arr.length) return [];
    return arr.map((v) => ({
      player: v.player ?? "",
      market: v.market ?? "",
      americanOdds: v.americanOdds ?? "N/A",
      modelRank: Number(v.modelRank ?? 0),
      impliedProbability: v.impliedProbability ?? impliedProbability(Number((v.americanOdds ?? "0").replace("+", ""))) ?? "N/A",
      modelEdge: v.modelEdge ?? "",
    })).filter((v) => v.player && v.modelEdge);
  } catch (err) {
    console.error("Value bets generation failed:", err.message);
    return [];
  }
}

// ─── Existing helpers (unchanged) ────────────────────────────────────────────

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
    if (lastName && !rawByLastName.has(lastName)) rawByLastName.set(lastName, row);
  });
  return { powerByName, rawByName, rawByLastName };
}

function findWeightEntry(courseWeights, tournamentName, courseName) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);
  return (
    courseWeights.find(
      (e) => normalizeEventKey(e.tournament) === tournamentKey && normalizeEventKey(e.course) === courseKey
    ) ??
    courseWeights.find((e) => normalizeEventKey(e.tournament) === tournamentKey) ??
    courseWeights.find((e) => normalizeEventKey(e.course) === courseKey) ??
    courseWeights.find((e) => normalizeEventKey(e.tournament) === "default") ??
    null
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
        `SG Total ${(weightEntry.weights.sgTotal * 100).toFixed(1)}%`,
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
    return rawContent.map((item) => (typeof item === "string" ? item : item?.text ?? "")).join("").trim();
  }
  return "";
}

function extractJsonSnippet(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstArray = trimmed.indexOf("[");
  const firstObject = trimmed.indexOf("{");
  const firstIndex = [firstArray, firstObject].filter((v) => v >= 0).sort((a, b) => a - b)[0];
  if (firstIndex === undefined) throw new Error("No JSON opening bracket found in Grok response.");
  const opening = trimmed[firstIndex];
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = firstIndex; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === opening) depth++;
    if (char === closing) { depth--; if (depth === 0) return trimmed.slice(firstIndex, i + 1); }
  }
  throw new Error("Could not find a complete JSON block in Grok response.");
}

function cleanJsonText(rawText) {
  return rawText
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/^\s*json\s*/i, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

function sanitizeResponseSnippet(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[`]+/g, "")
    .slice(0, 260)
    .trim();
}

function normalizeJsonCandidate(text) {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, " ")
    .trim();
}

function removeTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function describeJsonParseError(error, source) {
  if (!(error instanceof SyntaxError)) return error instanceof Error ? error.message : String(error);
  const match = error.message.match(/position\s+(\d+)/i);
  const position = match ? Number(match[1]) : null;
  if (!Number.isFinite(position)) return error.message;
  const start = Math.max(0, position - 80);
  const end = Math.min(source.length, position + 80);
  const excerpt = source.slice(start, end).replace(/\s+/g, " ");
  return `${error.message} near: ${excerpt}`;
}

export function parseModelJson(text) {
  const cleaned = cleanJsonText(text);
  const snippet = extractJsonSnippet(cleaned);
  const normalized = normalizeJsonCandidate(snippet);
  const candidates = [
    normalized,
    removeTrailingCommas(normalized),
  ].filter((candidate, index, array) => array.indexOf(candidate) === index);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return { parsed: JSON.parse(candidate), snippet: candidate };
    } catch (error) {
      lastError = new Error(describeJsonParseError(error, candidate));
    }
  }
  throw lastError ?? new Error("Unable to parse model JSON response.");
}

export function validatePickArray(value, officialPlayers = null) {
  const officialPlayerKeys = officialPlayers
    ? new Set(officialPlayers.map((player) => normalizeName(player)))
    : null;
  return Array.isArray(value)
    ? value
        .map((entry) => ({
          player: entry?.player ?? "",
          tournamentRank: Number(entry?.tournamentRank ?? 0),
          powerRank: Number(entry?.powerRank ?? 0),
          topStats: Array.isArray(entry?.topStats) ? entry.topStats.slice(0, 2).map(String) : [],
          bullets: Array.isArray(entry?.bullets) ? entry.bullets.slice(0, 3).map(String) : [],
        }))
        .filter((e) => e.player && e.topStats.length && e.bullets.length)
        .filter((e) => !officialPlayerKeys || officialPlayerKeys.has(normalizeName(e.player)))
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

async function callGrokWithRetry(prompt, maxRetries = 3, validate, label = "grok-call") {
  for (let index = 0; index < maxRetries; index++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY || process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status} from Grok: ${sanitizeResponseSnippet(detail)}`);
      }
      const data = await response.json();
      const content = extractMessageContent(data?.choices?.[0]?.message?.content);
      console.log(`[${label}] attempt ${index + 1} raw snippet: ${sanitizeResponseSnippet(content)}`);
      const { parsed } = parseModelJson(content);
      if (validate) validate(parsed, content);
      return parsed;
    } catch (error) {
      console.log(`[${label}] attempt ${index + 1} failed: ${error instanceof Error ? error.message : error}`);
      if (index < maxRetries - 1) await new Promise((r) => setTimeout(r, Math.pow(2, index) * 1500));
      else throw error;
    }
  }
}

async function generatePreview(apiKey, prompt) {
  try {
    const result = await callGrokWithRetry(`${PREVIEW_SYSTEM_PROMPT}\n\n${prompt}`, 3, undefined, "preview");
    return validatePreview(result);
  } catch (error) {
    console.error("Failed to generate preview:", error instanceof Error ? error.message : error);
    return null;
  }
}

function validateSectionCount(name, value, expectedCount, rawResponse) {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    console.log(`INVALID ${name.toUpperCase()} RESPONSE:\n${rawResponse}\n`);
    throw new Error(`${name} returned ${Array.isArray(value) ? value.length : 0} picks; expected ${expectedCount}.`);
  }
  return validatePickArray(value);
}

async function generateCombinedPicks(apiKey, summary, officialPlayers) {
  const basePrompt = `You are a sharp data-driven golf betting analyst. Based on this tournament model data:\n${summary}\n\nReturn ONLY a raw JSON object with no markdown, no code fences, no explanation. Each pick object has these exact fields: player (string), tournamentRank (number), powerRank (number), topStats (array of exactly 2 strings showing stat=value), bullets (array of exactly 2 strings each referencing a specific number from the data).`;

  const prompt1 = `${basePrompt}\n\nReturn an object with exactly two keys:\noutrights: array of exactly 5 picks from tournament ranks 3-20 that represent MODEL VALUE — players where their model rank suggests they are significantly more likely to win than their outright odds imply. Avoid heavy favorites with low odds. Prioritize players with strong course-fit stats at competitive prices.\ntop5: array of exactly 5 picks from ranks 1-15 where the model rank outperforms what the top-5 market is pricing — players the market is undervaluing relative to their stat profile.`;

  const prompt2 = `${basePrompt}\n\nReturn an object with exactly two keys:\ntop10: array of exactly 6 picks from ranks 1-20 where the model ranking and course-fit stats suggest better top-10 probability than the market is pricing. Include a mix of chalk and value plays.\ntop20: array of exactly 6 picks from ranks 5-30 where the player's floor stats (bogey avoidance, consistency) suggest top-20 probability the market is undervaluing.`;

  const [result1, result2] = await Promise.all([
    callGrokWithRetry(prompt1, 3, (parsed) => {
      if (!parsed.outrights || !parsed.top5) throw new Error("Missing outrights or top5");
    }, "combined-picks-1"),
    callGrokWithRetry(prompt2, 3, (parsed) => {
      if (!parsed.top10 || !parsed.top20) throw new Error("Missing top10 or top20");
    }, "combined-picks-2"),
  ]);

  await new Promise((r) => setTimeout(r, 1000));

  return {
    outrights: validatePickArray(result1.outrights, officialPlayers),
    top5: validatePickArray(result1.top5, officialPlayers),
    top10: validatePickArray(result2.top10, officialPlayers),
    top20: validatePickArray(result2.top20, officialPlayers),
  };
}

function getEventIdentifiers(event) {
  return [
    event?.tournamentId,
    event?.tournamentID,
    event?.id,
    event?.tournamentSlug,
    event?.slug,
  ].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim().toLowerCase());
}

export function validateCurrentField(currentField) {
  if (!currentField?.validated) return "current-field.json is not validated";
  if (currentField.source !== "pga-tour-official-field") return "current-field.json is not sourced from the official PGA TOUR field";
  if (!currentField.alternatesExcluded) return "current-field.json does not confirm alternates are excluded";
  if (!currentField.tournament || !Array.isArray(currentField.players) || !currentField.players.length) {
    return "current-field.json is missing a tournament name or official players";
  }
  return null;
}

export function modelMatchesCurrentField(model, currentField) {
  if (!model || !currentField) return false;
  if (normalizeEventKey(model.tournamentName) === normalizeEventKey(currentField.tournament)) return true;
  const fieldIdentifiers = new Set(getEventIdentifiers(currentField));
  return getEventIdentifiers(model).some((identifier) => fieldIdentifiers.has(identifier));
}

export function pickTournamentData(currentField, currentTournament, nextTournament) {
  const candidates = [
    ["current-tournament.json", currentTournament],
    ["next-tournament.json", nextTournament],
  ];
  const match = candidates.find(([, model]) => modelMatchesCurrentField(model, currentField));
  if (!match) return null;
  const [source, tournamentData] = match;
  return { source, tournamentData };
}

export function prepareTournamentModel(tournamentData, currentField) {
  if (!tournamentData?.rows?.length) return { model: null, reason: "matching tournament model has no rows" };
  const officialPlayers = new Set(currentField.players.map((player) => normalizeName(player)));
  const matchedRows = tournamentData.rows.filter((row) => officialPlayers.has(normalizeName(row.player)));
  const coverage = matchedRows.length / tournamentData.rows.length;
  if (coverage < 0.7) {
    return { model: null, reason: `matching tournament model only contains ${(coverage * 100).toFixed(0)}% official-field players` };
  }
  return { model: { ...tournamentData, rows: matchedRows }, reason: null };
}

export function canGenerateBestBets({ currentField, tournamentData, apiKey }) {
  const fieldError = validateCurrentField(currentField);
  if (fieldError) return fieldError;
  if (!tournamentData || !modelMatchesCurrentField(tournamentData, currentField)) {
    return "no tournament model matches the official current field";
  }
  if (!apiKey) return "GROK_API_KEY or XAI_API_KEY is not set";
  return null;
}

export function preparePicksForOutput(picks, oddsLookup, hasOddsApiKey) {
  const withOdds = attachOddsToPickArray(picks, oddsLookup);
  return hasOddsApiKey ? withOdds : withOdds.map((pick) => ({ ...pick, odds: null }));
}

function shouldSkip(outputPath, force) {
  if (force || !existsSync(outputPath)) return false;
  try {
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    if (!existing?.generatedAt) return false;
    const hasContent = ["outrights", "top5", "top10", "top20"].some(
      (key) => Array.isArray(existing[key]) && existing[key].length > 0
    );
    if (!hasContent) return false;
    return formatDateEt(existing.generatedAt) === getTodayEt();
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (shouldSkip(OUTPUT_PATH, FORCE)) {
    console.log("best-bets.json already generated today. Pass --force to regenerate.");
    return;
  }

  const currentField = loadJson("public/data/pga/current-field.json");
  const nextTournament = loadJson("public/data/pga/next-tournament.json");
  const currentTournament = loadJson("public/data/pga/current-tournament.json");
  const powerRankings = loadJson("public/data/pga/power-rankings.json");
  const playerStats = loadJson("public/data/pga/player-stats-raw.json");
  const courseWeights = loadJson("public/data/pga/course-weights.json");
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const oddsApiKey = process.env.ODDS_API_KEY;
  const selection = pickTournamentData(currentField, currentTournament, nextTournament);
  const selectionError = canGenerateBestBets({ currentField, tournamentData: selection?.tournamentData, apiKey });
  if (selectionError) {
    console.warn(`[pga-best-bets] Skipping generation: ${selectionError}. Checked public/data/pga/current-tournament.json and public/data/pga/next-tournament.json against official current-field.json (${currentField?.tournament ?? "unknown event"}).`);
    return;
  }

  const { model: tournamentData, reason: modelError } = prepareTournamentModel(selection.tournamentData, currentField);
  if (modelError) {
    console.warn(`[pga-best-bets] Skipping generation: ${modelError}. Checked ${selection.source} against official current-field.json (${currentField.tournament}).`);
    return;
  }

  console.log(`[pga-best-bets] Using ${selection.source} for ${currentField.tournament}.`);
  const summary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 25);
  const previewSummary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 20);
  const tournamentName = tournamentData.tournamentName;
  const courseName = tournamentData.courseName;

  if (!oddsApiKey) console.warn("ODDS_API_KEY is not set. Odds will not be attached.");

  // Fetch odds first
  const oddsLookup = await fetchOdds(oddsApiKey, tournamentName);

  // ── Value filtering + re-ranking ─────────────────────────────────────────────
  // Convert American odds string to implied probability
  function toImplied(oddsStr) {
    if (!oddsStr) return null;
    const n = parseFloat(String(oddsStr).replace("+", ""));
    if (!Number.isFinite(n)) return null;
    return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  }

  // Model probability proxy: exponential decay over field rank
  // Rank 1 gets ~100 units, rank 70 gets ~7 units (relative, not absolute %)
  function modelProxyScore(rank) {
    return Math.exp(-0.065 * (rank - 1)) * 100;
  }

  // Value edge: how much does model think player is better than market implies?
  // Edge > 1.0 = model likes player MORE than market → value bet
  function computeValueEdge(tournamentRank, oddsStr) {
    const implied = toImplied(oddsStr);
    if (implied == null || implied <= 0) return -1;
    const modelProb = modelProxyScore(tournamentRank);
    return modelProb / implied;
  }

  // Filter picks to only those with odds for the relevant market, then sort by value
  function filterByValueAndOdds(picks, marketKey) {
    return picks
      .map((p) => {
        const odds = p.odds?.[marketKey] ?? p.odds?.outright ?? null;
        if (!odds) return null;
        const edge = computeValueEdge(p.tournamentRank, odds);
        return { ...p, _edge: edge };
      })
      .filter(Boolean)
      .sort((a, b) => b._edge - a._edge)
      // eslint-disable-next-line no-unused-vars
      .map(({ _edge, ...pick }) => pick);
  }

  const previewPrompt = `You are writing a concise tournament betting preview for a sports analytics website. Based on this model data for ${tournamentName}: ${previewSummary}. Write three short sections with a bold label and 2-4 sentences each. Section 1 label: "The Tournament" - describe the course, what type of game it rewards, and why this event matters. Section 2 label: "How Our Model Works This Week" - explain the active course weights in plain English, which stat categories are most important at this course and why, referencing the specific weight percentages. Section 3 label: "How We're Approaching the Picks" - explain the tiered betting logic. Return as JSON with fields: tournamentOverview, modelExplainer, pickApproach - each a plain string of 3-4 sentences.`;

  let outrights = [], top5 = [], top10 = [], top20 = [], preview = null, valueBets = [];

  if (apiKey) {
    const combined = await generateCombinedPicks(apiKey, summary, currentField.players);
    const pickArrays = {
      outrights: preparePicksForOutput(combined.outrights, oddsLookup, Boolean(oddsApiKey)),
      top5: preparePicksForOutput(combined.top5, oddsLookup, Boolean(oddsApiKey)),
      top10: preparePicksForOutput(combined.top10, oddsLookup, Boolean(oddsApiKey)),
      top20: preparePicksForOutput(combined.top20, oddsLookup, Boolean(oddsApiKey)),
    };

    if (oddsApiKey) {
      outrights = filterByValueAndOdds(pickArrays.outrights, "outright");
      top5 = filterByValueAndOdds(pickArrays.top5, "top5");
      top10 = filterByValueAndOdds(pickArrays.top10, "top10");
      top20 = filterByValueAndOdds(pickArrays.top20, "top20");
    } else {
      ({ outrights, top5, top10, top20 } = pickArrays);
    }

    console.log(`After value filter: outrights=${outrights.length} top5=${top5.length} top10=${top10.length} top20=${top20.length}`);

    await new Promise((r) => setTimeout(r, 1500));
    preview = await generatePreview(apiKey, previewPrompt);

    await new Promise((r) => setTimeout(r, 1500));
    if (oddsApiKey) {
      valueBets = await generateValueBets(apiKey, combined, oddsLookup);
    }
  }

  const payload = {
    tournament: tournamentName,
    course: courseName,
    generatedAt: new Date().toISOString(),
    preview,
    valueBets,
    outrights,
    top5,
    top10,
    top20,
  };

  if (normalizeEventKey(payload.tournament) !== normalizeEventKey(currentField.tournament)) {
    throw new Error(`Refusing to write best-bets.json for ${payload.tournament}; official current field is ${currentField.tournament}.`);
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(payload, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
