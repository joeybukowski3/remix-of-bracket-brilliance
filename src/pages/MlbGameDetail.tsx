import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, CalendarDays, CloudSun, Crosshair, Dice5, ExternalLink, Flame, Gauge, Radar, Shield, Sparkles, Swords, Target, TrendingUp, Wind } from "lucide-react";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import MlbModelPickBadge from "@/components/mlb/MlbModelPickBadge";
import MlbPitcherRegressionTable, { regressionPillStyle } from "@/components/mlb/MlbPitcherRegressionTable";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";
import { useMlbOdds } from "@/hooks/useMlbOdds";
import { usePolymarketMlbMoneylines } from "@/hooks/usePolymarketMlbMoneylines";
import { usePitcherPercentiles } from "@/hooks/usePitcherPercentiles";
import { useTeamWrc } from "@/hooks/useTeamWrc";
import SportsbookBar from "@/components/SportsbookBar";
import MlbMatchupHero from "@/components/mlb/MlbMatchupHero";
import MlbMatchupLayout from "@/components/mlb/MlbMatchupLayout";
import MlbMatchupSummaryRow from "@/components/mlb/MlbMatchupSummaryRow";
import MlbParkContextPanel from "@/components/mlb/MlbParkContextPanel";
import MlbPitcherComparisonPanel from "@/components/mlb/MlbPitcherComparisonPanel";
import MlbPitcherVsLineupPanel from "@/components/mlb/MlbPitcherVsLineupPanel";
import MlbProjectedLineupPanel from "@/components/mlb/MlbProjectedLineupPanel";
import MlbPropAnglesPanel from "@/components/mlb/MlbPropAnglesPanel";
import MlbSectionCard from "@/components/mlb/MlbSectionCard";
import MlbSectionHeader from "@/components/mlb/MlbSectionHeader";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import MlbSplitComparisonPanel from "@/components/mlb/MlbSplitComparisonPanel";
import MlbTeamOverviewPanel from "@/components/mlb/MlbTeamOverviewPanel";
import MlbPolymarketMoneylinePanel, { type PanelMlEdge } from "@/components/mlb/MlbPolymarketMoneylinePanel";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getParkContextValues, getPitcherComparisonMetrics, getPropAngles, getSummaryCards } from "@/lib/mlb/mlbComparisonHelpers";
import { computeModelEdge, getEdgeTierKey, getEdgeTierLabel, ML_EDGE_METHODOLOGY } from "@/lib/mlb/mlbModelEdge";
import {
  americanToImpliedProbability,
  buildPrimaryReason,
  compareMlSocialRows,
  computeDisplayedEdge,
  confidenceForEdgePoints,
  DEFAULT_FORM_WINDOW,
  formatEdgePoints,
  formatMarketPct,
  FORM_WINDOW_LABELS,
  FORM_WINDOW_LONG,
  FORM_WINDOW_SOURCES,
  getComponentBand,
  getEdgeGrade,
  getFactorAvailability,
  getFormEdge,
  noVigProbability,
  type FormWindow,
  type MlSocialRow,
} from "@/lib/mlb/mlbSocialEdge";
import { computeK9, computePercent, formatAvgLike, formatFactor, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { getProjectionEdgeInfo, selectTopSocialKRows } from "@/lib/mlb/kPropValueSorting";
import { resolveKPropStatus } from "@/lib/mlb/kPropStatus";
import { MLB_LEAGUE_AVERAGES } from "@/lib/mlb/mlbLeagueAverages";
import { buildBreadcrumbSchema } from "@/lib/seo/pgaSeo";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric, MlbGameDetail, MlbLineupRow, MlbOpponentSplit, MlbRouteState, MlbScheduleGame, MlbTeamWrcData } from "@/lib/mlb/mlbTypes";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { ScorePill, HrDashboardPitcher, TeamLogoBadge, type HrDashboardBatter, type HrDashboardNextRunAt, type HrDashboardPendingGame, type PitcherStrikeoutTeamRow, type PitcherVsBatterRow } from "@/pages/MlbHrProps";

const SEASON = new Date().getFullYear();

type MlbCache = {
  date: string;
  schedule: MlbScheduleGame[] | null;
  schedulePromise: Promise<MlbScheduleGame[]> | null;
  games: Record<string, MlbGameDetail>;
  detailPromises: Record<string, Promise<MlbGameDetail>>;
  people: Record<string, any>;
  pitcherVsTeam: Record<string, any>;
  pitcherLocationSplits: Record<string, any>;
  teamSplits: Record<string, any>;
  teamSchedules: Record<string, any[]>;
  teamPitching: Record<string, any>;
  hitterStats: Record<string, any>;
  lineups: Record<string, any[]>;
  wrcData: MlbTeamWrcData | null;
};

let mlbCache: MlbCache | null = null;
const DEV_FIXTURE_GAME_PK = String(DEV_MLB_MATCHUP_FIXTURE.detail.game.gamePk);

function getOperationalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ensureCache() {
  const date = getOperationalDate();
  if (!mlbCache || mlbCache.date !== date) {
    mlbCache = {
      date,
      schedule: null,
      schedulePromise: null,
      games: {},
      detailPromises: {},
      people: {},
      pitcherVsTeam: {},
      pitcherLocationSplits: {},
      teamSplits: {},
      teamSchedules: {},
      teamPitching: {},
      hitterStats: {},
      lineups: {},
      wrcData: null,
    };
  }
  return mlbCache;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function formatLeagueRecord(record: any) {
  if (!record?.wins && !record?.losses && record?.wins !== 0 && record?.losses !== 0) return MLB_DASH;
  return `${record.wins}-${record.losses}`;
}

function normalizeGame(game: any): MlbScheduleGame {
  const away = game?.teams?.away?.team || {};
  const home = game?.teams?.home?.team || {};

  return {
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    status: game.status?.detailedState || game.status?.abstractGameState || MLB_DASH,
    venue: game.venue?.name || MLB_DASH,
    currentInning: game.linescore?.currentInning ?? null,
    inningHalf: game.linescore?.inningHalf === "Top" ? "top" : game.linescore?.inningHalf === "Bottom" ? "bottom" : null,
    away: {
      id: away.id ?? null,
      name: away.name || MLB_DASH,
      abbreviation: away.abbreviation || away.teamCode?.toUpperCase() || MLB_DASH,
      record: formatLeagueRecord(game?.teams?.away?.leagueRecord),
      score: game?.teams?.away?.score ?? null,
      probablePitcher: game?.teams?.away?.probablePitcher || null,
    },
    home: {
      id: home.id ?? null,
      name: home.name || MLB_DASH,
      abbreviation: home.abbreviation || home.teamCode?.toUpperCase() || MLB_DASH,
      record: formatLeagueRecord(game?.teams?.home?.leagueRecord),
      score: game?.teams?.home?.score ?? null,
      probablePitcher: game?.teams?.home?.probablePitcher || null,
    },
  };
}

async function loadSchedule() {
  const cache = ensureCache();
  if (cache.schedule) return cache.schedule;
  if (cache.schedulePromise) return cache.schedulePromise;

  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${cache.date}&hydrate=team,linescore,probablePitcher`;
  cache.schedulePromise = fetchJson(url)
    .then((json) => {
      const games = (json?.dates?.[0]?.games || []).map(normalizeGame);
      cache.schedule = games;
      cache.schedulePromise = null;
      return games;
    })
    .catch((error) => {
      cache.schedulePromise = null;
      throw error;
    });

  return cache.schedulePromise;
}

function findGame(gamePk: string | number) {
  const cache = ensureCache();
  return cache.schedule?.find((game) => String(game.gamePk) === String(gamePk)) || null;
}

async function fetchPerson(id: number | undefined | null) {
  if (!id) return null;
  const cache = ensureCache();
  if (cache.people[`person-${id}`]) return cache.people[`person-${id}`];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}`);
  cache.people[`person-${id}`] = json?.people?.[0] || null;
  return cache.people[`person-${id}`];
}

async function fetchPitcherSeasonStats(id: number | undefined | null) {
  if (!id) return null;
  const cache = ensureCache();
  if (cache.people[`pitcher-season-${id}`]) return cache.people[`pitcher-season-${id}`];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=pitching`);
  cache.people[`pitcher-season-${id}`] = json?.stats?.[0]?.splits?.[0]?.stat || null;
  return cache.people[`pitcher-season-${id}`];
}

async function fetchPitcherVsTeam(id: number | undefined | null, teamId: number | null) {
  if (!id || !teamId) return null;
  const cache = ensureCache();
  const key = `${id}-${teamId}`;
  if (cache.pitcherVsTeam[key]) return cache.pitcherVsTeam[key];
  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=vsTeam&opposingTeamId=${teamId}&season=${SEASON}&group=pitching`,
  );
  cache.pitcherVsTeam[key] = json?.stats?.[0]?.splits?.[0]?.stat || null;
  return cache.pitcherVsTeam[key];
}

/**
 * Fetch a pitcher's home and away split stats for the current season.
 * Returns { home: stat | null, away: stat | null } where each stat has
 * era, whip, strikeOuts, inningsPitched, battersFaced, homeRuns, avg fields.
 * Uses sitCodes h=home, a=away — each is a separate element in the splits array.
 */
async function fetchPitcherLocationSplits(id: number | undefined | null) {
  if (!id) return { home: null, away: null };
  const cache = ensureCache();
  const key = `loc-${id}`;
  if (cache.pitcherLocationSplits[key]) return cache.pitcherLocationSplits[key];

  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=statSplits&group=pitching&season=${SEASON}&sitCodes=h,a`,
  );
  const splits: any[] = json?.stats?.[0]?.splits ?? [];
  const findSplit = (code: string) =>
    splits.find((s: any) =>
      s?.split?.code === code || s?.split?.description?.toLowerCase().startsWith(code === "h" ? "home" : "away"),
    )?.stat ?? null;

  const result = { home: findSplit("h"), away: findSplit("a") };
  cache.pitcherLocationSplits[key] = result;
  return result;
}

async function fetchTeamHittingSplit(teamId: number | null, pitcherHand: string) {
  if (!teamId) return null;
  const cache = ensureCache();
  const sitCodes = pitcherHand.toUpperCase().startsWith("L") ? "vl" : "vr";
  const key = `${teamId}-${sitCodes}`;
  if (cache.teamSplits[key]) return cache.teamSplits[key];
  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${SEASON}&sitCodes=${sitCodes}`,
  );
  cache.teamSplits[key] = json?.stats?.[0]?.splits?.[0]?.stat || null;
  return cache.teamSplits[key];
}

/**
 * Fetch a team's home and away batting split stats for the current season.
 * Returns { home: stat | null, away: stat | null } where each stat has
 * ops, avg, obp, slg, atBats fields.
 */
async function fetchTeamLocationSplits(teamId: number | null) {
  if (!teamId) return { home: null, away: null };
  const cache = ensureCache();
  const key = `team-loc-${teamId}`;
  if (cache.teamSplits[key]) return cache.teamSplits[key];

  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${SEASON}&sitCodes=h,a`,
  );
  const splits: any[] = json?.stats?.[0]?.splits ?? [];
  const findSplit = (desc: string) =>
    splits.find((s: any) =>
      s?.split?.description?.toLowerCase().startsWith(desc),
    )?.stat ?? null;

  const result = { home: findSplit("home"), away: findSplit("away") };
  cache.teamSplits[key] = result;
  return result;
}

async function fetchTeamSeasonSchedule(teamId: number | null) {
  if (!teamId) return [];
  const cache = ensureCache();
  if (cache.teamSchedules[String(teamId)]) return cache.teamSchedules[String(teamId)];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&hydrate=linescore`);
  const games = (json?.dates || []).flatMap((dateBlock: any) => dateBlock.games || []);
  cache.teamSchedules[String(teamId)] = games;
  return games;
}

function summarizeTeamSchedule(games: any[], teamId: number | null, opponentId: number | null) {
  const completed = games
    .filter((game) => game?.status?.codedGameState === "F" || game?.status?.detailedState === "Final")
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());

  const decorated = completed.map((game) => {
    const isHome = game?.teams?.home?.team?.id === teamId;
    const teamScore = isHome ? game?.teams?.home?.score : game?.teams?.away?.score;
    const oppScore = isHome ? game?.teams?.away?.score : game?.teams?.home?.score;
    const oppId = isHome ? game?.teams?.away?.team?.id : game?.teams?.home?.team?.id;
    return { isHome, oppId, win: Number(teamScore) > Number(oppScore) };
  });

  const wins = decorated.filter((item) => item.win).length;
  const losses = decorated.length - wins;
  const lastFive = decorated.slice(-5);
  const lastFiveWins = lastFive.filter((item) => item.win).length;
  const homeGames = decorated.filter((item) => item.isHome);
  const awayGames = decorated.filter((item) => !item.isHome);
  const versus = decorated.filter((item) => item.oppId === opponentId);

  return {
    seasonRecord: decorated.length ? `${wins}-${losses}` : MLB_DASH,
    lastFiveRecord: lastFive.length ? `${lastFiveWins}-${lastFive.length - lastFiveWins}` : MLB_DASH,
    homeRecord: homeGames.length ? `${homeGames.filter((item) => item.win).length}-${homeGames.filter((item) => !item.win).length}` : MLB_DASH,
    awayRecord: awayGames.length ? `${awayGames.filter((item) => item.win).length}-${awayGames.filter((item) => !item.win).length}` : MLB_DASH,
    seriesRecord: versus.length ? `${versus.filter((item) => item.win).length}-${versus.filter((item) => !item.win).length}` : MLB_DASH,
    // wRC+ is enriched separately via fetchTeamContext
    seasonWrcPlus: null,
    seasonWrcPlusRank: null,
    recentWrcPlus: null,
    recentWrcPlusRank: null,
    vsLhpWrcPlus: null,
    vsLhpWrcPlusRank: null,
    vsRhpWrcPlus: null,
    vsRhpWrcPlusRank: null,
  };
}

async function fetchWrcData(): Promise<MlbTeamWrcData | null> {
  const cache = ensureCache();
  if (cache.wrcData) return cache.wrcData;
  try {
    const res = await fetch("/data/mlb/team-wrc-plus.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data: MlbTeamWrcData = await res.json();
    cache.wrcData = data;
    return data;
  } catch {
    return null;
  }
}

function lookupWrc(wrcData: MlbTeamWrcData | null, abbreviation: string) {
  if (!wrcData) return { seasonWrcPlus: null, seasonWrcPlusRank: null, recentWrcPlus: null, recentWrcPlusRank: null, vsLhpWrcPlus: null, vsLhpWrcPlusRank: null, vsRhpWrcPlus: null, vsRhpWrcPlusRank: null };
  const entry = wrcData.teams.find((t) => t.abbreviation === abbreviation);
  return {
    seasonWrcPlus: entry?.seasonWrcPlus ?? null,
    seasonWrcPlusRank: entry?.seasonRankLabel ?? null,
    recentWrcPlus: entry?.recentWrcPlus ?? null,
    recentWrcPlusRank: entry?.recentRankLabel ?? null,
    vsLhpWrcPlus: entry?.vsLhpWrcPlus ?? null,
    vsLhpWrcPlusRank: entry?.vsLhpRankLabel ?? null,
    vsRhpWrcPlus: entry?.vsRhpWrcPlus ?? null,
    vsRhpWrcPlusRank: entry?.vsRhpRankLabel ?? null,
  };
}

async function fetchTeamContext(teamId: number | null, opponentId: number | null, abbreviation: string) {
  const [scheduleResult, wrcData] = await Promise.all([
    fetchTeamSeasonSchedule(teamId),
    fetchWrcData(),
  ]);
  const base = summarizeTeamSchedule(scheduleResult, teamId, opponentId);
  const wrc = lookupWrc(wrcData, abbreviation);
  return { ...base, ...wrc };
}

async function fetchTeamPitchingStats(teamId: number | null) {
  if (!teamId) return null;
  const cache = ensureCache();
  if (cache.teamPitching[String(teamId)]) return cache.teamPitching[String(teamId)];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=pitching&season=${SEASON}`);
  cache.teamPitching[String(teamId)] = json?.stats?.[0]?.splits?.[0]?.stat || null;
  return cache.teamPitching[String(teamId)];
}

async function fetchHitterSeasonStats(playerId: number | undefined) {
  if (!playerId) return null;
  const cache = ensureCache();
  if (cache.hitterStats[String(playerId)]) return cache.hitterStats[String(playerId)];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&season=${SEASON}&group=hitting`);
  cache.hitterStats[String(playerId)] = json?.stats?.[0]?.splits?.[0]?.stat || null;
  return cache.hitterStats[String(playerId)];
}

async function fetchBoxscore(gamePk: number | string) {
  return fetchJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
}

function extractWeather(boxscore: any) {
  const info = boxscore?.info || [];
  const weather = info.find((item: any) => /weather/i.test(item.label || ""));
  const wind = info.find((item: any) => /wind/i.test(item.label || ""));
  return [weather?.value, wind?.value].filter(Boolean).join(", ") || MLB_DASH;
}

function extractLineupFromTeamBox(boxTeam: any) {
  if (!boxTeam) return [];
  const order = Array.isArray(boxTeam.battingOrder) ? boxTeam.battingOrder : [];
  const players = boxTeam.players || {};
  const lineup: any[] = [];

  if (order.length) {
    for (const playerRef of order) {
      const id = Number(String(playerRef).replace(/..$/, ""));
      const player = players[`ID${id}`];
      if (player) lineup.push(player.person);
      if (lineup.length === 9) break;
    }
  }

  if (lineup.length < 9) {
    const fallback = Object.values(players)
      .filter((player: any) => player?.battingOrder)
      .sort((a: any, b: any) => String(a.battingOrder).localeCompare(String(b.battingOrder)))
      .map((player: any) => player.person);

    for (const person of fallback) {
      if (!lineup.some((item) => item.id === person.id)) lineup.push(person);
      if (lineup.length === 9) break;
    }
  }

  return lineup.slice(0, 9);
}

async function fetchLastKnownLineup(teamId: number | null) {
  if (!teamId) return [];
  const cache = ensureCache();
  if (cache.lineups[String(teamId)]) return cache.lineups[String(teamId)];
  const games = await fetchTeamSeasonSchedule(teamId);
  const latestComplete = games
    .filter((game) => game?.status?.codedGameState === "F" || game?.status?.detailedState === "Final")
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())[0];

  if (!latestComplete?.gamePk) {
    cache.lineups[String(teamId)] = [];
    return [];
  }

  const boxscore = await fetchBoxscore(latestComplete.gamePk);
  const teamSide = boxscore?.teams?.home?.team?.id === teamId ? boxscore?.teams?.home : boxscore?.teams?.away;
  cache.lineups[String(teamId)] = extractLineupFromTeamBox(teamSide);
  return cache.lineups[String(teamId)];
}

