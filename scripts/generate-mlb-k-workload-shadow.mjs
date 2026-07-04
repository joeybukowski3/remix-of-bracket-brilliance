import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fetchJsonWithRetry,
  fetchPitcherWorkloadData,
  getTodayEt,
  inferSeason,
  toFiniteNumber,
} from "./mlb-k/fetch-workload-data.mjs";
import {
  computeWorkloadProjection,
  normalizeRate,
  WORKLOAD_MODEL_VERSION,
} from "./mlb-k/compute-workload-projection.mjs";
import {
  computeTeamKAdjustment,
  TEAM_K_ADJUSTMENT_MODEL_VERSION,
} from "./mlb-k/compute-team-k-adjustment.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "k-workload-shadow.json");
const HR_RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const MLB_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_CONCURRENCY = 4;

const round = (value, digits = 3) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const divide = (a, b) => {
  const top = toFiniteNumber(a);
  const bottom = toFiniteNumber(b);
  return top != null && bottom != null && bottom > 0 ? top / bottom : null;
};
const average = (values) => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};
const normalizeTeam = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return ({ ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH" })[code] ?? code;
};

async function fetchJson(url, fetchImpl) {
  const response = await fetchJsonWithRetry(url, { fetchImpl, timeoutMs: 15_000, maxAttempts: 3 });
  if (!response.ok) throw new Error(response.error ?? `Request failed: ${url}`);
  return response.json;
}

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

function loadOptionalRawContext(targetDate) {
  if (!existsSync(HR_RAW_PATH)) return { pitchers: new Map(), teams: new Map() };
  try {
    const payload = JSON.parse(readFileSync(HR_RAW_PATH, "utf8"));
    if (payload?.date !== targetDate) return { pitchers: new Map(), teams: new Map() };

    const pitchers = new Map();
    for (const row of payload.pitchers ?? []) {
      const id = toFiniteNumber(row.pitcherId);
      if (id == null) continue;
      const hand = String(row.hand ?? "").trim().toUpperCase();
      pitchers.set(id, {
        seasonKRate: normalizeRate(row.kRate),
        bbRate: normalizeRate(row.bbRate),
        whiffRate: normalizeRate(row.whiffRate),
        xera: toFiniteNumber(row.xera),
        hand: hand.startsWith("L") ? "L" : hand.startsWith("R") ? "R" : null,
        source: "hr-props-raw",
      });
    }

    const grouped = new Map();
    for (const batter of payload.batters ?? []) {
      const team = normalizeTeam(batter.team);
      grouped.set(team, [...(grouped.get(team) ?? []), batter]);
    }
    const teams = new Map();
    for (const [team, batters] of grouped) {
      teams.set(team, {
        lineupKRate: average(batters.map((row) => normalizeRate(row.kRate)).filter(Number.isFinite)),
        lineupWalkRate: average(batters.map((row) => normalizeRate(row.bbRate)).filter(Number.isFinite)),
        lineupWhiffRate: average(batters.map((row) => normalizeRate(row.whiffRate)).filter(Number.isFinite)),
      });
    }
    return { pitchers, teams };
  } catch {
    return { pitchers: new Map(), teams: new Map() };
  }
}

function normalizeScheduleTeam(side) {
  return {
    id: toFiniteNumber(side?.team?.id),
    code: normalizeTeam(side?.team?.abbreviation ?? side?.team?.teamCode ?? side?.team?.fileCode),
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
      gameDate: game.gameDate ?? null,
      venue: game?.venue?.name ?? "Unknown Venue",
      status: game?.status?.detailedState ?? "Scheduled",
      away: normalizeScheduleTeam(game?.teams?.away),
      home: normalizeScheduleTeam(game?.teams?.home),
    }));
}

