import { parseCsv } from "./mlb-opponent-k-context.mjs";
import { runLimited } from "./mlb-strikeout-prop-details-fetch.mjs";
import { approximateWrcPlusFromWoba, MLB_FALLBACK_RUNS_PER_PA } from "./mlb-wrc-plus.mjs";

const SAVANT_SEARCH_CSV = "https://baseballsavant.mlb.com/statcast_search/csv";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 4;

function finite(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shiftDate(dateStr, deltaDays) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "text/csv,*/*", "User-Agent": "Mozilla/5.0 (compatible; joeknowsball/1.0)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeReferencePlateAppearances(rows, teamAbbr) {
  const normalizedTeam = String(teamAbbr ?? "").toUpperCase();
  return (rows ?? [])
    .filter((row) => row?.events && row?.game_date && row?.game_pk)
    .map((row) => ({
      date: String(row.game_date).slice(0, 10),
      gamePk: String(row.game_pk),
      team: normalizedTeam,
      site: String(row.home_team ?? "").toUpperCase() === normalizedTeam ? "home" : "away",
      pitcherHand: String(row.p_throws ?? "").toUpperCase() === "L" ? "L" : String(row.p_throws ?? "").toUpperCase() === "R" ? "R" : null,
      strikeout: row.events === "strikeout" || row.events === "strikeout_double_play" ? 1 : 0,
      wobaValue: finite(row.woba_value),
      wobaDenom: finite(row.woba_denom),
      runsScored: finite(row.post_bat_score) != null && finite(row.bat_score) != null
        ? finite(row.post_bat_score) - finite(row.bat_score)
        : null,
    }));
}

export async function fetchTeamReferencePlateAppearances(teamAbbr, season, beforeDate, options = {}) {
  const params = new URLSearchParams({
    all: "true",
    hfGT: "R|",
    hfSea: `${season}|`,
    hfTeam: `${teamAbbr}|`,
    player_type: "batter",
    game_date_gt: options.startDate ?? `${season}-03-01`,
    // Ask through the cutoff, then enforce strict `< cutoff` locally. This is
    // safe whether Savant interprets its date bound as inclusive or exclusive.
    game_date_lt: beforeDate,
    group_by: "name",
    sort_col: "pitches",
    sort_order: "desc",
    min_pitches: "0",
    min_results: "0",
    min_abs: "0",
    type: "details",
  });
  const text = await fetchText(`${SAVANT_SEARCH_CSV}?${params.toString()}`, options);
  return normalizeReferencePlateAppearances(parseCsv(text), teamAbbr);
}

export async function fetchLeagueReferencePlateAppearances(teams, season, beforeDate, options = {}) {
  const errors = [];
  const results = await runLimited(teams, options.concurrency ?? DEFAULT_CONCURRENCY, async (team) => {
    try {
      const rows = await fetchTeamReferencePlateAppearances(team.abbreviation, season, beforeDate, options);
      return { abbreviation: team.abbreviation, rows };
    } catch (error) {
      errors.push(`${team.abbreviation}:${error?.message ?? "unknown"}`);
      return { abbreviation: team.abbreviation, rows: [] };
    }
  });
  return { rowsByTeam: new Map(results.map((result) => [result.abbreviation, result.rows])), errors };
}

function priorDays(rows, cutoffDate, days) {
  const startDate = shiftDate(cutoffDate, -days);
  return rows.filter((row) => row.date >= startDate && row.date < cutoffDate);
}

function priorGames(rows, cutoffDate, count) {
  const eligible = rows.filter((row) => row.date < cutoffDate);
  const games = new Map();
  for (const row of eligible) if (!games.has(row.gamePk)) games.set(row.gamePk, row.date);
  const gamePks = [...games.entries()]
    .sort(([gamePkA, dateA], [gamePkB, dateB]) => String(dateB).localeCompare(String(dateA)) || Number(gamePkB) - Number(gamePkA))
    .slice(0, count)
    .map(([gamePk]) => gamePk);
  const selected = new Set(gamePks);
  return eligible.filter((row) => selected.has(row.gamePk));
}

function kRate(rows) {
  return rows.length ? rows.reduce((sum, row) => sum + row.strikeout, 0) / rows.length : null;
}

function woba(rows) {
  const eligible = rows.filter((row) => row.wobaValue != null && row.wobaDenom != null && row.wobaDenom > 0);
  if (!eligible.length) return null;
  const denominator = eligible.reduce((sum, row) => sum + row.wobaDenom, 0);
  return denominator > 0 ? eligible.reduce((sum, row) => sum + row.wobaValue, 0) / denominator : null;
}

