/**
 * fetch-pga-fedex-standings.mjs
 *
 * Fetches current-season FedExCup standings from the PGA Tour site GraphQL
 * endpoint (same orchestrator.pgatour.com API used by fetch-pga-player-
 * stats.mjs, statId "02671" -- verified live against production: returns
 * statTitle "FedExCup Standings", ~219 rows, strictly non-increasing by
 * points). Writes public/data/pga/fedex-standings.json.
 *
 * Rank is derived from array position (index + 1) rather than trusting any
 * rank field the API might expose, because the response is validated to be
 * strictly ordered by points before that derivation is trusted -- if a
 * future API change breaks that ordering, this refuses to write output
 * rather than silently publishing wrong ranks (see validateFedexStandings).
 *
 * Usage:
 *   PGA_API_KEY=da2-xxxxx node scripts/fetch-pga-fedex-standings.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "public", "data", "pga", "fedex-standings.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const TOUR_CODE = "R";
const FEDEX_STAT_ID = "02671";
const SEASON = parseInt(process.env.PGA_STATS_YEAR || new Date().getFullYear(), 10);
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY || DEFAULT_API_KEY;
const MIN_EXPECTED_ROWS = 150;
const EXPECTED_STAT_TITLE = "FedExCup Standings";

const QUERY = `
  query StatDetails($tourCode: TourCode!, $statId: String!, $year: Int!) {
    statDetails(tourCode: $tourCode, statId: $statId, year: $year) {
      statTitle
      rows {
        ... on StatDetailsPlayer {
          playerId
          playerName
          stats { statName statValue }
        }
      }
    }
  }
`;

function parseNumeric(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function statValueFor(row, statName) {
  return row.stats?.find((entry) => entry.statName === statName)?.statValue ?? null;
}

async function fetchFedexStandings() {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "x-pgat-platform": "web",
      Referer: "https://www.pgatour.com/",
      Origin: "https://www.pgatour.com",
    },
    body: JSON.stringify({ query: QUERY, variables: { tourCode: TOUR_CODE, statId: FEDEX_STAT_ID, year: SEASON } }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching FedExCup standings`);
  const json = await response.json();
  if (json.errors?.length) throw new Error(`GraphQL error fetching FedExCup standings: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json?.data?.statDetails ?? null;
}

/**
 * Fail-closed validation before any rank is trusted. Never returns a
 * partial/best-effort result -- either the response is a well-formed,
 * strictly-ordered FedExCup standings list, or this throws and the caller
 * writes nothing (best-bets generation then treats FedEx data as
 * unavailable rather than publishing a guess).
 */
export function validateFedexStandings(statDetails) {
  if (!statDetails || typeof statDetails !== "object") {
    throw new Error("FedExCup standings response is missing or malformed.");
  }
  if (statDetails.statTitle !== EXPECTED_STAT_TITLE) {
    throw new Error(`FedExCup standings statTitle mismatch: expected "${EXPECTED_STAT_TITLE}", got "${statDetails.statTitle}".`);
  }
  const rows = Array.isArray(statDetails.rows) ? statDetails.rows : [];
  if (rows.length < MIN_EXPECTED_ROWS) {
    throw new Error(`FedExCup standings returned only ${rows.length} rows; expected at least ${MIN_EXPECTED_ROWS}.`);
  }

  const points = rows.map((row) => parseNumeric(statValueFor(row, "Points")));
  if (points.some((value) => value == null)) {
    throw new Error("FedExCup standings response has a row with a missing/unparseable points value.");
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i] > points[i - 1]) {
      throw new Error(`FedExCup standings are not ordered by points (row ${i} has more points than row ${i - 1}); refusing to derive rank from array position.`);
    }
  }

  const names = rows.map((row) => row.playerName);
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new Error("FedExCup standings response has a missing or duplicate player name.");
  }

  return { rows, points };
}

function buildOutputRows(rows, points) {
  return rows.map((row, index) => ({
    rank: index + 1,
    player: row.playerName,
    playerId: row.playerId ? String(row.playerId) : null,
    points: points[index],
    wins: parseNumeric(statValueFor(row, "# of Wins")),
    top10s: parseNumeric(statValueFor(row, "# of Top-10s")),
    pointsBehindLead: parseNumeric(statValueFor(row, "Points behind Lead")),
  }));
}

async function main() {
  console.log(`[pga-fedex-standings] Fetching FedExCup standings (statId ${FEDEX_STAT_ID}) for season ${SEASON}...`);
  const statDetails = await fetchFedexStandings();
  const { rows, points } = validateFedexStandings(statDetails);
  const outputRows = buildOutputRows(rows, points);

  const output = {
    version: 1,
    season: SEASON,
    source: "pga-tour-official-fedexcup-standings",
    sourceStatId: FEDEX_STAT_ID,
    fetchedAt: new Date().toISOString(),
    playerCount: outputRows.length,
    rows: outputRows,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const tempPath = `${OUTPUT_PATH}.tmp-${process.pid}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    JSON.parse(readFileSync(tempPath, "utf8")); // round-trip sanity check before publishing
    writeFileSync(OUTPUT_PATH, readFileSync(tempPath, "utf8"), "utf8");
  } finally {
    rmSync(tempPath, { force: true });
  }

  console.log(`[pga-fedex-standings] Wrote ${outputRows.length} validated rows to ${OUTPUT_PATH}`);
  console.log(`[pga-fedex-standings] Spot-check leader: ${outputRows[0]?.player} (${outputRows[0]?.points} pts)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[pga-fedex-standings] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