function average(values: Array<number | string | null | undefined>) {
  const filtered = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

async function buildLineup(team: MlbScheduleGame["away"] | MlbScheduleGame["home"], currentLineup: any[]) {
  const lineup = currentLineup.length ? currentLineup.slice(0, 9) : await fetchLastKnownLineup(team.id);
  const rows: MlbLineupRow[] = [];

  for (const person of lineup.slice(0, 9)) {
    const hitting = await fetchHitterSeasonStats(person.id);
    rows.push({
      id: person.id,
      name: person.fullName || person.name || MLB_DASH,
      avg: hitting?.avg ?? null,
      obp: hitting?.obp ?? null,
      slg: hitting?.slg ?? null,
      ops: hitting?.ops ?? null,
      kPct: hitting?.strikeOuts && hitting?.plateAppearances ? (hitting.strikeOuts / hitting.plateAppearances) * 100 : null,
      hr: hitting?.homeRuns ?? null,
    });
  }

  while (rows.length < 9) {
    rows.push({ name: MLB_DASH, avg: null, obp: null, slg: null, ops: null, kPct: null, hr: null });
  }

  const validRows = rows.filter((row) => row.name !== MLB_DASH);

  return {
    rows,
    summary: {
      avg: average(validRows.map((row) => row.avg)),
      obp: average(validRows.map((row) => row.obp)),
      slg: average(validRows.map((row) => row.slg)),
      ops: average(validRows.map((row) => row.ops)),
      kPct: average(validRows.map((row) => row.kPct)),
    },
  };
}

async function buildGameDetail(gamePk: string | number) {
  const cache = ensureCache();
  const existing = cache.games[String(gamePk)];
  if (existing) return existing;

  // Always ensure schedule is loaded before trying to find the game.
  // This handles the case where the user refreshes directly on a game URL
  // and the detail fetch races ahead of the schedule fetch.
  await loadSchedule();

  const game = findGame(gamePk);
  if (!game) {
    throw new Error(`Game ${gamePk} not found in today's schedule. Try refreshing the page for the latest games.`);
  }

  const boxscore = await fetchBoxscore(gamePk);
  const currentHomeLineup = extractLineupFromTeamBox(boxscore?.teams?.home);
  const currentAwayLineup = extractLineupFromTeamBox(boxscore?.teams?.away);
  const homeStarterId = game.home.probablePitcher?.id || null;
  const awayStarterId = game.away.probablePitcher?.id || null;

  const [
    homeContext,
    awayContext,
    homePitcherPerson,
    awayPitcherPerson,
    homePitcherStat,
    awayPitcherStat,
    homePitcherVsTeam,
    awayPitcherVsTeam,
    homePitcherLocationSplits,
    awayPitcherLocationSplits,
    homeTeamLocationSplits,
    awayTeamLocationSplits,
    homeLineupData,
    awayLineupData,
    homePitching,
    awayPitching,
  ] = await Promise.all([
    fetchTeamContext(game.home.id, game.away.id, game.home.abbreviation),
    fetchTeamContext(game.away.id, game.home.id, game.away.abbreviation),
    fetchPerson(homeStarterId),
    fetchPerson(awayStarterId),
    fetchPitcherSeasonStats(homeStarterId),
    fetchPitcherSeasonStats(awayStarterId),
    fetchPitcherVsTeam(homeStarterId, game.away.id),
    fetchPitcherVsTeam(awayStarterId, game.home.id),
    fetchPitcherLocationSplits(homeStarterId),
    fetchPitcherLocationSplits(awayStarterId),
    fetchTeamLocationSplits(game.home.id),
    fetchTeamLocationSplits(game.away.id),
    buildLineup(game.home, currentHomeLineup),
    buildLineup(game.away, currentAwayLineup),
    fetchTeamPitchingStats(game.home.id),
    fetchTeamPitchingStats(game.away.id),
  ]);

  const [awayBattingVsHomeStarter, homeBattingVsAwayStarter] = await Promise.all([
    fetchTeamHittingSplit(game.away.id, homePitcherPerson?.pitchHand?.code || "R"),
    fetchTeamHittingSplit(game.home.id, awayPitcherPerson?.pitchHand?.code || "R"),
  ]);

  const detail: MlbGameDetail = {
    game,
    weather: extractWeather(boxscore),
    homeContext,
    awayContext,
    starters: {
      home: {
        id: homeStarterId,
        name: game.home.probablePitcher?.fullName || homePitcherPerson?.fullName || MLB_DASH,
        hand: homePitcherPerson?.pitchHand?.description || homePitcherPerson?.pitchHand?.code || MLB_DASH,
        record:
          homePitcherStat?.wins !== undefined && homePitcherStat?.losses !== undefined
            ? `${homePitcherStat.wins}-${homePitcherStat.losses}`
            : MLB_DASH,
        era: homePitcherStat?.era ?? null,
        whip: homePitcherStat?.whip ?? null,
        strikeOuts: homePitcherStat?.strikeOuts ?? null,
        inningsPitched: homePitcherStat?.inningsPitched ?? null,
        homeRuns: homePitcherStat?.homeRuns ?? null,
        battersFaced: homePitcherStat?.battersFaced ?? null,
        baseOnBalls: homePitcherStat?.baseOnBalls ?? null,
        vsTeam: homePitcherVsTeam,
        locationSplits: homePitcherLocationSplits,
      },
      away: {
        id: awayStarterId,
        name: game.away.probablePitcher?.fullName || awayPitcherPerson?.fullName || MLB_DASH,
        hand: awayPitcherPerson?.pitchHand?.description || awayPitcherPerson?.pitchHand?.code || MLB_DASH,
        record:
          awayPitcherStat?.wins !== undefined && awayPitcherStat?.losses !== undefined
            ? `${awayPitcherStat.wins}-${awayPitcherStat.losses}`
            : MLB_DASH,
        era: awayPitcherStat?.era ?? null,
        whip: awayPitcherStat?.whip ?? null,
        strikeOuts: awayPitcherStat?.strikeOuts ?? null,
        inningsPitched: awayPitcherStat?.inningsPitched ?? null,
        homeRuns: awayPitcherStat?.homeRuns ?? null,
        battersFaced: awayPitcherStat?.battersFaced ?? null,
        baseOnBalls: awayPitcherStat?.baseOnBalls ?? null,
        vsTeam: awayPitcherVsTeam,
        locationSplits: awayPitcherLocationSplits,
      },
    },
    pitching: { home: homePitching, away: awayPitching },
    opponentSplits: {
      awayBattingVsHomeStarter,
      homeBattingVsAwayStarter,
    },
    teamLocationSplits: {
      home: homeTeamLocationSplits,
      away: awayTeamLocationSplits,
    },
    lineupSummaries: {
      home: homeLineupData.summary,
      away: awayLineupData.summary,
    },
    lineups: {
      home: homeLineupData.rows,
      away: awayLineupData.rows,
    },
  };

  cache.games[String(gamePk)] = detail;
  return detail;
}

function warmGameDetail(gamePk: number | string) {
  const cache = ensureCache();
  if (import.meta.env.DEV && String(gamePk) === DEV_FIXTURE_GAME_PK) {
    return Promise.resolve(DEV_MLB_MATCHUP_FIXTURE.detail);
  }
  if (cache.games[String(gamePk)]) return Promise.resolve(cache.games[String(gamePk)]);
  if (cache.detailPromises[String(gamePk)]) return cache.detailPromises[String(gamePk)];
  cache.detailPromises[String(gamePk)] = buildGameDetail(gamePk).finally(() => {
    delete cache.detailPromises[String(gamePk)];
  });
  return cache.detailPromises[String(gamePk)];
}

function parseHash(hash: string): MlbRouteState {
  const value = hash.replace(/^#/, "");
  if (value.startsWith("game-")) return { view: "game", gamePk: value.replace("game-", "") };
  return { view: "home" };
}

function buildSplitMetrics(split: MlbOpponentSplit, labelPrefix: string): MlbComparisonMetric[] {
  return [
    {
      key: `${labelPrefix}-k`,
      label: "K%",
      leftValue: split?.strikeOuts && split?.plateAppearances ? (split.strikeOuts / split.plateAppearances) * 100 : null,
      rightValue: MLB_LEAGUE_AVERAGES.kPct,
      leagueAverage: MLB_LEAGUE_AVERAGES.kPct,
      format: "percent",
      scaleKey: "percent",
    },
    {
      key: `${labelPrefix}-bb`,
      label: "BB%",
      leftValue: split?.baseOnBalls && split?.plateAppearances ? (split.baseOnBalls / split.plateAppearances) * 100 : null,
      rightValue: MLB_LEAGUE_AVERAGES.bbPct,
      leagueAverage: MLB_LEAGUE_AVERAGES.bbPct,
      format: "percent",
      scaleKey: "bbPercent",
    },
    {
      key: `${labelPrefix}-obp`,
      label: "OBP",
      leftValue: Number(split?.obp) || null,
      rightValue: MLB_LEAGUE_AVERAGES.obp,
      leagueAverage: MLB_LEAGUE_AVERAGES.obp,
      format: "avg",
      scaleKey: "obp",
    },
    {
      key: `${labelPrefix}-slg`,
      label: "SLG",
      leftValue: Number(split?.slg) || null,
      rightValue: MLB_LEAGUE_AVERAGES.slg,
      leagueAverage: MLB_LEAGUE_AVERAGES.slg,
      format: "avg",
      scaleKey: "slg",
    },
    {
      key: `${labelPrefix}-ops`,
      label: "OPS",
      leftValue: Number(split?.ops) || null,
      rightValue: MLB_LEAGUE_AVERAGES.ops,
      leagueAverage: MLB_LEAGUE_AVERAGES.ops,
      format: "ops",
      scaleKey: "ops",
    },
  ];
}

type SlateFilter = "all" | "in-progress" | "pre-game" | "scheduled" | "final";

function getSlateStatusCategory(status: string): Exclude<SlateFilter, "all"> {
  const normalized = status.toLowerCase();
  if (normalized.includes("progress") || normalized.includes("live") || normalized.includes("delayed")) return "in-progress";
  if (normalized.includes("pre-game") || normalized.includes("warmup")) return "pre-game";
  if (normalized.includes("final")) return "final";
  return "scheduled";
}

/** Formats the Polymarket agreement summary for display on collapsed matchup cards.
 * Returns "Aligned", "Contrarian", or "—" (em dash) when data is unavailable.
 * PER MODEL AUDIT: no longer returns a derived "value edge" percentage —
 * see getPolymarketAgreement in the parent component. */
export function formatCardPmEdgeLabel(
  mlPickAbbr: string | null,
  pmAgreement: { aligned: boolean } | null,
): string {
  if (!mlPickAbbr || !pmAgreement) return "—";
  return pmAgreement.aligned ? "Aligned" : "Contrarian";
}

function formatGameTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function formatMlbSlateDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function formatMlbModelUpdate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function formatMlbNextRefresh(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const nextRunAt = value as { label?: unknown; time?: unknown };
  if (typeof nextRunAt.time === "string" && nextRunAt.time.trim()) {
    const date = new Date(nextRunAt.time);
    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      }).format(date);
    }
  }
  return typeof nextRunAt.label === "string" && nextRunAt.label.trim() ? nextRunAt.label.trim() : null;
}

/**
 * Extracted out of HomeSchedule as a narrowly scoped test hook so the
 * freshness header can be rendered and asserted on directly, without
 * mounting HomeSchedule's much heavier dependency tree (slate analyzer,
 * Polymarket panel, social tables). Renders the exact same markup
 * HomeSchedule's <header> previously inlined -- no visual or DOM output
 * change.
 */
