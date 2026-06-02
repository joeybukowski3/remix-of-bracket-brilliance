import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, CalendarDays, CloudSun, Crosshair, ExternalLink, Flame, Gauge, Radar, Rocket, Shield, Sparkles, Swords, Target, Wind } from "lucide-react";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import MlbModelPickBadge from "@/components/mlb/MlbModelPickBadge";
import MlbPitcherRegressionTable, { regressionPillStyle } from "@/components/mlb/MlbPitcherRegressionTable";
import { usePitcherRegression } from "@/hooks/usePitcherRegression";
import { useMlbOdds } from "@/hooks/useMlbOdds";
import SportsbookBar from "@/components/SportsbookBar";
import SiteShell from "@/components/layout/SiteShell";
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
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getParkContextValues, getPitcherComparisonMetrics, getPropAngles, getSummaryCards } from "@/lib/mlb/mlbComparisonHelpers";
import { computeModelEdge } from "@/lib/mlb/mlbModelEdge";
import { computeK9, computePercent, formatAvgLike, formatFactor, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { MLB_LEAGUE_AVERAGES } from "@/lib/mlb/mlbLeagueAverages";
import { buildBreadcrumbSchema } from "@/lib/seo/pgaSeo";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric, MlbGameDetail, MlbLineupRow, MlbOpponentSplit, MlbRouteState, MlbScheduleGame } from "@/lib/mlb/mlbTypes";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SPORTSBOOKS } from "@/lib/sportsbooks";
import { ScorePill, HrDashboardPitcher, TeamLogoBadge, type HrDashboardBatter, type PitcherStrikeoutTeamRow, type PitcherVsBatterRow } from "@/pages/MlbHrProps";

const SEASON = new Date().getFullYear();

type MlbCache = {
  date: string;
  schedule: MlbScheduleGame[] | null;
  schedulePromise: Promise<MlbScheduleGame[]> | null;
  games: Record<string, MlbGameDetail>;
  detailPromises: Record<string, Promise<MlbGameDetail>>;
  people: Record<string, any>;
  pitcherVsTeam: Record<string, any>;
  teamSplits: Record<string, any>;
  teamSchedules: Record<string, any[]>;
  teamPitching: Record<string, any>;
  hitterStats: Record<string, any>;
  lineups: Record<string, any[]>;
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
      teamSplits: {},
      teamSchedules: {},
      teamPitching: {},
      hitterStats: {},
      lineups: {},
    };
  }
  return mlbCache;
}

async function fetchJson(url: string) {
  const response = await fetch(url);
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
  };
}

