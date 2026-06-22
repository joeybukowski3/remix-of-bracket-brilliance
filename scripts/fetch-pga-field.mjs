import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fieldsDir = path.join(repoRoot, "src", "data", "pga", "fields");
const schedulePath = path.join(repoRoot, "src", "data", "pga", "schedule.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY || DEFAULT_API_KEY;

const SCHEDULE_QUERY = `
query Schedule($tourCode: String!, $year: String) {
  schedule(tourCode: $tourCode, year: $year) {
    completed { tournaments { id tournamentName startDate } }
    upcoming { tournaments { id tournamentName startDate } }
  }
}`;

const FIELD_QUERY = `
query TournamentField($ids: [ID!], $fieldId: ID!) {
  tournaments(ids: $ids) {
    id
    tournamentName
    tournamentLocation
    displayDate
  }
  field: field(id: $fieldId) {
    players {
      id
      firstName
      lastName
    }
  }
}`;

async function postGraphql(query, variables) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "x-pgat-platform": "web",
      Referer: "https://www.pgatour.com/",
      Origin: "https://www.pgatour.com",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`PGA Tour GraphQL HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload.data ?? {};
}

function readSchedule() {
  return JSON.parse(fs.readFileSync(schedulePath, "utf8"));
}

function findTarget(slug) {
  const target = readSchedule().find((entry) => entry.slug === slug);
  if (!target) throw new Error(`Unknown PGA tournament slug: ${slug}`);
  if (target.alternateField || String(target.eventType ?? "").toLowerCase().includes("alternate field")) {
    throw new Error(`Alternate-field tournaments are excluded from this model for now: ${target.name}`);
  }
  return target;
}

async function fetchOfficialSchedule(year) {
  const data = await postGraphql(SCHEDULE_QUERY, { tourCode: "R", year: String(year) });
  return [data?.schedule?.completed ?? [], data?.schedule?.upcoming ?? []]
    .flatMap((groups) => groups.flatMap((group) => group?.tournaments ?? []))
    .map((event) => ({ ...event, startDateIso: normalizeTimestamp(event.startDate) }));
}

function matchTournament(target, officialEvents) {
  if (target.pgaTourId) {
    return officialEvents.find((event) => event.id === target.pgaTourId)
      ?? { id: target.pgaTourId, tournamentName: target.name, startDateIso: target.startDate };
  }

  const targetName = normalizeEventName(target.name);
  const candidates = officialEvents.map((event) => {
    const officialName = normalizeEventName(event.tournamentName);
    const exactName = officialName === targetName;
    const containsName = officialName.includes(targetName) || targetName.includes(officialName);
    const dateDiff = dayDifference(target.startDate, event.startDateIso);
    const score = (exactName ? 100 : containsName ? 70 : 0) + (dateDiff === 0 ? 30 : dateDiff <= 3 ? 15 : 0);
    return { event, score, dateDiff };
  }).sort((a, b) => b.score - a.score || a.dateDiff - b.dateDiff);

  const best = candidates[0];
  if (!best || best.score < 85) throw new Error(`Could not match ${target.name} to the official PGA Tour schedule.`);
  return best.event;
}

async function fetchOfficialField(tournamentId) {
  const data = await postGraphql(FIELD_QUERY, { ids: [tournamentId], fieldId: tournamentId });
  const tournament = data?.tournaments?.[0] ?? null;
  const rawPlayers = Array.isArray(data?.field?.players) ? data.field.players : [];
  const unique = new Map();

  for (const player of rawPlayers) {
    const name = [player?.firstName, player?.lastName].filter(Boolean).join(" ").trim();
    const id = String(player?.id ?? "").trim();
    if (!name) continue;
    const key = id || normalizePlayerName(name);
    if (!unique.has(key)) unique.set(key, { id: id || null, name });
  }

  const players = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (players.length < 20) throw new Error(`Official PGA Tour field returned only ${players.length} players for ${tournamentId}.`);
  return { tournament, players };
}

async function fetchField(slug, { force = false } = {}) {
  const target = findTarget(slug);
  const outputPath = path.join(fieldsDir, `${slug}.json`);

  if (!force && fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const ageMs = Date.now() - fs.statSync(outputPath).mtimeMs;
    if (ageMs < 6 * 60 * 60 * 1000 && existing.source === "pga-tour-official-field" && existing.alternatesExcluded) {
      console.log(`[fetch-pga-field] Using recent official field for ${slug} (${existing.playerCount} players)`);
      return outputPath;
    }
  }

  const year = target.season ?? Number(String(target.startDate).slice(0, 4));
  const officialEvents = await fetchOfficialSchedule(year);
  const officialTarget = matchTournament(target, officialEvents);
  const { tournament, players } = await fetchOfficialField(officialTarget.id);
  const officialName = tournament?.tournamentName || officialTarget.tournamentName || target.name;

  if (normalizeEventName(officialName) !== normalizeEventName(target.name)) {
    throw new Error(`Official tournament mismatch: expected ${target.name}, received ${officialName}`);
  }

  const sourceSlug = slugify(target.name);
  const sourceUrl = `https://www.pgatour.com/tournaments/${year}/${sourceSlug}/${officialTarget.id}`;
  const payload = {
    slug,
    tournament: officialName,
    tournamentId: officialTarget.id,
    source: "pga-tour-official-field",
    sourceUrl,
    updatedAt: new Date().toISOString(),
    playerCount: players.length,
    alternatesExcluded: true,
    alternatePolicy: "Only field.players is imported; alternate lists are intentionally excluded.",
    players: players.map((player) => player.name),
    playerDetails: players,
  };

  fs.mkdirSync(fieldsDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[fetch-pga-field] Saved ${players.length} official players for ${officialName} → ${path.relative(repoRoot, outputPath)}`);
  return outputPath;
}

function normalizeTimestamp(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 100_000_000_000 ? numeric : numeric * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeEventName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament|2026)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dayDifference(left, right) {
  if (!left || !right) return 999;
  const leftTime = new Date(`${left}T12:00:00Z`).getTime();
  const rightTime = new Date(`${right}T12:00:00Z`).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 999;
  return Math.round(Math.abs(leftTime - rightTime) / 86_400_000);
}

if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  const slugIdx = argv.indexOf("--slug");
  const slug = slugIdx !== -1 ? argv[slugIdx + 1] : null;
  const force = argv.includes("--force");

  if (!slug) {
    console.error("Usage: node scripts/fetch-pga-field.mjs --slug <tournament-slug> [--force]");
    process.exit(1);
  }

  fetchField(slug, { force }).then((outPath) => {
    if (!outPath) process.exit(1);
  }).catch((error) => {
    console.error(`[fetch-pga-field] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { fetchField };
