import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildCrossoverAngles,
  buildPostOpenAngles,
  isPostOpenWindow,
  MAJOR_SWING_WORKLOAD_LIMITATION,
} from "./lib/pga-post-open-angles.mjs";
import { PGA_MARKET_KEYS, marketOddsFor } from "./lib/pga-market-odds.mjs";
import { CANONICAL_MARKETS } from "./config/pga-best-bets-config.mjs";
import { fetchProviderOdds } from "./lib/pga-odds-provider.mjs";
import { computeFieldProbabilities } from "./lib/pga-probability-model.mjs";
import {
  applyThresholds,
  buildCandidateUniverse,
  buildRecommendationCopy,
  computePortfolioDiagnostics,
  priceCandidates,
  selectRecommendations,
} from "./lib/pga-best-bets-selection.mjs";
import {
  buildModelLeans,
  buildRecommendationEntry,
  buildUnavailableArtifact as buildV3UnavailableArtifact,
  buildV3Artifact,
  deriveV2Compatibility,
  deriveV2CompatibilityFromLeans,
} from "./lib/pga-best-bets-schema.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const OUTPUT_PATH = path.join(DATA_DIR, "best-bets.json");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "pga-best-bets");
const API_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-4-1-fast-non-reasoning";
const FORCE = process.argv.includes("--force");

// Dry-run: build and validate the complete Grok request payload (summary,
// post-Open context, every prompt) and either replay a stored fixture
// response (--fixture=path/to/fixture.json, a JSON object keyed by call
// label -- "combined-picks-1", "combined-picks-2", "preview", "article",
// "value-bets") or skip the paid call entirely -- never makes a real API
// request, never writes public/data/pga/best-bets.json. Always writes the
// assembled prompts + (fixture-derived or skipped) output to
// artifacts/pga-best-bets/dry-run.json for inspection.
const DRY_RUN = process.argv.includes("--dry-run");
const FIXTURE_ARG = process.argv.find((arg) => arg.startsWith("--fixture="));
const FIXTURE_PATH = FIXTURE_ARG ? FIXTURE_ARG.slice("--fixture=".length) : null;
const FIXTURE_DATA = FIXTURE_PATH ? JSON.parse(readFileSync(path.resolve(FIXTURE_PATH), "utf8")) : null;
const DRY_RUN_PROMPTS = [];

const PREVIEW_SYSTEM_PROMPT =
  "You are writing a concise tournament betting preview for a sports analytics website. Stay factual, sharp, and concise. Do not use filler. Output only valid JSON with no markdown.";

