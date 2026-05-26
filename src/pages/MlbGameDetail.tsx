import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, CalendarDays, CloudSun, Crosshair, ExternalLink, Flame, Gauge, Radar, Rocket, Shield, Sparkles, Swords, Target, Wind } from "lucide-react";
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
import { computeK9, computePercent, formatAvgLike, formatFactor, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { MLB_LEAGUE_AVERAGES } from "@/lib/mlb/mlbLeagueAverages";
import { buildBreadcrumbSchema } from "@/lib/seo/pgaSeo";
import { getMlbTeamColors, getStatusBadgeTheme } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric, MlbGameDetail, MlbLineupRow, MlbOpponentSplit, MlbRouteState, MlbScheduleGame } from "@/lib/mlb/mlbTypes";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { ScorePill, HrDashboardPitcher } from "@/pages/MlbHrProps";

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
      note: "Model High Edges",
    }
    : theme === "k"
    ? {
      header: "bg-emerald-50 text-emerald-950",
      icon: "bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
      hover: "hover:bg-emerald-50",
      note: "Model Precision",
    }
    : {
      header: "bg-purple-50 text-purple-950",
      icon: "bg-purple-100 text-purple-700",
      label: "text-purple-700",
      hover: "hover:bg-purple-50",
      note: "Model Matchup",
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
              <div className="truncate">{row.team} vs {row.opponent}</div>
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
    <aside className="hidden w-56 shrink-0 self-start border-r border-slate-200 bg-[#eff4ff] py-4 lg:sticky lg:top-24 lg:block">
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
    </aside>
  );
}