export function MlbAnalyticsHubFreshnessHeader({
  propDate,
  gamesCount,
  generatedAt,
  nextRunAt,
}: {
  propDate: string | null;
  gamesCount: number;
  generatedAt: string | null | undefined;
  nextRunAt: HrDashboardNextRunAt | null;
}) {
  const freshnessItems = [
    { label: "Slate", value: formatMlbSlateDate(propDate) },
    { label: "Today's games", value: String(gamesCount) },
    { label: "Last model update", value: formatMlbModelUpdate(generatedAt) },
    { label: "Next refresh", value: formatMlbNextRefresh(nextRunAt) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <header className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#031635] sm:text-[28px]">MLB Analytics Hub</h1>
      <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-600">
        Joe Knows Ball&apos;s MLB models analyze today&apos;s games, home run props, strikeout props, batter-vs-pitcher matchups, and betting value throughout the season.
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:text-xs">
        {freshnessItems.map((item) => (
          <div key={item.label} className="inline-flex items-baseline gap-1">
            <dt className="font-semibold text-slate-700">{item.label}:</dt>
            <dd className="tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/**
 * Extracted out of HomeSchedule for the same testability reason as
 * MlbAnalyticsHubFreshnessHeader above. Renders the exact same markup
 * HomeSchedule's pending-games banner previously inlined -- no visual or
 * DOM output change.
 */
export function MlbPendingGamesBanner({
  pendingGames,
  nextRunAt,
}: {
  pendingGames: HrDashboardPendingGame[];
  nextRunAt: HrDashboardNextRunAt | null;
}) {
  if (pendingGames.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <span className="font-semibold">⏳ {pendingGames.length} game{pendingGames.length !== 1 ? "s" : ""} excluded</span>
      {" — starting pitchers not yet announced for: "}
      <span className="font-medium">{pendingGames.map((g) => g.matchup).join(", ")}</span>
      {nextRunAt ? (
        <span className="ml-1 text-amber-600">· Check back after {nextRunAt.label} when the model refreshes.</span>
      ) : (
        <span className="ml-1 text-amber-600">· These matchups may be added in a future model update.</span>
      )}
    </div>
  );
}

type PropPreviewTheme = "hr" | "k" | "bvp";

export type PropPreviewRow = {
  key: string;
  player: string;
  position?: string;
  team: string;
  opponent: string;
  score: number | null | undefined;
  /** HR rows: sportsbook anytime-HR odds, e.g. "+320". Canonical field: hrOddsYes. */
  hrOdds?: string | null;
  /** HR rows: sportsbook label, e.g. "DraftKings". Canonical field: hrOddsBook. */
  hrBook?: string | null;
  /** K rows: strikeout line, e.g. 6.5. Canonical field: kLine. */
  kLine?: number | null;
  /** K rows: Over-side odds for the line. Canonical field: kOddsOver. */
  kOddsOver?: string | null;
  /** K rows: Under-side odds for the line. Canonical field: kOddsUnder. */
  kOddsUnder?: string | null;
  /** K rows: sportsbook label. Canonical field: kOddsBook. */
  kBook?: string | null;
};

function TeamAbbrBadge({ team }: { team: string }) {
  return <MlbTeamLogo team={team} size={20} />;
}

export function PropPreviewCard({
  title,
  description,
  rows,
  to,
  theme,
}: {
  title: string;
  description?: string;
  rows: PropPreviewRow[];
  to: string;
  theme: PropPreviewTheme;
}) {
  const themeClasses = theme === "hr"
    ? {
      header: "bg-sky-50 text-sky-900",
      icon: "bg-sky-100 text-sky-700",
      label: "text-sky-700",
      hover: "hover:bg-sky-50",
      note: "Full Model →",
    }
    : theme === "k"
    ? {
      header: "bg-emerald-50 text-emerald-950",
      icon: "bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
      hover: "hover:bg-emerald-50",
      note: "Full Model →",
    }
    : {
      header: "bg-purple-50 text-purple-950",
      icon: "bg-purple-100 text-purple-700",
      label: "text-purple-700",
      hover: "hover:bg-purple-50",
      note: "Full Model →",
    };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={cn("flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3", themeClasses.header)}>
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", themeClasses.icon)}>
          {theme === "hr" ? <Flame className="h-4 w-4" /> : theme === "k" ? <Radar className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-[#031635] 2xl:text-lg">{title}</h3>
            {description ? <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600">{description}</p> : null}
          </div>
        </div>
        <Link to={to} className={cn("shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] hover:underline", themeClasses.label)}>
          {themeClasses.note}
        </Link>
      </div>

      <div
        className={cn(
          "grid items-center gap-x-1.5 border-b border-slate-300 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 2xl:gap-x-2 2xl:px-4 2xl:text-[11px]",
          theme === "hr"
            ? "grid-cols-[20px_minmax(90px,1fr)_minmax(116px,1.08fr)_56px] 2xl:grid-cols-[20px_minmax(120px,1fr)_minmax(150px,1.12fr)_64px]"
            : "grid-cols-[20px_minmax(116px,1fr)_minmax(56px,0.45fr)_56px] 2xl:grid-cols-[20px_minmax(140px,1fr)_minmax(72px,0.48fr)_64px]",
        )}
      >
        <div className="col-span-2">Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>

      <div>
        {rows.map((row, index) => {
          const hasHrOdds = theme === "hr" && row.hrOdds != null;
          const hasKLine = theme === "k" && row.kLine != null;
          return (
            <Link
              key={row.key}
              to={to}
              className={cn(
                "group grid items-center gap-x-1.5 border-b border-slate-200/80 px-3 transition last:border-b-0 2xl:gap-x-2 2xl:px-4",
                theme === "hr"
                  ? "grid-cols-[20px_minmax(90px,1fr)_minmax(116px,1.08fr)_56px] py-2.5 2xl:grid-cols-[20px_minmax(120px,1fr)_minmax(150px,1.12fr)_64px] 2xl:py-3"
                  : "grid-cols-[20px_minmax(116px,1fr)_minmax(56px,0.45fr)_56px] py-2.5 2xl:grid-cols-[20px_minmax(140px,1fr)_minmax(72px,0.48fr)_64px]",
                index % 2 === 1 && "bg-slate-50/50",
                themeClasses.hover,
              )}
            >
              <div className="flex items-center justify-center">
                <TeamAbbrBadge team={row.team} />
              </div>
              <div className="min-w-0 overflow-hidden">
                <div
                  className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold leading-5 text-slate-950 2xl:text-[13px]"
                  title={row.player}
                >
                  {row.player}
                </div>
                {row.position && <div className="text-[9px] font-semibold uppercase text-slate-400">{row.position}</div>}
              </div>
              <div className="min-w-0 overflow-hidden text-[11px] font-medium text-slate-600 2xl:text-xs">
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={`vs ${row.opponent}`}>
                    vs {row.opponent}
                  </span>
                  {hasHrOdds && (
                    <>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span
                        className="inline-flex items-center rounded-full bg-sky-50 px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-sky-700"
                        aria-label={`HR odds ${row.hrOdds}`}
                      >
                        {row.hrOdds}
                      </span>
                      {row.hrBook && (
                        <span className="hidden text-[9px] text-slate-400 sm:inline" title={row.hrBook}>
                          {row.hrBook}
                        </span>
                      )}
                    </>
                  )}
                  {theme === "hr" && row.hrOdds == null && (
                    <span className="text-slate-300" aria-label="HR odds unavailable">—</span>
                  )}
                  {hasKLine && (
                    <>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span
                        className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-emerald-700"
                        aria-label={`Strikeout line ${row.kLine}`}
                      >
                        {row.kLine?.toFixed(1)} K
                      </span>
                      {(row.kOddsOver || row.kOddsUnder) && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-slate-500">
                          {row.kOddsOver && <span aria-label={`Over odds ${row.kOddsOver}`}>O {row.kOddsOver}</span>}
                          {row.kOddsUnder && <span aria-label={`Under odds ${row.kOddsUnder}`}>U {row.kOddsUnder}</span>}
                        </span>
                      )}
                      {row.kBook && (
                        <span className="hidden text-[9px] text-slate-400 sm:inline" title={row.kBook}>
                          {row.kBook}
                        </span>
                      )}
                    </>
                  )}
                  {theme === "k" && row.kLine == null && (
                    <span className="text-slate-300" aria-label="Strikeout line unavailable">—</span>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <ScorePill value={row.score} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const MLB_TOOL_CARDS = [
  {
    title: "Props Hub",
    body: "Broader daily MLB prop and value-play view.",
    to: "/mlb/props",
    icon: <BarChart3 className="h-5 w-5" />,
    accent: "border-t-[#031635]",
  },
  {
    title: "HR Props",
    body: "Daily home-run model rankings and available market context.",
    to: "/mlb/hr-props",
    icon: <Flame className="h-5 w-5" />,
    accent: "border-t-sky-700",
  },
  {
    title: "Strikeout Props",
    body: "Starter strikeout projections versus market totals.",
    to: "/mlb/strikeout-props",
    icon: <Radar className="h-5 w-5" />,
    accent: "border-t-emerald-700",
  },
  {
    title: "Batter vs Pitcher",
    body: "Hitter-versus-starter matchup analysis using underlying contact data.",
    to: "/mlb/batter-vs-pitcher",
    icon: <Swords className="h-5 w-5" />,
    accent: "border-t-slate-300",
  },
  {
    title: "Today's Slate",
    body: "Live schedule, probable pitchers, team records, status, and matchup edge previews.",
    to: "/mlb#schedule",
    icon: <CalendarDays className="h-5 w-5" />,
    accent: "border-t-amber-500",
  },
  {
    title: "Model Edges",
    body: "Quick access to the highest-scoring HR and strikeout prop boards for today's slate.",
    to: "/mlb#props",
    icon: <Gauge className="h-5 w-5" />,
    accent: "border-t-[#006399]",
  },
  {
    title: "Power Rankings",
    body: "Model-based team strength ratings, not standings.",
    to: "/mlb/power-rankings",
    icon: <BarChart3 className="h-5 w-5" />,
    accent: "border-t-indigo-600",
  },
  {
    title: "Sin City",
    body: "Strict high-risk, high-reward qualifying plays.",
    to: "/mlb/sin-city",
    icon: <Dice5 className="h-5 w-5" />,
    accent: "border-t-rose-600",
  },
  {
    title: "Numerology",
    body: "Specialty numerology analysis.",
    to: "/mlb/numerology",
    icon: <Sparkles className="h-5 w-5" />,
    accent: "border-t-fuchsia-600",
  },
];

function HubSportsbookStrip() {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#eff4ff] px-4 py-3">
      <SportsbookBar />
    </div>
  );
}

function getSlateEdgeSummary(detail: MlbGameDetail | undefined) {
  if (!detail) {
    return {
      pitching: "Loading",
      lineup: "Loading",
      total: "Loading",
    };
  }
  const cards = getSummaryCards(detail);
  return {
    pitching: cards.find((card) => card.label === "Pitching Edge")?.value ?? "Neutral",
    lineup: cards.find((card) => card.label === "Lineup Edge")?.value ?? "Neutral",
    total: cards.find((card) => card.label === "Run Total Lean")?.value ?? "Neutral",
  };
}

function MlbSlateAnalyzer({
  games,
  detailPreviews,
  pitchers,
  onOpenGame,
  pitcherRegressionData,
  mlbOdds,
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  pitchers: HrDashboardPitcher[];
  onOpenGame: (gamePk: number) => void;
  pitcherRegressionData: import("@/lib/mlb/mlbPitcherRegression").PitcherRegressionData[];
  mlbOdds: import("@/hooks/useMlbOdds").MlbOddsData | null;
}) {
  const { data: polymarketData } = usePolymarketMlbMoneylines();

  function getPitcherXera(pitcherId: number | null | undefined): number | null {
    if (!pitcherId) return null;
    return pitchers.find((p) => p.pitcherId === pitcherId)?.xera ?? null;
  }

  /**
   * PER MODEL AUDIT (Phase 1 correctness fix): this NO LONGER computes a
   * "value edge" percentage by treating edge.confidence/100 as a model win
   * probability and diffing it against the Polymarket price. That
   * arithmetic implied a calibration that does not exist. Instead, this
   * reports whether the model's pick agrees with the side Polymarket
   * currently favors, plus the raw Polymarket price for that side (real
   * market data, not a derived probability comparison).
   */
  function getPolymarketAgreement(gamePk: number, mlEdge: any) {
    if (!polymarketData || !mlEdge || mlEdge.pick === "push") return null;

    const game = polymarketData.games.find(g => g.gamePk === gamePk);
    if (!game || !game.matched) return null;

    const pickIsAway = mlEdge.pick === "away";
    const pickTeam = pickIsAway ? game.away : game.home;
    const otherTeam = pickIsAway ? game.home : game.away;
    if (pickTeam.yesPrice == null || otherTeam.yesPrice == null) return null;

    const pickAbbr = pickIsAway ? game.away.abbreviation : game.home.abbreviation;
    const marketFavors = pickTeam.yesPrice >= otherTeam.yesPrice ? pickAbbr : (pickIsAway ? game.home.abbreviation : game.away.abbreviation);
    const aligned = marketFavors === pickAbbr;

    return { aligned, marketPrice: pickTeam.yesPrice, pickAbbr };
  }
  const { getTeam } = useTeamWrc();
  return (
    <section id="schedule" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="shrink-0 text-xl font-bold tracking-tight text-[#031635] 2xl:text-2xl">Game Matchup Analyzer</h2>
            <label className="relative min-w-0 sm:w-[220px] 2xl:w-[260px]">
              <span className="sr-only">Jump to a game</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  const gamePk = event.currentTarget.value;
                  if (!gamePk) return;
                  document.getElementById(`mlb-game-${gamePk}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  event.currentTarget.value = "";
                }}
                className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Jump to game…</option>
                {games.map((game) => (
                  <option key={game.gamePk} value={game.gamePk}>
                    {game.away.abbreviation} @ {game.home.abbreviation} — {formatGameTime(game.gameDate)}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▼</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500 2xl:text-sm">Daily predictive analysis and situational edges from the live slate.</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-400">{games.length} games</span>
      </div>

      {/* 2 cards per row on lg+, 1 on mobile */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {games.map((game) => {
          const detail = detailPreviews[game.gamePk];
          const edges = getSlateEdgeSummary(detail);
          const statusTheme = getStatusBadgeTheme(game.status);
          const statusCategory = getSlateStatusCategory(game.status);
          const awayScore = Number(game.away.score);
          const homeScore = Number(game.home.score);
          const showScore = (statusCategory === "in-progress" || statusCategory === "final")
            && Number.isFinite(awayScore) && Number.isFinite(homeScore);

          // Hoist edge calculations so they can be placed on data-* attributes for the mobile card summary
          const cardMlEdge = detail ? computeModelEdge(detail) : null;
          const cardMlPickAbbr = cardMlEdge && cardMlEdge.pick !== "push"
            ? (cardMlEdge.pick === "away" ? cardMlEdge.awayAbbr : cardMlEdge.homeAbbr) : null;
          const cardPmAgreement = getPolymarketAgreement(game.gamePk, cardMlEdge);
          const cardPmEdgeLabel: string = formatCardPmEdgeLabel(cardMlPickAbbr, cardPmAgreement);

          return (
            <button
              id={`mlb-game-${game.gamePk}`}
              key={game.gamePk}
              type="button"
              onClick={() => onOpenGame(game.gamePk)}
              data-pm-edge-team={cardMlPickAbbr ?? ""}
              data-pm-edge-value={cardPmEdgeLabel}
              className={cn(
                "scroll-mt-28 flex w-full flex-col rounded-xl border text-left transition-all hover:shadow-md",
                statusCategory === "in-progress"
                  ? "border-green-300 bg-green-50/40 shadow-sm"
                  : statusCategory === "final"
                  ? "border-slate-400 bg-slate-50/60 shadow-sm"
                  : "border-slate-400 bg-white shadow-sm hover:border-blue-300",
              )}>

              {/* Top bar */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: statusTheme.background, color: statusTheme.color }}>
                    {game.status}
                  </span>
                  {statusCategory === "in-progress" && game.currentInning != null && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
                      {game.inningHalf === "top" ? "▲" : "▼"}{game.currentInning}
                    </span>
                  )}
                  {statusCategory === "final" && showScore && (
                    <span className="text-[9px] font-bold text-slate-400">FINAL</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{game.venue}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{formatGameTime(game.gameDate)}</span>
                </div>
              </div>

              {/* Main content */}
              <div className="px-4 py-3">
                {(() => {
                  const mlEdge = detail ? computeModelEdge(detail) : null;
                  const mlPickAbbr = mlEdge && mlEdge.pick !== "push"
                    ? (mlEdge.pick === "away" ? mlEdge.awayAbbr : mlEdge.homeAbbr) : null;
                  const mlPickColor = mlPickAbbr ? getMlbTeamColors(mlPickAbbr).primary : null;
                  const pmAgreement = getPolymarketAgreement(game.gamePk, mlEdge);

                  const awayWrc = getTeam(game.away.abbreviation);
                  const homeWrc = getTeam(game.home.abbreviation);

                  const xeraStyle = (v: number) => {
                    if (v <= 3.00) return { bg: "#14532d", text: "#bbf7d0" };
                    if (v <= 3.50) return { bg: "#166534", text: "#86efac" };
                    if (v <= 4.00) return { bg: "#dcfce7", text: "#15803d" };
                    if (v <= 4.50) return { bg: "#f1f5f9", text: "#64748b" };
                    if (v <= 5.00) return { bg: "#dbeafe", text: "#1d4ed8" };
                    if (v <= 5.75) return { bg: "#1e3a8a", text: "#93c5fd" };
                    return { bg: "#172554", text: "#60a5fa" };
                  };
                  const fmt3 = (v: number | null | undefined) =>
                    v == null ? "—" : v.toFixed(3).replace(/^0/, "");

                  const awayPitcherName = game.away.probablePitcher?.fullName || detail?.starters.away.name;
                  const homePitcherName = game.home.probablePitcher?.fullName || detail?.starters.home.name;
                  const awayHand = detail?.starters.away.hand;
                  const homeHand = detail?.starters.home.hand;

                  const getPInfo = (pitcherName: string | undefined, pitcherId: number | undefined) => {
                    const regrData = pitcherRegressionData.find(p => p.name === pitcherName);
                    const pill = regrData ? regressionPillStyle(regrData.regressionScore) : null;
                    const s = regrData?.regressionScore;
                    const shortLabel = s == null ? null : Math.abs(s) <= 0.5 ? "Neutral" : s < 0 ? "Regr ↓" : "Regr ↑";
                    const xera = regrData?.xera ?? getPitcherXera(pitcherId);
                    const xfipFallback = (xera == null && regrData?.xfip != null) ? regrData.xfip : null;
                    return { pill, s, shortLabel, xera, xfipFallback };
                  };
                  const awayPI = getPInfo(awayPitcherName, game.away.probablePitcher?.id ?? detail?.starters.away.id);
                  const homePI = getPInfo(homePitcherName, game.home.probablePitcher?.id ?? detail?.starters.home.id);

                  // Advantage helper — returns "away", "home", or null
                  const parseW = (r: string | null | undefined) => { const n = parseInt(r?.split("-")[0] ?? ""); return isNaN(n) ? null : n; };
                  const adv = (homeVal: number | null | undefined, awayVal: number | null | undefined): "home" | "away" | null => {
                    if (homeVal == null || awayVal == null || homeVal === awayVal) return null;
                    return homeVal > awayVal ? "home" : "away";
                  };

                  // OPS vs opposing pitcher handedness
                  // Home team BATS against AWAY pitcher
                  const awayHandIsL = awayHand?.toUpperCase().startsWith("L") ?? false;
                  const homeHandIsL = homeHand?.toUpperCase().startsWith("L") ?? false;

                  // Each team faces the OPPOSING pitcher's hand
                  const homeVsHandOps  = awayHandIsL ? (homeWrc?.vsLhpOps ?? null) : (homeWrc?.vsRhpOps ?? null);
                  const awayVsHandOps  = homeHandIsL ? (awayWrc?.vsLhpOps ?? null) : (awayWrc?.vsRhpOps ?? null);
                  const homeVsHandTag  = awayHandIsL ? "vs LHP" : "vs RHP";
                  const awayVsHandTag  = homeHandIsL ? "vs LHP" : "vs RHP";
                  // If both teams face same handedness, one shared label; if different, label per side
                  const vsHandRowLabel = "OPS vs hand";
                  // Format value with its own parenthetical split label
                  const fmtOps = (val: number | null | undefined, tag: string) =>
                    val != null ? `${fmt3(val)} (${tag})` : "—";
                  const homeVsHandTagShort = awayHandIsL ? "LHP" : "RHP";
                  const awayVsHandTagShort = homeHandIsL ? "LHP" : "RHP";

                  // ── Home/Away split adjustments ────────────────────────────
                  const parseEra = (v: string | number | null | undefined) => {
                    const n = parseFloat(String(v ?? ""));
                    return isFinite(n) ? n : null;
                  };
                  const parseOps = (v: string | number | null | undefined) => {
                    const n = parseFloat(String(v ?? ""));
                    return isFinite(n) ? n : null;
                  };

                  // Pitcher ERA delta: positive = better in today's context
                  // Home pitcher is pitching AT HOME → home ERA vs away ERA
                  const homePitcherHomeEra = parseEra(detail?.starters.home.locationSplits?.home?.era);
                  const homePitcherAwayEra = parseEra(detail?.starters.home.locationSplits?.away?.era);
                  const homePitcherHomeIp  = parseFloat(String(detail?.starters.home.locationSplits?.home?.inningsPitched ?? "")) || 0;
                  const homePitcherAwayIp  = parseFloat(String(detail?.starters.home.locationSplits?.away?.inningsPitched ?? "")) || 0;
                  // Delta = away ERA − home ERA: positive means ERA is LOWER at home (better)
                  const homePitcherEraDelta = (homePitcherHomeEra != null && homePitcherAwayEra != null && homePitcherHomeIp >= 10 && homePitcherAwayIp >= 10)
                    ? Math.round((homePitcherAwayEra - homePitcherHomeEra) * 100) / 100 : null;

                  // Away pitcher is pitching AWAY → away ERA vs home ERA
                  const awayPitcherAwayEra = parseEra(detail?.starters.away.locationSplits?.away?.era);
                  const awayPitcherHomeEra = parseEra(detail?.starters.away.locationSplits?.home?.era);
                  const awayPitcherAwayIp  = parseFloat(String(detail?.starters.away.locationSplits?.away?.inningsPitched ?? "")) || 0;
                  const awayPitcherHomeIp  = parseFloat(String(detail?.starters.away.locationSplits?.home?.inningsPitched ?? "")) || 0;
                  // Delta = home ERA − away ERA: positive means ERA is LOWER away (better)
                  const awayPitcherEraDelta = (awayPitcherAwayEra != null && awayPitcherHomeEra != null && awayPitcherAwayIp >= 10 && awayPitcherHomeIp >= 10)
                    ? Math.round((awayPitcherHomeEra - awayPitcherAwayEra) * 100) / 100 : null;

                  // Team OPS delta: positive = better in today's context
                  // Home team bats AT HOME → home OPS vs away OPS
                  const homeTeamHomeOps = parseOps(detail?.teamLocationSplits?.home?.home?.ops);
                  const homeTeamAwayOps = parseOps(detail?.teamLocationSplits?.home?.away?.ops);
                  const homeTeamHomeAb  = detail?.teamLocationSplits?.home?.home?.atBats ?? 0;
                  const homeTeamAwayAb  = detail?.teamLocationSplits?.home?.away?.atBats ?? 0;
                  const homeOpsDelta = (homeTeamHomeOps != null && homeTeamAwayOps != null && homeTeamHomeAb >= 100 && homeTeamAwayAb >= 100)
                    ? Math.round((homeTeamHomeOps - homeTeamAwayOps) * 1000) / 1000 : null;

                  // Away team bats AWAY → away OPS vs home OPS
                  const awayTeamAwayOps = parseOps(detail?.teamLocationSplits?.away?.away?.ops);
                  const awayTeamHomeOps = parseOps(detail?.teamLocationSplits?.away?.home?.ops);
                  const awayTeamAwayAb  = detail?.teamLocationSplits?.away?.away?.atBats ?? 0;
                  const awayTeamHomeAb  = detail?.teamLocationSplits?.away?.home?.atBats ?? 0;
                  const awayOpsDelta = (awayTeamAwayOps != null && awayTeamHomeOps != null && awayTeamAwayAb >= 100 && awayTeamHomeAb >= 100)
                    ? Math.round((awayTeamAwayOps - awayTeamHomeOps) * 1000) / 1000 : null;

                  const hasContextData = homePitcherEraDelta != null || awayPitcherEraDelta != null || homeOpsDelta != null || awayOpsDelta != null;

                  // Format a signed delta with color: green = favorable, blue = unfavorable
                  const fmtDelta = (delta: number | null, unit: string, threshold: number) => {
                    if (delta == null) return null;
                    const favorable = delta > threshold;
                    const unfavorable = delta < -threshold;
                    const sign = delta > 0 ? "+" : "";
                    const label = `${sign}${unit === "ERA" ? delta.toFixed(2) : delta.toFixed(3)} ${unit}`;
                    return { label, favorable, unfavorable };
                  };

                  type Row = { label: string; awaySzn: string; awayL14: string; homeSzn: string; homeL14: string; sznAdv: "home"|"away"|null; l14Adv: "home"|"away"|null };
                  const rows: Row[] = [
                    {
                      label: "Record",
                      awaySzn: awayWrc?.awayRecord ? `${awayWrc.awayRecord} (A)` : "—",
                      awayL14: awayWrc?.last14Record ?? "—",
                      homeSzn: homeWrc?.homeRecord ? `${homeWrc.homeRecord} (H)` : "—",
                      homeL14: homeWrc?.last14Record ?? "—",
                      sznAdv: adv(parseW(homeWrc?.homeRecord), parseW(awayWrc?.awayRecord)),
                      l14Adv: adv(parseW(homeWrc?.last14Record), parseW(awayWrc?.last14Record)),
                    },
                    {
                      label: "Batting xBA",
                      awaySzn: fmt3(awayWrc?.seasonXba),
                      awayL14: awayWrc?.recentAvg != null ? `${fmt3(awayWrc.recentAvg)} AVG` : "—",
                      homeSzn: fmt3(homeWrc?.seasonXba),
                      homeL14: homeWrc?.recentAvg != null ? `${fmt3(homeWrc.recentAvg)} AVG` : "—",
                      sznAdv: adv(homeWrc?.seasonXba, awayWrc?.seasonXba),
                      l14Adv: adv(homeWrc?.recentAvg, awayWrc?.recentAvg),
                    },
                    {
                      label: "wRC+",
                      awaySzn: awayWrc?.seasonWrcPlus != null ? String(awayWrc.seasonWrcPlus) : "—",
                      awayL14: awayWrc?.recentWrcPlus != null ? String(awayWrc.recentWrcPlus) : "—",
                      homeSzn: homeWrc?.seasonWrcPlus != null ? String(homeWrc.seasonWrcPlus) : "—",
                      homeL14: homeWrc?.recentWrcPlus != null ? String(homeWrc.recentWrcPlus) : "—",
                      sznAdv: adv(homeWrc?.seasonWrcPlus, awayWrc?.seasonWrcPlus),
                      l14Adv: adv(homeWrc?.recentWrcPlus, awayWrc?.recentWrcPlus),
                    },
                    {
                      label: vsHandRowLabel,
                      awaySzn: fmtOps(awayVsHandOps, awayVsHandTagShort),
                      awayL14: "—",
                      homeSzn: fmtOps(homeVsHandOps, homeVsHandTagShort),
                      homeL14: "—",
                      sznAdv: adv(homeVsHandOps, awayVsHandOps),
                      l14Adv: null,
                    },
                    {
                      label: "SLG",
                      awaySzn: "—",
                      awayL14: awayWrc?.recentSlg != null ? fmt3(awayWrc.recentSlg) : "—",
                      homeSzn: "—",
                      homeL14: homeWrc?.recentSlg != null ? fmt3(homeWrc.recentSlg) : "—",
                      sznAdv: null,
                      l14Adv: adv(homeWrc?.recentSlg, awayWrc?.recentSlg),
                    },
                  ];

                  const PitcherPills = ({ pi, align = "left" }: { pi: ReturnType<typeof getPInfo>; align?: "left" | "right" }) => {
                    const metric = pi.xera != null
                      ? { label: `${pi.xera.toFixed(2)} xERA`, style: xeraStyle(pi.xera) }
                      : pi.xfipFallback != null
                        ? { label: `${pi.xfipFallback.toFixed(2)} xFIP`, style: { bg: "#f1f5f9", text: "#64748b" } }
                        : null;

                    return (
                      <div className={cn(
                        "grid h-5 grid-cols-[60px_70px] items-center gap-1",
                        align === "right" ? "justify-end" : "justify-start",
                      )}>
                        {metric ? (
                          <span
                            className="inline-flex h-5 w-[60px] items-center justify-center whitespace-nowrap rounded px-1 text-[9px] font-bold tabular-nums"
                            style={{ backgroundColor: metric.style.bg, color: metric.style.text }}
                          >
                            {metric.label}
                          </span>
                        ) : (
                          <span aria-hidden="true" className="invisible h-5 w-[60px]">—</span>
                        )}
                        {pi.pill && pi.s != null ? (
                          <span
                            className="inline-flex h-5 w-[70px] items-center justify-center whitespace-nowrap rounded px-1 text-[9px] font-bold tabular-nums"
                            style={{ backgroundColor: pi.pill.bg, color: pi.pill.color }}
                          >
                            {pi.s > 0 ? "+" : ""}{pi.s} {pi.shortLabel}
                          </span>
                        ) : (
                          <span aria-hidden="true" className="invisible h-5 w-[70px]">—</span>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* ── Pitcher headers: Home LEFT, Away RIGHT ── */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-b border-slate-100 pb-2.5">
                        {/* Home LEFT */}
                        <div className="grid min-w-0 grid-rows-[28px_18px_16px_20px] gap-0.5">
                          <div className="flex h-7 items-center gap-1.5 overflow-hidden">
                            <MlbTeamLogo team={game.home.abbreviation} size={28} />
                            <span className="text-[15px] font-extrabold text-slate-950">{game.home.abbreviation}</span>
                            <span className="truncate text-[11px] font-semibold text-slate-400">{game.home.record}</span>
                            {showScore && <span className="text-[18px] font-extrabold text-slate-900">{homeScore}</span>}
                          </div>
                          <span className="block h-[18px] truncate text-[12px] font-semibold leading-[18px] text-[#031635]" title={homePitcherName || "TBD"}>
                            {homePitcherName || "TBD"}
                          </span>
                          <span className="block h-4 text-[11px] leading-4 text-slate-400">
                            {detail?.starters.home.record || " "}
                          </span>
                          <PitcherPills pi={homePI} align="left" />
                        </div>
                        <div className="self-center px-1 pt-7 text-[11px] font-bold text-slate-300">vs</div>
                        {/* Away RIGHT */}
                        <div className="grid min-w-0 grid-rows-[28px_18px_16px_20px] justify-items-end gap-0.5 text-right">
                          <div className="flex h-7 max-w-full flex-row-reverse items-center gap-1.5 overflow-hidden">
                            <MlbTeamLogo team={game.away.abbreviation} size={28} />
                            <span className="text-[15px] font-extrabold text-slate-950">{game.away.abbreviation}</span>
                            <span className="truncate text-[11px] font-semibold text-slate-400">{game.away.record}</span>
                            {showScore && <span className="text-[18px] font-extrabold text-slate-900">{awayScore}</span>}
                          </div>
                          <span className="block h-[18px] max-w-full truncate text-[12px] font-semibold leading-[18px] text-[#031635]" title={awayPitcherName || "TBD"}>
                            {awayPitcherName || "TBD"}
                          </span>
                          <span className="block h-4 text-[11px] leading-4 text-slate-400">
                            {detail?.starters.away.record || " "}
                          </span>
                          <PitcherPills pi={awayPI} align="right" />
                        </div>
                      </div>

                      {/* ── Stat comparison: Season block then L14 block ── */}
                      {/* Shared layout: Home value | Stat label (center) | Away value */}
                      <div className="mt-2 space-y-2">
                        {/* Season block */}
                        <div className="w-full max-w-[320px] mx-auto">
                          <div className="grid grid-cols-[minmax(0,100px)_auto_minmax(0,100px)] items-center gap-x-2 pb-1 border-b border-slate-200">
                            <div className="flex items-center gap-1">
                              <MlbTeamLogo team={game.home.abbreviation} size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Season</span>
                            </div>
                            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-300 min-w-[72px]">Stat</div>
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Season</span>
                              <MlbTeamLogo team={game.away.abbreviation} size={12} />
                            </div>
                          </div>
                          {rows.filter(r => r.homeSzn !== "—" || r.awaySzn !== "—").map((r) => (
                            <div key={`szn-${r.label}`} className="grid grid-cols-[minmax(0,100px)_auto_minmax(0,100px)] items-center gap-x-2 py-1.5 border-b border-slate-100 last:border-0">
                              <div className="flex items-center gap-0.5 min-w-0">
                                {r.sznAdv === "home" && <span className="text-emerald-500 text-[12px] leading-none shrink-0">✓</span>}
                                <span className={cn("text-[11px] tabular-nums font-bold truncate", r.sznAdv === "home" ? "text-emerald-700" : "text-slate-900")}>{r.homeSzn}</span>
                              </div>
                              <div className="text-center text-[10px] text-slate-400 font-medium min-w-[68px] px-1">{r.label}</div>
                              <div className="flex items-center gap-0.5 justify-end min-w-0">
                                <span className={cn("text-[11px] tabular-nums font-bold truncate", r.sznAdv === "away" ? "text-emerald-700" : "text-slate-900")}>{r.awaySzn}</span>
                                {r.sznAdv === "away" && <span className="text-emerald-500 text-[12px] leading-none shrink-0">✓</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Last 14 block */}
                        <div className="w-full max-w-[320px] mx-auto">
                          <div className="grid grid-cols-[minmax(0,100px)_auto_minmax(0,100px)] items-center gap-x-2 pb-1 border-b border-slate-200">
                            <div className="flex items-center gap-1">
                              <MlbTeamLogo team={game.home.abbreviation} size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last 14</span>
                            </div>
                            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-300 min-w-[72px]">Stat</div>
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last 14</span>
                              <MlbTeamLogo team={game.away.abbreviation} size={12} />
                            </div>
                          </div>
                          {rows.filter(r => r.homeL14 !== "—" || r.awayL14 !== "—").map((r) => (
                            <div key={`l14-${r.label}`} className="grid grid-cols-[minmax(0,100px)_auto_minmax(0,100px)] items-center gap-x-2 py-1.5 border-b border-slate-100 last:border-0">
                              <div className="flex items-center gap-0.5 min-w-0">
                                {r.l14Adv === "home" && <span className="text-emerald-500 text-[11px] leading-none shrink-0">✓</span>}
                                <span className={cn("text-[11px] tabular-nums font-bold truncate", r.l14Adv === "home" ? "text-emerald-700" : "text-slate-700")}>{r.homeL14}</span>
                              </div>
                              <div className="text-center text-[10px] text-slate-400 font-medium min-w-[68px] px-1">{r.label}</div>
                              <div className="flex items-center gap-0.5 justify-end min-w-0">
                                <span className={cn("text-[11px] tabular-nums font-bold truncate", r.l14Adv === "away" ? "text-emerald-700" : "text-slate-700")}>{r.awayL14}</span>
                                {r.l14Adv === "away" && <span className="text-emerald-500 text-[11px] leading-none shrink-0">✓</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Home/Away Context Splits */}
                        {hasContextData && (
                          <div className="w-full max-w-[320px] mx-auto">
                            <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200">
                              <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Home / Away Context</span>
                              <span className="text-[9px] text-slate-300 italic">ERA · OPS split</span>
                            </div>

                            {/* Pitcher ERA delta row */}
                            {(homePitcherEraDelta != null || awayPitcherEraDelta != null) && (() => {
                              const homeFmt = fmtDelta(homePitcherEraDelta, "ERA", 0.3);
                              const awayFmt = fmtDelta(awayPitcherEraDelta, "ERA", 0.3);
                              return (
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 py-1.5 border-b border-slate-100">
                                  <div className="min-w-0">
                                    {homeFmt ? (
                                      <span className={cn("text-[11px] font-bold tabular-nums",
                                        homeFmt.favorable ? "text-emerald-700" : homeFmt.unfavorable ? "text-blue-700" : "text-slate-500"
                                      )}>
                                        {homeFmt.label}
                                      </span>
                                    ) : <span className="text-[10px] text-slate-300">—</span>}
                                  </div>
                                  <div className="text-center text-[9px] text-slate-300 font-medium px-1 shrink-0">Pitcher ERA</div>
                                  <div className="min-w-0 text-right">
                                    {awayFmt ? (
                                      <span className={cn("text-[11px] font-bold tabular-nums",
                                        awayFmt.favorable ? "text-emerald-700" : awayFmt.unfavorable ? "text-blue-700" : "text-slate-500"
                                      )}>
                                        {awayFmt.label}
                                      </span>
                                    ) : <span className="text-[10px] text-slate-300">—</span>}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Team OPS delta row */}
                            {(homeOpsDelta != null || awayOpsDelta != null) && (() => {
                              const homeFmt = fmtDelta(homeOpsDelta, "OPS", 0.02);
                              const awayFmt = fmtDelta(awayOpsDelta, "OPS", 0.02);
                              return (
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 py-1.5">
                                  <div className="min-w-0">
                                    {homeFmt ? (
                                      <span className={cn("text-[11px] font-bold tabular-nums",
                                        homeFmt.favorable ? "text-emerald-700" : homeFmt.unfavorable ? "text-blue-700" : "text-slate-500"
                                      )}>
                                        {homeFmt.label}
                                      </span>
                                    ) : <span className="text-[10px] text-slate-300">—</span>}
                                  </div>
                                  <div className="text-center text-[9px] text-slate-300 font-medium px-1 shrink-0">Team OPS</div>
                                  <div className="min-w-0 text-right">
                                    {awayFmt ? (
                                      <span className={cn("text-[11px] font-bold tabular-nums",
                                        awayFmt.favorable ? "text-emerald-700" : awayFmt.unfavorable ? "text-blue-700" : "text-slate-500"
                                      )}>
                                        {awayFmt.label}
                                      </span>
                                    ) : <span className="text-[10px] text-slate-300">—</span>}
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="text-[8px] text-slate-300 pt-1 leading-tight">
                              Green = better in today's context · Blue = worse · min. 10 IP / 100 AB per split
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Model drivers + market summary footer ── */}
                      {(() => {
                        const driverRows = mlEdge
                          ? mlEdge.factors
                              .map((factor) => {
                                const weightedDifference = factor.weightedDifference;
                                const favoredSide = Math.abs(weightedDifference) < 0.05
                                  ? "push"
                                  : weightedDifference > 0 ? "away" : "home";
                                const favoredTeam = favoredSide === "away"
                                  ? game.away.abbreviation
                                  : favoredSide === "home" ? game.home.abbreviation : null;
                                return { ...factor, weightedDifference, favoredSide, favoredTeam };
                              })
                              .sort((a, b) => Math.abs(b.weightedDifference) - Math.abs(a.weightedDifference))
                              .slice(0, 3)
                          : [];
                        const maxContribution = Math.max(
                          ...driverRows.map((factor) => Math.abs(factor.weightedDifference)),
                          1,
                        );
                        const awayColor = getMlbTeamColors(game.away.abbreviation).primary;
                        const homeColor = getMlbTeamColors(game.home.abbreviation).primary;
                        const awayAbbr = game.away.abbreviation;
                        const homeAbbr = game.home.abbreviation;
                        const ml = mlbOdds?.moneylines?.[`${awayAbbr}@${homeAbbr}`];
                        const awayAmerican = ml?.away?.american ?? null;
                        const homeAmerican = ml?.home?.american ?? null;
                        const isRealOdds = (value: string | null) => value != null && /^[+-]\d+$/.test(String(value).trim());
                        const bothReal = isRealOdds(awayAmerican) && isRealOdds(homeAmerican);

                        return (
                          <div className="mt-auto border-t border-slate-100 bg-slate-50/70 px-3 pb-3 pt-2.5">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(145px,0.75fr)] sm:gap-4">
                              <div className="min-w-0">
                                <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Top Model Drivers</div>
                                {driverRows.length ? (
                                  <div className="space-y-2">
                                    {driverRows.map((factor) => {
                                      const magnitude = Math.abs(factor.weightedDifference);
                                      const width = Math.min(50, (magnitude / maxContribution) * 50);
                                      const contributionLabel = factor.favoredTeam
                                        ? `${factor.favoredTeam} +${magnitude.toFixed(1)}`
                                        : "Even";
                                      const tooltip = `${awayAbbr} ${factor.awayScore} − ${homeAbbr} ${factor.homeScore}; × ${Math.round(factor.weight * 100)}% = ${contributionLabel}`;
                                      return (
                                        <div key={factor.label} title={tooltip} className="min-w-0">
                                          <div className="mb-0.5 flex items-center justify-between gap-2">
                                            <span className="truncate text-[9px] font-semibold text-slate-500">{factor.label}</span>
                                            <span className="shrink-0 text-[9px] font-extrabold tabular-nums text-slate-700">{contributionLabel}</span>
                                          </div>
                                          <div className="grid grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-1">
                                            <span className="text-[8px] font-bold text-slate-400">{homeAbbr}</span>
                                            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                                              <div className="absolute inset-y-0 left-1/2 z-10 w-px bg-slate-400/80" />
                                              {factor.favoredSide === "home" && (
                                                <div
                                                  className="absolute inset-y-0 right-1/2 rounded-l-full"
                                                  style={{ width: `${width}%`, backgroundColor: homeColor }}
                                                />
                                              )}
                                              {factor.favoredSide === "away" && (
                                                <div
                                                  className="absolute inset-y-0 left-1/2 rounded-r-full"
                                                  style={{ width: `${width}%`, backgroundColor: awayColor }}
                                                />
                                              )}
                                              {factor.favoredSide === "push" && (
                                                <div className="absolute left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500" />
                                              )}
                                            </div>
                                            <span className="text-right text-[8px] font-bold text-slate-400">{awayAbbr}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-slate-400">Model drivers unavailable.</div>
                                )}
                              </div>

                              <div className="border-t border-slate-200 pt-2.5 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                                <div className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Market Summary</div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Total</span>
                                    <span className="rounded-full bg-[#031635] px-2.5 py-1 text-[9px] font-extrabold text-white">{edges.total}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3" title={ML_EDGE_METHODOLOGY}>
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Edge Strength</span>
                                    {mlPickAbbr && mlPickColor ? (
                                      <span className="rounded-full px-2.5 py-1 text-[9px] font-extrabold text-white" style={{ backgroundColor: mlPickColor }}>
                                        {mlPickAbbr} {getEdgeTierLabel(mlEdge!.confidence)}
                                      </span>
                                    ) : mlEdge ? (
                                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[9px] font-extrabold text-slate-500">Even</span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Polymarket</span>
                                    {pmAgreement ? (
                                      <span className={cn(
                                        "rounded-full px-2.5 py-1 text-[9px] font-extrabold",
                                        pmAgreement.aligned
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-amber-100 text-amber-700",
                                      )}>
                                        {pmAgreement.aligned ? "Aligned" : "Contrarian"} · {pmAgreement.pickAbbr} {(pmAgreement.marketPrice * 100).toFixed(0)}¢
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="pt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{bothReal ? "Line" : "Win%"}</span>
                                    {awayAmerican && homeAmerican ? (
                                      <div className="text-right text-[9px] font-bold leading-4 text-slate-600">
                                        <div className={mlPickAbbr === awayAbbr ? "text-slate-900" : undefined}>{awayAbbr} {awayAmerican}</div>
                                        <div className={mlPickAbbr === homeAbbr ? "text-slate-900" : undefined}>{homeAbbr} {homeAmerican}</div>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function MlbToolsGrid() {
  return (
    <section id="tools" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-[#031635]">MLB Analytics Tools</h2>
          <p className="text-sm text-slate-500">Real Joe Knows Ball MLB boards and slate workflows.</p>
        </div>
        <Link to="/mlb/props" className="hidden items-center gap-1 text-sm font-bold text-sky-700 hover:underline sm:flex">
          View All Tools <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MLB_TOOL_CARDS.map((tool) => (
          <Link
            key={tool.title}
            to={tool.to}
            className={cn("group relative overflow-hidden rounded-xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", tool.accent)}
          >
            <div className="absolute -right-4 -top-4 text-slate-900/5 transition group-hover:text-slate-900/10">
              {tool.icon}
            </div>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#eff4ff] text-[#031635]">
              {tool.icon}
            </div>
            <h3 className="text-base font-bold text-slate-950">{tool.title}</h3>
            <p className="mt-2 min-h-[54px] text-xs leading-5 text-slate-500">{tool.body}</p>
            <div className="mt-5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#031635] group-hover:text-sky-700">
              Open Tool <ExternalLink className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Social Media Tables ──────────────────────────────────────────────────────
function socialOdds(value: string | null | undefined) {
  return typeof value === "string" && /^[+-]\d+$/.test(value.trim()) ? value.trim() : null;
}

function socialLine(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return "";
  return Number.isInteger(Number(value)) ? Number(value).toFixed(0) : String(Number(value));
}

function SocialTableHR({ batters }: { batters: HrDashboardBatter[] }) {
  const rows = batters
    .filter((b) => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice().sort((a, b) => b.hrScore - a.hrScore)
    .slice(0, 8);

  function sc(s: number) {
    if (s >= 70) return { bg: "#22c55e", color: "#fff" };
    if (s >= 65) return { bg: "#4ade80", color: "#000" };
    if (s >= 62) return { bg: "#facc15", color: "#000" };
    return { bg: "#fb923c", color: "#fff" };
  }
  function statCol(v: number | null, hi: number, mid: number) {
    if (v == null) return "#94a3b8";
    return v >= hi ? "#22c55e" : v >= mid ? "#86efac" : "#94a3b8";
  }
  const ACCENTS = ["#e05c2e","#f97316","#fb923c","#fbbf24","#eab308","#94a3b8","#64748b","#475569"];

  return (
    <div data-x-export="mlb-hr-social" style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #e05c2e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>🔥 MLB HR PROPS</div>
          <div style={{ color: "#38bdf8", fontSize: 11, marginTop: 2 }}>Top 8 Home Run Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#ffffff" }}>joeknowsball.com</div>
      </div>
      
      {/* Mobile: 2 column layout (player info + score), stats below */}
      <div className="sm:hidden">
        {rows.map((r, i) => {
          const score = r.hrScore;
          const pillStyle = sc(score);
          const hrOdds = socialOdds(r.hrOddsYes);
          return (
            <div
              key={`${r.player}-${i}`}
              data-hr-row={i}
              data-hr-player={r.player}
              data-hr-team={r.team}
              data-hr-opponent={r.opponent}
              data-hr-score={score}
              data-hr-odds={hrOdds ?? ""}
              data-hr-bookmaker={r.hrOddsBook ?? ""}
              style={{ padding: "12px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `4px solid ${ACCENTS[i]}`, position: "relative" }}
            >
              {/* Header: rank + player */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: ACCENTS[i], minWidth: 24 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>{r.player}</span>
                    <span style={{ color: hrOdds ? "#fbbf24" : "#64748b", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" }}>{hrOdds ?? "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} />
                    <span style={{ color: "#64748b" }}>vs {r.opposingPitcher}</span>
                  </div>
                </div>
                <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "4px 8px", fontWeight: 900, fontSize: 15, whiteSpace: "nowrap" }}>
                  {score >= 70 && "🔥"}{score.toFixed(1)}
                </div>
              </div>
              {/* Stats grid: 2x2 on mobile */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>BARREL%</div>
                  <div style={{ color: statCol(r.barrelRate, 20, 16), fontWeight: 600, fontSize: 13 }}>
                    {r.barrelRate != null && r.barrelRate >= 18 && <span style={{ marginRight: 2 }}>💣</span>}
                    {r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>HH%</div>
                  <div style={{ color: statCol(r.hardHitRate, 54, 50), fontWeight: 600, fontSize: 13 }}>
                    {r.hardHitRate != null && r.hardHitRate >= 55 && <span style={{ marginRight: 2 }}>💥</span>}
                    {r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>L7</div>
                  <div style={{ color: r.last7HR >= 3 ? "#22c55e" : r.last7HR >= 2 ? "#facc15" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>
                    {r.last7HR >= 3 && <span style={{ marginRight: 2 }}>📈</span>}{r.last7HR}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>L30</div>
                  <div style={{ color: r.last30HR >= 8 ? "#22c55e" : r.last30HR >= 5 ? "#facc15" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>
                    {r.last30HR >= 8 && <span style={{ marginRight: 2 }}>👑</span>}{r.last30HR}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: 7 column grid */}
      <div className="hidden sm:block">
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 84px 84px 50px 50px", padding: "5px 10px", background: "#0d1f3c", gap: 6 }}>
          {["","PLAYER","SCORE","BARREL%","HH%","L7","L30"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {rows.map((r, i) => {
          const score = r.hrScore;
          const pillStyle = sc(score);
          const hrOdds = socialOdds(r.hrOddsYes);
          return (
            <div
              key={`${r.player}-${i}`}
              data-hr-row={i}
              data-hr-player={r.player}
              data-hr-team={r.team}
              data-hr-opponent={r.opponent}
              data-hr-score={score}
              data-hr-odds={hrOdds ?? ""}
              data-hr-bookmaker={r.hrOddsBook ?? ""}
              style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 84px 84px 50px 50px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 6, position: "relative" }}
            >
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ACCENTS[i] }} />
                  <span style={{ fontSize: i < 3 ? 18 : 15, fontWeight: 900, color: ACCENTS[i], paddingLeft: 6 }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 1 }}>
                    <span style={{ fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", fontSize: 13 }}>{r.player}</span>
                    <span style={{ color: hrOdds ? "#fbbf24" : "#64748b", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" }}>{hrOdds ?? "—"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} />
                      <span style={{ color: "#64748b", fontSize: 10, whiteSpace: "nowrap" }}>vs {r.opposingPitcher}</span>
                    </div>
                  </div>
                  <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "4px 0", fontWeight: 900, textAlign: "center", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    {score >= 70 && "🔥"}{score.toFixed(1)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: statCol(r.barrelRate, 20, 16), fontSize: 14, fontWeight: 600 }}>
                    {r.barrelRate != null && r.barrelRate >= 18 && <span style={{ fontSize: 12 }}>💣</span>}
                    {r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: statCol(r.hardHitRate, 54, 50), fontSize: 14, fontWeight: 600 }}>
                    {r.hardHitRate != null && r.hardHitRate >= 55 && <span style={{ fontSize: 12 }}>💥</span>}
                    {r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, color: r.last7HR >= 3 ? "#22c55e" : r.last7HR >= 2 ? "#facc15" : "#94a3b8", fontSize: 15, fontWeight: 700 }}>
                    {r.last7HR >= 3 && <span style={{ fontSize: 11 }}>📈</span>}{r.last7HR}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, color: r.last30HR >= 8 ? "#22c55e" : r.last30HR >= 5 ? "#facc15" : "#94a3b8", fontSize: 15, fontWeight: 700 }}>
                    {r.last30HR >= 8 && <span style={{ fontSize: 11 }}>👑</span>}{r.last30HR}
                  </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "5px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[["💣","Barrel ≥18%"],["💥","HH ≥55%"],["📈","L7 ≥3"],["👑","L30 ≥8"],["🔥","Score ≥70"]].map(([emoji, label]) => (
          <span key={label} style={{ fontSize: 9, color: "#475569" }}>{emoji} {label}</span>
        ))}
      </div>
    </div>
  );
}

// Ranked by absolute projection-vs-line edge (see kPropValueSorting.ts),
// not projected Ks or matchup score -- a strong UNDER edge and a strong
// OVER edge both rank highly here, matching how the main K props table's
// "Best Value" sort mode works. Rows without a real projection/line are
// excluded rather than shown with a fabricated edge.
function SocialTableK({ rows }: { rows: PitcherStrikeoutTeamRow[] }) {
  const top = rows?.length ? selectTopSocialKRows(rows, 5) : [];
  if (top.length === 0) {
    return (
      <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
        Data Not Available
      </div>
    );
  }
  function sc(s: number) {
    if (s >= 70) return { bg: "#22c55e", color: "#fff" };
    if (s >= 65) return { bg: "#4ade80", color: "#000" };
    if (s >= 62) return { bg: "#facc15", color: "#000" };
    return { bg: "#fb923c", color: "#fff" };
  }
  // Accent by favored side, not row rank -- orange for OVER, blue for UNDER.
  function directionAccent(direction: "over" | "under" | "neutral") {
    if (direction === "under") return "#3b82f6";
    if (direction === "over") return "#f97316";
    return "#64748b";
  }
  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div
      data-x-export="mlb-k-social"
      data-k-date={todayEt}
      data-k-generated-at={new Date().toISOString()}
      data-k-row-count={top.length}
      style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}
    >
      <div style={{ background: "#0a1628", borderBottom: "3px solid #22c55e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>🎯 MLB K PROPS</div>
          <div style={{ color: "#86efac", fontSize: 11, marginTop: 2 }}>Top 5 Strikeout Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#ffffff" }}>joeknowsball.com</div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {top.map((r, i) => {
          const safeScore = typeof r.strikeoutMatchupScore === 'number' && isFinite(r.strikeoutMatchupScore) ? r.strikeoutMatchupScore : 0;
          const pillStyle = sc(safeScore);
          const edgeInfo = getProjectionEdgeInfo(r);
          const kLineLabel = socialLine(r.kLine);
          const kOver = socialOdds(r.kOddsOver);
          const kUnder = socialOdds(r.kOddsUnder);
          const favoredOdds = edgeInfo.direction === "under" ? kUnder : kOver;
          const sideLabel = edgeInfo.direction === "under" ? "UNDER" : edgeInfo.direction === "over" ? "OVER" : "";
          const kDisplay = kLineLabel && favoredOdds && sideLabel ? `${sideLabel} ${kLineLabel} (${favoredOdds})` : "—";
          const edgeLabel = edgeInfo.projectionEdge != null ? `${edgeInfo.projectionEdge > 0 ? "+" : ""}${edgeInfo.projectionEdge.toFixed(1)} K edge` : "";
          const accent = directionAccent(edgeInfo.direction);
          const kStatus = resolveKPropStatus(r).status;
          return (
            <div
              key={`${r.pitcher}-${i}`}
              data-k-row={i}
              data-k-pitcher={r.pitcher}
              data-k-team={r.team}
              data-k-opponent={r.opponent}
              data-k-score={safeScore}
              data-k-rate={r.pitcherKRate ?? ""}
              data-k-whiff-rate={r.pitcherWhiffRate ?? ""}
              data-k-opp-rate={r.opponentTeamKRate ?? ""}
              data-k-line={kLineLabel}
              data-k-odds-over={kOver ?? ""}
              data-k-odds-under={kUnder ?? ""}
              data-k-bookmaker={r.kOddsBook ?? ""}
              data-k-projected-ks={edgeInfo.projectedKs ?? ""}
              data-k-projection-edge={edgeInfo.projectionEdge ?? ""}
              data-k-side={edgeInfo.direction}
              data-k-status={kStatus}
              style={{ padding: "12px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `4px solid ${accent}` }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: accent, minWidth: 24 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>{r.pitcher}</span>
                    <span style={{ color: accent, fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" }}>{kDisplay}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} />
                    <span style={{ color: "#64748b" }}>vs {r.opponent}</span>
                    {edgeLabel && <span style={{ color: "#94a3b8" }}>· Proj {edgeInfo.projectedKs?.toFixed(1)} K · {edgeLabel}</span>}
                  </div>
                </div>
                <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "4px 8px", fontWeight: 900, fontSize: 15, whiteSpace: "nowrap" }}>
                  {safeScore.toFixed(1)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>K%</div>
                  <div style={{ color: r.pitcherKRate != null && r.pitcherKRate >= 28 ? "#22c55e" : r.pitcherKRate != null && r.pitcherKRate >= 24 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.pitcherKRate != null && r.pitcherKRate >= 28 && <span style={{ marginRight: 2 }}>🎯</span>}
                    {r.pitcherKRate != null ? `${r.pitcherKRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>WHIFF%</div>
                  <div style={{ color: r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 32 ? "#22c55e" : r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 28 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 32 && <span style={{ marginRight: 2 }}>🌫️</span>}
                    {r.pitcherWhiffRate != null ? `${r.pitcherWhiffRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>OPP K%</div>
                  <div style={{ color: r.opponentTeamKRate != null && r.opponentTeamKRate >= 27 ? "#22c55e" : r.opponentTeamKRate != null && r.opponentTeamKRate >= 24 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.opponentTeamKRate != null && r.opponentTeamKRate >= 27 && <span style={{ marginRight: 2 }}>💀</span>}
                    {r.opponentTeamKRate != null ? `${r.opponentTeamKRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden sm:block">
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 84px 72px 72px 68px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
          {["","PITCHER / EDGE","K SCORE","K%","WHIFF%","OPP K%"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {top.map((r, i) => {
          const safeScore = typeof r.strikeoutMatchupScore === 'number' && isFinite(r.strikeoutMatchupScore) ? r.strikeoutMatchupScore : 0;
          const pillStyle = sc(safeScore);
          const edgeInfo = getProjectionEdgeInfo(r);
          const kLineLabel = socialLine(r.kLine);
          const kOver = socialOdds(r.kOddsOver);
          const kUnder = socialOdds(r.kOddsUnder);
          const favoredOdds = edgeInfo.direction === "under" ? kUnder : kOver;
          const sideLabel = edgeInfo.direction === "under" ? "UNDER" : edgeInfo.direction === "over" ? "OVER" : "";
          const kDisplay = kLineLabel && favoredOdds && sideLabel ? `${sideLabel} ${kLineLabel} (${favoredOdds})` : "—";
          const edgeLabel = edgeInfo.projectionEdge != null ? `${edgeInfo.projectionEdge > 0 ? "+" : ""}${edgeInfo.projectionEdge.toFixed(1)} K` : "";
          const accent = directionAccent(edgeInfo.direction);
          const kStatus = resolveKPropStatus(r).status;
          return (
            <div
              key={`${r.pitcher}-${i}`}
              data-k-row={i}
              data-k-pitcher={r.pitcher}
              data-k-team={r.team}
              data-k-opponent={r.opponent}
              data-k-score={safeScore}
              data-k-rate={r.pitcherKRate ?? ""}
              data-k-whiff-rate={r.pitcherWhiffRate ?? ""}
              data-k-opp-rate={r.opponentTeamKRate ?? ""}
              data-k-line={kLineLabel}
              data-k-odds-over={kOver ?? ""}
              data-k-odds-under={kUnder ?? ""}
              data-k-bookmaker={r.kOddsBook ?? ""}
              data-k-projected-ks={edgeInfo.projectedKs ?? ""}
              data-k-projection-edge={edgeInfo.projectionEdge ?? ""}
              data-k-side={edgeInfo.direction}
              data-k-status={kStatus}
              style={{ display: "grid", gridTemplateColumns: "28px 1fr 84px 72px 72px 68px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}
            >
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
              <span style={{ fontSize: 14, fontWeight: 900, color: accent, paddingLeft: 6 }}>{i + 1}</span>
              <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 1 }}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", fontSize: 13 }}>{r.pitcher}</span>
                <span style={{ color: accent, fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" }}>{kDisplay}</span>
                {edgeLabel && (
                  <span style={{ background: `${accent}26`, color: accent, borderRadius: 999, padding: "1px 6px", fontWeight: 800, fontSize: 10, whiteSpace: "nowrap" }}>
                    Proj {edgeInfo.projectedKs?.toFixed(1)} · {edgeLabel}
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}><TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} /><span style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</span></div>
              </div>
              <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "4px 0", fontWeight: 900, textAlign: "center", fontSize: 14 }}>{safeScore.toFixed(1)}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: r.pitcherKRate != null && r.pitcherKRate >= 28 ? "#22c55e" : r.pitcherKRate != null && r.pitcherKRate >= 24 ? "#86efac" : "#94a3b8", fontSize: 14, fontWeight: 600 }}>
                {r.pitcherKRate != null && r.pitcherKRate >= 28 && <span style={{ fontSize: 11 }}>🎯</span>}{r.pitcherKRate != null ? `${r.pitcherKRate.toFixed(1)}%` : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 32 ? "#22c55e" : r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 28 ? "#86efac" : "#94a3b8", fontSize: 14, fontWeight: 600 }}>
                {r.pitcherWhiffRate != null && r.pitcherWhiffRate >= 32 && <span style={{ fontSize: 11 }}>🌫️</span>}{r.pitcherWhiffRate != null ? `${r.pitcherWhiffRate.toFixed(1)}%` : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: r.opponentTeamKRate != null && r.opponentTeamKRate >= 27 ? "#22c55e" : r.opponentTeamKRate != null && r.opponentTeamKRate >= 24 ? "#86efac" : "#94a3b8", fontSize: 14, fontWeight: 600 }}>
                {r.opponentTeamKRate != null && r.opponentTeamKRate >= 27 && <span style={{ fontSize: 10 }}>💀</span>}{r.opponentTeamKRate != null ? `${r.opponentTeamKRate.toFixed(1)}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "5px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[["🎯","K% ≥28%"],["🌫️","Whiff ≥32%"],["💀","Opp K ≥27%"]].map(([emoji, label]) => (
          <span key={label} style={{ fontSize: 9, color: "#475569" }}>{emoji} {label}</span>
        ))}
      </div>
    </div>
  );
}

function SocialTableHits({ rows }: { rows: PitcherVsBatterRow[] }) {
  const top = rows.slice().sort((a, b) => b.bestMatchupScore - a.bestMatchupScore).slice(0, 10);
  function sc(s: number) {
    if (s >= 70) return { bg: "#22c55e", color: "#fff" };
    if (s >= 65) return { bg: "#4ade80", color: "#000" };
    if (s >= 62) return { bg: "#facc15", color: "#000" };
    return { bg: "#fb923c", color: "#fff" };
  }
  const ACCENTS = ["#e05c2e","#f97316","#fb923c","#fbbf24","#eab308","#94a3b8","#64748b","#475569","#374151","#1f2937"];

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #8b5cf6", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>⚔️ MLB HIT PROPS</div>
          <div style={{ color: "#c4b5fd", fontSize: 11, marginTop: 2 }}>Top 10 Batter vs Pitcher Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#ffffff" }}>joeknowsball.com</div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {top.map((r, i) => {
          const pillStyle = sc(r.bestMatchupScore);
          return (
            <div key={`${r.player}-${i}`} style={{ padding: "12px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `4px solid ${ACCENTS[i]}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: ACCENTS[i], minWidth: 24 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13, marginBottom: 2 }}>{r.player}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} />
                    <span style={{ color: "#94a3b8" }}>vs {r.opposingPitcher}</span>
                  </div>
                </div>
                <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "4px 8px", fontWeight: 900, fontSize: 15, whiteSpace: "nowrap" }}>
                  {r.bestMatchupScore.toFixed(1)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>xBA</div>
                  <div style={{ color: r.xba != null && r.xba >= 0.31 ? "#22c55e" : r.xba != null && r.xba >= 0.28 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.xba != null && r.xba >= 0.31 && <span style={{ marginRight: 2 }}>🎯</span>}
                    {r.xba != null ? r.xba.toFixed(3) : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>HH%</div>
                  <div style={{ color: r.hardHitRate != null && r.hardHitRate >= 55 ? "#22c55e" : r.hardHitRate != null && r.hardHitRate >= 50 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.hardHitRate != null && r.hardHitRate >= 55 && <span style={{ marginRight: 2 }}>💥</span>}
                    {r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>BARREL%</div>
                  <div style={{ color: r.barrelRate != null && r.barrelRate >= 18 ? "#22c55e" : r.barrelRate != null && r.barrelRate >= 14 ? "#86efac" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                    {r.barrelRate != null && r.barrelRate >= 18 && <span style={{ marginRight: 2 }}>💣</span>}
                    {r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden sm:block">
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 64px 70px 70px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
          {["","PLAYER","HIT SCORE","xBA","HH%","BARREL%"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {top.map((r, i) => {
          const pillStyle = sc(r.bestMatchupScore);
          return (
            <div key={`${r.player}-${i}`} style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 64px 70px 70px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ACCENTS[i] }} />
              <span style={{ fontSize: i < 3 ? 18 : 15, fontWeight: 900, color: ACCENTS[i], paddingLeft: 6 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 1 }}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", fontSize: 12 }}>{r.player}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}><TeamLogoBadge team={r.team} size={13} showLabel={false} dark={true} /><span style={{ color: "#94a3b8", fontSize: 10 }}>vs {r.opposingPitcher}</span></div>
              </div>
              <div style={{ background: pillStyle.bg, color: pillStyle.color, borderRadius: 8, padding: "3px 0", fontWeight: 900, textAlign: "center", fontSize: 13 }}>{r.bestMatchupScore.toFixed(1)}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: r.xba != null && r.xba >= 0.31 ? "#22c55e" : r.xba != null && r.xba >= 0.28 ? "#86efac" : "#94a3b8" }}>
                {r.xba != null && r.xba >= 0.31 && <span style={{ fontSize: 10 }}>🎯</span>}{r.xba != null ? r.xba.toFixed(3) : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: r.hardHitRate != null && r.hardHitRate >= 55 ? "#22c55e" : r.hardHitRate != null && r.hardHitRate >= 50 ? "#86efac" : "#94a3b8" }}>
                {r.hardHitRate != null && r.hardHitRate >= 55 && <span style={{ fontSize: 10 }}>💥</span>}{r.hardHitRate != null ? `${r.hardHitRate.toFixed(1)}%` : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: r.barrelRate != null && r.barrelRate >= 18 ? "#22c55e" : r.barrelRate != null && r.barrelRate >= 14 ? "#86efac" : "#94a3b8" }}>
                {r.barrelRate != null && r.barrelRate >= 18 && <span style={{ fontSize: 10 }}>💣</span>}{r.barrelRate != null ? `${r.barrelRate.toFixed(1)}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "5px 10px", background: "#060d1a", borderTop: "1px solid #1e3a5f", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[["🎯","xBA ≥.310"],["💥","HH ≥55%"],["💣","Barrel ≥18%"]].map(([emoji, label]) => (
          <span key={label} style={{ fontSize: 9, color: "#475569" }}>{emoji} {label}</span>
        ))}
      </div>
    </div>
  );
}

// strikeoutDetailRows (buildPitcherStrikeoutRows' full per-pitcher shape)
// is checked FIRST, ahead of strikeoutRows (buildPitcherStrikeoutMatchupRows'
// leaner "matchup summary" shape): strikeoutDetailRows is the only one of
// the two that carries projectedKs/projectedIP/workloadConfidenceGrade/
// workloadFlags/etc, which resolveKPropStatus (via selectTopSocialKRows in
// the K tab and selectTopKValuePlays in the Value tab) requires before it
// will ever classify a row as VALID. strikeoutRows structurally lacks those
// fields entirely, so every row built from it always resolved to
// INSUFFICIENT_DATA ("Missing workload") regardless of how much real model
// data existed upstream -- checking strikeoutRows first (the previous
// order) meant the K social table and the K portion of the Value table
// were always empty, since strikeoutRows is populated on every normal
// slate. See src/pages/MlbGameDetail.kSocialTable.test.tsx for the
// regression coverage.
export function getKRowsForSocial(strikeoutRows, strikeoutDetailRows, pitchers = [], batters = [], games = []) {
  if (strikeoutDetailRows?.length) return strikeoutDetailRows;

  if (strikeoutRows?.length) {
    return strikeoutRows.map(r => ({
      ...r,
      pitcherKRate: r.pitcherKRate ?? r.kRate ?? null,
      pitcherWhiffRate: r.pitcherWhiffRate ?? r.whiffRate ?? null,
      strikeoutMatchupScore: r.strikeoutMatchupScore ?? r.kMatchupScore ?? 0,
    }));
  }

  if (!pitchers?.length) return [];

  // Build opponent batters map (same logic as the main builder) so we can compute real opponent stats even in fallback
  const battersByGameAndTeam = new Map();
  batters.forEach((batter) => {
    const key = `${batter.gameKey}|${batter.team}`;
    if (!battersByGameAndTeam.has(key)) battersByGameAndTeam.set(key, []);
    battersByGameAndTeam.get(key).push(batter);
  });

  const gameByKey = new Map(games.map((g) => [g.gameKey, g]));

  return pitchers
    .map((p, i) => {
      const opponentBatters = battersByGameAndTeam.get(`${p.gameKey}|${p.opponent}`) || [];
      const game = gameByKey.get(p.gameKey);

      // For social fallback, prioritize the pitcher's own K stats for the score (opponent data may be sparse after filters)
      const kRate = Number(p.kRate) || 0;
      const whiffRate = Number(p.whiffRate) || 0;
      const kVs = Number(p.kVs) || 0;

      let score = kVs;
      if (score === 0) {
        score = (kRate * 0.5 + whiffRate * 0.5);
      }
      const safeScore = Math.max(0, Math.min(100, score));

      return {
        rank: i + 1,
        pitcher: p.pitcher,
        team: p.team,
        opponent: p.opponent,
        strikeoutMatchupScore: safeScore,
        pitcherKRate: typeof p.kRate === 'number' ? p.kRate : (Number(p.kRate) || 0),
        pitcherWhiffRate: typeof p.whiffRate === 'number' ? p.whiffRate : (Number(p.whiffRate) || 0),
        opponentTeamKRate: typeof opponentTeamKRate === 'number' ? opponentTeamKRate : null,
        opponentTeamWhiffRate: typeof opponentTeamWhiffRate === 'number' ? opponentTeamWhiffRate : null,
      };
    })
    .sort((a, b) => (b.strikeoutMatchupScore || 0) - (a.strikeoutMatchupScore || 0))
    .slice(0, 5);
}

// ── Value table: top 3 HR (by HR Quality Score, odds required) + top 3 K ────
// HR ranking: HR Quality Score (relative matchup ranking, NOT a probability),
// restricted to batters with posted odds so the displayed price is real.
// This intentionally does NOT use the deprecated/removed hrValueEdge field
// (a fabricated probability-vs-market formula) -- see model audit.
// K value  = projectedKs - kLine (model projects this many Ks OVER the posted line)
// Only includes rows that actually have odds posted. Falls back gracefully if
// lines haven't been released yet.

function americanToImplied(ml: string | null | undefined): number | null {
  if (!ml) return null;
  const n = parseFloat(ml.replace(/[^0-9\-.]/g, ""));
  if (!isFinite(n) || n === 0) return null;
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
}

// Top N K props by model-vs-line value edge, for the social "value" widget.
// Only VALID rows (recomputed fresh via resolveKPropStatus, never trusted
// from a cached field) are eligible -- see kPropStatus.ts. This subsumes
// the narrower publicRecommendationEligible/reliever-safety check that
// used to be the only gate here; see kPropBestBets.ts for the same rule
// applied to the main page's Top Over/Under selection.
export function selectTopKValuePlays(kRows: PitcherStrikeoutTeamRow[], max = 3) {
  return kRows
    .filter((r) => resolveKPropStatus(r).status === "VALID")
    .filter((r) => r.kLine != null && r.kLine > 0 && r.projectedKs != null)
    .sort((a, b) => {
      const edgeA = (a.projectedKs ?? 0) - (a.kLine ?? 0);
      const edgeB = (b.projectedKs ?? 0) - (b.kLine ?? 0);
      return edgeB - edgeA;
    })
    .slice(0, max);
}

function SocialTableValue({
  batters,
  kRows,
}: {
  batters: HrDashboardBatter[];
  kRows: PitcherStrikeoutTeamRow[];
}) {
  const ACCENTS = ["#e05c2e","#f97316","#fb923c","#22c55e","#4ade80","#86efac"];

  // Top 3 HR by HR Quality Score — only include batters with odds posted
  const hrValue = batters
    .filter((b) => b.hrOddsYes != null)
    .sort((a, b) => (b.hrScore ?? 0) - (a.hrScore ?? 0))
    .slice(0, 3)
    .map((b) => {
      const marketImplied = b.marketImpliedProbability ?? americanToImplied(b.hrOddsYes);
      return {
        type: "hr" as const,
        name: b.player,
        team: b.team,
        opponent: b.opposingPitcher,
        score: b.hrScore,
        line: b.hrOddsYes ?? null,
        lineLabel: b.hrOddsYes ?? "—",
        impliedPct: marketImplied != null ? marketImplied * 100 : null,
        valueEdge: null as number | null, // deprecated field removed, never populated
        modelPct: null as number | null,  // no calibrated model probability exists yet
        projLine: null as number | null,
        projKs: null as number | null,
        kDelta: null as number | null,
      };
    });

  // Top 3 K by value edge — only include pitchers with kLine posted.
  const kValue = selectTopKValuePlays(kRows, 3)
    .map((r) => {
      const delta = (r.projectedKs ?? 0) - (r.kLine ?? 0);
      const implied = americanToImplied(r.kOddsOver);
      return {
        type: "k" as const,
        name: r.pitcher,
        team: r.team,
        opponent: r.opponent,
        score: r.strikeoutMatchupScore,
        line: r.kLine != null ? `o${r.kLine}` : null,
        lineLabel: r.kLine != null ? `o${r.kLine}` : "—",
        impliedPct: implied != null ? implied * 100 : null,
        valueEdge: null,
        modelPct: null,
        projLine: r.kLine ?? null,
        projKs: r.projectedKs ?? null,
        kDelta: delta,
      };
    });

  const hasHR = hrValue.length > 0;
  const hasK  = kValue.length > 0;

  if (!hasHR && !hasK) {
    return (
      <div style={{ background: "#060d1a", borderRadius: 10, padding: "28px 14px", textAlign: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>⏳ Odds Not Yet Posted</div>
        <div style={{ color: "#475569", fontSize: 11 }}>
          Lines typically release 2–3 hours before first pitch.<br/>
          Check back after the 1 PM ET model refresh.
        </div>
      </div>
    );
  }

  function sc(s: number) {
    if (s >= 70) return { bg: "#22c55e", color: "#fff" };
    if (s >= 65) return { bg: "#4ade80", color: "#000" };
    if (s >= 62) return { bg: "#facc15", color: "#000" };
    return { bg: "#fb923c", color: "#fff" };
  }

  const allRows = [...hrValue, ...kValue];

  return (
    <div data-x-export="mlb-value-social" style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      {/* Header */}
      <div style={{ background: "#0a1628", borderBottom: "3px solid #a855f7", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>💎 MLB VALUE PROPS</div>
          <div style={{ color: "#d8b4fe", fontSize: 11, marginTop: 2 }}>Top 3 HR + Top 3 K by Model vs Market Edge · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#fff" }}>joeknowsball.com</div>
      </div>

      {/* Section header: HR */}
      {hasHR && (
        <>
          <div style={{ padding: "8px 14px 4px", background: "#0a1628", borderBottom: "1px solid #1e3a5f" }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: "#e05c2e", textTransform: "uppercase" }}>🔥 HR Props — Top Quality Score (with posted odds)</span>
          </div>
          {/* Desktop HR table */}
          <div className="hidden sm:block" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#0d1f3c" }}>
                <tr style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>
                  <th style={{ padding: "6px 14px", textAlign: "left" }}>Player</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Quality Score</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Line</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Mkt Implied</th>
                </tr>
              </thead>
              <tbody>
                {hrValue.map((r, i) => {
                  const pill = sc(r.score ?? 0);
                  return (
                    <tr key={r.name + i} style={{ borderBottom: "1px solid #1e3a5f", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderLeft: `3px solid ${ACCENTS[i]}` }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{r.name}</div>
                        <div style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</div>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <span style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 8px", fontWeight: 900 }}>{(r.score ?? 0).toFixed(1)}</span>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#fbbf24", fontWeight: 700 }}>{r.lineLabel}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#94a3b8" }}>
                        {r.impliedPct != null ? `${r.impliedPct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile HR cards */}
          <div className="sm:hidden">
            {hrValue.map((r, i) => {
              const pill = sc(r.score ?? 0);
              return (
                <div key={r.name + i} style={{ padding: "10px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `3px solid ${ACCENTS[i]}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>{r.name}</div>
                      <div style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</div>
                    </div>
                    <span style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 8px", fontWeight: 900 }}>{(r.score ?? 0).toFixed(1)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>LINE</div>
                      <div style={{ color: "#fbbf24", fontWeight: 700 }}>{r.lineLabel}</div>
                    </div>
                    <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>MKT%</div>
                      <div style={{ color: "#94a3b8", fontWeight: 600 }}>{r.impliedPct != null ? `${r.impliedPct.toFixed(1)}%` : "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Section header: K */}
      {hasK && (
        <>
          <div style={{ padding: "8px 14px 4px", background: "#0a1628", borderBottom: "1px solid #1e3a5f", borderTop: hasHR ? "2px solid #1e3a5f" : "none" }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: "#22c55e", textTransform: "uppercase" }}>🎯 K Props — Model vs Line</span>
          </div>
          {/* Desktop K table */}
          <div className="hidden sm:block" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#0d1f3c" }}>
                <tr style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>
                  <th style={{ padding: "6px 14px", textAlign: "left" }}>Pitcher</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>K Score</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Line</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Proj Ks</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Over Odds</th>
                  <th style={{ padding: "6px 14px", textAlign: "center" }}>+/- Line</th>
                </tr>
              </thead>
              <tbody>
                {kValue.map((r, i) => {
                  const pill = sc(r.score ?? 0);
                  const delta = r.kDelta ?? 0;
                  const deltaColor = delta >= 1.5 ? "#22c55e" : delta >= 0.5 ? "#86efac" : "#94a3b8";
                  const kIdx = i + (hasHR ? 3 : 0);
                  return (
                    <tr key={r.name + i} style={{ borderBottom: "1px solid #1e3a5f", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderLeft: `3px solid ${ACCENTS[kIdx]}` }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{r.name}</div>
                        <div style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</div>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <span style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 8px", fontWeight: 900 }}>{(r.score ?? 0).toFixed(1)}</span>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#fbbf24", fontWeight: 700 }}>{r.lineLabel}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#94a3b8" }}>
                        {r.projKs != null ? r.projKs.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#94a3b8" }}>
                        {r.impliedPct != null ? `${r.impliedPct.toFixed(0)}% (${kValue[i] ? (kRows.find(k=>k.pitcher===r.name)?.kOddsOver ?? "—") : "—"})` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{ background: "#0d1f2a", color: deltaColor, border: `1px solid ${deltaColor}`, borderRadius: 6, padding: "3px 8px", fontWeight: 900, fontSize: 11 }}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(1)} Ks
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile K cards */}
          <div className="sm:hidden">
            {kValue.map((r, i) => {
              const pill = sc(r.score ?? 0);
              const delta = r.kDelta ?? 0;
              const deltaColor = delta >= 1.5 ? "#22c55e" : delta >= 0.5 ? "#86efac" : "#94a3b8";
              const kIdx = i + (hasHR ? 3 : 0);
              return (
                <div key={r.name + i} style={{ padding: "10px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `3px solid ${ACCENTS[kIdx]}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>{r.name}</div>
                      <div style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</div>
                    </div>
                    <span style={{ background: pill.bg, color: pill.color, borderRadius: 6, padding: "3px 8px", fontWeight: 900 }}>{(r.score ?? 0).toFixed(1)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>LINE</div>
                      <div style={{ color: "#fbbf24", fontWeight: 700 }}>{r.lineLabel}</div>
                    </div>
                    <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>PROJ</div>
                      <div style={{ color: "#94a3b8", fontWeight: 600 }}>{r.projKs != null ? r.projKs.toFixed(1) : "—"}</div>
                    </div>
                    <div style={{ background: "#0d1f3c", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>EDGE</div>
                      <div style={{ color: deltaColor, fontWeight: 900 }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}K</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Legend */}
      <div style={{ padding: "8px 14px", background: "#0a1628", borderTop: "1px solid #1e3a5f", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#64748b" }}>🔥 HR Edge = Model prob ÷ Market implied prob (≥1.25 = strong value)</span>
        <span style={{ fontSize: 10, color: "#64748b" }}>🎯 K Edge = Projected Ks above posted line</span>
      </div>
    </div>
  );
}

function SocialTableML({
  games,
  detailPreviews,
  pitcherRegressionData,
  mlbOdds,
  polymarketGames,
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  pitcherRegressionData: import("@/lib/mlb/mlbPitcherRegression").PitcherRegressionData[];
  mlbOdds: import("@/hooks/useMlbOdds").MlbOddsData | null;
  polymarketGames?: import("@/lib/mlb/polymarketMoneylines").MoneylineGame[];
}) {
  // Recent-record window. Default L5 → deterministic social screenshot (the X
  // export captures this default). The selector affects ONLY the recent-record
  // diagnostic and its reason text — never pitching, batting, model form,
  // season, market odds, or the Model Edge.
  const [formWindow, setFormWindow] = useState<FormWindow>(DEFAULT_FORM_WINDOW);
  const { getTeam: getTeamWrc } = useTeamWrc();

  const rows: MlSocialRow[] = games
    .map((game): MlSocialRow | null => {
      const detail = detailPreviews[game.gamePk];
      if (!detail) return null;
      const edge = computeModelEdge(detail);
      if (edge.pick === "push") return null;

      const pickIsAway = edge.pick === "away";
      const pickAbbr = pickIsAway ? game.away.abbreviation : game.home.abbreviation;
      const fadeAbbr = pickIsAway ? game.home.abbreviation : game.away.abbreviation;

      // Factor availability from SOURCE fields (not the neutral-filled result),
      // then the displayed edge: canonical when complete, Adjusted Model Edge
      // when some factors are genuinely unavailable, N/A below the gate.
      const availability = getFactorAvailability(detail);
      const display = computeDisplayedEdge(edge, availability);
      const pitchingEdge = display.components.pitching;
      const battingEdge = display.components.batting;
      const modelFormEdge = display.components.modelForm;
      const seasonEdge = display.components.season;

      // Recent-record diagnostic (season-free). L5 = last 5 completed games
      // (game context); L14 = last 14 completed games (wRC+ dataset). These are
      // game-count windows, NOT calendar weeks. Null → N/A, never fabricated.
      const pickCtx = pickIsAway ? detail.awayContext : detail.homeContext;
      const oppCtx = pickIsAway ? detail.homeContext : detail.awayContext;
      const pickRecord = formWindow === "l5"
        ? pickCtx?.lastFiveRecord ?? null
        : getTeamWrc(pickAbbr)?.last14Record ?? null;
      const oppRecord = formWindow === "l5"
        ? oppCtx?.lastFiveRecord ?? null
        : getTeamWrc(fadeAbbr)?.last14Record ?? null;
      const formEdge = getFormEdge(pickRecord, oppRecord);

      // Actual posted moneylines (both sides) for the picked game.
      const gameKey = `${game.away.abbreviation}@${game.home.abbreviation}`;
      const ml = mlbOdds?.moneylines?.[gameKey];
      const pickAmerican = (pickIsAway ? ml?.away : ml?.home)?.american ?? null;
      const fadeAmerican = (pickIsAway ? ml?.home : ml?.away)?.american ?? null;

      // Polymarket YES/NO reference prices for both sides.
      const pmGame = polymarketGames?.find((g) => g.gamePk === game.gamePk);
      const pmPickSide = pmGame ? (pickIsAway ? pmGame.away : pmGame.home) : null;
      const pmFadeSide = pmGame ? (pickIsAway ? pmGame.home : pmGame.away) : null;
      const pmYes = pmPickSide?.yesPrice ?? null;
      const pmNo = pmPickSide?.noPrice ?? null;

      // Real market data only. Two-sided NO-VIG implied probability for the
      // pick (posted moneyline, else Polymarket). Fails safe to null.
      const marketImplied = americanToImpliedProbability(pickAmerican);
      const fadeImplied = americanToImpliedProbability(fadeAmerican);
      const noVig =
        noVigProbability(marketImplied, fadeImplied) ??
        noVigProbability(pmYes, pmFadeSide?.yesPrice ?? null);

      // Grade + color follow the DISPLAYED edge (canonical or adjusted), so a
      // row's grade always matches the number shown. N/A rows carry no grade.
      const displayedEdge = display.displayed;
      const confidence = displayedEdge != null
        ? confidenceForEdgePoints(displayedEdge)
        : edge.confidence;
      const grade = displayedEdge != null ? getEdgeGrade(confidence).label : null;

      // Pitcher names + regression context for the reason fallback only.
      const awayPitcherName = game.away.probablePitcher?.fullName || detail?.starters.away.name || null;
      const homePitcherName = game.home.probablePitcher?.fullName || detail?.starters.home.name || null;
      const awayReg = pitcherRegressionData.find((p) => p.name === awayPitcherName);
      const homeReg = pitcherRegressionData.find((p) => p.name === homePitcherName);
      const pickPitcherReg = pickIsAway ? awayReg : homeReg;
      const fadePitcherReg = pickIsAway ? homeReg : awayReg;
      let context: string | null = null;
      if (fadePitcherReg && fadePitcherReg.regressionScore < -2) context = `${fadeAbbr} starter overperforming`;
      else if (pickPitcherReg && pickPitcherReg.regressionScore > 2) context = `${pickAbbr} starter undervalued`;

      return {
        gamePk: game.gamePk,
        awayAbbr: game.away.abbreviation,
        homeAbbr: game.home.abbreviation,
        awayPitcher: awayPitcherName,
        homePitcher: homePitcherName,
        gameTime: formatGameTime(game.gameDate),
        selectedTeam: pickAbbr,
        fadeTeam: fadeAbbr,
        selectedAmerican: pickAmerican,
        modelEdgePoints: displayedEdge,
        canonicalEdgePoints: display.canonical,
        isAdjusted: display.adjusted,
        confidence,
        completeness: display.weightAvailable,
        pitchingEdge,
        battingEdge,
        modelFormEdge,
        seasonEdge,
        formEdge,
        formWindow,
        marketImpliedProbability: marketImplied,
        noVigMarketProbability: noVig,
        polymarketYes: pmYes,
        polymarketNo: pmNo,
        grade,
        primaryReason: display.ok
          ? buildPrimaryReason({
              pitching: pitchingEdge, batting: battingEdge, modelForm: modelFormEdge,
              season: seasonEdge, formEdge, formWindow, pickTeam: pickAbbr, context,
            })
          : null,
      };
    })
    .filter((r): r is MlSocialRow => r !== null)
    // Deterministic: valid rows first, then displayed edge desc → confidence →
    // team → gamePk; N/A rows sort last. See compareMlSocialRows.
    .sort(compareMlSocialRows)
    .slice(0, 8);

  const MEDALS = ["🥇", "🥈", "🥉"];
  const ACCENTS = ["#f97316", "#fb923c", "#fbbf24", "#facc15", "#a3e635", "#34d399", "#38bdf8", "#818cf8"];
  // # | matchup | pitch | bat | recent-form | model-context(form+season) | model-edge | pick
  const DESKTOP_COLUMNS = "20px minmax(116px,1fr) 44px 44px 56px 70px 64px minmax(92px,auto)";

  // Model Edge value color. When the edge is present it follows the SAME
  // confidence tier that drives the grade (so number and grade never disagree);
  // an N/A edge renders muted.
  function edgeValueColor(row: MlSocialRow): string {
    if (row.modelEdgePoints == null) return "#64748b";
    const tier = getEdgeTierKey(row.confidence);
    if (tier === "strong") return "#34d399";
    if (tier === "moderate") return "#4ade80";
    if (tier === "slight") return "#fbbf24";
    return "#94a3b8";
  }

  // One compact component cell (desktop): LABEL / signed value / band note.
  // A null value renders "N/A" with no band — never a fabricated 0 or "Even".
  function ComponentCell({ label, value }: { label: string; value: number | null }) {
    const band = value != null ? getComponentBand(value) : null;
    return (
      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ color: "#64748b", fontSize: 8, fontWeight: 800, letterSpacing: ".04em" }}>{label}</div>
        <div style={{ color: band?.color ?? "#64748b", fontSize: 13, fontWeight: 900, lineHeight: 1.1 }}>{formatEdgePoints(value)}</div>
        <div style={{ color: "#475569", fontSize: 7.5, fontWeight: 700, whiteSpace: "nowrap" }}>{band?.label ?? " "}</div>
      </div>
    );
  }

  const formLabel = FORM_WINDOW_LABELS[formWindow];

  // Grouped "Model Context" cell: the two lower-weight canonical drivers
  // (internal Model Form + Season). Part of the additive identity; kept
  // visually distinct from the separate recent-record diagnostic.
  function ModelContextCell({ modelForm, season }: { modelForm: number | null; season: number | null }) {
    const line = (label: string, value: number | null) => {
      const color = value != null ? getComponentBand(value).color : "#64748b";
      return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4, lineHeight: 1.2 }}>
          <span style={{ color: "#64748b", fontSize: 8, fontWeight: 700 }}>{label}</span>
          <span style={{ color, fontSize: 10, fontWeight: 800 }}>{formatEdgePoints(value)}</span>
        </div>
      );
    };
    return (
      <div
        style={{ minWidth: 0, borderLeft: "1px solid #14243d", borderRight: "1px solid #14243d", padding: "0 5px" }}
        title="Model Form = JKB model internal recent-form factor; Season = season-long quality factor"
      >
        {line("Form", modelForm)}
        {line("Seas", season)}
      </div>
    );
  }

  // Recent-record window toggle (L5 = last 5 completed games; L14 = last 14).
  // Affects ONLY the recent-record diagnostic + its reason text.
  function WindowToggle() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} role="group" aria-label="Recent record window">
        <span style={{ color: "#64748b", fontSize: 9, fontWeight: 700 }}>RECENT</span>
        {(["l5", "l14"] as FormWindow[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setFormWindow(w)}
            aria-pressed={formWindow === w}
            aria-label={FORM_WINDOW_LONG[w]}
            title={FORM_WINDOW_LONG[w]}
            style={{
              border: "1px solid #1e3a5f",
              background: formWindow === w ? "#3b82f6" : "transparent",
              color: formWindow === w ? "#fff" : "#94a3b8",
              borderRadius: 4,
              padding: "2px 7px",
              fontSize: 10,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {FORM_WINDOW_LABELS[w]}
          </button>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
        Model edge data not yet available. Check back after game previews load.
      </div>
    );
  }

  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const hasPoly = rows.some((r) => r.polymarketYes != null || r.polymarketNo != null);

  return (
    <div
      data-x-export="mlb-ml-social"
      data-ml-date={todayEt}
      data-ml-generated-at={new Date().toISOString()}
      data-ml-row-count={rows.length}
      style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}
    >
      {/* Responsive toggle: full table on wide screens, stacked cards on phones.
          Media query keys off viewport width so the X screenshot (1080px)
          always captures the desktop layout deterministically. */}
      <style>{`
        .jkb-mle-desktop { display: block; }
        .jkb-mle-mobile { display: none; }
        @media (max-width: 640px) {
          .jkb-mle-desktop { display: none; }
          .jkb-mle-mobile { display: block; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: "#0a1628", borderBottom: "3px solid #3b82f6", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px", whiteSpace: "nowrap" }}>🏆 MLB ML EDGES</div>
          <div style={{ color: "#38bdf8", fontSize: 11, marginTop: 2 }}>
            Model drivers + recent record — sorted by Model Edge
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          <WindowToggle />
          <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#ffffff" }}>joeknowsball.com</div>
        </div>
      </div>

      {/* ── Desktop / wide table ──────────────────────────────────────── */}
      <div className="jkb-mle-desktop">
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: DESKTOP_COLUMNS, gap: 6, padding: "6px 12px", background: "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700 }}>#</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700 }}>MATCHUP</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, textAlign: "center" }}>PITCH</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, textAlign: "center" }}>BAT</div>
          <div style={{ color: "#38bdf8", fontSize: 9, fontWeight: 700, textAlign: "center" }}>RECENT {formLabel}</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, textAlign: "center" }}>MODEL CTX</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, textAlign: "center" }}>MODEL EDGE</div>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, textAlign: "right" }}>PICK · GRADE</div>
        </div>

        {/* Rows */}
        {rows.map((row, i) => {
          const noVig = formatMarketPct(row.noVigMarketProbability);
          return (
            <div
              key={row.gamePk}
              data-ml-row={i}
              data-ml-away={row.awayAbbr}
              data-ml-home={row.homeAbbr}
              data-ml-pick={row.selectedTeam}
              data-ml-confidence={row.confidence}
              data-ml-differential={row.modelEdgePoints != null ? Math.round(row.modelEdgePoints) : ""}
              data-ml-model-edge={row.modelEdgePoints != null ? row.modelEdgePoints.toFixed(2) : ""}
              data-ml-canonical={row.canonicalEdgePoints != null ? row.canonicalEdgePoints.toFixed(2) : ""}
              data-ml-adjusted={row.isAdjusted ? "1" : "0"}
              data-ml-pitching={row.pitchingEdge != null ? row.pitchingEdge.toFixed(2) : ""}
              data-ml-batting={row.battingEdge != null ? row.battingEdge.toFixed(2) : ""}
              data-ml-model-form={row.modelFormEdge != null ? row.modelFormEdge.toFixed(2) : ""}
              data-ml-season={row.seasonEdge != null ? row.seasonEdge.toFixed(2) : ""}
              data-ml-form={row.formEdge != null ? row.formEdge.toFixed(2) : ""}
              data-ml-form-window={row.formWindow}
              data-ml-grade={row.grade ?? ""}
              data-ml-novig={row.noVigMarketProbability ?? ""}
              data-ml-pick-american={row.selectedAmerican ?? ""}
              data-ml-poly-yes={row.polymarketYes ?? ""}
              data-ml-poly-no={row.polymarketNo ?? ""}
              data-ml-game-time={row.gameTime}
              style={{
                display: "grid",
                gridTemplateColumns: DESKTOP_COLUMNS,
                gap: 6,
                padding: "8px 12px",
                background: i % 2 === 0 ? "#0d1e38" : "#091629",
                borderBottom: "1px solid #1e3a5f",
                borderLeft: `3px solid ${ACCENTS[i] ?? "#475569"}`,
                alignItems: "center",
              }}
            >
              {/* Rank */}
              <div style={{ fontWeight: 900, color: ACCENTS[i] ?? "#475569", fontSize: i < 3 ? 15 : 12, textAlign: "center" }}>
                {i < 3 ? MEDALS[i] : i + 1}
              </div>

              {/* Matchup */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                  <TeamLogoBadge team={row.awayAbbr} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>{row.awayAbbr}</span>
                  <span style={{ color: "#475569", fontSize: 10 }}>@</span>
                  <TeamLogoBadge team={row.homeAbbr} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>{row.homeAbbr}</span>
                  <span style={{ color: "#64748b", fontSize: 10, marginLeft: 2 }}>{row.gameTime}</span>
                </div>
                <div style={{ fontSize: 10, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.awayPitcher?.split(" ").pop() ?? "TBD"} vs {row.homePitcher?.split(" ").pop() ?? "TBD"}
                  {row.primaryReason ? <span style={{ color: "#38bdf8", marginLeft: 4 }}>· {row.primaryReason}</span> : null}
                </div>
              </div>

              {/* Canonical additive drivers */}
              <ComponentCell label="PITCH" value={row.pitchingEdge} />
              <ComponentCell label="BAT" value={row.battingEdge} />

              {/* Recent-record diagnostic (separate from the additive identity) */}
              <ComponentCell label={`REC ${formLabel}`} value={row.formEdge} />

              {/* Model Context: internal Model Form + Season (additive) */}
              <ModelContextCell modelForm={row.modelFormEdge} season={row.seasonEdge} />

              {/* Model Edge (points) — canonical or Adjusted */}
              <div style={{ textAlign: "center", minWidth: 0 }}>
                <div style={{ color: edgeValueColor(row), fontSize: 16, fontWeight: 900, lineHeight: 1.05 }}>
                  {formatEdgePoints(row.modelEdgePoints)}
                </div>
                <div style={{ color: row.isAdjusted ? "#fbbf24" : "#475569", fontSize: 7.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {row.modelEdgePoints == null ? "N/A" : row.isAdjusted ? "adj pts" : "pts"}
                </div>
              </div>

              {/* Pick · price · grade · market */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <TeamLogoBadge team={row.selectedTeam} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>{row.selectedTeam}</span>
                  {row.selectedAmerican && (
                    <span style={{
                      background: "#0d1e38",
                      border: "1px solid #1e3a5f",
                      borderRadius: 4,
                      padding: "1px 5px",
                      fontWeight: 800,
                      fontSize: 11,
                      color: row.selectedAmerican.startsWith("+") ? "#34d399" : "#94a3b8",
                    }}>
                      {row.selectedAmerican}
                    </span>
                  )}
                </div>
                {row.grade ? (
                  <span style={{
                    background: getEdgeGrade(row.confidence).bg,
                    color: getEdgeGrade(row.confidence).text,
                    borderRadius: 4,
                    padding: "2px 7px",
                    fontWeight: 700,
                    fontSize: 10,
                    whiteSpace: "nowrap",
                  }}>
                    {row.grade}
                  </span>
                ) : (
                  <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>No grade (N/A)</span>
                )}
                {row.isAdjusted && (
                  <span style={{ color: "#fbbf24", fontSize: 8, fontWeight: 700, whiteSpace: "nowrap" }} title="Adjusted for partial data">Adjusted · partial data</span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>Mkt {noVig}</span>
                  {row.polymarketYes != null && (
                    <span style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", borderRadius: 3, padding: "1px 4px", fontWeight: 700, fontSize: 9, whiteSpace: "nowrap" }}>
                      Poly {Math.round(row.polymarketYes * 100)}¢
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile / stacked cards ────────────────────────────────────── */}
      <div className="jkb-mle-mobile">
        {/* Recent-form window toggle (mobile) — affects Form only */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 14px", background: "#091629", borderBottom: "1px solid #1e3a5f" }}>
          <WindowToggle />
        </div>
        {rows.map((row, i) => {
          const noVig = formatMarketPct(row.noVigMarketProbability);
          const compRow = (label: string, value: number | null) => {
            const band = value != null ? getComponentBand(value) : null;
            return (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>{label}</span>
                <span style={{ color: band?.color ?? "#64748b", fontSize: 13, fontWeight: 800 }}>{formatEdgePoints(value)}</span>
              </div>
            );
          };
          return (
            <div
              key={row.gamePk}
              style={{
                padding: "10px 14px",
                background: i % 2 === 0 ? "#0d1e38" : "#091629",
                borderBottom: "1px solid #1e3a5f",
                borderLeft: `3px solid ${ACCENTS[i] ?? "#475569"}`,
              }}
            >
              {/* Matchup + time */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: ACCENTS[i] ?? "#475569", fontWeight: 900, fontSize: 13 }}>{i < 3 ? MEDALS[i] : i + 1}</span>
                  <TeamLogoBadge team={row.awayAbbr} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{row.awayAbbr}</span>
                  <span style={{ color: "#475569", fontSize: 11 }}>@</span>
                  <TeamLogoBadge team={row.homeAbbr} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{row.homeAbbr}</span>
                </div>
                <span style={{ color: "#64748b", fontSize: 11 }}>{row.gameTime}</span>
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 3 }}>
                {row.awayPitcher?.split(" ").pop() ?? "TBD"} vs {row.homePitcher?.split(" ").pop() ?? "TBD"}
              </div>

              {/* Pick + Model Edge headline */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700 }}>Pick</span>
                  <TeamLogoBadge team={row.selectedTeam} size={20} showLabel={false} dark={true} />
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>{row.selectedTeam}</span>
                  {row.selectedAmerican && (
                    <span style={{ background: "#0d1e38", border: "1px solid #1e3a5f", borderRadius: 4, padding: "1px 6px", fontWeight: 800, fontSize: 12, color: row.selectedAmerican.startsWith("+") ? "#34d399" : "#94a3b8" }}>
                      {row.selectedAmerican}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: edgeValueColor(row), fontSize: 16, fontWeight: 900 }}>{formatEdgePoints(row.modelEdgePoints)}</span>
                    {row.grade ? (
                      <span style={{ background: getEdgeGrade(row.confidence).bg, color: getEdgeGrade(row.confidence).text, borderRadius: 4, padding: "2px 7px", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{row.grade}</span>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>No grade (N/A)</span>
                    )}
                  </div>
                  {row.isAdjusted && <span style={{ color: "#fbbf24", fontSize: 9, fontWeight: 700 }}>Adjusted · partial data</span>}
                </div>
              </div>

              {/* Model Drivers (canonical, additive) */}
              <div style={{ marginTop: 8, background: "#060d1a", borderRadius: 6, padding: "4px 10px" }}>
                <div style={{ color: "#475569", fontSize: 9, fontWeight: 800, letterSpacing: ".05em", marginBottom: 1 }}>MODEL DRIVERS</div>
                {compRow("Pitching", row.pitchingEdge)}
                {compRow("Batting", row.battingEdge)}
                {compRow("Model Form", row.modelFormEdge)}
                {compRow("Season", row.seasonEdge)}
              </div>

              {/* Recent Record (separate diagnostic) */}
              <div style={{ marginTop: 6, background: "#060d1a", borderRadius: 6, padding: "4px 10px" }}>
                <div style={{ color: "#38bdf8", fontSize: 9, fontWeight: 800, letterSpacing: ".05em", marginBottom: 1 }}>RECENT RECORD</div>
                {compRow(`${formLabel} form`, row.formEdge)}
              </div>

              {/* Secondary: reason + market */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
                <span style={{ color: "#38bdf8", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.primaryReason ?? ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700 }}>Mkt {noVig}</span>
                  {row.polymarketYes != null && (
                    <span style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", borderRadius: 3, padding: "1px 5px", fontWeight: 700, fontSize: 10 }}>
                      Poly {Math.round(row.polymarketYes * 100)}¢
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 14px", background: "#091629", borderTop: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9.5, color: "#475569", lineHeight: 1.35 }}>
          Model Edge (pts) = full factor model, not a win-probability edge · Pitch + Bat + Model Ctx (Model Form + Season) = Model Edge · Recent {formLabel} = {FORM_WINDOW_SOURCES[formWindow]} record, a season-free diagnostic NOT summed into Model Edge · Adjusted = one or more factors missing, valid weights renormalized · N/A = data unavailable
          {hasPoly ? " · Mkt = no-vig implied · Poly = Polymarket" : " · Mkt = no-vig implied"}
        </span>
        <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700, flexShrink: 0 }}>joeknowsball.com</span>
      </div>
    </div>
  );
}

function SocialMediaTablesSection({
  games,
  detailPreviews,
  pitcherRegressionData,
  mlbOdds,
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  pitcherRegressionData: import("@/lib/mlb/mlbPitcherRegression").PitcherRegressionData[];
  mlbOdds: import("@/hooks/useMlbOdds").MlbOddsData | null;
}) {
  const { batters, strikeoutRows, batterVsPitcherRows, strikeoutDetailRows, pitchers, games: propsGames, loading } = useMlbPropsData();
  const [activeTab, setActiveTab] = useState<"ml" | "hr" | "k" | "hits" | "value">("hr");
  const { data: polymarketData } = usePolymarketMlbMoneylines();

  if (loading) return null;

  const tabs: { key: "ml" | "hr" | "k" | "hits" | "value"; label: string; emoji: string }[] = [
    { key: "ml",    label: "ML Edges",  emoji: "🏆" },
    { key: "hr",    label: "HR Props",  emoji: "🔥" },
    { key: "k",     label: "K Props",   emoji: "🎯" },
    { key: "hits",  label: "Hit Props", emoji: "⚔️" },
    { key: "value", label: "Value",     emoji: "💎" },
  ];

  const kRows = getKRowsForSocial(strikeoutRows, strikeoutDetailRows, pitchers, batters, propsGames);

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#0ea5e9" }}>Daily export</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#031635", marginTop: 2, letterSpacing: "-.03em" }}>Social Media Tables</h2>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Live data — updates with each model refresh. Review below then export to post.</p>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1, padding: "10px 4px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: activeTab === t.key ? "#fff" : "transparent",
                color: activeTab === t.key ? "#031635" : "#94a3b8",
                borderBottom: activeTab === t.key ? "2px solid #e05c2e" : "2px solid transparent",
                transition: "all .15s",
              }}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Table content */}
        <div style={{ padding: 14 }}>
          {activeTab === "ml"    && <SocialTableML games={games} detailPreviews={detailPreviews} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} polymarketGames={polymarketData?.games} />}
          {activeTab === "hr"    && <SocialTableHR batters={batters} />}
          {activeTab === "k"     && (kRows.length ? <SocialTableK rows={kRows} /> : <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Data Not Available</div>)}
          {activeTab === "hits"  && <SocialTableHits rows={batterVsPitcherRows} />}
          {activeTab === "value" && <SocialTableValue batters={batters} kRows={kRows} />}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Data refreshes at 3 AM · 10 AM · 1 PM ET</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/mlb/hr-props"          style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9", textDecoration: "none" }}>Open HR Props →</Link>
            <Link to="/mlb/strikeout-props"   style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textDecoration: "none" }}>Strikeout Props →</Link>
            <Link to="/mlb/batter-vs-pitcher" style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", textDecoration: "none" }}>Batter vs Pitcher →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}


function HomeSchedule({
  games,
  detailPreviews,
  onOpenGame,
  pitcherRegressionData,
  regressionLoading,
  mlbOdds,
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  onOpenGame: (gamePk: number) => void;
  pitcherRegressionData: import("@/lib/mlb/mlbPitcherRegression").PitcherRegressionData[];
  regressionLoading: boolean;
  mlbOdds: import("@/hooks/useMlbOdds").MlbOddsData | null;
}) {
  const {
    dashboard,
    batters: propBatters,
    batterVsPitcherRows,
    pitchers: propPitchers,
    strikeoutRows,
    pendingGames,
    propDate,
    nextRunAt,
  } = useMlbPropsData();

  const topHrProps = useMemo(() => propBatters
    .filter((b) => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice()
    .sort((a, b) => b.hrScore - a.hrScore)
    .slice(0, 5), [propBatters]);
  const topStrikeoutProps = useMemo(() => strikeoutRows.slice(0, 5), [strikeoutRows]);
  const topBvpProps = useMemo(() => batterVsPitcherRows.slice().sort((a, b) => b.bestMatchupScore - a.bestMatchupScore).slice(0, 5), [batterVsPitcherRows]);
  const hrPreviewRows = useMemo<PropPreviewRow[]>(
    () => topHrProps.map((row) => ({
      key: `${row.player}-${row.team}`,
      player: row.player,
      position: row.position,
      team: row.team,
      opponent: row.opposingPitcher,
      score: row.hrScore,
      hrOdds: row.hrOddsYes ?? null,
      hrBook: row.hrOddsBook ?? null,
    })),
    [topHrProps],
  );
  const strikeoutPreviewRows = useMemo<PropPreviewRow[]>(
    () => topStrikeoutProps.map((row) => ({
      key: `${row.pitcher}-${row.team}`,
      player: row.pitcher,
      team: row.team,
      opponent: row.opponent,
      score: row.kMatchupScore,
      kLine: row.kLine ?? null,
      kOddsOver: row.kOddsOver ?? null,
      kOddsUnder: row.kOddsUnder ?? null,
      kBook: row.kOddsBook ?? null,
    })),
    [topStrikeoutProps],
  );
  const bvpPreviewRows = useMemo<PropPreviewRow[]>(
    () => topBvpProps.map((row) => ({
      key: `${row.player}-${row.opposingPitcher}`,
      player: row.player,
      position: row.position,
      team: row.team,
      opponent: row.opposingPitcher,
      score: row.bestMatchupScore,
    })),
    [topBvpProps],
  );

  // Build ML edge map (gamePk → PanelMlEdge) for the Polymarket panel.
  // Uses the same computeModelEdge logic as the Game Matchup Analyzer so
  // the panel's sorting and badges always match what the analyzer shows.
  //
  // PER MODEL AUDIT (Phase 1 correctness fix): this NO LONGER derives a
  // "value edge" percentage from edge.confidence/100 treated as a win
  // probability. It reports market agreement (does the model's pick match
  // the side Polymarket currently favors) plus the raw market price, and
  // sorts by the model's own differential -- not a fabricated edge number.
  const { data: polymarketData } = usePolymarketMlbMoneylines();
  const mlEdges = useMemo<Record<number, PanelMlEdge>>(() => {
    if (!polymarketData?.games?.length) return {};
    const map: Record<number, PanelMlEdge> = {};
    for (const pmGame of polymarketData.games) {
      if (!pmGame.matched) continue;
      const detail = detailPreviews[pmGame.gamePk];
      if (!detail) continue;
      const edge = computeModelEdge(detail);
      if (edge.pick === "push") continue;

      const pickIsAway = edge.pick === "away";
      const pickAbbr = pickIsAway ? pmGame.away.abbreviation : pmGame.home.abbreviation;
      const pickTeam = pickIsAway ? pmGame.away : pmGame.home;
      const otherTeam = pickIsAway ? pmGame.home : pmGame.away;

      let marketAligned: boolean | null = null;
      let marketPrice: number | null = null;
      if (pickTeam.yesPrice != null && otherTeam.yesPrice != null) {
        marketAligned = pickTeam.yesPrice >= otherTeam.yesPrice;
        marketPrice = pickTeam.yesPrice;
      }

      map[pmGame.gamePk] = {
        pickAbbr,
        confidence: edge.confidence,
        differential: edge.differential,
        marketAligned,
        marketPrice,
      };
    }
    return map;
  }, [detailPreviews, polymarketData]);

  return (
    <div className="-mx-3 -my-3 bg-[#f8f9ff] lg:-mx-4 lg:-my-4">
      <div className="flex flex-col gap-5 px-4 py-6 sm:px-5 lg:px-6 2xl:flex-row">
        <div className="min-w-0 flex-1 space-y-3">

          <MlbAnalyticsHubFreshnessHeader
            propDate={propDate}
            gamesCount={games.length}
            generatedAt={dashboard?.generatedAt}
            nextRunAt={nextRunAt}
          />

          <MlbNavHero />

          <section id="props" className="space-y-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[#031635]">Today&apos;s Top Model Edges</h2>
              <p className="mt-0.5 text-xs text-slate-500">Our highest-rated projections from today&apos;s MLB model.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 3xl:gap-5">
              <PropPreviewCard
                title="Top HR Props"
                description="Ranks today's home run opportunities using our proprietary hitter model."
                rows={hrPreviewRows}
                to="/mlb/hr-props"
                theme="hr"
              />
              <PropPreviewCard
                title="Top K Props"
                description="Highlights today's largest strikeout projection differences versus sportsbook markets."
                rows={strikeoutPreviewRows}
                to="/mlb/strikeout-props"
                theme="k"
              />
            </div>

            <MlbPendingGamesBanner pendingGames={pendingGames} nextRunAt={nextRunAt} />
          </section>

          <MlbSlateAnalyzer games={games} detailPreviews={detailPreviews} pitchers={propPitchers} onOpenGame={onOpenGame} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} />

          {/* Polymarket panel — inline on screens below 2xl, shown AFTER the Game Matchup Analyzer */}
          <div id="moneylines" className="2xl:hidden">
            <MlbPolymarketMoneylinePanel onOpenGame={onOpenGame} mlEdges={mlEdges} />
          </div>

          <SocialMediaTablesSection games={games} detailPreviews={detailPreviews} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} />
          <MlbToolsGrid />
          
          {/* Pitcher Regression Table */}
          <section id="pitcher-regression" className="space-y-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight text-[#031635]">Pitcher Regression Analysis</h2>
              <p className="text-xs text-slate-500">Today's starters — ERA vs expected metrics (xFIP/xERA). Negative score = overperforming (regression risk), Positive = underperforming (improvement likely). Auto-generated from MLB Stats API + Baseball Savant.</p>
            </div>
            {regressionLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Loading pitcher regression data…</div>
            ) : (
              <MlbPitcherRegressionTable pitchers={pitcherRegressionData} />
            )}
          </section>
        </div>

        {/* Polymarket panel — sticky right sidebar on 2xl+ screens */}
        <aside className="hidden w-[310px] shrink-0 2xl:block 2xl:sticky 2xl:top-24 2xl:self-start 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto 2xl:overflow-x-hidden 3xl:w-[360px] 4xl:w-[410px] polymarket-panel-scroll">
          <MlbPolymarketMoneylinePanel onOpenGame={onOpenGame} mlEdges={mlEdges} />
        </aside>
      </div>

      <div className="px-4 pb-6 sm:px-5 lg:px-6">
        <section aria-labelledby="mlb-methodology-title" className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h2 id="mlb-methodology-title" className="text-lg font-bold text-[#031635]">How to use these models</h2>
          <p className="mt-1.5 max-w-5xl text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
            These projections compare Joe Knows Ball&apos;s proprietary model against available betting markets to surface research opportunities. Model scores are comparative ratings and should not be interpreted as guarantees or win probabilities.
          </p>
        </section>
      </div>
    </div>
  );
}

function getFeaturedMatchupEdge(detail: MlbGameDetail) {
  const awayK9 = computeK9(detail.starters.away.strikeOuts, detail.starters.away.inningsPitched);
  const homeK9 = computeK9(detail.starters.home.strikeOuts, detail.starters.home.inningsPitched);
  const awayOpponentK = computePercent(
    detail.opponentSplits.homeBattingVsAwayStarter?.strikeOuts ?? null,
    detail.opponentSplits.homeBattingVsAwayStarter?.plateAppearances ?? null,
  );
  const homeOpponentK = computePercent(
    detail.opponentSplits.awayBattingVsHomeStarter?.strikeOuts ?? null,
    detail.opponentSplits.awayBattingVsHomeStarter?.plateAppearances ?? null,
  );
  const awayLineupOps = detail.lineupSummaries.away.ops;
  const homeLineupOps = detail.lineupSummaries.home.ops;

  const kCandidates = [
    {
      title: `${detail.starters.away.name} strikeout look`,
      score: (awayK9 ?? 0) * 0.65 + (awayOpponentK ?? 0) * 0.35,
      note: `${detail.game.home.abbreviation} split K% ${awayOpponentK?.toFixed(1) ?? "—"} with ${detail.starters.away.name} carrying a ${awayK9?.toFixed(1) ?? "—"} K/9.`,
      icon: <Target className="h-5 w-5" />,
    },
    {
      title: `${detail.starters.home.name} strikeout look`,
      score: (homeK9 ?? 0) * 0.65 + (homeOpponentK ?? 0) * 0.35,
      note: `${detail.game.away.abbreviation} split K% ${homeOpponentK?.toFixed(1) ?? "—"} with ${detail.starters.home.name} carrying a ${homeK9?.toFixed(1) ?? "—"} K/9.`,
      icon: <Target className="h-5 w-5" />,
    },
  ].sort((left, right) => right.score - left.score);

  const lineupDelta = Math.abs((awayLineupOps ?? 0) - (homeLineupOps ?? 0));
  if (kCandidates[0].score >= 14 || lineupDelta < 0.035) {
    return {
      eyebrow: "Top edge to price first",
      title: kCandidates[0].title,
      note: kCandidates[0].note,
      icon: kCandidates[0].icon,
    };
  }

  const homeLineupAhead = (homeLineupOps ?? 0) > (awayLineupOps ?? 0);
  return {
    eyebrow: "Top edge to price first",
    title: `${homeLineupAhead ? detail.game.home.abbreviation : detail.game.away.abbreviation} lineup pressure`,
    note: `${detail.game.away.abbreviation} projected OPS ${awayLineupOps?.toFixed(3) ?? "—"} against ${detail.game.home.abbreviation} at ${homeLineupOps?.toFixed(3) ?? "—"}.`,
    icon: <Swords className="h-5 w-5" />,
  };
}

export default function MlbGameDetail() {
  const seo = getSeoMeta("mlb");
  const [routeState, setRouteState] = useState<MlbRouteState>(() => parseHash(window.location.hash));
  const [schedule, setSchedule] = useState<MlbScheduleGame[]>([]);
  const [detailPreviews, setDetailPreviews] = useState<Record<number, MlbGameDetail>>({});
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MlbGameDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [usingDevFixture, setUsingDevFixture] = useState(false);
  const { data: PITCHER_REGRESSION_DATA, loading: regressionLoading } = usePitcherRegression();
  const { getPercentiles } = usePitcherPercentiles();
  const mlbOdds = useMlbOdds();

  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    structuredData: [
      buildBreadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "MLB", path: "/mlb" },
      ]),
    ],
  });

  useEffect(() => {
    const onHashChange = () => setRouteState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    setDetailPreviews({});
    setUsingDevFixture(false);

    loadSchedule()
      .then((games) => {
        if (cancelled) return;
        setSchedule(games);
        setScheduleLoading(false);
        games.forEach((game) => {
          void warmGameDetail(game.gamePk)
            .then((data) => {
              if (cancelled) return;
              setDetailPreviews((current) => ({ ...current, [game.gamePk]: data }));
            })
            .catch(() => {});
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          setSchedule(DEV_MLB_MATCHUP_FIXTURE.schedule);
          setDetailPreviews({ [DEV_MLB_MATCHUP_FIXTURE.detail.game.gamePk]: DEV_MLB_MATCHUP_FIXTURE.detail });
          setScheduleLoading(false);
          setUsingDevFixture(true);
          return;
        }
        setScheduleError(error instanceof Error ? error.message : "Unable to load MLB schedule.");
        setScheduleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (routeState.view !== "game") {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    if (!routeState.gamePk) {
      setDetailError("Game ID not found in URL.");
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    warmGameDetail(routeState.gamePk)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV && String(routeState.gamePk) === DEV_FIXTURE_GAME_PK) {
          setDetail(DEV_MLB_MATCHUP_FIXTURE.detail);
          setDetailLoading(false);
          setUsingDevFixture(true);
          return;
        }
        const errorMsg = error instanceof Error ? error.message : "Unable to load MLB matchup detail.";
        console.error("Detail load error:", errorMsg, routeState.gamePk);
        setDetailError(errorMsg);
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeState]);

  const openGame = (gamePk: number) => {
    window.location.hash = `game-${gamePk}`;
  };

  const goHome = () => {
    window.location.hash = "home";
  };

  const summaryCards = detail ? getSummaryCards(detail) : [];
  const pitcherMetrics = useMemo(() => {
    if (!detail) return [];
    const base = getPitcherComparisonMetrics(detail);
    const awayPcts = getPercentiles(detail.starters.away.id);
    const homePcts = getPercentiles(detail.starters.home.id);
    if (!awayPcts && !homePcts) return base;
    return base.map((m) => {
      const pctKeyMap: Record<string, keyof typeof awayPcts> = {
        era:   "eraPct",
        whip:  "whipPct",
        k9:    "k9Pct",
        kPct:  "kPctPct",
        bbPct: "bbPctPct",
        hr9:   "hr9Pct",
      };
      const pctKey = pctKeyMap[m.key];
      if (!pctKey) return m;
      return {
        ...m,
        leftPct:  awayPcts ? (awayPcts[pctKey] as number | null) : null,
        rightPct: homePcts ? (homePcts[pctKey] as number | null) : null,
      };
    });
  }, [detail, getPercentiles]);
  const parkContext = detail ? getParkContextValues(detail) : null;
  const propAngles = detail ? getPropAngles(detail) : [];
  const featuredMatchupEdge = detail ? getFeaturedMatchupEdge(detail) : null;
  const awaySplitMetrics = detail ? buildSplitMetrics(detail.opponentSplits.awayBattingVsHomeStarter, "away-split") : [];
  const homeSplitMetrics = detail ? buildSplitMetrics(detail.opponentSplits.homeBattingVsAwayStarter, "home-split") : [];
  const heroIndicators = detail ? [
    {
      label: "Best angle",
      value: featuredMatchupEdge?.title ?? "Balanced matchup",
      icon: <Crosshair className="h-4 w-4" />,
    },
    {
      label: "Strikeout lean",
      value: summaryCards[5]?.value ?? "Neutral",
      icon: <Radar className="h-4 w-4" />,
    },
    {
      label: "Run environment",
      value: summaryCards[4]?.value ?? parkContext?.totalLean ?? "Neutral",
      icon: <Flame className="h-4 w-4" />,
    },
    {
      label: "Weather / wind",
      value: detail.weather || "Context unavailable",
      icon: <Wind className="h-4 w-4" />,
    },
  ] : [];

  return (
      <MlbMatchupLayout>
        {scheduleLoading ? (
          <div className="rounded-[32px] bg-card p-8 text-sm text-muted-foreground shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
            Loading MLB schedule and matchup context.
          </div>
        ) : scheduleError ? (
          <div className="rounded-[32px] bg-card p-8 text-sm text-destructive shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
            {scheduleError}
          </div>
        ) : routeState.view === "home" ? (
          <HomeSchedule games={schedule} detailPreviews={detailPreviews} onOpenGame={openGame} pitcherRegressionData={PITCHER_REGRESSION_DATA} regressionLoading={regressionLoading} mlbOdds={mlbOdds} />
        ) : detailLoading && !detail ? (
          <div className="rounded-[32px] bg-card p-8 text-sm text-muted-foreground shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
            Building matchup dashboard.
          </div>
        ) : detailError || !detail ? (
          <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <div className="text-sm font-semibold text-red-900">{detailError || "Matchup detail is unavailable."}</div>
            <button
              type="button"
              onClick={goHome}
              className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              ← Back to games
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={goHome}
                className="inline-flex items-center rounded-full bg-secondary px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
              >
                Back to MLB slate
              </button>
              <div className="text-xs text-muted-foreground">/mlb#game-{detail.game.gamePk}</div>
            </div>

            {usingDevFixture ? (
              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900 shadow-sm">
                Dev-only MLB matchup fixture loaded for local UI verification because live MLB API requests are unavailable in this environment.
              </div>
            ) : null}

            <MlbMatchupHero
              detail={detail}
              quickChips={[
                { label: parkContext?.parkType || "Neutral park" },
                { label: parkContext?.totalLean || "Neutral total" },
                { label: summaryCards[2]?.value || "Lineup edge", tone: "positive" },
                { label: summaryCards[5]?.value || "Strikeout environment" },
              ]}
              summaryIndicators={heroIndicators}
              spotlight={featuredMatchupEdge ?? {
                eyebrow: "Top edge to price first",
                title: "Balanced matchup board",
                note: "The core matchup signals are available below across team context, pitcher form, and lineup pressure.",
                icon: <Sparkles className="h-5 w-5" />,
              }}
            />

            <MlbMatchupSummaryRow
              cards={summaryCards}
              awayAbbreviation={detail.game.away.abbreviation}
              homeAbbreviation={detail.game.home.abbreviation}
            />

            {/* 2-col layout: left = team+pitcher analysis, right = context+lineups */}
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">

              {/* Left column: Team Snapshot → Pitcher Edge → Pitcher vs Lineup → Split Performance */}
              <div className="space-y-3">
                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Team Snapshot">
                  <MlbSectionHeader eyebrow="Teams" title="Team Snapshot" icon={<Shield className="h-3.5 w-3.5" />} />
                  <div className="mt-2">
                    <MlbTeamOverviewPanel detail={detail} />
                  </div>
                </MlbSectionCard>

                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary} collapsible title="Pitcher Edge">
                  <MlbSectionHeader eyebrow="Pitchers" title="Pitcher Edge" icon={<Target className="h-3.5 w-3.5" />} />
                  <div className="mt-2">
                    <MlbPitcherComparisonPanel
                      awayPitcher={detail.starters.away}
                      homePitcher={detail.starters.home}
                      metrics={pitcherMetrics}
                      awayAbbreviation={detail.game.away.abbreviation}
                      homeAbbreviation={detail.game.home.abbreviation}
                    />
                  </div>
                </MlbSectionCard>

                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Pitcher vs Lineup">
                  <MlbSectionHeader eyebrow="Pitcher vs Lineup" title={`${detail.starters.home.name} vs ${detail.game.away.abbreviation} · ${detail.starters.away.name} vs ${detail.game.home.abbreviation}`} icon={<Crosshair className="h-3.5 w-3.5" />} />
                  <div className="mt-2">
                    <MlbPitcherVsLineupPanel
                      awayPitcher={detail.starters.away}
                      homePitcher={detail.starters.home}
                      awaySplit={detail.opponentSplits.awayBattingVsHomeStarter}
                      homeSplit={detail.opponentSplits.homeBattingVsAwayStarter}
                      awayLineupSummary={detail.lineupSummaries.away}
                      homeLineupSummary={detail.lineupSummaries.home}
                      awayAbbreviation={detail.game.away.abbreviation}
                      homeAbbreviation={detail.game.home.abbreviation}
                      getPercentiles={getPercentiles}
                    />
                  </div>
                </MlbSectionCard>

                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Split Performance">
                  <MlbSectionHeader
                    eyebrow="Split Performance"
                    title={`${detail.game.away.abbreviation} vs ${detail.starters.home.hand}HP · ${detail.game.home.abbreviation} vs ${detail.starters.away.hand}HP`}
                    icon={<Activity className="h-3.5 w-3.5" />}
                  />
                  <div className="mt-2">
                    <MlbSplitComparisonPanel
                      awayMetrics={awaySplitMetrics}
                      homeMetrics={homeSplitMetrics}
                      awayAbbreviation={detail.game.away.abbreviation}
                      homeAbbreviation={detail.game.home.abbreviation}
                    />
                  </div>
                </MlbSectionCard>
              </div>

              {/* Right column: Prop Angles → Park Context → Order-by-order Matchup */}
              <div className="space-y-3">
                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Prop Angles">
                  <MlbSectionHeader eyebrow="Betting" title="Prop Angles" icon={<Sparkles className="h-3.5 w-3.5" />} />
                  <div className="mt-2">
                    <MlbPropAnglesPanel angles={propAngles} />
                  </div>
                </MlbSectionCard>

                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary} collapsible title="Park Context">
                  <MlbSectionHeader eyebrow="Park" title="Park Context" icon={<CloudSun className="h-3.5 w-3.5" />} />
                  <div className="mt-2">
                    <MlbParkContextPanel
                      venue={parkContext?.venue || detail.game.venue}
                      weather={parkContext?.weather || detail.weather}
                      parkType={parkContext?.parkType || "Neutral park"}
                      totalLean={parkContext?.totalLean || "Neutral"}
                      factorLabel={parkContext?.factorLabel || `${formatFactor(MLB_LEAGUE_AVERAGES.runsFactor)} avg run factor`}
                      runFactor={parkContext?.runFactor || MLB_LEAGUE_AVERAGES.runsFactor}
                      hrFactor={parkContext?.hrFactor || MLB_LEAGUE_AVERAGES.hrFactor}
                      awayAbbreviation={detail.game.away.abbreviation}
                      homeAbbreviation={detail.game.home.abbreviation}
                      starterEraMetrics={[
                        { key: "starter-era", label: "Starter ERA", leftValue: Number(detail.starters.away.era) || null, rightValue: Number(detail.starters.home.era) || null, leagueAverage: MLB_LEAGUE_AVERAGES.era, format: "era", scaleKey: "era" },
                        { key: "park-factors", label: "Run / HR factor", leftValue: parkContext?.runFactor || MLB_LEAGUE_AVERAGES.runsFactor, rightValue: parkContext?.hrFactor || MLB_LEAGUE_AVERAGES.hrFactor, leagueAverage: MLB_LEAGUE_AVERAGES.runsFactor, format: "factor", scaleKey: "factor" },
                      ]}
                    />
                  </div>
                </MlbSectionCard>

                <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Order-by-order matchup">
                  <MlbSectionHeader eyebrow="Lineups" title="Order-by-order matchup" icon={<Swords className="h-3.5 w-3.5" />} />
                  <div className="mt-2 mb-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-secondary/30 px-3 py-1.5 text-xs">
                      <span className="font-bold text-foreground">{detail.game.away.abbreviation}</span>
                      <span className="ml-2 text-muted-foreground">AVG {formatAvgLike(detail.lineupSummaries.away.avg)} · OBP {formatAvgLike(detail.lineupSummaries.away.obp)} · SLG {formatAvgLike(detail.lineupSummaries.away.slg)}</span>
                    </div>
                    <div className="rounded-lg bg-secondary/30 px-3 py-1.5 text-xs">
                      <span className="font-bold text-foreground">{detail.game.home.abbreviation}</span>
                      <span className="ml-2 text-muted-foreground">AVG {formatAvgLike(detail.lineupSummaries.home.avg)} · OBP {formatAvgLike(detail.lineupSummaries.home.obp)} · SLG {formatAvgLike(detail.lineupSummaries.home.slg)}</span>
                    </div>
                  </div>
                  <MlbProjectedLineupPanel
                    away={detail.lineups.away}
                    home={detail.lineups.home}
                    awayTeamAbbreviation={detail.game.away.abbreviation}
                    homeTeamAbbreviation={detail.game.home.abbreviation}
                  />
                </MlbSectionCard>
              </div>
            </div>

            {/* Model Pick Badge */}
            <MlbModelPickBadge detail={detail} />
          </>
        )}
      </MlbMatchupLayout>
  );
}