// ─── Utilities ───────────────────────────────────────────────────────────────

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function loadJsonSafe(relativePath, fallback) {
  try {
    return loadJson(relativePath);
  } catch {
    return fallback;
  }
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

// ─── Odds ────────────────────────────────────────────────────────────────────
// Live odds now come exclusively from fetchProviderOdds (pga-odds-provider.mjs) --
// a provider-neutral, fail-closed adapter. See buildDeterministicSelection below.

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

// Grok-authored "value bets" (an LLM asserting its own edge claims over the
// market) are removed under PR A: expected value now comes exclusively from
// the deterministic candidate/selection pipeline in
// scripts/lib/pga-best-bets-selection.mjs. Grok never selects golfers or
// asserts an edge -- see buildDeterministicSelection and generateArticle's
// DATA_DISCIPLINE_RULES below.

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

const OPEN_RESULT_LABELS = {
  top5: "Top 5",
  top10: "Top 10",
  "11-20": "11-20",
  "21-40": "21-40",
  "41+": "41+",
  missed_cut: "Missed Cut",
  did_not_play: "Did Not Play The Open",
};
const SCOTTISH_LABELS = {
  played_made_cut: "Played Scottish Open, made cut",
  played_missed_cut: "Played Scottish Open, missed cut",
  skipped: "Skipped Scottish Open",
};
const FEDEX_LABELS = { safe: "Safe (Top 50)", bubble: "Bubble (51-80)", chasing: "Chasing (81+)", unranked: "Unranked" };

/**
 * Post-Open / FedExCup context block for the top model rows, appended to
 * the summary ONLY when isPostOpenWindow() says the current tournament is
 * the one immediately following The Open Championship (e.g. the 3M Open).
 * Every line is derived from buildPostOpenAngles (round-history-pga.json +
 * fedex-standings.json) -- a player with no data for an angle is labeled
 * "Did Not Play" / "Skipped" / "Unranked" explicitly, never omitted or
 * guessed, so the prompt below can instruct Grok to only build an angle
 * narrative where the label isn't one of those "no data" states.
 */
function buildPostOpenContext(topRows, { rounds, fedexRows, sinceDate }) {
  const lines = topRows.map((row) => {
    const angles = buildPostOpenAngles(row.player, { rounds, fedexRows, sinceDate });
    const fedex = angles.fedex.rank != null ? `${FEDEX_LABELS[angles.fedex.status]} rank #${angles.fedex.rank}` : FEDEX_LABELS[angles.fedex.status];
    return [
      `name=${row.player}`,
      `openResult=${OPEN_RESULT_LABELS[angles.openResult]}`,
      `scottishOpen=${SCOTTISH_LABELS[angles.scottishOpen]}`,
      `twoWeekWorkloadRounds=${angles.workloadRoundCount}`,
      `fedexCup=${fedex}`,
    ].join(" | ");
  });
  return [
    "This is the tournament immediately following The Open Championship. Post-Open workload, motivation, and FedExCup context for the top model rows:",
    ...lines,
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
          bullets: Array.isArray(entry?.bullets) ? entry.bullets.slice(0, 4).map(String) : [],
          // Optional -- only present when the prompt asked for them (outrights/
          // top10/top20) and the model actually returned them. A short-form
          // pick (e.g. legacy fixture data) without these still validates.
          risk: typeof entry?.risk === "string" ? entry.risk.trim() : "",
          angles: Array.isArray(entry?.angles) ? entry.angles.slice(0, 4).map(String).filter(Boolean) : [],
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

/** A section needs a non-empty heading and body -- an empty/malformed section is dropped rather than rendered blank. */
function validateArticleSection(entry) {
  const heading = typeof entry?.heading === "string" ? entry.heading.trim() : "";
  const body = typeof entry?.body === "string" ? entry.body.trim() : "";
  if (!heading || !body) return null;
  return { heading, body };
}

export function validateArticle(value) {
  if (!value || typeof value !== "object") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const dek = typeof value.dek === "string" ? value.dek.trim() : "";
  const introduction = typeof value.introduction === "string" ? value.introduction.trim() : "";
  const conclusion = typeof value.conclusion === "string" ? value.conclusion.trim() : "";
  const sections = Array.isArray(value.sections) ? value.sections.map(validateArticleSection).filter(Boolean) : [];
  if (!title || !introduction || !conclusion || sections.length < 3) return null;
  // Additive and optional: absent/malformed entries resolve to [] so older
  // artifacts and older Grok responses still validate unchanged.
  const keyTakeaways = Array.isArray(value.keyTakeaways)
    ? value.keyTakeaways
        .map((entry) => ({
          text: typeof entry?.text === "string" ? entry.text.trim() : "",
          players: Array.isArray(entry?.players) ? entry.players.map(String).filter(Boolean) : [],
        }))
        .filter((entry) => entry.text)
    : [];
  const playersToApproachCautiously = Array.isArray(value.playersToApproachCautiously)
    ? value.playersToApproachCautiously
        .map((entry) => ({
          player: typeof entry?.player === "string" ? entry.player.trim() : "",
          reason: typeof entry?.reason === "string" ? entry.reason.trim() : "",
        }))
        .filter((entry) => entry.player && entry.reason)
    : [];
  return { title, dek, introduction, sections, conclusion, keyTakeaways, playersToApproachCautiously };
}

/**
 * Full weekly betting article, written from the SAME generated picks the
 * cards use (never re-derived independently) so the prose can never
 * recommend a player the structured outrights/top10/top20 arrays don't
 * also contain -- see the "article recommendations match the structured
 * cards" validation requirement.
 */
/**
 * Frozen-selection summary handed to the article.
 *
 * Odds are resolved per recommendation, per market, through the same
 * marketOddsFor that enforceOddsLanguage uses -- a Top-10 price must never
 * imply the same player's Top-20 recommendation is priced. Every line is marked
 * explicitly (a real value, or odds=UNAVAILABLE) so a partially priced slate
 * tells the model exactly which individual recommendations may discuss market
 * value. Top-5 is included even though the editorial emphasis stays on
 * outright/top-10/top-20, so a selected top-5 player is never treated as an
 * outside name.
 */
export function buildPicksSummary(picks) {
  const pickLines = (label, list, market) =>
    (list ?? []).length
      ? `${label}: ${list
          .map((p) => {
            const odds = marketOddsFor(p, market);
            return `${p.player} (rank #${p.tournamentRank}, odds=${odds ?? "UNAVAILABLE"}${p.risk ? `, risk: ${p.risk}` : ""})`;
          })
          .join("; ")}`
      : `${label}: none generated this week.`;

  return [
    pickLines("Outright targets", picks.outrights, "outrights"),
    pickLines("Top-5 targets", picks.top5, "top5"),
    pickLines("Top-10 targets", picks.top10, "top10"),
    pickLines("Top-20 targets", picks.top20, "top20"),
  ].join("\n");
}

async function generateArticle(apiKey, { tournamentName, courseName, startDate, fieldSize, summary, picks, researchContext, hasAnyOdds, dataLimitations }) {
  const picksSummary = buildPicksSummary(picks);

  const researchLines = Object.values(researchContext ?? {}).map((entry) => {
    const parts = [
      `name=${entry.player}`,
      `openFinish=${entry.openFinishBucket}`,
      `scottish=${entry.scottish.participation}${entry.scottish.finishText ? ` (${entry.scottish.finishText})` : ""}`,
      `majorSwingWorkload=${entry.majorSwingWorkload.bucket}${entry.majorSwingWorkload.rounds != null ? ` (${entry.majorSwingWorkload.rounds} tracked rounds)` : ""}`,
      `fedex=${entry.fedex.bucket}${entry.fedex.rank != null ? ` rank #${entry.fedex.rank}` : ""}`,
      `modelRank=${entry.model.tournamentRank ?? "NA"}`,
      `powerRank=${entry.model.powerRank ?? "NA"}`,
    ];
    if (entry.crossoverAngles.length) parts.push(`crossover=${entry.crossoverAngles.map((a) => a.label).join(" / ")}`);
    return parts.join(" | ");
  });

  const researchBlock = researchLines.length
    ? [
        "",
        "Per-player research classifications for the selected picks (use these exact classifications; do not reclassify or invent):",
        ...researchLines,
        "These classifications are contextual research factors. They are not automatically positive or negative signals on their own. NO_TRACKED_ROUNDS means no rounds were recorded in the tracked events -- it does NOT mean the player rested.",
      ].join("\n")
    : "";

  const limitationsLine = dataLimitations.length ? `Known data limitations this week (state these plainly if relevant, do not work around them): ${dataLimitations.join("; ")}.` : "";

  const prompt = [
    `You are a senior golf betting analyst writing a serious, data-backed weekly PGA betting article for ${tournamentName}${courseName ? ` at ${courseName}` : ""}${startDate ? `, starting ${startDate}` : ""}${fieldSize ? ` (${fieldSize}-player field)` : ""}.`,
    "",
    "Tournament model data (top rows, ranks, strokes-gained categories, course weights):",
    summary,
    // The top-25 postOpenContext block is deliberately NOT sent here. It is
    // built from tournamentData.rows.slice(0, 25) for PICK SELECTION, before a
    // selection exists. Sending it to the article too would push classifications
    // for players who were never recommended, contradicting the selected-player
    // scope researchBlock establishes below.
    researchBlock,
    "",
    "These are the picks already selected for this week's cards -- your article must discuss these exact players and must not introduce a different outright/top-5/top-10/top-20 recommendation than what's listed:",
    picksSummary,
    "",
    limitationsLine,
    "",
    DATA_DISCIPLINE_RULES,
    "For every recommendation, cite at least two supplied factors, and at least one must come from either the model context or the post-Open research classifications above.",
    "Distinguish clearly between model strength, contextual research, market price, and risk. Never present a contextual research classification as proof of a result.",
    "Market-value analysis is permitted only for a recommendation whose supplied line contains a real odds value. A recommendation marked odds=UNAVAILABLE must not include price, market-value, mispricing, overlay, or value-at-the-number claims.",
    hasAnyOdds
      ? "Some recommendations are priced and some are not -- check each individual line's odds= marker before making any market claim about that recommendation. A price on one market for a player says nothing about that player's other markets."
      : "NO market prices are available this week: every recommendation is marked odds=UNAVAILABLE. You must NOT claim price value, market value, mispricing, overlay, or value at the current number for ANY pick. Describe model strength, ranking differential, model-supported targets, course fit, and contextual research instead.",
    "Tone: direct, confident but not absolute, analytical, concise, specific. No fake insider language. No 'lock', 'guarantee', or 'can't miss' claims. No generic AI phrases. No unnecessary explanation of basic golf concepts.",
    "Distinguish strong model-supported bets from secondary value plays and speculative long shots -- say explicitly which tier each pick belongs to.",
    "Include a short paragraph naming 1-3 players to approach cautiously (e.g. inflated price off one big result, weak underlying data) -- only if the data above actually supports a caution, otherwise omit this section.",
    "",
    "Return ONLY a raw JSON object with no markdown, no code fences. Fields: title (string), dek (one-sentence subtitle string), introduction (2-3 sentences), keyTakeaways (array of 3-5 objects, each { text: string, players: array of player names referenced -- names MUST come from the selected picks above }), sections (array of 6-12 objects, each { heading: string, body: string } -- cover tournament overview, course fit, recent form, post-Open workload, FedExCup motivation, crossover research angles, outright targets, top-10 targets, top-20 targets, players to approach cautiously if applicable, final betting card, and data limitations), playersToApproachCautiously (array of 0-3 objects, each { player: string, reason: string } -- only players actually supplied above, omit entirely if the data supports no caution), conclusion (a short final betting-card-style wrap-up naming the top plays by tier).",
  ].filter(Boolean).join("\n");

  try {
    const result = await callGrokWithRetry(prompt, 3, (parsed) => {
      if (!validateArticle(parsed)) throw new Error("Article response failed shape validation (missing title/introduction/conclusion or fewer than 3 sections)");
    }, "article", 6000);
    return validateArticle(result);
  } catch (error) {
    console.error("Failed to generate article:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function callGrokWithRetry(prompt, maxRetries = 3, validate, label = "grok-call", maxTokens = 8000) {
  if (DRY_RUN) {
    DRY_RUN_PROMPTS.push({ label, maxTokens, promptLength: prompt.length, prompt });
    const fixtureValue = FIXTURE_DATA?.[label];
    if (fixtureValue !== undefined) {
      if (validate) validate(fixtureValue, JSON.stringify(fixtureValue));
      console.log(`[${label}] dry-run: validated fixture response (no live request made).`);
      return fixtureValue;
    }
    console.log(`[${label}] dry-run: no fixture provided for this call -- skipping (this would be a live paid Grok request of ~${Math.ceil(prompt.length / 4)} estimated input tokens).`);
    return undefined;
  }
  for (let index = 0; index < maxRetries; index++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY || process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
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

const DATA_DISCIPLINE_RULES = [
  "Only use the player names, ranks, stats, and (when given) odds and post-Open/FedExCup values printed above. Never invent a statistic, an odds price, an injury, a withdrawal, or a player's tournament participation.",
  "Every player you write about MUST come from the frozen selection supplied below -- never introduce a player who isn't listed there.",
  "Cite at least one specific data value from the summary above in each claim (a rank, a strokes-gained number, a workload round count, a FedExCup rank, etc.) -- do not write a generic claim with no number behind it.",
  "If a post-Open/FedExCup context block was NOT provided above, do not mention Open Championship results, Scottish Open participation, workload, or FedExCup standing at all -- leave angles empty rather than guessing.",
].join(" ");

// Player/market/price selection is frozen deterministically BEFORE any Grok
// call -- see buildDeterministicSelection in main(). Grok's only remaining
// role is prose (preview + article) about that frozen selection; it is never
// asked to choose a golfer, a market, or an EV/value judgement. See PR A's
// "Grok restriction" requirement.

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

/**
 * Field coverage: how much of the OFFICIAL field the model actually contains.
 *
 * The denominator is the official field size, not the model's own row count.
 * Dividing by tournamentData.rows.length asked "what share of my rows are in
 * the field?", which is ~100% by construction once non-field rows are removed --
 * so the gate below could never detect entrants missing from the model. At the
 * Rocket Classic that reported 100% while 15 of 141 entrants (10.6%) had no
 * statistics and were silently unpickable.
 */
export function computeFieldCoverage(tournamentData, currentField) {
  const officialPlayers = new Map(
    (currentField?.players ?? []).map((player) => [normalizeName(player), player]),
  );
  const modeledKeys = new Set(
    (tournamentData?.rows ?? []).map((row) => normalizeName(row.player)),
  );

  const unmodeledPlayers = [...officialPlayers.entries()]
    .filter(([key]) => !modeledKeys.has(key))
    .map(([, player]) => player)
    .sort((left, right) => left.localeCompare(right));

  const fieldCount = officialPlayers.size;
  const modeledCount = fieldCount - unmodeledPlayers.length;

  return {
    fieldCount,
    modeledCount,
    unmodeledCount: unmodeledPlayers.length,
    coveragePct: fieldCount > 0 ? Number(((modeledCount / fieldCount) * 100).toFixed(1)) : 0,
    unmodeledPlayers,
    reason: "no current statistics available for these official entrants",
  };
}

const MIN_FIELD_COVERAGE = 0.7;

export function prepareTournamentModel(tournamentData, currentField) {
  if (!tournamentData?.rows?.length) return { model: null, reason: "matching tournament model has no rows" };
  const officialPlayers = new Set(currentField.players.map((player) => normalizeName(player)));
  const matchedRows = tournamentData.rows.filter((row) => officialPlayers.has(normalizeName(row.player)));

  const coverageDetail = computeFieldCoverage({ rows: matchedRows }, currentField);
  const coverage = officialPlayers.size > 0 ? coverageDetail.modeledCount / officialPlayers.size : 0;
  if (coverage < MIN_FIELD_COVERAGE) {
    // Name the missing entrants so a blocked run is diagnosable without
    // re-deriving the gap by hand.
    const names = coverageDetail.unmodeledPlayers.slice(0, 10).join(", ");
    const overflow = coverageDetail.unmodeledPlayers.length > 10
      ? ` and ${coverageDetail.unmodeledPlayers.length - 10} more`
      : "";
    return {
      model: null,
      reason: `matching tournament model covers only ${(coverage * 100).toFixed(0)}% of the ${officialPlayers.size}-player official field; missing ${names}${overflow}`,
    };
  }

  return { model: { ...tournamentData, rows: matchedRows }, coverage: coverageDetail, reason: null };
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

/**
 * Decides whether odds-based value filtering runs at all.
 *
 * Odds are an enrichment, not a precondition for publishing model picks --
 * the no-key path has always published unfiltered picks. Previously a
 * configured ODDS_API_KEY whose lookup came back empty still ran the value
 * filter, and since filterByValueAndOdds drops any pick without a price, a
 * total odds-provider failure silently emptied all four markets and the
 * artifact finalized as NO_VALID_PICKS despite a perfectly good model + Grok
 * response.
 *
 * The fallback is deliberately whole-lookup only: if the lookup holds ANY
 * usable entry the provider worked, so existing filtering and value
 * thresholds apply unchanged. A pick individually lacking a price on a
 * working odds week is still dropped, exactly as before -- there is no
 * per-market fallback.
 *
 * filterByValueAndOdds is injected so this stays a pure, unit-testable
 * decision without hoisting main()'s value-edge closures to module scope.
 */
export function selectPublishedPicks(pickArrays, { hasOddsApiKey, oddsLookup, filterByValueAndOdds }) {
  const oddsAvailable = Object.keys(oddsLookup ?? {}).length > 0;
  if (!hasOddsApiKey || !oddsAvailable) {
    return { ...pickArrays };
  }
  // Market keys are the canonical section keys; marketOddsFor maps each to its
  // odds-payload key. Previously "outright" (singular) was passed here and
  // happened to work only because the odds payload uses that spelling.
  return {
    outrights: filterByValueAndOdds(pickArrays.outrights, "outrights"),
    top5: filterByValueAndOdds(pickArrays.top5, "top5"),
    top10: filterByValueAndOdds(pickArrays.top10, "top10"),
    top20: filterByValueAndOdds(pickArrays.top20, "top20"),
  };
}

const PICK_MARKETS = PGA_MARKET_KEYS;

/** Unique union of players across ALL four selected markets, in stable first-seen order. */
export function collectSelectedPlayers(pickArrays) {
  const seen = new Map();
  for (const market of PICK_MARKETS) {
    for (const pick of pickArrays?.[market] ?? []) {
      const key = normalizeName(pick?.player ?? "");
      if (key && !seen.has(key)) seen.set(key, pick.player);
    }
  }
  return [...seen.values()];
}

/**
 * Per-player research context, keyed by normalized player name.
 *
 * Built for the union of SELECTED picks, not an arbitrary top-N slice of the
 * model -- the previous prompt-only context covered rows.slice(0, 25), which
 * both missed selected players outside the top 25 and wasted context on players
 * never recommended. Persisted so the frontend renders stored classifications
 * instead of inventing them at display time.
 */
export function buildResearchContext(players, { rounds = [], fedexRows = [], sinceDate, windowStart = null, windowEnd = null, modelRows = [], powerByName = new Map() } = {}) {
  const modelByName = new Map(modelRows.map((row) => [normalizeName(row.player), row]));
  const context = {};
  for (const player of players) {
    const key = normalizeName(player);
    const angles = buildPostOpenAngles(player, { rounds, fedexRows, sinceDate, windowStart, windowEnd });
    const modelRow = modelByName.get(key) ?? null;
    const powerRow = powerByName.get(key) ?? null;
    const tournamentRank = Number.isFinite(Number(modelRow?.rank)) ? Number(modelRow.rank) : null;
    const powerRank = Number.isFinite(Number(powerRow?.rank)) ? Number(powerRow.rank) : null;
    const entry = {
      player,
      openFinishBucket: angles.openFinishBucket,
      openResult: angles.openResult,
      scottish: angles.scottish,
      majorSwingWorkload: angles.majorSwingWorkload,
      workloadRoundCount: angles.workloadRoundCount,
      fedex: angles.fedex,
      model: {
        tournamentRank,
        powerRank,
        rankDifferential: tournamentRank != null && powerRank != null ? powerRank - tournamentRank : null,
        modelScore: modelRow?.modelScore ?? null,
        sgTotal: modelRow?.sgTotal ?? null,
        sgApp: modelRow?.sgApp ?? null,
        sgPutt: modelRow?.sgPutt ?? null,
        sgAtg: modelRow?.sgAtg ?? null,
        sgOtt: modelRow?.sgOtt ?? null,
      },
    };
    entry.crossoverAngles = buildCrossoverAngles(entry);
    context[key] = entry;
  }
  return context;
}

/**
 * Phrases that assert a market/price judgement. Only valid when a price exists.
 * Matched case-insensitively against generated bullets and risk text.
 */
const PRICE_CLAIM_PATTERNS = [
  /\bprice\b/i,
  /\bpriced\b/i,
  /\bmarket value\b/i,
  /\bmispric\w*/i,
  /\bvalue at the (current )?number\b/i,
  /\bodds (look|are|seem)\b/i,
  /\bgenerous (price|number)\b/i,
  /\bshort(er)? number\b/i,
  /\boverlay\b/i,
];

const UNPRICED_FALLBACK_BULLET =
  "Model-supported target: no market price was available this week, so this case rests on course-weighted model rank rather than the number.";

/**
 * LEGACY, NON-PROBABILISTIC value ordering. Temporary.
 *
 * modelProxyScore returns 0-100 "units" from an exponential rank decay; it is
 * NOT a probability and does not sum to 1 over the field. computeValueEdge then
 * divides those units by a vig-inclusive implied probability, so the resulting
 * number has no interpretable scale and is NOT comparable across markets. Its
 * only sound use is the within-market ordering below, which is scale-invariant.
 *
 * Deliberately left unchanged in this correctness pass: replacing it requires
 * per-market probabilities and vig removal, which are separate, later work.
 * Do not present this quantity to readers as an edge.
 *
 * Hoisted to module scope (previously closures inside main) purely so the
 * cross-market odds behavior below is directly testable.
 */
function modelProxyScore(rank) {
  return Math.exp(-0.065 * (rank - 1)) * 100;
}

/** Convert an American odds string to a vig-inclusive implied probability. */
export function toImplied(oddsStr) {
  if (!oddsStr) return null;
  const n = parseFloat(String(oddsStr).replace("+", ""));
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

/** See the caveat above: a legacy ordering ratio, not an edge. */
export function computeValueEdge(tournamentRank, oddsStr) {
  const implied = toImplied(oddsStr);
  if (implied == null || implied <= 0) return -1;
  return modelProxyScore(tournamentRank) / implied;
}

/**
 * Keep only picks that have a real price IN THEIR OWN MARKET, then order them.
 *
 * There is NO outright fallback. A placement pick with no placement price is
 * dropped rather than retained and ranked against an outright number that says
 * nothing about its market. This can legitimately publish fewer picks on a
 * partially priced week -- that is the intended, honest outcome.
 */
export function filterByValueAndOdds(picks, marketKey) {
  return (picks ?? [])
    .map((pick) => {
      const odds = marketOddsFor(pick, marketKey);
      if (!odds) return null;
      return { ...pick, _edge: computeValueEdge(pick.tournamentRank, odds) };
    })
    .filter(Boolean)
    .sort((a, b) => b._edge - a._edge || String(a.player).localeCompare(String(b.player)))
    // eslint-disable-next-line no-unused-vars
    .map(({ _edge, ...pick }) => pick);
}

/**
 * Strips price/market-value claims from picks that have no price.
 *
 * A pick with null odds cannot support "the price looks like value" -- there is
 * no price. Offending bullets are REMOVED rather than reworded, so nothing is
 * fabricated; if that would leave a pick with no bullets, one deterministic and
 * factually true line is substituted. Priced picks are returned untouched, so
 * genuine market-value analysis still ships.
 */
export function enforceOddsLanguage(picks, market) {
  return (picks ?? []).map((pick) => {
    if (marketOddsFor(pick, market)) return pick;
    const bullets = (pick.bullets ?? []).filter((bullet) => !PRICE_CLAIM_PATTERNS.some((pattern) => pattern.test(bullet)));
    const risk = PRICE_CLAIM_PATTERNS.some((pattern) => pattern.test(pick.risk ?? "")) ? "" : pick.risk ?? "";
    return {
      ...pick,
      bullets: bullets.length ? bullets : [UNPRICED_FALLBACK_BULLET],
      risk,
    };
  });
}

/**
 * Rejects article content that introduces recommendations outside the frozen
 * selection.
 *
 * Deliberately NOT blanket prose name-rejection: general tournament context is
 * allowed to mention any supplied player. Only the STRUCTURED recommendation
 * surfaces are constrained -- keyTakeaways picks and playersToApproachCautiously
 * -- which is both stricter where it matters and far less fragile than scanning
 * free prose.
 */
export function validateArticleRecommendations(article, { selectedPlayers = [], cautionCandidates = null } = {}) {
  if (!article) return { valid: false, violations: ["article missing"] };
  const allowed = new Set(selectedPlayers.map((player) => normalizeName(player)));
  const cautionAllowed = cautionCandidates ? new Set(cautionCandidates.map((p) => normalizeName(p))) : null;
  const violations = [];

  for (const entry of article.playersToApproachCautiously ?? []) {
    const key = normalizeName(entry?.player ?? "");
    if (!key) continue;
    if (cautionAllowed && !cautionAllowed.has(key)) {
      violations.push(`caution list contains unsupported player: ${entry.player}`);
    }
  }
  for (const takeaway of article.keyTakeaways ?? []) {
    for (const player of takeaway?.players ?? []) {
      const key = normalizeName(player);
      if (key && !allowed.has(key)) violations.push(`key takeaway recommends unselected player: ${player}`);
    }
  }
  return { valid: violations.length === 0, violations };
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
  if (!DRY_RUN && shouldSkip(OUTPUT_PATH, FORCE)) {
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

  const { model: tournamentData, coverage: fieldCoverage, reason: modelError } = prepareTournamentModel(selection.tournamentData, currentField);
  if (modelError) {
    console.warn(`[pga-best-bets] Skipping generation: ${modelError}. Checked ${selection.source} against official current-field.json (${currentField.tournament}).`);
    return;
  }

  console.log(`[pga-best-bets] Using ${selection.source} for ${currentField.tournament}.`);

  // Coverage diagnostics. An unexplained gap must never stay invisible: if the
  // counts disagree, the artifact would understate how much of the field is
  // unmodeled, so fail rather than publish a misleading disclosure.
  if (fieldCoverage.fieldCount - fieldCoverage.modeledCount !== fieldCoverage.unmodeledPlayers.length) {
    throw new Error(
      `Field-coverage diagnostics are inconsistent: ${fieldCoverage.fieldCount} official entrants minus ` +
        `${fieldCoverage.modeledCount} modeled should equal ${fieldCoverage.unmodeledPlayers.length} named unmodeled players.`,
    );
  }
  console.log(
    `::notice title=PGA field coverage::${fieldCoverage.modeledCount} of ${fieldCoverage.fieldCount} official entrants modeled (${fieldCoverage.coveragePct}%); ${fieldCoverage.unmodeledCount} unmodeled.`,
  );
  if (fieldCoverage.coveragePct < 95) {
    console.warn(
      `::warning title=PGA field coverage below 95%::${fieldCoverage.unmodeledCount} official entrants have no current statistics and cannot be modeled or recommended: ${fieldCoverage.unmodeledPlayers.join(", ")}.`,
    );
  }

  const summary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 25);
  const previewSummary = buildSummary(tournamentData, powerRankings, playerStats, courseWeights, 20);
  const tournamentName = tournamentData.tournamentName;
  const courseName = tournamentData.courseName;

  // ── Post-Open / FedExCup angles (only when this is the tournament right
  // after The Open Championship -- see isPostOpenWindow's own doc comment
  // for why round-history-pga.json, not schedule.json, decides this). Both
  // sources are loaded with loadJsonSafe: missing/unavailable data degrades
  // to an explicit, code-generated dataLimitations note rather than a
  // Grok-invented angle or a hard failure of the whole pipeline.
  const roundHistory = loadJsonSafe("public/data/pga/round-history-pga.json", { rounds: [] });
  const fedexStandings = loadJsonSafe("public/data/pga/fedex-standings.json", { rows: [] });
  const roundHistoryAvailable = Array.isArray(roundHistory.rounds) && roundHistory.rounds.length > 0;
  const isPostOpen = roundHistoryAvailable && isPostOpenWindow(roundHistory.rounds, currentField.startDate);
  const fedexAvailable = Array.isArray(fedexStandings.rows) && fedexStandings.rows.length > 0;

  // 14-day window preceding the current tournament. Recorded on every
  // majorSwingWorkload entry so consumers know the period the tracked rounds
  // were drawn from -- see MAJOR_SWING_WORKLOAD_LIMITATION for why the count
  // itself is scoped to the two tracked championships rather than all events.
  const workloadWindowStart = currentField.startDate
    ? new Date(new Date(`${currentField.startDate}T12:00:00Z`).getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
    : null;

  const dataLimitations = [
    "Weather and tee-time data are not available in this pipeline; the article does not make weather- or tee-time-specific claims.",
  ];
  if (isPostOpen) {
    dataLimitations.push(MAJOR_SWING_WORKLOAD_LIMITATION);
  }
  if (!roundHistoryAvailable) {
    dataLimitations.push("Recent-tournament round history was unavailable this week; post-Open and recent-form-by-event angles are omitted.");
  }
  if (isPostOpen && !fedexAvailable) {
    dataLimitations.push("FedExCup standings were unavailable this week; FedExCup motivation angles are omitted.");
  }

  let postOpenContext = "";
  if (isPostOpen) {
    console.log("[pga-best-bets] Post-Open window detected -- including Open Championship / Scottish Open / FedExCup angles.");
    const sinceDate = new Date(new Date(`${currentField.startDate}T12:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    postOpenContext = buildPostOpenContext(tournamentData.rows.slice(0, 25), {
      rounds: roundHistory.rounds,
      fedexRows: fedexAvailable ? fedexStandings.rows : [],
      sinceDate,
    });
  }

  if (!oddsApiKey) console.warn("ODDS_API_KEY is not set. No verified market prices can be attached this week -- Model Leans only.");

  // ── Deterministic odds + selection (PR A) ────────────────────────────────
  // Live odds are fetched, matched, priced, and thresholded entirely before
  // any Grok call -- Grok never sees an unpriced candidate and never selects
  // a golfer, a market, or a price. Skipped entirely in dry-run (never
  // trigger a rate-limited/paid external call during development).
  const providerResult = DRY_RUN
    ? {
        providerKey: "the-odds-api",
        providerName: "The Odds API",
        requestedTournament: tournamentName,
        matchedEventName: null,
        providerEventId: null,
        eventStartTime: null,
        eventMatchStatus: "dry-run-skipped",
        marketsRequested: [...CANONICAL_MARKETS],
        marketsAvailable: [],
        fetchedAt: new Date().toISOString(),
        quotaDiagnostics: {},
        errors: ["dry run: live odds fetch skipped"],
        sportsbookMarkets: [],
      }
    : await fetchProviderOdds({
        apiKey: oddsApiKey,
        tournamentName,
        startDate: currentField.startDate ?? null,
        knownProviderEventId: currentField.tournamentId ?? null,
      });
  if (DRY_RUN) console.log("[pga-best-bets] dry-run: skipping live odds fetch.");

  const candidateUniverse = buildCandidateUniverse({
    officialFieldPlayers: currentField.players,
    modelRows: tournamentData.rows,
  });
  const pricedCandidates = priceCandidates(candidateUniverse, {
    providerResult,
    officialFieldSize: currentField.players.length,
  });
  const thresholdedCandidates = applyThresholds(pricedCandidates);
  const { recommendations: rawRecommendations, overlapRejections } = selectRecommendations(
    thresholdedCandidates.filter((candidate) => candidate.status === "qualified"),
  );
  const portfolioDiagnostics = computePortfolioDiagnostics(thresholdedCandidates, overlapRejections, rawRecommendations);
  const recommendations = rawRecommendations.map((candidate) => buildRecommendationEntry(candidate, buildRecommendationCopy(candidate)));

  console.log(
    `[pga-best-bets] deterministic selection: ${recommendations.length} recommendation(s) from ${portfolioDiagnostics.candidatesCreated} candidate(s) ` +
      `(${portfolioDiagnostics.candidatesWithExactPrice} priced, event match=${providerResult.eventMatchStatus ?? "unmatched"}).`,
  );

  const powerByName = buildPlayerMaps(powerRankings, playerStats).powerByName;
  let bestBetsStatus;
  let bestBetsReason = null;
  let modelLeans = [];
  if (recommendations.length > 0) {
    bestBetsStatus = "official-best-bets";
  } else {
    bestBetsStatus = "model-leans-only";
    bestBetsReason = providerResult.errors.length
      ? `Verified exact-market prices were unavailable this week (${providerResult.errors[0]}).`
      : "No candidate cleared the configured probability/edge/expected-value thresholds this week.";
    const leanRows = candidateUniverse
      .filter((candidate) => candidate.market === CANONICAL_MARKETS[0] && candidate.inField && candidate.hasModelData)
      .map((candidate) => ({ playerKey: candidate.playerKey, rank: candidate.rank, player: candidate.playerName, powerRank: candidate.powerRank }));
    const fieldProbabilities = computeFieldProbabilities(leanRows.map((row) => ({ playerKey: row.playerKey, rank: row.rank })));
    // computeFieldProbabilities keys its output {win, top5, top10, top20};
    // buildModelLeans/CANONICAL_MARKETS use "outright" for that same market --
    // remap here so a lean's provisionalModelProbability.outright is never
    // silently undefined (and therefore excluded from every outright lean).
    modelLeans = buildModelLeans(
      leanRows.map((row) => {
        const probability = fieldProbabilities[row.playerKey] ?? {};
        return {
          ...row,
          provisionalModelProbability: {
            outright: probability.win,
            top5: probability.top5,
            top10: probability.top10,
            top20: probability.top20,
          },
        };
      }),
    );
  }

  const picksForArticle = bestBetsStatus === "official-best-bets"
    ? deriveV2Compatibility(recommendations)
    : deriveV2CompatibilityFromLeans(modelLeans);

  const previewPrompt = `You are writing a concise tournament betting preview for a sports analytics website. Based on this model data for ${tournamentName}: ${previewSummary}. Write three short sections with a bold label and 2-4 sentences each. Section 1 label: "The Tournament" - describe the course, what type of game it rewards, and why this event matters. Section 2 label: "How Our Model Works This Week" - explain the active course weights in plain English, which stat categories are most important at this course and why, referencing the specific weight percentages. Section 3 label: "How We're Approaching the Picks" - explain the tiered betting logic. Return as JSON with fields: tournamentOverview, modelExplainer, pickApproach - each a plain string of 3-4 sentences.`;

  let preview = null;
  let article = null;
  // "unavailable" = no Grok call was attempted at all (no key, not a dry run).
  let grokStatus = "unavailable";
  const waitMs = (ms) => (DRY_RUN ? 0 : ms);

  // Research context + prose, fed ONLY the frozen selection above. Grok is
  // never given an unpriced candidate to choose from and never asked to pick
  // a player -- see DATA_DISCIPLINE_RULES and validateArticleRecommendations.
  const selectedPlayers = collectSelectedPlayers(picksForArticle);
  const researchContext = buildResearchContext(selectedPlayers, {
    rounds: roundHistory.rounds,
    fedexRows: fedexAvailable ? fedexStandings.rows : [],
    sinceDate: workloadWindowStart,
    windowStart: workloadWindowStart,
    windowEnd: currentField.startDate ?? null,
    modelRows: tournamentData.rows,
    powerByName,
  });
  console.log(`Research context built for ${selectedPlayers.length} selected player(s).`);

  if (apiKey || DRY_RUN) {
    grokStatus = "available";

    await new Promise((r) => setTimeout(r, waitMs(1500)));
    preview = await generatePreview(apiKey, previewPrompt);

    await new Promise((r) => setTimeout(r, waitMs(1500)));
    const hasAnyOdds = bestBetsStatus === "official-best-bets";
    article = await generateArticle(apiKey, {
      tournamentName,
      courseName,
      startDate: currentField.startDate ?? null,
      fieldSize: currentField.players.length,
      summary: previewSummary,
      picks: picksForArticle,
      researchContext,
      hasAnyOdds,
      dataLimitations,
    });

    if (article) {
      // Caution entries are restricted to the frozen selection too. Passing no
      // cautionCandidates would leave playersToApproachCautiously unvalidated.
      const { valid, violations } = validateArticleRecommendations(article, {
        selectedPlayers,
        cautionCandidates: selectedPlayers,
      });
      if (!valid) {
        console.warn(`::warning title=PGA article recommendation mismatch::${violations.join("; ")}`);
        const isSelected = (player) => selectedPlayers.some((selected) => normalizeName(selected) === normalizeName(player));
        // Drop only the offending structured entries; the editorial prose and
        // sections are still valid and are kept rather than losing the article.
        article = {
          ...article,
          keyTakeaways: article.keyTakeaways.filter((takeaway) => (takeaway.players ?? []).every(isSelected)),
          playersToApproachCautiously: article.playersToApproachCautiously.filter((entry) => isSelected(entry.player)),
        };
      }
    }
  }

  const oddsDiagnostics = {
    providerKey: providerResult.providerKey,
    providerName: providerResult.providerName,
    requestedTournament: providerResult.requestedTournament,
    matchedEventName: providerResult.matchedEventName,
    providerEventId: providerResult.providerEventId,
    eventStartTime: providerResult.eventStartTime,
    eventMatchStatus: providerResult.eventMatchStatus,
    marketsRequested: providerResult.marketsRequested,
    marketsAvailable: providerResult.marketsAvailable,
    fetchedAt: providerResult.fetchedAt,
    quotaDiagnostics: providerResult.quotaDiagnostics,
    errors: providerResult.errors,
  };

  const sourceStatus = {
    model: "available",
    grok: grokStatus,
    odds: providerResult.matchedEventName ? "available" : "unavailable",
    article: article?.title ? "available" : "unavailable",
  };

  const methodologyNotes = [
    "Recommendations are generated by a deterministic candidate/threshold/portfolio pipeline against verified sportsbook prices; Grok never selects a golfer, a market, or a price -- it only writes prose about the frozen selection.",
    "Finish probabilities come from a provisional, field-relative model (see probabilityMethod) blended with no-vig market probability; neither component is historically calibrated.",
    isPostOpen
      ? "Post-Open Championship, Scottish Open, and FedExCup context is included because this is the tournament immediately following The Open Championship."
      : "Post-Open Championship / FedExCup context does not apply this week.",
  ];

  const payload = buildV3Artifact({
    tournament: tournamentName,
    tournamentId: currentField.tournamentId ?? null,
    localScheduleId: currentField.localScheduleId ?? null,
    course: courseName,
    generatedAt: new Date().toISOString(),
    status: bestBetsStatus,
    reason: bestBetsReason,
    sourceStatus,
    oddsDiagnostics,
    recommendations: bestBetsStatus === "official-best-bets" ? recommendations : [],
    modelLeans: bestBetsStatus === "model-leans-only" ? modelLeans : [],
    portfolioDiagnostics,
    fieldCoverage,
    methodologyNotes,
    dataLimitations,
  });
  payload.preview = preview;
  payload.article = article;
  payload.valueBets = [];
  payload.researchContext = researchContext;
  payload.selectedPlayers = selectedPlayers;

  if (normalizeEventKey(payload.tournament) !== normalizeEventKey(currentField.tournament)) {
    throw new Error(`Refusing to write best-bets.json for ${payload.tournament}; official current field is ${currentField.tournament}.`);
  }

  if (DRY_RUN) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const promptsPath = path.join(ARTIFACTS_DIR, "dry-run-prompts.json");
    const payloadPath = path.join(ARTIFACTS_DIR, "dry-run-payload.json");
    writeFileSync(promptsPath, `${JSON.stringify(DRY_RUN_PROMPTS, null, 2)}\n`, "utf8");
    writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`[pga-best-bets] dry-run: wrote ${DRY_RUN_PROMPTS.length} prompt(s) to ${promptsPath}`);
    console.log(`[pga-best-bets] dry-run: wrote assembled payload to ${payloadPath}`);
    console.log(`[pga-best-bets] dry-run: status=${payload.status} outrights=${payload.outrights.length} top5=${payload.top5.length} top10=${payload.top10.length} top20=${payload.top20.length} article=${article ? "generated" : "none (no fixture / skipped)"}`);
    console.log(`[pga-best-bets] dry-run: ${OUTPUT_PATH} was NOT modified.`);
    return;
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
