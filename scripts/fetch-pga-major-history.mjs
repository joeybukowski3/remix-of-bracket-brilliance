import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const OUTPUT = path.join(process.cwd(), "public", "data", "pga", "major-history.json");
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY;
const START_YEAR = Number(process.env.PGA_MAJOR_START_YEAR || 2018);
const END_YEAR = Number(process.env.PGA_MAJOR_END_YEAR || new Date().getFullYear());

const QUERY = `
query Leaderboard($id: ID!) {
  leaderboardV3(id: $id) {
    id
    players {
      ... on PlayerRowV3 {
        player { id displayName }
        scoringData { position playerState total totalStrokes }
      }
    }
  }
}`;

const SPECIAL_IDS = {
  "masters:2020": "R2021014",
  "masters:2021": "R2021536",
  "us_open:2020": "R2021026",
  "us_open:2021": "R2021535",
};

const MAJORS = [
  { type: "masters", name: "Masters Tournament", suffix: "014", monthDay: "04-15" },
  { type: "pga_championship", name: "PGA Championship", suffix: "033", monthDay: "05-25" },
  { type: "us_open", name: "U.S. Open", suffix: "026", monthDay: "06-25" },
  { type: "open_championship", name: "The Open Championship", suffix: "100", monthDay: "07-25" },
];

function tournamentId(type, suffix, year) {
  return SPECIAL_IDS[`${type}:${year}`] || `R${year}${suffix}`;
}

function parsePosition(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeFinish(position, state) {
  const normalizedState = String(state || "").toLowerCase();
  if (normalizedState.includes("withdraw")) return { finishText: "WD", finishPosition: null, madeCut: false, status: "withdrawn" };
  if (normalizedState.includes("disqual")) return { finishText: "DQ", finishPosition: null, madeCut: false, status: "disqualified" };
  if (normalizedState.includes("cut") || String(position || "").toUpperCase() === "CUT") return { finishText: "MC", finishPosition: null, madeCut: false, status: "missed_cut" };
  const finishPosition = parsePosition(position);
  if (finishPosition == null) return null;
  return { finishText: String(position).trim() || String(finishPosition), finishPosition, madeCut: true, status: "finished" };
}

async function fetchLeaderboard(id) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "x-pgat-platform": "web",
      Referer: "https://www.pgatour.com/",
      Origin: "https://www.pgatour.com",
    },
    body: JSON.stringify({ query: QUERY, variables: { id } }),
  });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`${id}: ${payload.errors[0].message}`);
  return payload?.data?.leaderboardV3?.players || [];
}

async function main() {
  if (!API_KEY) throw new Error("Set PGA_API_KEY or PGA_TOUR_GQL_API_KEY before running this importer.");
  const byPlayer = new Map();
  const errors = [];
  const years = [];

  for (let year = START_YEAR; year <= END_YEAR; year += 1) {
    years.push(year);
    for (const major of MAJORS) {
      if (major.type === "open_championship" && year === 2020) continue;
      const id = tournamentId(major.type, major.suffix, year);
      try {
        console.log(`[pga-major-history] ${year} ${major.name} (${id})`);
        const rows = await fetchLeaderboard(id);
        for (const row of rows) {
          const player = row?.player?.displayName;
          const finish = normalizeFinish(row?.scoringData?.position, row?.scoringData?.playerState);
          if (!player || !finish) continue;
          if (!byPlayer.has(player)) byPlayer.set(player, { player, playerId: row.player.id || null, results: [] });
          byPlayer.get(player).results.push({
            season: year,
            eventSlug: `${major.type}-${year}`,
            eventName: major.name,
            eventDate: `${year}-${major.monthDay}`,
            majorType: major.type,
            ...finish,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[pga-major-history] ${message}`);
        errors.push(message);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const players = [...byPlayer.values()]
    .map((entry) => ({ ...entry, results: entry.results.sort((a, b) => b.eventDate.localeCompare(a.eventDate)) }))
    .sort((a, b) => a.player.localeCompare(b.player));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    version: 1,
    source: "pga-tour-graphql",
    generatedAt: new Date().toISOString(),
    years,
    players,
    errors,
  }, null, 2) + "\n");
  console.log(`[pga-major-history] wrote ${players.length} players to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(`[pga-major-history] ${error.message}`);
  process.exitCode = 1;
});
