import { useEffect, useState } from "react";
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
import MlbTeamBadge from "@/components/mlb/MlbTeamBadge";
import MlbTeamOverviewPanel from "@/components/mlb/MlbTeamOverviewPanel";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import { getParkContextValues, getPitcherComparisonMetrics, getPropAngles, getSummaryCards } from "@/lib/mlb/mlbComparisonHelpers";
import { formatAvgLike, formatFactor, MLB_DASH } from "@/lib/mlb/mlbFormatters";
import { MLB_LEAGUE_AVERAGES } from "@/lib/mlb/mlbLeagueAverages";
import type { MlbComparisonMetric, MlbGameDetail, MlbLineupRow, MlbOpponentSplit, MlbRouteState, MlbScheduleGame } from "@/lib/mlb/mlbTypes";

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
      probablePitcher: game?.teams?.away?.probablePitcher || null,
    },
    home: {
      id: home.id ?? null,
      name: home.name || MLB_DASH,
      abbreviation: home.abbreviation || home.teamCode?.toUpperCase() || MLB_DASH,
      record: formatLeagueRecord(game?.teams?.home?.leagueRecord),
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

function HomeSchedule({
  games,
  onOpenGame,
}: {
  games: MlbScheduleGame[];
  onOpenGame: (gamePk: number) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-card p-6 shadow-[0_16px_36px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">MLB Dashboard</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              Matchup-first MLB intelligence for today&apos;s slate
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Open any game to compare team context, starting pitchers, lineup pressure points, handedness splits, park
              environment, and prop angles in one view.
            </p>
          </div>
          <MlbValuePill>Live from MLB StatsAPI</MlbValuePill>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today&apos;s slate</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{games.length} MLB matchups</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {games.map((game) => (
            <button
              key={game.gamePk}
              type="button"
              onClick={() => onOpenGame(game.gamePk)}
              className="rounded-[28px] bg-card p-5 text-left shadow-[0_12px_28px_hsl(var(--foreground)/0.05)] ring-1 ring-border/60 transition hover:bg-secondary/25"
            >
              <div className="flex items-center justify-between gap-3">
                <MlbValuePill>{game.status}</MlbValuePill>
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(game.gameDate))}
                </span>
              </div>
              <div className="mt-5 space-y-4">
                <MlbTeamBadge abbreviation={game.away.abbreviation} name={game.away.name} record={game.away.record} size={30} />
                <div className="pl-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">@</div>
                <MlbTeamBadge abbreviation={game.home.abbreviation} name={game.home.name} record={game.home.record} size={30} />
              </div>
              <div className="mt-5 rounded-2xl bg-secondary/45 p-4 text-sm text-muted-foreground">
                <div>{game.away.probablePitcher?.fullName || MLB_DASH} vs {game.home.probablePitcher?.fullName || MLB_DASH}</div>
                <div className="mt-1">{game.venue}</div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function MlbGameDetail() {
  const [routeState, setRouteState] = useState<MlbRouteState>(() => parseHash(window.location.hash));
  const [schedule, setSchedule] = useState<MlbScheduleGame[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MlbGameDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setRouteState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);

    loadSchedule()
      .then((games) => {
        if (cancelled) return;
        setSchedule(games);
        setScheduleLoading(false);
        games.forEach((game) => {
          void warmGameDetail(game.gamePk);
        });
      })
      .catch((error) => {
        if (cancelled) return;
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
  const awaySplitMetrics = detail ? buildSplitMetrics(detail.opponentSplits.awayBattingVsHomeStarter, "away-split") : [];
  const homeSplitMetrics = detail ? buildSplitMetrics(detail.opponentSplits.homeBattingVsAwayStarter, "home-split") : [];

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
          <HomeSchedule games={schedule} onOpenGame={openGame} />
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

            <MlbMatchupHero
              detail={detail}
              quickChips={[
                { label: parkContext?.parkType || "Neutral park" },
                { label: parkContext?.totalLean || "Neutral total" },
                { label: summaryCards[2]?.value || "Lineup edge", tone: "positive" },
                { label: summaryCards[5]?.value || "Strikeout environment" },
              ]}
            />

            <MlbMatchupSummaryRow cards={summaryCards} />

            <MlbSectionCard>
              <MlbSectionHeader
                eyebrow="Team context"
                title="Overall team snapshot"
                subtitle="Side-by-side record, short-form, venue split, and game-setting context before the deeper matchup layers."
              />
              <div className="mt-6">
                <MlbTeamOverviewPanel detail={detail} />
              </div>
            </MlbSectionCard>

            <MlbSectionCard>
              <MlbSectionHeader
                eyebrow="Starting pitchers"
                title="Pitcher edge at a glance"
                subtitle="Quick comparison across run prevention, traffic control, strikeout ceiling, walks, and home-run exposure."
              />
              <div className="mt-6">
                <MlbPitcherComparisonPanel
                  awayPitcher={detail.starters.away}
                  homePitcher={detail.starters.home}
                  metrics={pitcherMetrics}
                />
              </div>
            </MlbSectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <MlbSectionCard>
                <MlbSectionHeader
                  eyebrow="Pitcher vs lineup"
                  title={`${detail.starters.home.name} vs ${detail.game.away.abbreviation}`}
                  subtitle="How the home starter's profile collides with the opposing offense."
                />
                <div className="mt-6">
                  <MlbPitcherVsLineupPanel
                    title="Home starter vs away lineup"
                    pitcher={detail.starters.home}
                    lineupLabel={`${detail.game.away.name} split profile`}
                    split={detail.opponentSplits.awayBattingVsHomeStarter}
                    lineupSummary={detail.lineupSummaries.away}
                  />
                </div>
              </MlbSectionCard>

              <MlbSectionCard>
                <MlbSectionHeader
                  eyebrow="Pitcher vs lineup"
                  title={`${detail.starters.away.name} vs ${detail.game.home.abbreviation}`}
                  subtitle="Same comparison from the away starter's side of the game tree."
                />
                <div className="mt-6">
                  <MlbPitcherVsLineupPanel
                    title="Away starter vs home lineup"
                    pitcher={detail.starters.away}
                    lineupLabel={`${detail.game.home.name} split profile`}
                    split={detail.opponentSplits.homeBattingVsAwayStarter}
                    lineupSummary={detail.lineupSummaries.home}
                  />
                </div>
              </MlbSectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <MlbSectionCard>
                <MlbSectionHeader
                  eyebrow="Split performance"
                  title={`${detail.game.away.abbreviation} relevant split vs league`}
                  subtitle="Opposing lineup performance in the handedness matchup that matters for this start."
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

              <MlbSectionCard>
                <MlbSectionHeader
                  eyebrow="Split performance"
                  title={`${detail.game.home.abbreviation} relevant split vs league`}
                  subtitle="League-average anchors make it easier to spot where this lineup departs from baseline."
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

            <MlbSectionCard>
              <MlbSectionHeader
                eyebrow="Projected lineups"
                title="Order-by-order lineup comparison"
                subtitle="Cleaner scan of likely batting order, supporting contact rates, and side-by-side production markers."
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
                <MlbProjectedLineupPanel away={detail.lineups.away} home={detail.lineups.home} />
              </div>
            </MlbSectionCard>

            <MlbSectionCard>
              <MlbSectionHeader
                eyebrow="Park context"
                title="Environment and total-setting context"
                subtitle="Venue, weather, park factor baseline, and starter run-prevention context in one module."
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

            <MlbSectionCard>
              <MlbSectionHeader
                eyebrow="Betting angles"
                title="Data-backed prop and total setups"
                subtitle="Short cards tied directly to the comparison signals above instead of generic filler."
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
