import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const MANIFEST_PATH = path.join(DATA_DIR, "external-tour-events.json");
const requestedTour = String(process.argv.find((arg) => arg.startsWith("--tour="))?.split("=")[1] ?? "").toUpperCase();

if (!new Set(["LIV", "DPWT"]).has(requestedTour)) {
  throw new Error("Usage: node scripts/fetch-external-tour-results.mjs --tour=LIV|DPWT");
}

const OUTPUT_PATH = path.join(DATA_DIR, requestedTour === "LIV" ? "round-history-liv.json" : "round-history-dpwt.json");

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function numeric(value) {
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^E$/i, "0").replace(/^\+/, "");
    if (!normalized || /^(MC|WD|DQ|CUT|MDF)$/i.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findFirst(object, keys) {
  if (!object || typeof object !== "object") return null;
  for (const key of keys) {
    if (object[key] != null && object[key] !== "") return object[key];
  }
  return null;
}

function playerName(row) {
  const direct = findFirst(row, ["playerName", "displayName", "fullName", "competitorName", "name"]);
  if (typeof direct === "string" && direct.trim().includes(" ")) return direct.trim();
  const nested = row.player ?? row.competitor ?? row.athlete ?? row.participant;
  const nestedName = findFirst(nested, ["playerName", "displayName", "fullName", "name"]);
  if (typeof nestedName === "string") return nestedName.trim();
  const first = findFirst(row, ["firstName", "first_name"]);
  const last = findFirst(row, ["lastName", "last_name", "surname"]);
  return [first, last].filter(Boolean).join(" ").trim();
}

function roundScores(row) {
  const candidates = [
    row.roundScores,
    row.rounds,
    row.scores,
    row.scorecard?.rounds,
    row.result?.rounds,
    row.results?.rounds,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;
    const parsed = candidate.map((entry, index) => {
      if (typeof entry === "number" || typeof entry === "string") return { round: index + 1, strokes: numeric(entry) };
      return {
        round: numeric(findFirst(entry, ["round", "roundNum", "roundNumber", "number"])) ?? index + 1,
        strokes: numeric(findFirst(entry, ["strokes", "roundScore", "score", "total", "value"])),
      };
    }).filter((entry) => entry.strokes != null);
    if (parsed.length) return parsed;
  }

  const parsed = [];
  for (let round = 1; round <= 4; round += 1) {
    const strokes = numeric(findFirst(row, [`r${round}`, `R${round}`, `round${round}`, `round_${round}`, `score${round}`]));
    if (strokes != null) parsed.push({ round, strokes });
  }
  return parsed;
}

function looksLikePlayerRow(value) {
  return value && typeof value === "object" && playerName(value) && roundScores(value).length;
}

function collectPlayerRows(value, results = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return results;
  seen.add(value);
  if (looksLikePlayerRow(value)) results.push(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPlayerRows(entry, results, seen));
  } else {
    Object.values(value).forEach((entry) => collectPlayerRows(entry, results, seen));
  }
  return results;
}

function parseEmbeddedJson(html) {
  const payloads = [];
  const scriptPattern = /<script[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html))) {
    try { payloads.push(JSON.parse(match[1])); } catch { /* ignore unrelated scripts */ }
  }
  return payloads;
}

async function fetchPayload(event) {
  const url = event.dataUrl || event.sourceUrl;
  if (!url) throw new Error("Missing sourceUrl/dataUrl");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; JKBTrendBot/1.0; +https://www.joeknowsball.com)",
      Referer: event.sourceUrl || url,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) return [await response.json()];
  const html = await response.text();
  const embedded = parseEmbeddedJson(html);
  if (!embedded.length) throw new Error("No embedded JSON found; add the official leaderboard JSON request as dataUrl in external-tour-events.json");
  return embedded;
}