async function fetchTeamContext(teamId: number | null, opponentId: number | null) {
  return summarizeTeamSchedule(await fetchTeamSeasonSchedule(teamId), teamId, opponentId);
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
    homeLineupData,
    awayLineupData,
    homePitching,
    awayPitching,
  ] = await Promise.all([
    fetchTeamContext(game.home.id, game.away.id),
    fetchTeamContext(game.away.id, game.home.id),
    fetchPerson(homeStarterId),
    fetchPerson(awayStarterId),
    fetchPitcherSeasonStats(homeStarterId),
    fetchPitcherSeasonStats(awayStarterId),
    fetchPitcherVsTeam(homeStarterId, game.away.id),
    fetchPitcherVsTeam(awayStarterId, game.home.id),
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
      },
    },
    pitching: { home: homePitching, away: awayPitching },
    opponentSplits: {
      awayBattingVsHomeStarter,
      homeBattingVsAwayStarter,
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

function formatGameTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

type PropPreviewTheme = "hr" | "k" | "bvp";

type PropPreviewRow = {
  key: string;
  player: string;
  position?: string;
  team: string;
  opponent: string;
  score: number | null | undefined;
};

function TeamAbbrBadge({ team }: { team: string }) {
  return <MlbTeamLogo team={team} size={20} />;
}

function PropPreviewCard({
  title,
  rows,
  to,
  theme,
}: {
  title: string;
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
      <div className={cn("flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3", themeClasses.header)}>
        <div className="flex items-center gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", themeClasses.icon)}>
          {theme === "hr" ? <Flame className="h-4 w-4" /> : theme === "k" ? <Radar className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
          </span>
          <h3 className="text-base font-bold text-[#031635]">{title}</h3>
        </div>
        <Link to={to} className={cn("text-[10px] font-bold uppercase tracking-[0.16em] hover:underline", themeClasses.label)}>
          {themeClasses.note}
        </Link>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] items-center gap-2 border-b border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <div>Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>

      <div>
        {rows.map((row, index) => (
          <Link
            key={row.key}
            to={to}
            className={cn(
              "group grid grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] items-center gap-2 border-b border-slate-100 px-4 py-2 transition last:border-b-0",
              index % 2 === 1 && "bg-slate-50/50",
              themeClasses.hover,
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <TeamAbbrBadge team={row.team} />
              <div className="min-w-0">
                <div className="truncate text-xs font-bold leading-5 text-slate-950">{row.player}</div>
                {row.position && <div className="text-[10px] font-semibold uppercase text-slate-400">{row.position}</div>}
              </div>
            </div>
            <div className="min-w-0 text-[11px] font-medium text-slate-500">
              <div className="truncate">vs {row.opponent}</div>
            </div>
            <div className="flex justify-end">
              <ScorePill value={row.score} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const MLB_HUB_LINKS = [
  { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: <Swords className="h-4 w-4" /> },
  { label: "HR Props", to: "/mlb/hr-props", icon: <Flame className="h-4 w-4" /> },
  { label: "K Props", to: "/mlb/strikeout-props", icon: <Radar className="h-4 w-4" /> },
  { label: "Game Matchups", to: "/mlb#schedule", icon: <CalendarDays className="h-4 w-4" /> },
  { label: "Schedule", to: "/mlb#schedule", icon: <CalendarDays className="h-4 w-4" /> },
];

const MLB_TOOL_CARDS = [
  {
    title: "MLB Props Hub",
    body: "Comprehensive prop analytics for every game on the slate with matchup context.",
    to: "/mlb/props",
    icon: <BarChart3 className="h-5 w-5" />,
    accent: "border-t-[#031635]",
  },
  {
    title: "HR Props",
    body: "Daily home run model projections and edges with park, weather, and pitcher risk.",
    to: "/mlb/hr-props",
    icon: <Flame className="h-5 w-5" />,
    accent: "border-t-sky-700",
  },
  {
    title: "Strikeout Props",
    body: "Pitcher K-prop rankings by skill profile, whiff rate, and opponent strikeout tendency.",
    to: "/mlb/strikeout-props",
    icon: <Radar className="h-5 w-5" />,
    accent: "border-t-emerald-700",
  },
  {
    title: "Batter vs Pitcher",
    body: "Table-first matchup board for batter power, pitcher attackability, and park context.",
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
];

function MlbHubSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 self-start border-r border-slate-200 bg-[#eff4ff] py-4 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="mb-5 px-5">
        <img src="/logos/mlb.svg" alt="MLB" className="h-9 w-auto" />
      </div>
      <nav className="flex flex-col gap-1">
        {MLB_HUB_LINKS.slice(0, 4).map((item, index) => (
          <Link
            key={item.label}
            to={item.to}
            className={cn(
              "mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:translate-x-1 hover:bg-[#dce9ff] hover:text-[#031635]",
              index === 0 && "bg-[#7bc2ff] text-[#004f7b] shadow-sm",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 px-4">
        <Link
          to="/mlb/props"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#031635] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#1a2b4b]"
        >
          <Rocket className="h-4 w-4" />
          Prop Optimizer
        </Link>
      </div>

      {/* Vertical "Bet with our partners" section card (stacked, no horizontal scroll) */}
      <div className="mt-4 border-t border-slate-200 pt-3 px-3">
        <div className="px-1 mb-1.5 text-[10px] font-semibold tracking-wide text-slate-500">
          Bet with our partners
        </div>
        <div className="flex flex-col gap-1">
          {SPORTSBOOKS.map((sb) => (
            <a
              key={sb.name}
              href={sb.referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-[5px] text-[11px] font-bold transition hover:opacity-95 active:opacity-90"
              style={{ backgroundColor: sb.bgColor, color: sb.textColor }}
            >
              <img
                src={sb.logoUrl}
                alt={sb.name}
                className="h-4 w-4 rounded object-contain shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {sb.name}
            </a>
          ))}
        </div>
        <div className="mt-2 px-1 text-[9px] text-slate-400">21+ • Call 1-800-GAMBLER</div>
      </div>

      {/* Stat Glossary */}
      <div className="mt-6 border-t border-slate-200 px-4 pt-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Stat Glossary</div>
        <dl className="space-y-2">
          {([
            ["xERA", "Expected ERA from Statcast exit velocity & launch angle. Strips luck from actual results."],
            ["xFIP", "Expected FIP — normalises HR/FB% to league average. Best predictor of future ERA."],
            ["K-BB%", "Strikeout rate minus walk rate. Pure skill indicator — higher = better command."],
            ["LOB%", "Left-on-base (strand) rate. League avg ~73%. >80% is unsustainable luck."],
            ["HR/FB%", "Home runs per fly ball. League avg ~10.5%. <8% = likely lucky, >13% = unlucky."],
            ["BABIP", "Batting avg on balls in play. Pitcher norm ~.300. <.270 = likely lucky."],
            ["Regr ↓", "Blue pill — pitcher is overperforming ERA vs metrics. Regression toward higher ERA likely."],
            ["Regr ↑", "Green pill — pitcher is underperforming ERA vs metrics. ERA improvement likely."],
          ] as [string, string][]).map(([term, def]) => (
            <div key={term}>
              <dt className="text-[10px] font-extrabold text-slate-700">{term}</dt>
              <dd className="text-[9px] leading-tight text-slate-500">{def}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 rounded-md bg-slate-100 p-2">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Regression Scale</div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#1e3a8a", color: "#93c5fd" }}>-10</span>
            <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#1e3a8a] via-[#dbeafe] to-white to-[#dcfce7] via-white via-[50%]" style={{ background: "linear-gradient(to right, #1e3a8a, #93c5fd, #dbeafe, #f1f5f9, #dcfce7, #22c55e, #15803d)" }} />
            <span className="rounded px-1 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#14532d", color: "#bbf7d0" }}>+10</span>
          </div>
          <div className="mt-0.5 flex justify-between text-[8px] text-slate-400">
            <span>Blue = regress ↓</span>
            <span>0 = neutral</span>
            <span>Green = improve ↑</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

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
  function getPitcherXera(pitcherId: number | null | undefined): number | null {
    if (!pitcherId) return null;
    return pitchers.find((p) => p.pitcherId === pitcherId)?.xera ?? null;
  }
  return (
    <section id="schedule" className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#031635]">Game Matchup Analyzer</h2>
          <p className="text-xs text-slate-500">Daily predictive analysis and situational edges from the live slate.</p>
        </div>
        <span className="text-xs font-semibold text-slate-400">{games.length} games</span>
      </div>

      {/* Individual game cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {games.map((game, index) => {
            const detail = detailPreviews[game.gamePk];
            const edges = getSlateEdgeSummary(detail);
            const statusTheme = getStatusBadgeTheme(game.status);
            const statusCategory = getSlateStatusCategory(game.status);
            const awayScore = Number(game.away.score);
            const homeScore = Number(game.home.score);
            const showScore = (statusCategory === "in-progress" || statusCategory === "final")
              && Number.isFinite(awayScore)
              && Number.isFinite(homeScore);

            return (
              <button
                key={game.gamePk}
                type="button"
                onClick={() => onOpenGame(game.gamePk)}
                className={cn(
                  "flex w-full flex-col rounded-xl border text-left transition-all hover:shadow-md h-full",
                  statusCategory === "in-progress"
                    ? "border-green-200 bg-green-50/40 shadow-sm"
                    : statusCategory === "final"
                    ? "border-slate-200 bg-slate-50/60 shadow-sm"
                    : "border-slate-200 bg-white shadow-sm hover:border-blue-200",
                )}>

                {/* Top bar: status + time + venue */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: statusTheme.background, color: statusTheme.color }}
                    >
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
                      ? (mlEdge.pick === "away" ? mlEdge.awayAbbr : mlEdge.homeAbbr)
                      : null;
                    const mlPickColor = mlPickAbbr ? getMlbTeamColors(mlPickAbbr).primary : null;

                    const renderTeamCol = (
                      abbr: string,
                      record: string,
                      pitcherName: string | undefined,
                      pitcherId: number | undefined,
                      starterRecord: string | undefined,
                      score: number,
                    ) => {
                      const regrData = pitcherRegressionData.find(p => p.name === pitcherName);
                      const pill = regrData ? regressionPillStyle(regrData.regressionScore) : null;
                      const s = regrData?.regressionScore;
                      const shortLabel = s == null ? null : Math.abs(s) <= 0.5 ? "Neutral" : s < 0 ? "Regr ↓" : "Regr ↑";
                      // xERA: regression data first, then HR props lookup, then xFIP as labeled fallback
                      const xeraFromRegr = regrData?.xera ?? null;
                      const xeraFromProps = getPitcherXera(pitcherId);
                      const xera = xeraFromRegr ?? xeraFromProps;
                      const xeraLabel = xera != null ? "xERA" : null;
                      const xfipFallback = (xera == null && regrData?.xfip != null) ? regrData.xfip : null;

                      const xeraStyle = (v: number) => {
                        if (v <= 3.00) return { bg: "#14532d", text: "#bbf7d0" }; // elite — dark green
                        if (v <= 3.50) return { bg: "#166534", text: "#86efac" }; // great — green
                        if (v <= 4.00) return { bg: "#dcfce7", text: "#15803d" }; // good — light green
                        if (v <= 4.50) return { bg: "#f1f5f9", text: "#64748b" }; // average — neutral
                        if (v <= 5.00) return { bg: "#dbeafe", text: "#1d4ed8" }; // below avg — light blue
                        if (v <= 5.75) return { bg: "#1e3a8a", text: "#93c5fd" }; // poor — blue
                        return { bg: "#172554", text: "#60a5fa" };                // bad — dark blue
                      };

                      return (
                        <div className="flex flex-col items-center gap-1 text-center min-w-0">
                          {/* Logo */}
                          <MlbTeamLogo team={abbr} size={28} />
                          {/* Team abbr + record */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-extrabold text-slate-950">{abbr}</span>
                            <span className="text-[10px] font-semibold text-slate-400">{record}</span>
                          </div>
                          {/* Score (live/final) */}
                          {showScore && (
                            <span className="text-[18px] font-extrabold leading-none text-slate-900">{score}</span>
                          )}
                          {/* Pitcher name */}
                          <span className="text-[12px] font-semibold leading-tight text-[#031635]">
                            {pitcherName || "TBD"}
                          </span>
                          {/* Pitcher record */}
                          {starterRecord && (
                            <span className="text-[10px] text-slate-400">{starterRecord}</span>
                          )}
                          {/* xERA pill — green (elite) → neutral → blue (poor) */}
                          {xera != null ? (() => {
                            const xs = xeraStyle(xera);
                            return (
                              <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: xs.bg, color: xs.text }}>
                                {xera.toFixed(2)} {xeraLabel}
                              </span>
                            );
                          })() : xfipFallback != null ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {xfipFallback.toFixed(2)} xFIP
                            </span>
                          ) : null}
                          {/* Regression pill */}
                          {pill && s != null && (
                            <span
                              className="rounded px-2 py-0.5 text-[10px] font-bold"
                              style={{ backgroundColor: pill.bg, color: pill.color }}
                              title={pill.label}
                            >
                              {s > 0 ? "+" : ""}{s} {shortLabel}
                            </span>
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Side-by-side team columns */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                          {/* Away */}
                          {renderTeamCol(
                            game.away.abbreviation,
                            game.away.record,
                            game.away.probablePitcher?.fullName || detail?.starters.away.name,
                            game.away.probablePitcher?.id ?? detail?.starters.away.id,
                            detail?.starters.away.record,
                            awayScore,
                          )}

                          {/* VS divider */}
                          <div className="flex flex-col items-center justify-center gap-1 self-center px-1">
                            <span className="text-[10px] font-bold text-slate-300">vs</span>
                          </div>

                          {/* Home */}
                          {renderTeamCol(
                            game.home.abbreviation,
                            game.home.record,
                            game.home.probablePitcher?.fullName || detail?.starters.home.name,
                            game.home.probablePitcher?.id ?? detail?.starters.home.id,
                            detail?.starters.home.record,
                            homeScore,
                          )}
                        </div>

                        {/* Bottom bar: Total + ML Edge + actual ML prices */}
                        <div className="mt-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</span>
                            <span className="rounded-full bg-[#031635] px-3 py-1 text-[10px] font-extrabold text-white">{edges.total}</span>
                          </div>
                          <div className="h-3 w-px bg-slate-200" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ML Edge</span>
                            {mlPickAbbr && mlPickColor ? (
                              <span className="rounded-full px-3 py-1 text-[10px] font-extrabold text-white" style={{ backgroundColor: mlPickColor }}>
                                {mlPickAbbr} {mlEdge!.confidence}%
                              </span>
                            ) : mlEdge ? (
                              <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-extrabold text-slate-500">Even</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-400">—</span>
                            )}
                          </div>
                          {/* Live ML prices from sportsbook */}
                          {(() => {
                            const awayAbbr = game.away.abbreviation;
                            const homeAbbr = game.home.abbreviation;
                            const ml = mlbOdds?.moneylines?.[`${awayAbbr}@${homeAbbr}`];
                            if (!ml) return null;
                            const awayPrice = ml.away.american;
                            const homePrice = ml.home.american;
                            if (!awayPrice || !homePrice) return null;
                            return (
                              <>
                                <div className="h-3 w-px bg-slate-200" />
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Line</span>
                                  <span className="text-[10px] font-bold text-slate-600">{awayAbbr} {awayPrice}</span>
                                  <span className="text-[9px] text-slate-300">/</span>
                                  <span className="text-[10px] font-bold text-slate-600">{homeAbbr} {homePrice}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
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
function SocialTableHR({ batters }: { batters: HrDashboardBatter[] }) {
  const rows = batters
    .filter((b) => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice().sort((a, b) => (b.adjustedHrScore ?? b.hrScore) - (a.adjustedHrScore ?? a.hrScore))
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
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #e05c2e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>🔥 MLB HR PROPS</div>
          <div style={{ color: "#38bdf8", fontSize: 11, marginTop: 2 }}>Top 8 Home Run Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#64748b" }}>joeknowsball.com</div>
      </div>
      
      {/* Mobile: 2 column layout (player info + score), stats below */}
      <div className="sm:hidden">
        {rows.map((r, i) => {
          const score = r.adjustedHrScore ?? r.hrScore;
          const pillStyle = sc(score);
          return (
            <div key={`${r.player}-${i}`} style={{ padding: "12px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `4px solid ${ACCENTS[i]}`, position: "relative" }}>
              {/* Header: rank + player */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: ACCENTS[i], minWidth: 24 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13, marginBottom: 2 }}>{r.player}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} />
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
          const score = r.adjustedHrScore ?? r.hrScore;
          const pillStyle = sc(score);
          return (
            <div key={`${r.player}-${i}`} style={{ display: "grid", gridTemplateColumns: "36px 1fr 88px 84px 84px 50px 50px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 6, position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ACCENTS[i] }} />
                  <span style={{ fontSize: i < 3 ? 18 : 15, fontWeight: 900, color: ACCENTS[i], paddingLeft: 6 }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 1 }}>
                    <span style={{ fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", fontSize: 13 }}>{r.player}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <TeamLogoBadge team={r.team} size={13} showLabel={false} />
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

function SocialTableK({ rows }: { rows: PitcherStrikeoutTeamRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
        Data Not Available
      </div>
    );
  }
  const top = rows.slice(0, 5);
  function sc(s: number) {
    if (s >= 70) return { bg: "#22c55e", color: "#fff" };
    if (s >= 65) return { bg: "#4ade80", color: "#000" };
    if (s >= 62) return { bg: "#facc15", color: "#000" };
    return { bg: "#fb923c", color: "#fff" };
  }
  const ACCENTS = ["#e05c2e","#f97316","#fb923c","#fbbf24","#eab308"];

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      <div style={{ background: "#0a1628", borderBottom: "3px solid #22c55e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>🎯 MLB K PROPS</div>
          <div style={{ color: "#86efac", fontSize: 11, marginTop: 2 }}>Top 5 Strikeout Edges · Today's Slate</div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#64748b" }}>joeknowsball.com</div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {top.map((r, i) => {
          const safeScore = typeof r.strikeoutMatchupScore === 'number' && isFinite(r.strikeoutMatchupScore) ? r.strikeoutMatchupScore : 0;
          const pillStyle = sc(safeScore);
          return (
            <div key={`${r.pitcher}-${i}`} style={{ padding: "12px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", borderLeft: `4px solid ${ACCENTS[i]}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: ACCENTS[i], minWidth: 24 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13, marginBottom: 2 }}>{r.pitcher}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} />
                    <span style={{ color: "#64748b" }}>vs {r.opponent}</span>
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
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 84px 72px 72px 68px", padding: "5px 10px", background: "#0d1f3c", gap: 4 }}>
          {["","PITCHER","K SCORE","K%","WHIFF%","OPP K%"].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: ".07em", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {top.map((r, i) => {
          const safeScore = typeof r.strikeoutMatchupScore === 'number' && isFinite(r.strikeoutMatchupScore) ? r.strikeoutMatchupScore : 0;
          const pillStyle = sc(safeScore);
          return (
            <div key={`${r.pitcher}-${i}`} style={{ display: "grid", gridTemplateColumns: "36px 1fr 84px 72px 72px 68px", padding: "7px 10px", background: i % 2 === 0 ? "#0d1e38" : "#091629", borderBottom: "1px solid #1e3a5f", alignItems: "center", gap: 4, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ACCENTS[i] }} />
              <span style={{ fontSize: i < 3 ? 18 : 15, fontWeight: 900, color: ACCENTS[i], paddingLeft: 6 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 1 }}>
                <span style={{ fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", fontSize: 13 }}>{r.pitcher}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}><TeamLogoBadge team={r.team} size={13} showLabel={false} /><span style={{ color: "#64748b", fontSize: 10 }}>vs {r.opponent}</span></div>
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
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#64748b" }}>joeknowsball.com</div>
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
                    <TeamLogoBadge team={r.team} size={13} showLabel={false} />
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
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}><TeamLogoBadge team={r.team} size={13} showLabel={false} /><span style={{ color: "#94a3b8", fontSize: 10 }}>vs {r.opposingPitcher}</span></div>
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

function getKRowsForSocial(strikeoutRows, strikeoutDetailRows, pitchers = [], batters = [], games = []) {
  if (strikeoutRows?.length) {
    return strikeoutRows.map(r => ({
      ...r,
      pitcherKRate: r.pitcherKRate ?? r.kRate ?? null,
      pitcherWhiffRate: r.pitcherWhiffRate ?? r.whiffRate ?? null,
      strikeoutMatchupScore: r.strikeoutMatchupScore ?? r.kMatchupScore ?? 0,
    }));
  }
  if (strikeoutDetailRows?.length) return strikeoutDetailRows;

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

function SocialTableML({
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
  function americanToImplied(american: string | null | undefined): number | null {
    if (!american) return null;
    const n = parseFloat(american);
    if (!isFinite(n)) return null;
    return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  }

  const rows = games
    .map((game) => {
      const detail = detailPreviews[game.gamePk];
      if (!detail) return null;
      const edge = computeModelEdge(detail);
      if (edge.pick === "push") return null;

      const pickAbbr = edge.pick === "away" ? game.away.abbreviation : game.home.abbreviation;
      const fadeAbbr = edge.pick === "away" ? game.home.abbreviation : game.away.abbreviation;
      const pickColors = getMlbTeamColors(pickAbbr);

      // Look up actual ML odds for this game
      const gameKey = `${game.away.abbreviation}@${game.home.abbreviation}`;
      const ml = mlbOdds?.moneylines?.[gameKey];
      const pickIsAway = edge.pick === "away";
      const pickOddsEntry = pickIsAway ? ml?.away : ml?.home;
      const fadeOddsEntry = pickIsAway ? ml?.home : ml?.away;
      const pickAmerican = pickOddsEntry?.american ?? null;
      const fadeAmerican = fadeOddsEntry?.american ?? null;

      // Value edge: model win probability vs market implied probability
      const modelProb = edge.confidence / 100;          // e.g. 0.57
      const marketImplied = americanToImplied(pickAmerican); // e.g. 0.67 for -200
      // Value = how much model beats the market. Positive = value, negative = market overprices pick
      const valueEdge = marketImplied != null
        ? Math.round((modelProb - marketImplied) * 100 * 10) / 10  // in percentage points
        : null; // null = no odds available, rank by confidence alone

      // Pitcher context
      const awayPitcherName = game.away.probablePitcher?.fullName || detail?.starters.away.name;
      const homePitcherName = game.home.probablePitcher?.fullName || detail?.starters.home.name;
      const awayReg = pitcherRegressionData.find(p => p.name === awayPitcherName);
      const homeReg = pitcherRegressionData.find(p => p.name === homePitcherName);
      const pickPitcherReg = pickIsAway ? awayReg : homeReg;
      const fadePitcherReg = pickIsAway ? homeReg : awayReg;
      let context = "";
      if (fadePitcherReg && fadePitcherReg.regressionScore < -2) context = `${fadeAbbr} pitcher overperforming`;
      else if (pickPitcherReg && pickPitcherReg.regressionScore > 2) context = `${pickAbbr} pitcher undervalued`;

      return {
        gamePk: game.gamePk,
        awayAbbr: game.away.abbreviation,
        homeAbbr: game.home.abbreviation,
        awayPitcher: awayPitcherName,
        homePitcher: homePitcherName,
        pickAbbr,
        fadeAbbr,
        pickColors,
        confidence: edge.confidence,
        pickAmerican,
        fadeAmerican,
        marketImplied,
        valueEdge,
        context,
        gameTime: formatGameTime(game.gameDate),
      };
    })
    .filter(Boolean)
    // Sort by value edge first (model beats market), then by confidence as tiebreaker
    // If no odds, sort by confidence only
    .sort((a, b) => {
      const va = a!.valueEdge;
      const vb = b!.valueEdge;
      if (va != null && vb != null) return vb - va;
      if (va != null) return -1; // odds-ranked rows above no-odds rows
      if (vb != null) return 1;
      return b!.confidence - a!.confidence;
    })
    .slice(0, 8) as NonNullable<ReturnType<typeof rows[0]>>[];

  const MEDALS = ["🥇", "🥈", "🥉"];
  const ACCENTS = ["#f97316", "#fb923c", "#fbbf24", "#facc15", "#a3e635", "#34d399", "#38bdf8", "#818cf8"];

  function valueColor(ve: number | null): { bg: string; text: string; label: string } {
    if (ve == null)  return { bg: "#475569", text: "#fff", label: "No line" };
    if (ve >= 10)    return { bg: "#16a34a", text: "#fff", label: `+${ve.toFixed(1)}% edge` };
    if (ve >= 4)     return { bg: "#22c55e", text: "#fff", label: `+${ve.toFixed(1)}% edge` };
    if (ve >= 0)     return { bg: "#facc15", text: "#000", label: `+${ve.toFixed(1)}%` };
    if (ve >= -5)    return { bg: "#f97316", text: "#fff", label: `${ve.toFixed(1)}%` };
    return           { bg: "#dc2626", text: "#fff", label: `${ve.toFixed(1)}% no val` };
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
        Model edge data not yet available. Check back after game previews load.
      </div>
    );
  }

  const hasOdds = rows.some(r => r.valueEdge != null);

  return (
    <div style={{ background: "#060d1a", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      {/* Header */}
      <div style={{ background: "#0a1628", borderBottom: "3px solid #3b82f6", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-.3px" }}>🏆 MLB ML EDGES</div>
          <div style={{ color: "#38bdf8", fontSize: 11, marginTop: 2 }}>
            {hasOdds ? "Sorted by Value vs. Market Line" : "Top Model Picks · Sorted by Confidence"}
          </div>
        </div>
        <div style={{ background: "#0d1e38", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#64748b" }}>joeknowsball.com</div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, padding: "6px 12px", background: "#091629", borderBottom: "1px solid #1e3a5f" }}>
        <div style={{ color: "#475569", fontSize: 10, fontWeight: 700 }}>#</div>
        <div style={{ color: "#475569", fontSize: 10, fontWeight: 700 }}>MATCHUP</div>
        <div style={{ color: "#475569", fontSize: 10, fontWeight: 700, textAlign: "right" }}>PICK · LINE · VALUE</div>
      </div>

      {/* Rows */}
      {rows.map((row, i) => {
        const vc = valueColor(row.valueEdge);
        return (
          <div
            key={row.gamePk}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr auto",
              gap: 8,
              padding: "10px 12px",
              background: i % 2 === 0 ? "#0d1e38" : "#091629",
              borderBottom: "1px solid #1e3a5f",
              borderLeft: `3px solid ${ACCENTS[i] ?? "#475569"}`,
              alignItems: "center",
            }}
          >
            {/* Rank */}
            <div style={{ fontWeight: 900, color: ACCENTS[i] ?? "#475569", fontSize: i < 3 ? 16 : 13, textAlign: "center" }}>
              {i < 3 ? MEDALS[i] : i + 1}
            </div>

            {/* Matchup */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <TeamLogoBadge team={row.awayAbbr} size={13} showLabel={false} />
                <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>{row.awayAbbr}</span>
                <span style={{ color: "#475569", fontSize: 10 }}>@</span>
                <TeamLogoBadge team={row.homeAbbr} size={13} showLabel={false} />
                <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>{row.homeAbbr}</span>
                <span style={{ color: "#475569", fontSize: 10, marginLeft: 2 }}>{row.gameTime}</span>
              </div>
              <div style={{ fontSize: 10, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.awayPitcher?.split(" ").pop()} vs {row.homePitcher?.split(" ").pop()}
                {row.context ? <span style={{ color: "#38bdf8", marginLeft: 4 }}>· {row.context}</span> : null}
              </div>
            </div>

            {/* Pick · ML price · Value edge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              {/* Team logo + actual ML price */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <TeamLogoBadge team={row.pickAbbr} size={18} showLabel={false} />
                <span style={{ color: "#e2e8f0", fontWeight: 900, fontSize: 12 }}>{row.pickAbbr}</span>
                {row.pickAmerican && (
                  <span style={{
                    background: "#0d1e38",
                    border: "1px solid #1e3a5f",
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontWeight: 800,
                    fontSize: 11,
                    color: row.pickAmerican.startsWith("+") ? "#34d399" : "#94a3b8",
                  }}>
                    {row.pickAmerican}
                  </span>
                )}
              </div>
              {/* Value edge badge */}
              <span style={{
                background: vc.bg,
                color: vc.text,
                borderRadius: 4,
                padding: "2px 7px",
                fontWeight: 700,
                fontSize: 10,
                whiteSpace: "nowrap",
              }}>
                {vc.label}
              </span>
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ padding: "8px 14px", background: "#091629", borderTop: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#475569" }}>
          {hasOdds ? "Value = model win% minus market implied%" : "Model: ERA · xFIP · xERA · K-BB% · Regression"}
        </span>
        <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>joeknowsball.com</span>
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
  const [activeTab, setActiveTab] = useState<"ml" | "hr" | "k" | "hits">("ml");

  if (loading) return null;

  const tabs: { key: "ml" | "hr" | "k" | "hits"; label: string; emoji: string }[] = [
    { key: "ml",   label: "ML Edges",  emoji: "🏆" },
    { key: "hr",   label: "HR Props",  emoji: "🔥" },
    { key: "k",    label: "K Props",   emoji: "🎯" },
    { key: "hits", label: "Hit Props", emoji: "⚔️" },
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
          {activeTab === "ml"   && <SocialTableML games={games} detailPreviews={detailPreviews} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} />}
          {activeTab === "hr"   && <SocialTableHR batters={batters} />}
          {activeTab === "k"    && (kRows.length ? <SocialTableK rows={kRows} /> : <div style={{ background: "#060d1a", borderRadius: 10, padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Data Not Available</div>)}
          {activeTab === "hits" && <SocialTableHits rows={batterVsPitcherRows} />}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Data refreshes at 3 AM · 10 AM · 1 PM ET</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/mlb/hr-props"          style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9", textDecoration: "none" }}>Open HR Props →</Link>
            <Link to="/mlb/strikeout-props"   style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textDecoration: "none" }}>K Props →</Link>
            <Link to="/mlb/batter-vs-pitcher" style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", textDecoration: "none" }}>Hit Props →</Link>
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
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  onOpenGame: (gamePk: number) => void;
  pitcherRegressionData: import("@/lib/mlb/mlbPitcherRegression").PitcherRegressionData[];
  regressionLoading: boolean;
}) {
  const {
    batters: propBatters,
    batterVsPitcherRows,
    pitchers: propPitchers,
    strikeoutRows,
    pendingGames,
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
      score: row.adjustedHrScore ?? row.hrScore,
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

  return (
    <div className="-mx-3 -my-3 bg-[#f8f9ff] lg:-mx-4 lg:-my-4">
      <div className="mx-auto flex max-w-[1280px] gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <MlbHubSidebar />

        <div className="min-w-0 flex-1 space-y-3">

          <MlbNavHero />

          <section id="props" className="space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Daily prop preview</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">Top model edges</div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <PropPreviewCard title="Top HR Props" rows={hrPreviewRows} to="/mlb/hr-props" theme="hr" />
              <PropPreviewCard title="Top K Props" rows={strikeoutPreviewRows} to="/mlb/strikeout-props" theme="k" />
              <PropPreviewCard title="Top Batter vs Pitcher" rows={bvpPreviewRows} to="/mlb/batter-vs-pitcher" theme="bvp" />
            </div>

            {pendingGames.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <span className="font-semibold">⏳ {pendingGames.length} game{pendingGames.length !== 1 ? "s" : ""} excluded</span>
                {" — starting pitchers not yet announced for: "}
                <span className="font-medium">{pendingGames.map((g: any) => g.matchup).join(", ")}</span>
                {nextRunAt ? (
                  <span className="ml-1 text-amber-600">· Check back after {nextRunAt.label} when the model refreshes.</span>
                ) : (
                  <span className="ml-1 text-amber-600">· These matchups may be added in a future model update.</span>
                )}
              </div>
            )}
          </section>

          <MlbSlateAnalyzer games={games} detailPreviews={detailPreviews} pitchers={propPitchers} onOpenGame={onOpenGame} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} />
          <MlbToolsGrid />
          <SocialMediaTablesSection games={games} detailPreviews={detailPreviews} pitcherRegressionData={pitcherRegressionData} mlbOdds={mlbOdds} />
          
          {/* Pitcher Regression Table */}
          <section className="space-y-3">
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
  const pitcherMetrics = detail ? getPitcherComparisonMetrics(detail) : [];
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
    <SiteShell>
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
          <HomeSchedule games={schedule} detailPreviews={detailPreviews} onOpenGame={openGame} pitcherRegressionData={PITCHER_REGRESSION_DATA} regressionLoading={regressionLoading} />
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
    </SiteShell>
  );
}