function MlbHubHero() {
  const heroTiles = [
    { label: "HR Props", to: "/mlb/hr-props", bg: "bg-sky-500 hover:bg-sky-600", icon: <Flame className="h-3.5 w-3.5" /> },
    { label: "K Props", to: "/mlb/strikeout-props", bg: "bg-emerald-500 hover:bg-emerald-600", icon: <Radar className="h-3.5 w-3.5" /> },
    { label: "Game Matchups", to: "/mlb#schedule", bg: "bg-amber-500 hover:bg-amber-600", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  ];

  return (
    <section className="flex items-center gap-4 rounded-xl bg-[#1a2b4b] px-5 py-4 shadow-sm">
      <img src="/logos/mlb.svg" alt="MLB" className="h-10 w-auto shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300/80">MLB Hub</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {heroTiles.map((tile) => (
            <Link
              key={tile.label}
              to={tile.to}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-extrabold text-white transition", tile.bg)}
            >
              {tile.icon}
              {tile.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
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
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  pitchers: HrDashboardPitcher[];
  onOpenGame: (gamePk: number) => void;
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[86px_minmax(0,1.7fr)_minmax(120px,0.75fr)_minmax(120px,0.75fr)_minmax(110px,0.55fr)] border-b border-slate-200 bg-[#eff4ff] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:grid">
          <div>Status</div>
          <div>Matchup / Pitchers</div>
          <div className="text-center">Lineup</div>
          <div className="text-center">Pitching</div>
          <div className="text-center">Total</div>
        </div>
        <div>
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
                  "grid w-full gap-2 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-[#eff4ff]",
                  "lg:grid-cols-[86px_minmax(0,1.7fr)_minmax(120px,0.75fr)_minmax(120px,0.75fr)_minmax(110px,0.55fr)] lg:items-center",
                  index % 2 === 1 && "bg-slate-50/55",
                )}
              >
                <div className="flex items-center justify-between gap-2 lg:block">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ backgroundColor: statusTheme.background, color: statusTheme.color }}
                  >
                    {game.status}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 lg:mt-1.5 lg:block">{formatGameTime(game.gameDate)}</span>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <MlbTeamLogo team={game.away.abbreviation} size={18} />
                      <span className="w-8 shrink-0 text-[11px] font-extrabold text-slate-950">{game.away.abbreviation}</span>
                      <span className="text-[10px] font-semibold text-slate-400">{game.away.record}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-[#031635]">
                        {game.away.probablePitcher?.fullName || MLB_DASH}
                      </span>
                      {detail?.starters.away.record && (
                        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{detail.starters.away.record}</span>
                      )}
                      {getPitcherXera(detail?.starters.away.id) !== null && (
                        <span className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">{getPitcherXera(detail?.starters.away.id)!.toFixed(2)} xERA</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <MlbTeamLogo team={game.home.abbreviation} size={18} />
                      <span className="w-8 shrink-0 text-[11px] font-extrabold text-slate-950">{game.home.abbreviation}</span>
                      <span className="text-[10px] font-semibold text-slate-400">{game.home.record}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-[#031635]">
                        {game.home.probablePitcher?.fullName || MLB_DASH}
                      </span>
                      {detail?.starters.home.record && (
                        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{detail.starters.home.record}</span>
                      )}
                      {getPitcherXera(detail?.starters.home.id) !== null && (
                        <span className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">{getPitcherXera(detail?.starters.home.id)!.toFixed(2)} xERA</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-0.5 text-[10px] font-semibold uppercase text-slate-400">
                    <span>{game.venue}</span>
                    {showScore ? <span>{awayScore}-{homeScore}</span> : null}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-1.5 lg:hidden">
                  <div className="text-center text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Lineup</div>
                  <div className="text-center text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Pitching</div>
                  <div className="text-center text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Total</div>
                </div>

                <div className="grid grid-cols-3 gap-2 lg:contents">
                  <div className="flex justify-center">
                    <span className="rounded-md bg-sky-50 px-2 py-1 text-[10px] font-extrabold text-sky-700">{edges.lineup}</span>
                  </div>
                  <div className="flex justify-center">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700">{edges.pitching}</span>
                  </div>
                  <div className="flex justify-center">
                    <span className="rounded-full bg-[#031635] px-3 py-1 text-[10px] font-extrabold text-white">{edges.total}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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

function HomeSchedule({
  games,
  detailPreviews,
  onOpenGame,
}: {
  games: MlbScheduleGame[];
  detailPreviews: Record<number, MlbGameDetail>;
  onOpenGame: (gamePk: number) => void;
}) {
  const {
    batters: propBatters,
    batterVsPitcherRows,
    pitchers: propPitchers,
    strikeoutRows,
  } = useMlbPropsData();
  const topHrProps = useMemo(() => propBatters.slice().sort((a, b) => b.hrScore - a.hrScore).slice(0, 5), [propBatters]);
  const topStrikeoutProps = useMemo(() => strikeoutRows.slice(0, 5), [strikeoutRows]);
  const topBvpProps = useMemo(() => batterVsPitcherRows.slice(0, 5), [batterVsPitcherRows]);
  const hrPreviewRows = useMemo<PropPreviewRow[]>(
    () => topHrProps.map((row) => ({
      key: `${row.player}-${row.team}`,
      player: row.player,
      position: row.position,
      team: row.team,
      opponent: row.opponent,
      score: row.hrScore,
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
      score: row.hrTargetScore,
    })),
    [topBvpProps],
  );

  return (
    <div className="-mx-3 -my-3 bg-[#f8f9ff] lg:-mx-4 lg:-my-4">
      <div className="mx-auto flex max-w-[1280px] gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <MlbHubSidebar />

        <div className="min-w-0 flex-1 space-y-3">
          <nav className="flex flex-wrap gap-2 lg:hidden">
            {MLB_HUB_LINKS.slice(0, 4).map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <MlbHubHero />
          <HubSportsbookStrip />

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
          </section>

          <MlbSlateAnalyzer games={games} detailPreviews={detailPreviews} pitchers={propPitchers} onOpenGame={onOpenGame} />
          <MlbToolsGrid />
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
          <HomeSchedule games={schedule} detailPreviews={detailPreviews} onOpenGame={openGame} />
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

            {/* Row 1: Team Overview | Pitcher Comparison | Park Context */}
            <div className="grid gap-3 lg:grid-cols-3">
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
            </div>

            {/* Row 2: Combined Pitcher vs Lineup */}
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

            {/* Row 3: Combined Split Performance */}
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

            {/* Row 4: Lineup (wide) + Betting Angles (narrow) */}
            <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
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

              <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary} collapsible title="Prop Angles">
                <MlbSectionHeader eyebrow="Betting" title="Prop Angles" icon={<Sparkles className="h-3.5 w-3.5" />} />
                <div className="mt-2">
                  <MlbPropAnglesPanel angles={propAngles} />
                </div>
              </MlbSectionCard>
            </div>
          </>
        )}
      </MlbMatchupLayout>
    </SiteShell>
  );
}