function battingStat(rows) {
  return {
    woba: woba(rows),
    plateAppearances: rows.length,
    runs: rows.every((row) => row.runsScored != null)
      ? rows.reduce((sum, row) => sum + row.runsScored, 0)
      : null,
  };
}

function approximateWrcPlusForSamples(samples, statKey) {
  const valid = samples.filter((sample) => sample[statKey].woba != null && sample[statKey].plateAppearances > 0);
  const totalPa = valid.reduce((sum, sample) => sum + sample[statKey].plateAppearances, 0);
  const leagueWoba = totalPa > 0
    ? valid.reduce((sum, sample) => sum + sample[statKey].woba * sample[statKey].plateAppearances, 0) / totalPa
    : null;
  const hasCompleteRuns = valid.every((sample) => sample[statKey].runs != null);
  const leagueRunsPerPa = hasCompleteRuns && totalPa > 0
    ? valid.reduce((sum, sample) => sum + sample[statKey].runs, 0) / totalPa
    : MLB_FALLBACK_RUNS_PER_PA;
  return samples.map((sample) => ({
    team: sample.team,
    value: approximateWrcPlusFromWoba(sample[statKey].woba, leagueWoba, leagueRunsPerPa),
  }));
}

function rankDescending(entries, expectedTeamCount) {
  if (entries.length !== expectedTeamCount) return new Map();
  const eligible = entries.filter((entry) => entry.value != null && Number.isFinite(entry.value));
  if (eligible.length !== expectedTeamCount) return new Map();
  eligible.sort((a, b) => b.value - a.value || a.team.localeCompare(b.team));
  return new Map(eligible.map((entry, index) => [entry.team, index + 1]));
}

/**
 * Builds visual-reference league ranks at one strict pregame cutoff. Each
 * comparison set uses the repository's league-normalized, integer wRC+
 * approximation before ranking; the ranks never feed model calculations.
 */
export function buildLeagueReferenceContext(rowsByTeam, cutoffDate, pitcherHand, options = {}) {
  const teams = [...rowsByTeam.keys()].sort();
  const expectedTeamCount = options.expectedTeamCount ?? teams.length;
  const samples = teams.map((team) => {
    const rows = rowsByTeam.get(team) ?? [];
    const l30 = priorDays(rows, cutoffDate, 30);
    const l30VsHand = l30.filter((row) => row.pitcherHand === pitcherHand);
    return {
      team,
      kRateL30: kRate(l30),
      kRateL30VsHand: kRate(l30VsHand),
      battingL30: battingStat(l30),
      battingL30VsHand: battingStat(l30VsHand),
      battingL30Home: battingStat(l30.filter((row) => row.site === "home")),
      battingL30Away: battingStat(l30.filter((row) => row.site === "away")),
      battingL10: battingStat(priorGames(rows, cutoffDate, 10)),
    };
  });
  const ranks = {
    kRateL30: rankDescending(samples.map((row) => ({ team: row.team, value: row.kRateL30 })), expectedTeamCount),
    kRateL30VsHand: rankDescending(samples.map((row) => ({ team: row.team, value: row.kRateL30VsHand })), expectedTeamCount),
    wrcPlusL30: rankDescending(approximateWrcPlusForSamples(samples, "battingL30"), expectedTeamCount),
    wrcPlusL30VsHand: rankDescending(approximateWrcPlusForSamples(samples, "battingL30VsHand"), expectedTeamCount),
    wrcPlusL30Home: rankDescending(approximateWrcPlusForSamples(samples, "battingL30Home"), expectedTeamCount),
    wrcPlusL30Away: rankDescending(approximateWrcPlusForSamples(samples, "battingL30Away"), expectedTeamCount),
    wrcPlusL10: rankDescending(approximateWrcPlusForSamples(samples, "battingL10"), expectedTeamCount),
  };
  return new Map(teams.map((team) => [team, {
    cutoffDate,
    pitcherHand,
    opponentKRateRankL30: ranks.kRateL30.get(team) ?? null,
    opponentKRateRankL30VsHand: ranks.kRateL30VsHand.get(team) ?? null,
    opponentWrcPlusRankL30: ranks.wrcPlusL30.get(team) ?? null,
    opponentWrcPlusRankL30VsHand: ranks.wrcPlusL30VsHand.get(team) ?? null,
    opponentWrcPlusRankL30Home: ranks.wrcPlusL30Home.get(team) ?? null,
    opponentWrcPlusRankL30Away: ranks.wrcPlusL30Away.get(team) ?? null,
    opponentWrcPlusRankL10: ranks.wrcPlusL10.get(team) ?? null,
  }]));
}
