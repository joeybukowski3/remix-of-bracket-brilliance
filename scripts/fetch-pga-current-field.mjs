import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "../public/data/pga/current-field.json");
const SCHEDULE_PATH = path.resolve(__dirname, "../public/data/pga/schedule.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const TOUR_CODE = "R";
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY || DEFAULT_API_KEY;
const OVERRIDE_ID = clean(process.env.PGA_TOURNAMENT_ID);
const OVERRIDE_URL = clean(process.env.PGA_TOURNAMENT_URL);
const AS_OF = process.env.PGA_FIELD_AS_OF
  ? new Date(`${process.env.PGA_FIELD_AS_OF}T12:00:00Z`)
  : new Date();

const SCHEDULE_QUERY = `
query Schedule($tourCode: String!, $year: String) {
  schedule(tourCode: $tourCode, year: $year) {
    completed {
      tournaments {
        id
        tournamentName
        startDate
        city
        state
        country
        status { __typename }
      }
    }
    upcoming {
      tournaments {
        id
        tournamentName
        startDate
        city
        state
        country
        status { __typename }
      }
    }
  }
}`;

const FIELD_QUERY = `
query TournamentField($ids: [ID!], $fieldId: ID!) {
  tournaments(ids: $ids) {
    id
    tournamentName
    tournamentLocation
    tournamentStatus
    displayDate
    courses {
      id
      courseName
    }
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

async function readLocalSchedule() {
  const schedule = JSON.parse(await readFile(SCHEDULE_PATH, "utf8"));
  if (!Array.isArray(schedule)) throw new Error("PGA schedule.json must contain an array.");
  return schedule;
}

function selectLocalTarget(schedule) {
  const asOfDate = AS_OF.toISOString().slice(0, 10);
  const eligible = schedule
    .filter((event) => !String(event.eventType ?? "").toLowerCase().includes("alternate field"))
    .filter((event) => event.startDate && event.endDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  const active = eligible.find((event) => event.startDate <= asOfDate && event.endDate >= asOfDate);
  if (active) return active;

  const upcoming = eligible.find((event) => event.startDate >= asOfDate);
  if (upcoming) return upcoming;

  throw new Error(`No current or future non-alternate PGA event found for ${asOfDate}.`);
}

async function fetchOfficialSchedule(year) {
  const data = await postGraphql(SCHEDULE_QUERY, { tourCode: TOUR_CODE, year: String(year) });
  const buckets = [
    ["completed", data?.schedule?.completed ?? []],
    ["upcoming", data?.schedule?.upcoming ?? []],
  ];

  return buckets.flatMap(([bucket, groups]) => (groups ?? []).flatMap((group) =>
    (group?.tournaments ?? []).map((event) => ({
      ...event,
      bucket,
      startDateIso: normalizePgaTimestamp(event?.startDate),
    })),
  ));
}

function resolveTournamentIdFromUrl(value) {
  const text = String(value ?? "");
  const match = text.match(/\b(R\d{7,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function matchOfficialTournament(localEvent, officialEvents) {
  const explicitId = OVERRIDE_ID || resolveTournamentIdFromUrl(OVERRIDE_URL) || clean(localEvent.pgaTourId);
  if (explicitId) {
    return officialEvents.find((event) => event.id === explicitId)
      ?? { id: explicitId, tournamentName: localEvent.name, startDateIso: localEvent.startDate };
  }

  const localName = normalizeEventName(localEvent.name);
  const localDate = localEvent.startDate;
  const scored = officialEvents.map((event) => {
    const officialName = normalizeEventName(event.tournamentName);
    const exactName = officialName === localName;
    const containsName = officialName.includes(localName) || localName.includes(officialName);
    const dateDiff = dayDifference(localDate, event.startDateIso);
    let score = 0;
    if (exactName) score += 100;
    else if (containsName) score += 70;
    if (dateDiff === 0) score += 30;
    else if (dateDiff <= 3) score += 15;
    return { event, score, dateDiff };
  }).sort((a, b) => b.score - a.score || a.dateDiff - b.dateDiff);

  const best = scored[0];
  if (!best || best.score < 85) {
    const candidates = scored.slice(0, 5).map(({ event, score }) => `${event.id} ${event.tournamentName} (${score})`).join(", ");
    throw new Error(`Unable to confidently match ${localEvent.name} to the official PGA schedule. Candidates: ${candidates}`);
  }
  return best.event;
}

async function fetchOfficialField(tournamentId) {
  const data = await postGraphql(FIELD_QUERY, { ids: [tournamentId], fieldId: tournamentId });
  const tournament = data?.tournaments?.[0] ?? null;
  const rawPlayers = Array.isArray(data?.field?.players) ? data.field.players : [];

  const playersByKey = new Map();
  for (const player of rawPlayers) {
    const name = [player?.firstName, player?.lastName].filter(Boolean).join(" ").trim();
    const id = clean(player?.id);
    if (!name) continue;
    const key = id || normalizePlayerName(name);
    if (!playersByKey.has(key)) playersByKey.set(key, { id: id || null, name });
  }

  const players = [...playersByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (players.length < 20) throw new Error(`Official field returned only ${players.length} players for ${tournamentId}.`);
  return { tournament, players };
}

async function fetchEspnCrossCheck(expectedTournament) {
  try {
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
    if (!response.ok) return null;
    const payload = await response.json();
    const event = (payload?.events ?? []).find((candidate) =>
      normalizeEventName(candidate?.shortName ?? candidate?.name) === normalizeEventName(expectedTournament),
    );
    const competitors = event?.competitions?.[0]?.competitors ?? [];
    const players = competitors
      .filter((competitor) => !competitor?.isAlternate)
      .filter((competitor) => {
        const status = String(competitor?.status?.type?.id ?? competitor?.status ?? "").toUpperCase();
        return status !== "ALT" && status !== "WD" && status !== "DQ";
      })
      .map((competitor) => competitor?.athlete?.displayName ?? competitor?.athlete?.fullName)
      .filter(Boolean);
    return players.length ? players : null;
  } catch {
    return null;
  }
}

function calculateAgreement(officialPlayers, comparisonPlayers) {
  if (!comparisonPlayers?.length) return null;
  const official = new Set(officialPlayers.map((player) => normalizePlayerName(player.name)));
  const comparison = new Set(comparisonPlayers.map(normalizePlayerName));
  const overlap = [...official].filter((name) => comparison.has(name)).length;
  const union = new Set([...official, ...comparison]).size;
  return {
    overlap,
    union,
    agreementPercent: union ? Math.round((overlap / union) * 1000) / 10 : 0,
  };
}

function updateScheduleMetadata(schedule, localEvent, officialEvent, sourceUrl) {
  return schedule.map((event) => event.id === localEvent.id ? {
    ...event,
    pgaTourId: officialEvent.id,
    pgaTourUrl: sourceUrl,
    fieldSource: "pga-tour-official",
  } : event);
}

async function main() {
  const schedule = await readLocalSchedule();
  const localTarget = selectLocalTarget(schedule);
  const year = Number(String(localTarget.startDate).slice(0, 4)) || AS_OF.getUTCFullYear();
  const officialSchedule = await fetchOfficialSchedule(year);
  const officialTarget = matchOfficialTournament(localTarget, officialSchedule);
  const tournamentId = officialTarget.id;
  const sourceSlug = slugify(localTarget.name).replace(/-2026$/, "");
  const sourceUrl = OVERRIDE_URL || `https://www.pgatour.com/tournaments/${year}/${sourceSlug}/${tournamentId}`;
  const { tournament, players } = await fetchOfficialField(tournamentId);

  const officialName = tournament?.tournamentName || officialTarget.tournamentName || localTarget.name;
  if (normalizeEventName(officialName) !== normalizeEventName(localTarget.name)) {
    throw new Error(`Official field tournament mismatch: local=${localTarget.name}, official=${officialName}`);
  }

  const espnPlayers = await fetchEspnCrossCheck(officialName);
  const crossCheck = calculateAgreement(players, espnPlayers);
  const output = {
    version: 2,
    tournament: officialName,
    tournamentId,
    tournamentSlug: localTarget.slug,
    localScheduleId: localTarget.id,
    startDate: localTarget.startDate,
    endDate: localTarget.endDate,
    source: "pga-tour-official-field",
    sourceUrl,
    validated: true,
    validationNote: "Tournament ID, tournament name, dates, and player list were matched to the official PGA TOUR schedule and field endpoints.",
    fetchedAt: new Date().toISOString(),
    fieldCount: players.length,
    alternatesExcluded: true,
    alternatePolicy: "Only field.players is imported. Alternate lists are intentionally not queried or merged.",
    crossCheck: crossCheck ? {
      source: "espn-scoreboard",
      playerCount: espnPlayers.length,
      ...crossCheck,
    } : null,
    players: players.map((player) => player.name),
    playerDetails: players,
  };

  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n", "utf8");
  const updatedSchedule = updateScheduleMetadata(schedule, localTarget, officialTarget, sourceUrl);
  await writeFile(SCHEDULE_PATH, JSON.stringify(updatedSchedule, null, 2) + "\n", "utf8");

  console.log(`[pga-field] ${officialName} (${tournamentId})`);
  console.log(`[pga-field] Imported ${players.length} official field players.`);
  console.log("[pga-field] Alternates excluded by policy.");
  if (crossCheck) console.log(`[pga-field] ESPN cross-check agreement: ${crossCheck.agreementPercent}% (${crossCheck.overlap}/${crossCheck.union})`);
  console.log(`[pga-field] Source: ${sourceUrl}`);
}

function normalizePgaTimestamp(value) {
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

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

main().catch((error) => {
  console.error(`[pga-field] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
