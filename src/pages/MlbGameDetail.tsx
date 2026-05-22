import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CloudSun, Crosshair, Flame, Radar, Shield, Sparkles, Swords, Target, Wind } from "lucide-react";
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
import { ScorePill, TeamLogoBadge } from "@/pages/MlbHrProps";

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

  const game = findGame(gamePk);
  if (!game) throw new Error("Game not found for the current MLB slate.");

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

function formatSlateDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(value);
}

function formatGameTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function getPitcherSubline(detail: MlbGameDetail | undefined, side: "away" | "home") {
  const starter = detail?.starters?.[side];
  if (!starter) return `${MLB_DASH} • ${MLB_DASH}`;
  return `${starter.hand || MLB_DASH} • ${starter.record || MLB_DASH}`;
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

const ESPN_TEAM_ABBR_SLATE: Record<string, string> = {
  AZ: "ari", ATH: "oak", WSH: "wsh", CWS: "chw", KCR: "kc",
  SDP: "sd", SFG: "sf", TBR: "tb", NYY: "nyy", NYM: "nym",
  LAD: "lad", LAA: "laa", BOS: "bos", CHC: "chc", CIN: "cin",
  CLE: "cle", COL: "col", DET: "det", HOU: "hou", MIA: "mia",
  MIL: "mil", MIN: "min", PHI: "phi", PIT: "pit", SEA: "sea",
  STL: "stl", TEX: "tex", TOR: "tor", ATL: "atl", BAL: "bal",
};

function espnSlateLogoUrl(abbreviation: string) {
  const key = ESPN_TEAM_ABBR_SLATE[abbreviation] ?? abbreviation.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${key}.png`;
}

function SlateTeamLogo({ abbreviation, size = 40 }: { abbreviation: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const colors = getMlbTeamColors(abbreviation);
  if (failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.32 }}
      >
        {abbreviation.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={espnSlateLogoUrl(abbreviation)}
      alt={abbreviation}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function SlateEdgeRow({ detail, game }: { detail: MlbGameDetail | undefined; game: MlbScheduleGame }) {
  if (!detail) {
    return (
      <div className="border-t border-slate-100 px-4 py-2.5">
        <div className="text-[11px] text-slate-400">Loading edge data…</div>
      </div>
    );
  }
  const cards = getSummaryCards(detail);
  const pitchEdge = cards.find((c) => c.label === "Pitching Edge");
  const lineupEdge = cards.find((c) => c.label === "Lineup Edge");
  const totalLean = cards.find((c) => c.label === "Run Total Lean");

  const edges = [
    { label: "Pitch", value: pitchEdge?.value ?? "Neutral" },
    { label: "Lineup", value: lineupEdge?.value ?? "Neutral" },
    { label: "Total", value: totalLean?.value ?? "Neutral" },
  ];

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Overall Edge</div>
      <div className="flex gap-2">
        {edges.map((edge) => {
          const isAway = edge.value.toLowerCase().includes(game.away.abbreviation.toLowerCase());
          const isHome = edge.value.toLowerCase().includes(game.home.abbreviation.toLowerCase());
          const awayColors = getMlbTeamColors(game.away.abbreviation);
          const homeColors = getMlbTeamColors(game.home.abbreviation);
          const bg = isAway ? awayColors.primary : isHome ? homeColors.primary : "#94a3b8";
          return (
            <div
              key={edge.label}
              className="flex flex-1 flex-col items-center rounded-lg py-1.5 text-white"
              style={{ backgroundColor: bg }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">{edge.label}</span>
              <span className="text-[11px] font-bold leading-tight">{edge.value}</span>
            </div>
          );
        })}
      </div>
    </div>
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
  const [filter, setFilter] = useState<SlateFilter>("all");
  const { batters: propBatters, strikeoutRows } = useMlbPropsData();
  const topHrProps = useMemo(() => propBatters.slice().sort((a, b) => b.hrScore - a.hrScore).slice(0, 5), [propBatters]);
  const topStrikeoutProps = useMemo(() => strikeoutRows.slice(0, 5), [strikeoutRows]);

  const counts = useMemo(() => {
    const summary = { "in-progress": 0, "pre-game": 0, scheduled: 0, final: 0 };
    games.forEach((game) => { summary[getSlateStatusCategory(game.status)] += 1; });
    return summary;
  }, [games]);

  const filteredGames = useMemo(() => {
    if (filter === "all") return games;
    return games.filter((game) => getSlateStatusCategory(game.status) === filter);
  }, [filter, games]);

  const filterOptions: Array<{ key: SlateFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "in-progress", label: "Live" },
    { key: "pre-game", label: "Pre-Game" },
    { key: "scheduled", label: "Scheduled" },
    { key: "final", label: "Final" },
  ];

  return (
    <div className="space-y-6">
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1.2fr)_360px] xl:gap-5">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-4xl">
                Today&apos;s MLB Slate
              </h1>
              <div className="text-sm font-medium text-slate-500">{formatSlateDate(new Date())}</div>
            </div>
            <div className="mt-1.5 text-sm text-slate-500">
              {games.length} games · {counts["in-progress"]} live · {counts.scheduled + counts["pre-game"]} upcoming
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Starting pitcher matchups, park context, projected lineups, and game-level prop angles —{" "}
              <Link to="/mlb/hr-props" className="font-semibold text-sky-700 hover:underline">
                open the HR props board
              </Link>{" "}
              for individual player analysis.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/mlb/props" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Props Hub
              </Link>
              <Link to="/mlb/hr-props" className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
                HR Props
              </Link>
              <Link to="/mlb/strikeout-props" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                K Props
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <SportsbookBar />
          </div>
        </div>

        <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Daily prop preview</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">Top model edges</div>
            </div>
            <Link to="/mlb/props" className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              Hub
            </Link>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Top HR Props</div>
              <div className="space-y-1.5">
                {topHrProps.map((row) => (
                  <Link
                    key={`${row.player}-${row.team}`}
                    to="/mlb/hr-props"
                    className="grid grid-cols-[minmax(0,1fr)_50px] items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 hover:bg-sky-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900">
                        {row.player} <span className="text-slate-400">{row.position}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <TeamLogoBadge team={row.team} size={16} /> vs {row.opponent}
                      </div>
                    </div>
                    <ScorePill value={row.hrScore} />
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Top K Props</div>
              <div className="space-y-1.5">
                {topStrikeoutProps.map((row) => (
                  <Link
                    key={`${row.pitcher}-${row.team}`}
                    to="/mlb/strikeout-props"
                    className="grid grid-cols-[minmax(0,1fr)_50px] items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 hover:bg-sky-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900">{row.pitcher}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <TeamLogoBadge team={row.team} size={16} /> vs {row.opponent}
                      </div>
                    </div>
                    <ScorePill value={row.kMatchupScore} />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <Link to="/mlb/hr-props" className="rounded-xl bg-sky-700 px-3 py-2 text-center text-xs font-semibold text-white">
              HR Prop Model
            </Link>
            <Link to="/mlb/strikeout-props" className="rounded-xl bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">
              K Prop Model
            </Link>
            <Link to="/mlb/props" className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-700">
              Props Hub
            </Link>
          </div>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-2 rounded-[20px] border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                filter === option.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {option.label}
              {option.key !== "all" && counts[option.key as keyof typeof counts] > 0 && (
                <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                  filter === option.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                )}>
                  {counts[option.key as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            {filteredGames.length} of {games.length} games
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGames.map((game) => {
            const detail = detailPreviews[game.gamePk];
            const homeColors = getMlbTeamColors(game.home.abbreviation);
            const awayColors = getMlbTeamColors(game.away.abbreviation);
            const statusTheme = getStatusBadgeTheme(game.status);
            const statusCategory = getSlateStatusCategory(game.status);
            const awayScore = Number(game.away.score);
            const homeScore = Number(game.home.score);
            const showScore = (statusCategory === "in-progress" || statusCategory === "final")
              && Number.isFinite(awayScore)
              && Number.isFinite(homeScore);
            const awayWinning = showScore ? awayScore > homeScore : false;
            const homeWinning = showScore ? homeScore > awayScore : false;

            return (
              <button
                key={game.gamePk}
                type="button"
                onClick={() => onOpenGame(game.gamePk)}
                className="group cursor-pointer overflow-hidden rounded-[20px] border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${awayColors.primary}, ${homeColors.primary})` }} />

                <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: statusTheme.background, color: statusTheme.color }}
                  >
                    {game.status}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">{formatGameTime(game.gameDate)}</span>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 pb-3">
                  <div className="flex items-center gap-2.5">
                    <SlateTeamLogo abbreviation={game.away.abbreviation} size={36} />
                    <div className="min-w-0">
                      <div className={cn("truncate text-sm font-bold text-slate-900", awayWinning && "text-slate-900")}>
                        {game.away.name}
                      </div>
                      <div className={cn("text-[11px] text-slate-400", awayWinning && "font-semibold text-slate-700")}>
                        {game.away.record}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-[52px] text-center">
                    {showScore ? (
                      <div className="text-lg font-extrabold tracking-tight text-slate-900">
                        {awayScore}–{homeScore}
                      </div>
                    ) : (
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">@</div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2.5">
                    <div className="min-w-0 text-right">
                      <div className={cn("truncate text-sm font-bold text-slate-900", homeWinning && "text-slate-900")}>
                        {game.home.name}
                      </div>
                      <div className={cn("text-[11px] text-slate-400", homeWinning && "font-semibold text-slate-700")}>
                        {game.home.record}
                      </div>
                    </div>
                    <SlateTeamLogo abbreviation={game.home.abbreviation} size={36} />
                  </div>
                </div>

                <div className="border-t border-slate-100 px-4 py-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="truncate text-xs font-semibold text-slate-800">
                        {game.away.probablePitcher?.fullName || MLB_DASH}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{getPitcherSubline(detail, "away")}</div>
                    </div>
                    <div className="text-right">
                      <div className="truncate text-xs font-semibold text-slate-800">
                        {game.home.probablePitcher?.fullName || MLB_DASH}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{getPitcherSubline(detail, "home")}</div>
                    </div>
                  </div>
                </div>

                <SlateEdgeRow detail={detail} game={game} />

                <div className="px-4 pb-3 pt-1 text-[11px] text-slate-400">{game.venue}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
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
        setDetailError(error instanceof Error ? error.message : "Unable to load MLB matchup detail.");
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
          <div className="space-y-4 rounded-[32px] bg-card p-8 shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
            <div className="text-sm text-destructive">{detailError || "Matchup detail is unavailable."}</div>
            <button
              type="button"
              onClick={goHome}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Back to MLB slate
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

            <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary}>
              <MlbSectionHeader
                eyebrow="Team context"
                title="Overall team snapshot"
                subtitle="Side-by-side record, short-form, venue split, and game-setting context before the deeper matchup layers."
                icon={<Shield className="h-4 w-4" />}
              />
              <div className="mt-6">
                <MlbTeamOverviewPanel detail={detail} />
              </div>
            </MlbSectionCard>

            <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary}>
              <MlbSectionHeader
                eyebrow="Starting pitchers"
                title="Pitcher edge at a glance"
                subtitle="Quick comparison across run prevention, traffic control, strikeout ceiling, walks, and home-run exposure."
                icon={<Target className="h-4 w-4" />}
              />
              <div className="mt-6">
                <MlbPitcherComparisonPanel
                  awayPitcher={detail.starters.away}
                  homePitcher={detail.starters.home}
                  metrics={pitcherMetrics}
                  awayAbbreviation={detail.game.away.abbreviation}
                  homeAbbreviation={detail.game.home.abbreviation}
                />
              </div>
            </MlbSectionCard>

            <div className="grid gap-4 xl:grid-cols-2">
              <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary}>
                <MlbSectionHeader
                  eyebrow="Pitcher vs lineup"
                  title={`${detail.starters.home.name} vs ${detail.game.away.abbreviation}`}
                  subtitle="How the home starter's profile collides with the opposing offense, with matchup percentile ranks for the key edge stats."
                  icon={<Crosshair className="h-4 w-4" />}
                />
                <div className="mt-6">
                  <MlbPitcherVsLineupPanel
                    title="Home starter vs away lineup"
                    pitcher={detail.starters.home}
                    lineupLabel={`${detail.game.away.name} split profile`}
                    split={detail.opponentSplits.awayBattingVsHomeStarter}
                    lineupSummary={detail.lineupSummaries.away}
                    pitcherTeamAbbreviation={detail.game.home.abbreviation}
                    lineupTeamAbbreviation={detail.game.away.abbreviation}
                  />
                </div>
              </MlbSectionCard>

              <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary}>
                <MlbSectionHeader
                  eyebrow="Pitcher vs lineup"
                  title={`${detail.starters.away.name} vs ${detail.game.home.abbreviation}`}
                  subtitle="Same comparison from the away starter's side of the game tree, with matchup percentile ranks for the key edge stats."
                  icon={<Crosshair className="h-4 w-4" />}
                />
                <div className="mt-6">
                  <MlbPitcherVsLineupPanel
                    title="Away starter vs home lineup"
                    pitcher={detail.starters.away}
                    lineupLabel={`${detail.game.home.name} split profile`}
                    split={detail.opponentSplits.homeBattingVsAwayStarter}
                    lineupSummary={detail.lineupSummaries.home}
                    pitcherTeamAbbreviation={detail.game.away.abbreviation}
                    lineupTeamAbbreviation={detail.game.home.abbreviation}
                  />
                </div>
              </MlbSectionCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary}>
                <MlbSectionHeader
                  eyebrow="Split performance"
                  title={`${detail.game.away.abbreviation} relevant split vs league`}
                  subtitle="Opposing lineup performance in the handedness matchup that matters for this start."
                  icon={<Activity className="h-4 w-4" />}
                  rightSlot={<MlbValuePill>PA {detail.opponentSplits.awayBattingVsHomeStarter?.plateAppearances ?? MLB_DASH}</MlbValuePill>}
                />
                <div className="mt-6">
                  <MlbSplitComparisonPanel
                    context={`${detail.game.away.abbreviation} vs ${detail.starters.home.hand}`}
                    note={`${formatAvgLike(detail.opponentSplits.awayBattingVsHomeStarter?.ops)} OPS split`}
                    metrics={awaySplitMetrics}
                  />
                </div>
              </MlbSectionCard>

              <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary}>
                <MlbSectionHeader
                  eyebrow="Split performance"
                  title={`${detail.game.home.abbreviation} relevant split vs league`}
                  subtitle="League-average anchors make it easier to spot where this lineup departs from baseline."
                  icon={<Activity className="h-4 w-4" />}
                  rightSlot={<MlbValuePill>PA {detail.opponentSplits.homeBattingVsAwayStarter?.plateAppearances ?? MLB_DASH}</MlbValuePill>}
                />
                <div className="mt-6">
                  <MlbSplitComparisonPanel
                    context={`${detail.game.home.abbreviation} vs ${detail.starters.away.hand}`}
                    note={`${formatAvgLike(detail.opponentSplits.homeBattingVsAwayStarter?.ops)} OPS split`}
                    metrics={homeSplitMetrics}
                  />
                </div>
              </MlbSectionCard>
            </div>

            <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary}>
              <MlbSectionHeader
                eyebrow="Projected lineups"
                title="Order-by-order lineup comparison"
                subtitle="Cleaner scan of likely batting order, supporting contact rates, and side-by-side production markers."
                icon={<Swords className="h-4 w-4" />}
              />
              <div className="mt-6">
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-secondary/35 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {detail.game.away.name} lineup
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      AVG {formatAvgLike(detail.lineupSummaries.away.avg)} | OBP {formatAvgLike(detail.lineupSummaries.away.obp)} | SLG {formatAvgLike(detail.lineupSummaries.away.slg)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-secondary/35 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {detail.game.home.name} lineup
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      AVG {formatAvgLike(detail.lineupSummaries.home.avg)} | OBP {formatAvgLike(detail.lineupSummaries.home.obp)} | SLG {formatAvgLike(detail.lineupSummaries.home.slg)}
                    </div>
                  </div>
                </div>
                <MlbProjectedLineupPanel
                  away={detail.lineups.away}
                  home={detail.lineups.home}
                  awayTeamAbbreviation={detail.game.away.abbreviation}
                  homeTeamAbbreviation={detail.game.home.abbreviation}
                />
              </div>
            </MlbSectionCard>

            <MlbSectionCard accentColor={getMlbTeamColors(detail.game.home.abbreviation).primary}>
              <MlbSectionHeader
                eyebrow="Park context"
                title="Environment and total-setting context"
                subtitle="Venue, weather, park factor baseline, and starter run-prevention context in one module."
                icon={<CloudSun className="h-4 w-4" />}
              />
              <div className="mt-6">
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
                    {
                      key: "starter-era",
                      label: "Starter ERA",
                      leftValue: Number(detail.starters.away.era) || null,
                      rightValue: Number(detail.starters.home.era) || null,
                      leagueAverage: MLB_LEAGUE_AVERAGES.era,
                      format: "era",
                      scaleKey: "era",
                    },
                    {
                      key: "park-factors",
                      label: "Run / HR factor",
                      leftValue: parkContext?.runFactor || MLB_LEAGUE_AVERAGES.runsFactor,
                      rightValue: parkContext?.hrFactor || MLB_LEAGUE_AVERAGES.hrFactor,
                      leagueAverage: MLB_LEAGUE_AVERAGES.runsFactor,
                      format: "factor",
                      scaleKey: "factor",
                    },
                  ]}
                />
              </div>
            </MlbSectionCard>

            <MlbSectionCard accentColor={getMlbTeamColors(detail.game.away.abbreviation).primary}>
              <MlbSectionHeader
                eyebrow="Betting angles"
                title="Data-backed prop and total setups"
                subtitle="Short cards tied directly to the comparison signals above instead of generic filler."
                icon={<Sparkles className="h-4 w-4" />}
              />
              <div className="mt-6">
                <MlbPropAnglesPanel angles={propAngles} />
              </div>
            </MlbSectionCard>
          </>
        )}
      </MlbMatchupLayout>
    </SiteShell>
  );
}

