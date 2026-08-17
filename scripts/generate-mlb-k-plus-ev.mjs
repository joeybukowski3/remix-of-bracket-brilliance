/**
 * Generate the MLB Pitcher K +EV V1 source artifact.
 *
 * Independent of K Projection V2, the K workload shadow model, and the HR
 * +EV model. Reads today's probable starters from the live MLB schedule,
 * fetches each starter's full-season per-start game log (for Season/L8/L4
 * count windows), fetches real home/away K/outs/starts splits, and derives
 * the confirmed/projected-lineup-vs-hand -> team-vs-hand -> neutral
 * OpponentKRatio hierarchy from public/data/mlb/hr-props-raw.json batters
 * and public/data/mlb/batter-hand-splits-cache.json.
 *
 * Output: public/data/mlb/k-plus-ev.json
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fetchPitcherWorkloadData, getTodayEt, inferSeason, toFiniteNumber } from "./mlb-k/fetch-workload-data.mjs";
import { buildKCountWindows } from "./mlb-k/compute-k-count-windows.mjs";
import { fetchPitcherHomeAwaySplits } from "./mlb-k/fetch-pitcher-home-away-splits.mjs";
import { computeOpponentKRatio } from "./mlb-k/compute-opponent-k-ratio.mjs";

export const K_PLUS_EV_GENERATOR_VERSION = "mlb-k-plus-ev-generator-v1";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "k-plus-ev.json");
const HR_RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const HAND_SPLITS_PATH = path.join(DATA_DIR, "batter-hand-splits-cache.json");
const MLB_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_CONCURRENCY = 4;

function writeJsonAtomic(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    renameSync(temporary, filePath);
  } catch {
    if (existsSync(filePath)) rmSync(filePath);
    renameSync(temporary, filePath);
  }
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, worker));
  return output;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function normalizeScheduleTeam(side) {
  return {
    id: toFiniteNumber(side?.team?.id),
    code: side?.team?.abbreviation ?? null,
    probablePitcher: side?.probablePitcher?.id
      ? { id: toFiniteNumber(side.probablePitcher.id), name: side.probablePitcher.fullName ?? "Unknown Pitcher" }
      : null,
  };
}

export async function loadCurrentSlate(targetDate, fetchImpl = globalThis.fetch) {
  const query = new URLSearchParams({ sportId: "1", date: targetDate, hydrate: "team,probablePitcher" });
  const payload = await fetchJson(`${MLB_API}/schedule?${query}`, fetchImpl);
  return (payload?.dates?.[0]?.games ?? [])
    .filter((game) => !/(postponed|cancelled|canceled|suspended)/i.test(game?.status?.detailedState ?? ""))
    .map((game) => ({
      gamePk: toFiniteNumber(game.gamePk),
      away: normalizeScheduleTeam(game?.teams?.away),
      home: normalizeScheduleTeam(game?.teams?.home),
    }));
}

export function extractProbableStarters(games) {
  const rows = [];
  for (const game of games) {
    for (const [team, opponent, isHome] of [[game.away, game.home, false], [game.home, game.away, true]]) {
      if (!team.probablePitcher?.id) continue;
      rows.push({
        gamePk: game.gamePk,
        pitcherId: team.probablePitcher.id,
        pitcher: team.probablePitcher.name,
        teamId: team.id,
        team: team.code,
        opponentId: opponent.id,
        opponent: opponent.code,
        isHome,
      });
    }
  }
  return [...new Map(rows.map((row) => [`${row.gamePk}|${row.pitcherId}`, row])).values()];
}

function loadHrPropsRaw(targetDate) {
  if (!existsSync(HR_RAW_PATH)) return null;
  try {
    const payload = JSON.parse(readFileSync(HR_RAW_PATH, "utf8"));
    if (payload?.date !== targetDate) return null;
    return payload;
  } catch {
    return null;
  }
}

function loadHandSplitsByPlayerId() {
  if (!existsSync(HAND_SPLITS_PATH)) return new Map();
  try {
    const payload = JSON.parse(readFileSync(HAND_SPLITS_PATH, "utf8"));
    const entries = Object.values(payload?.players ?? {}).map((player) => [player.playerId, player]);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function pitcherHandFromRaw(hrRaw, pitcherId) {
  const row = hrRaw?.pitchers?.find((pitcher) => pitcher.pitcherId === pitcherId);
  const hand = String(row?.hand ?? "").trim().toUpperCase();
  return hand.startsWith("L") ? "L" : hand.startsWith("R") ? "R" : null;
}

function kLineOddsFromRaw(hrRaw, pitcherId) {
  const row = hrRaw?.pitchers?.find((pitcher) => pitcher.pitcherId === pitcherId);
  return {
    kLine: toFiniteNumber(row?.kLine),
    kOddsOverRaw: row?.kOddsOver ?? null,
    kOddsUnderRaw: row?.kOddsUnder ?? null,
    kOddsBook: row?.kOddsBook ?? null,
  };
}

function opposingLineupBatters(hrRaw, opponentTeamId, pitcherId) {
  return (hrRaw?.batters ?? []).filter(
    (batter) => batter.teamId === opponentTeamId && batter.opposingPitcherId === pitcherId,
  );
}

function teamRosterPlayerIds(hrRaw, opponentTeamId) {
  return (hrRaw?.batters ?? [])
    .filter((batter) => batter.teamId === opponentTeamId)
    .map((batter) => batter.playerId);
}

export async function generateKPlusEvSource({
  targetDate = getTodayEt(),
  concurrency = DEFAULT_CONCURRENCY,
  fetchImpl = globalThis.fetch,
} = {}) {
  const season = inferSeason(targetDate);
  const games = await loadCurrentSlate(targetDate, fetchImpl);
  const starters = extractProbableStarters(games);
  const hrRaw = loadHrPropsRaw(targetDate);
  const handSplitsByPlayerId = loadHandSplitsByPlayerId();

  const pitchers = await mapLimit(starters, concurrency, async (starter) => {
    let workloadData;
    let workloadError = null;
    try {
      workloadData = await fetchPitcherWorkloadData(starter.pitcherId, {
        season,
        targetDate,
        limit: 8,
        includePreviousSeasonFallback: false,
        fetchImpl,
      });
    } catch (error) {
      workloadData = { allStarterAppearances: [] };
      workloadError = error instanceof Error ? error.message : String(error);
    }

    const currentSeasonAppearances = (workloadData.allStarterAppearances ?? []).filter(
      (appearance) => toFiniteNumber(appearance.season) === season,
    );
    const { season: seasonWindow, last8, last4 } = buildKCountWindows(currentSeasonAppearances);

    let homeAway = { ok: false, home: null, away: null, error: "not fetched" };
    try {
      homeAway = await fetchPitcherHomeAwaySplits(starter.pitcherId, season, { fetchImpl });
    } catch (error) {
      homeAway = { ok: false, home: null, away: null, error: error instanceof Error ? error.message : String(error) };
    }

    const pitcherHand = pitcherHandFromRaw(hrRaw, starter.pitcherId);
    const lineupBatters = opposingLineupBatters(hrRaw, starter.opponentId, starter.pitcherId);
    const rosterPlayerIds = teamRosterPlayerIds(hrRaw, starter.opponentId);
    const opponentRatio = computeOpponentKRatio({
      pitcherHand,
      lineupBatters,
      teamRosterPlayerIds: rosterPlayerIds,
      handSplitsByPlayerId,
    });

    const { kLine, kOddsOverRaw, kOddsUnderRaw, kOddsBook } = kLineOddsFromRaw(hrRaw, starter.pitcherId);

    return {
      pitcher: starter.pitcher,
      pitcherId: starter.pitcherId,
      team: starter.team,
      opponent: starter.opponent,
      pitcherHand,
      isHome: starter.isHome,
      starterConfirmed: true,
      workloadFetchOk: workloadError == null,
      workloadFetchError: workloadError,
      season: seasonWindow,
      last8,
      last4,
      home: homeAway.home,
      away: homeAway.away,
      homeAwayFetchOk: homeAway.ok,
      homeAwayFetchError: homeAway.error,
      opponentKRatio: opponentRatio.opponentKRatio,
      opponentKRatioSource: opponentRatio.source,
      opponentKRateVsHand: opponentRatio.opponentKRateVsHand,
      leagueKRateVsHand: opponentRatio.leagueKRateVsHand,
      kLine,
      kOddsOverRaw,
      kOddsUnderRaw,
      kOddsBook,
    };
  });

  return {
    schemaVersion: 1,
    generatorVersion: K_PLUS_EV_GENERATOR_VERSION,
    mode: "v1",
    date: targetDate,
    generatedAt: new Date().toISOString(),
    pitchers,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const targetDate = value("--date=") ?? getTodayEt();
  const concurrency = Math.max(1, Math.min(8, Math.trunc(toFiniteNumber(value("--concurrency="), DEFAULT_CONCURRENCY))));
  const payload = await generateKPlusEvSource({ targetDate, concurrency });
  if (argv.includes("--dry-run")) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }
  writeJsonAtomic(OUTPUT_PATH, payload);
  console.log(`[k-plus-ev] wrote ${OUTPUT_PATH} (${payload.pitchers.length} pitchers)`);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[k-plus-ev] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