function normalizeEventRows(event, payloads) {
  const candidateRows = payloads.flatMap((payload) => collectPlayerRows(payload));
  const uniqueRows = new Map();
  for (const row of candidateRows) {
    const name = playerName(row);
    const scores = roundScores(row);
    if (!name || !scores.length) continue;
    const key = `${normalizeKey(name)}|${scores.map((score) => `${score.round}:${score.strokes}`).join(",")}`;
    uniqueRows.set(key, row);
  }

  const normalized = [];
  for (const row of uniqueRows.values()) {
    const name = playerName(row);
    const finishText = String(findFirst(row, ["finishText", "positionText", "position", "rank", "place"]) ?? "").trim() || null;
    const finishPosition = numeric(finishText?.match(/\d+/)?.[0] ?? finishText);
    const statusText = String(findFirst(row, ["status", "playerStatus", "resultStatus"]) ?? finishText ?? "").toUpperCase();
    const status = /WD|WITHDRAW/.test(statusText) ? "withdrawn"
      : /DQ|DISQUAL/.test(statusText) ? "disqualified"
        : /MC|CUT|MDF/.test(statusText) ? "missed_cut"
          : "finished";
    const playerId = findFirst(row, ["playerId", "competitorId", "athleteId", "id"])
      ?? findFirst(row.player ?? row.competitor ?? row.athlete, ["playerId", "competitorId", "athleteId", "id"]);

    for (const score of roundScores(row)) {
      normalized.push({
        tour: requestedTour,
        eventId: event.eventId ?? null,
        eventName: event.eventName,
        eventDate: event.eventDate,
        courseName: event.courseName ?? null,
        playerId: playerId == null ? null : String(playerId),
        player: name,
        round: score.round,
        strokes: score.strokes,
        finishPosition,
        finishText,
        status,
        major: Boolean(event.major),
        sourceUrl: event.sourceUrl || event.dataUrl,
        fetchedAt: new Date().toISOString(),
      });
    }
  }
  return normalized;
}

function eventKey(row) {
  return `${row.tour}|${row.eventId ?? ""}|${row.eventDate}|${normalizeKey(row.eventName)}|${normalizeKey(row.player)}|${row.round}`;
}

async function main() {
  const manifest = readJson(MANIFEST_PATH, { events: [] });
  const events = (manifest.events ?? []).filter((event) => String(event.tour ?? "").toUpperCase() === requestedTour && event.enabled !== false);
  const existing = readJson(OUTPUT_PATH, { rounds: [] });
  const rows = new Map((existing.rounds ?? []).map((row) => [eventKey(row), row]));
  const errors = [];

  if (!events.length) {
    console.log(`[external-tour] No enabled ${requestedTour} events in ${path.relative(ROOT, MANIFEST_PATH)}; preserving ${rows.size} existing rounds.`);
  }

  for (const event of events) {
    try {
      if (!event.eventName || !event.eventDate) throw new Error("eventName and eventDate are required");
      const payloads = await fetchPayload(event);
      const normalized = normalizeEventRows(event, payloads);
      if (!normalized.length) throw new Error("No player round scores were discovered in the official payload");
      for (const row of normalized) rows.set(eventKey(row), row);
      console.log(`[external-tour] ${requestedTour} ${event.eventName}: ${normalized.length} round rows`);
    } catch (error) {
      const message = `${event.eventName ?? event.sourceUrl}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.warn(`[external-tour] ${message}`);
    }
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify({
    version: 1,
    tour: requestedTour,
    generatedAt: new Date().toISOString(),
    source: requestedTour === "LIV" ? "liv-golf-official-leaderboards" : "dp-world-tour-official-leaderboards",
    rounds: [...rows.values()].sort((a, b) => String(b.eventDate).localeCompare(String(a.eventDate)) || a.player.localeCompare(b.player) || a.round - b.round),
    errors,
  }, null, 2) + "\n");

  console.log(`[external-tour] Wrote ${rows.size} ${requestedTour} round rows to ${path.relative(ROOT, OUTPUT_PATH)}`);
  if (events.length && errors.length === events.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[external-tour] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