export function extractProbableStarters(games) {
  const rows = [];
  for (const game of games) {
    const gameKey = `${game.away.code}@${game.home.code}`;
    for (const [team, opponent, isHome] of [[game.away, game.home, false], [game.home, game.away, true]]) {
      if (!team.probablePitcher?.id) continue;
      rows.push({
        gamePk: game.gamePk,
        gameKey,
        gameDate: game.gameDate,
        gameStatus: game.status,
        venue: game.venue,
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

function extractStat(payload) {
  return payload?.stats?.flatMap((block) => block?.splits ?? []).find((split) => split?.stat)?.stat ?? null;
}

async function fetchTeamStats(teamId, season, fetchImpl, range = null) {
  const query = new URLSearchParams({ group: "hitting" });
  if (range) {
    query.set("stats", "byDateRange");
    query.set("startDate", range.startDate);
    query.set("endDate", range.endDate);
  } else {
    query.set("stats", "season");
    query.set("season", String(season));
  }
  const stat = extractStat(await fetchJson(`${MLB_API}/teams/${teamId}/stats?${query}`, fetchImpl));
  if (!stat) return null;
  const plateAppearances = toFiniteNumber(stat.plateAppearances);
  const strikeouts = toFiniteNumber(stat.strikeOuts ?? stat.strikeouts);
  const walks = toFiniteNumber(stat.baseOnBalls ?? stat.walks);
  const pitches = toFiniteNumber(stat.numberOfPitches ?? stat.pitchesSeen ?? stat.pitches);
  return {
    plateAppearances,
    strikeouts,
    walks,
    pitches,
    kRate: divide(strikeouts, plateAppearances),
    walkRate: divide(walks, plateAppearances),
    pitchesPerPA: divide(pitches, plateAppearances),
  };
}

function subtractDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function buildTeamContext(team, season, targetDate, raw, fetchImpl) {
  let seasonStats = null;
  let recentStats = null;
  const warnings = [];
  try {
    seasonStats = await fetchTeamStats(team.id, season, fetchImpl);
  } catch {
    warnings.push("TEAM_SEASON_STATS_UNAVAILABLE");
  }
  try {
    recentStats = await fetchTeamStats(team.id, season, fetchImpl, {
      startDate: subtractDays(targetDate, 13),
      endDate: targetDate,
    });
  } catch {
    warnings.push("TEAM_RECENT_STATS_UNAVAILABLE");
  }
  return {
    teamId: team.id,
    team: team.code,
    seasonPitchesPerPA: seasonStats?.pitchesPerPA ?? null,
    recent14PitchesPerPA: recentStats?.pitchesPerPA ?? null,
    seasonPlateAppearances: seasonStats?.plateAppearances ?? null,
    recent14PlateAppearances: recentStats?.plateAppearances ?? null,
    seasonKRate: seasonStats?.kRate ?? raw?.lineupKRate ?? null,
    recent14KRate: recentStats?.kRate ?? null,
    seasonWalkRate: seasonStats?.walkRate ?? raw?.lineupWalkRate ?? null,
    recent14WalkRate: recentStats?.walkRate ?? null,
    seasonContactRate: raw?.lineupWhiffRate == null ? null : 1 - raw.lineupWhiffRate,
    kRateVsLhp: null,
    plateAppearancesVsLhp: null,
    kRateVsRhp: null,
    plateAppearancesVsRhp: null,
    warnings,
    _totals: seasonStats,
  };
}

function buildLeagueContext(teamRows) {
  let pa = 0;
  let strikeouts = 0;
  let walks = 0;
  let pitches = 0;
  for (const row of teamRows) {
    const totals = row._totals;
    if (!totals?.plateAppearances) continue;
    pa += totals.plateAppearances;
    strikeouts += totals.strikeouts ?? 0;
    walks += totals.walks ?? 0;
    pitches += totals.pitches ?? 0;
  }
  const contactRates = teamRows.map((row) => row.seasonContactRate).filter(Number.isFinite);
  const contactRate = average(contactRates) ?? 0.75;
  return {
    pitchesPerPA: pa > 0 ? pitches / pa : 3.9,
    kRate: pa > 0 ? strikeouts / pa : 0.225,
    whiffRate: 1 - contactRate,
    bbRate: pa > 0 ? walks / pa : 0.085,
    contactRate,
    starterAveragePitches: 86,
    starterAverageBF: 21.5,
    outsPerBF: 0.72,
  };
}

function aggregateStarts(starts) {
  let bf = 0;
  let strikeouts = 0;
  let walks = 0;
  for (const start of starts ?? []) {
    const faced = toFiniteNumber(start.battersFaced);
    if (faced == null || faced <= 0) continue;
    bf += faced;
    strikeouts += toFiniteNumber(start.strikeouts, 0);
    walks += toFiniteNumber(start.walks, 0);
  }
  return { bf, kRate: divide(strikeouts, bf), bbRate: divide(walks, bf) };
}

function derivePitcherContext(workloadData, raw) {
  const season = toFiniteNumber(workloadData?.season);
  const currentStarts = (workloadData?.allStarterAppearances ?? []).filter((start) => season == null || toFiniteNumber(start.season) === season);
  const seasonAgg = aggregateStarts(currentStarts);
  const recentAgg = aggregateStarts(workloadData?.starts ?? []);
  return {
    seasonKRate: raw?.seasonKRate ?? seasonAgg.kRate,
    seasonBattersFaced: seasonAgg.bf || null,
    recentKRate: recentAgg.kRate,
    recentBattersFaced: recentAgg.bf || null,
    bbRate: raw?.bbRate ?? seasonAgg.bbRate,
    whiffRate: raw?.whiffRate ?? null,
    xera: raw?.xera ?? null,
    hand: raw?.hand ?? null,
    source: raw?.source ?? "starter-game-log-derived",
  };
}

export async function generateShadow({
  targetDate = getTodayEt(),
  concurrency = DEFAULT_CONCURRENCY,
  fetchImpl = globalThis.fetch,
} = {}) {
  const season = inferSeason(targetDate);
  const games = await loadCurrentSlate(targetDate, fetchImpl);
  const starters = extractProbableStarters(games);
  const raw = loadOptionalRawContext(targetDate);
  const teams = [...new Map(games.flatMap((game) => [game.away, game.home]).filter((team) => team.id).map((team) => [team.id, team])).values()];
  const teamRows = await mapLimit(teams, concurrency, (team) => buildTeamContext(team, season, targetDate, raw.teams.get(team.code), fetchImpl));
  const teamById = new Map(teamRows.map((row) => [row.teamId, row]));
  const league = buildLeagueContext(teamRows);

  const pitchers = await mapLimit(starters, concurrency, async (starter) => {
    let workloadData;
    try {
      workloadData = await fetchPitcherWorkloadData(starter.pitcherId, {
        season,
        targetDate,
        limit: 6,
        includePreviousSeasonFallback: true,
        fetchImpl,
      });
    } catch (error) {
      workloadData = {
        ok: false,
        pitcherId: starter.pitcherId,
        season,
        targetDate,
        starts: [],
        allStarterAppearances: [],
        completeness: { score: 0, grade: "D", flags: ["GAME_LOG_FETCH_FAILED"] },
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const pitcherContext = derivePitcherContext(workloadData, raw.pitchers.get(starter.pitcherId));
    const opponentContext = teamById.get(starter.opponentId) ?? {};
    const workload = computeWorkloadProjection({
      workloadData,
      pitcher: pitcherContext,
      opponent: opponentContext,
      league,
      context: { listedProbableStarter: true },
    });
    const teamKAdjustment = computeTeamKAdjustment({
      pitcher: pitcherContext,
      opponent: opponentContext,
      league,
      context: { pitcherHand: pitcherContext.hand },
    });
    const expectedBF = toFiniteNumber(workload.projection?.expectedBF);
    const teamAdjustedKRate = toFiniteNumber(teamKAdjustment.adjustedKRate);
    const workloadOnlyProjectedKs = toFiniteNumber(workload.projection?.workloadOnlyProjectedKs);
    const fullShadowProjectedKs = expectedBF != null && teamAdjustedKRate != null ? expectedBF * teamAdjustedKRate : null;

    return {
      ...starter,
      workloadFetchOk: workloadData.ok === true,
      workloadFetchError: workloadData.error ?? null,
      pitcherContext: {
        ...pitcherContext,
        seasonKRate: round(pitcherContext.seasonKRate, 4),
        recentKRate: round(pitcherContext.recentKRate, 4),
        bbRate: round(pitcherContext.bbRate, 4),
        whiffRate: round(pitcherContext.whiffRate, 4),
      },
      opponentContext: {
        seasonPitchesPerPA: round(opponentContext.seasonPitchesPerPA),
        recent14PitchesPerPA: round(opponentContext.recent14PitchesPerPA),
        seasonPlateAppearances: opponentContext.seasonPlateAppearances ?? null,
        recent14PlateAppearances: opponentContext.recent14PlateAppearances ?? null,
        seasonKRate: round(opponentContext.seasonKRate, 4),
        recent14KRate: round(opponentContext.recent14KRate, 4),
        warnings: opponentContext.warnings ?? [],
      },
      ...workload,
      teamKAdjustment,
      workloadFlags: workload.flags ?? [],
      teamKFlags: teamKAdjustment.flags ?? [],
      flags: [...new Set([...(workload.flags ?? []), ...(teamKAdjustment.flags ?? [])])],
      projection: {
        ...workload.projection,
        workloadOnlyProjectedKs: round(workloadOnlyProjectedKs, 3),
        teamAdjustedKRate: round(teamAdjustedKRate, 4),
        fullShadowProjectedKs: round(fullShadowProjectedKs, 3),
        teamAdjustmentKsDelta: workloadOnlyProjectedKs != null && fullShadowProjectedKs != null
          ? round(fullShadowProjectedKs - workloadOnlyProjectedKs, 3)
          : null,
      },
    };
  });

  const deltas = pitchers.map((row) => row.projection.teamAdjustmentKsDelta).filter(Number.isFinite);
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    modelVersion: WORKLOAD_MODEL_VERSION,
    teamKAdjustmentModelVersion: TEAM_K_ADJUSTMENT_MODEL_VERSION,
    mode: "shadow",
    date: targetDate,
    generatedAt,
    summary: {
      gameCount: games.length,
      pitcherCount: pitchers.length,
      successfulWorkloadFetches: pitchers.filter((row) => row.workloadFetchOk).length,
      workloadOnlyKsAvailable: pitchers.filter((row) => row.projection.workloadOnlyProjectedKs != null).length,
      teamAdjustedKsAvailable: pitchers.filter((row) => row.projection.fullShadowProjectedKs != null).length,
      averageSignedKsChange: round(average(deltas), 3),
      averageAbsoluteKsChange: round(average(deltas.map(Math.abs)), 3),
      generatedAt,
    },
    leagueContext: {
      pitchesPerPA: round(league.pitchesPerPA),
      kRate: round(league.kRate, 4),
      whiffRate: round(league.whiffRate, 4),
      bbRate: round(league.bbRate, 4),
      contactRate: round(league.contactRate, 4),
    },
    pitchers,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const targetDate = value("--date=") ?? getTodayEt();
  const concurrency = Math.max(1, Math.min(8, Math.trunc(toFiniteNumber(value("--concurrency="), DEFAULT_CONCURRENCY))));
  const payload = await generateShadow({ targetDate, concurrency });
  if (argv.includes("--dry-run")) {
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }
  writeJsonAtomic(OUTPUT_PATH, payload);
  console.log(`[k-workload-shadow] wrote ${OUTPUT_PATH} (${payload.pitchers.length} pitchers)`);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[k-workload-shadow] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
