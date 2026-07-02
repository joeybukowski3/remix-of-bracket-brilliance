/**
 * mlb-ml-detail-fetch.mjs
 *
 * Node port of the client-side data-fetching in buildGameDetail()
 * (src/pages/MlbGameDetail.tsx), scoped to ONLY the fields
 * computeModelEdge() actually reads (see mlb-ml-edge-core.mjs):
 *   - starters.{away,home}.{era, strikeOuts, inningsPitched, baseOnBalls,
 *     battersFaced, homeRuns}
 *   - opponentSplits.{awayBattingVsHomeStarter,homeBattingVsAwayStarter}.
 *     {ops, strikeOuts, plateAppearances}
 *   - lineupSummaries.{away,home}.{ops, slg, obp, kPct}
 *   - {away,home}Context.{lastFiveRecord, awayRecord, homeRecord}
 *   - game.{away,home}.{abbreviation, record}
 *
 * NOTE ON regressionScore: the live client-side computeModelEdge() reads
 * `starters.away/home.regressionScore`, but buildGameDetail() in
 * MlbGameDetail.tsx never actually sets that field -- it is always
 * undefined in production, so the "pitcher regression risk" adjustment
 * in the live model always contributes 0. This fetch module intentionally
 * mirrors that (does not set regressionScore) so archived picks match
 * live behavior exactly, bugs and all. This is a pre-existing behavior,
 * not something Phase 1 changes.
 *
 * Uses the same MLB StatsAPI endpoints and header patterns already used
 * in generate-mlb-hr-props.mjs / generate-mlb-pitcher-regression.mjs.
 * No new external dependency.
 */

const SEASON = new Date().getFullYear();
const TIMEOUT_MS = 12000;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.mlb.com/",
  "Origin": "https://www.mlb.com",
};

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBoxscore(gamePk) {
  return fetchJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
}

async function fetchPitcherSeasonStats(id) {
  if (!id) return null;
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=pitching`);
  return json?.stats?.[0]?.splits?.[0]?.stat || null;
}

async function fetchHitterSeasonStats(id) {
  if (!id) return null;
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=hitting`);
  return json?.stats?.[0]?.splits?.[0]?.stat || null;
}

async function fetchTeamHittingSplit(teamId, pitcherHand) {
  if (!teamId) return null;
  const sitCodes = String(pitcherHand || "R").toUpperCase().startsWith("L") ? "vl" : "vr";
  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${SEASON}&sitCodes=${sitCodes}`,
  );
  return json?.stats?.[0]?.splits?.[0]?.stat || null;
}

async function fetchTeamSeasonSchedule(teamId) {
  if (!teamId) return [];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&hydrate=linescore`);
  return (json?.dates || []).flatMap((d) => d.games || []);
}

function isCompletedGame(game) {
  return game?.status?.codedGameState === "F" || game?.status?.detailedState === "Final";
}

/** Mirrors summarizeTeamSchedule in MlbGameDetail.tsx (lastFiveRecord, homeRecord, awayRecord only -- seasonWrcPlus fields are not read by computeModelEdge). */
function summarizeTeamSchedule(games, teamId) {
  const completed = games
    .filter(isCompletedGame)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());

  const decorated = completed.map((game) => {
    const isHome = game?.teams?.home?.team?.id === teamId;
    const teamScore = isHome ? game?.teams?.home?.score : game?.teams?.away?.score;
    const oppScore = isHome ? game?.teams?.away?.score : game?.teams?.home?.score;
    return { isHome, win: Number(teamScore) > Number(oppScore) };
  });

  const lastFive = decorated.slice(-5);
  const lastFiveWins = lastFive.filter((g) => g.win).length;
  const homeGames = decorated.filter((g) => g.isHome);
  const awayGames = decorated.filter((g) => !g.isHome);

  return {
    lastFiveRecord: lastFive.length ? `${lastFiveWins}-${lastFive.length - lastFiveWins}` : "—",
    homeRecord: homeGames.length ? `${homeGames.filter((g) => g.win).length}-${homeGames.filter((g) => !g.win).length}` : "—",
    awayRecord: awayGames.length ? `${awayGames.filter((g) => g.win).length}-${awayGames.filter((g) => !g.win).length}` : "—",
  };
}

function extractLineupFromTeamBox(boxTeam) {
  if (!boxTeam) return [];
  const order = Array.isArray(boxTeam.battingOrder) ? boxTeam.battingOrder : [];
  const players = boxTeam.players || {};
  const lineup = [];

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
      .filter((p) => p?.battingOrder)
      .sort((a, b) => String(a.battingOrder).localeCompare(String(b.battingOrder)))
      .map((p) => p.person);
    for (const person of fallback) {
      if (!lineup.some((item) => item.id === person.id)) lineup.push(person);
      if (lineup.length === 9) break;
    }
  }

  return lineup.slice(0, 9);
}

async function fetchLastKnownLineup(teamId) {
  if (!teamId) return [];
  const games = await fetchTeamSeasonSchedule(teamId);
  const latestComplete = games
    .filter(isCompletedGame)
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())[0];
  if (!latestComplete?.gamePk) return [];
  const boxscore = await fetchBoxscore(latestComplete.gamePk);
  const teamSide = boxscore?.teams?.home?.team?.id === teamId ? boxscore?.teams?.home : boxscore?.teams?.away;
  return extractLineupFromTeamBox(teamSide);
}

function average(values) {
  const filtered = values.map(Number).filter((v) => Number.isFinite(v));
  return filtered.length ? filtered.reduce((sum, v) => sum + v, 0) / filtered.length : null;
}

/** Mirrors buildLineup in MlbGameDetail.tsx, returning only the summary (ops/slg/obp/kPct) computeModelEdge reads. */
async function buildLineupSummary(team, currentLineup) {
  const lineup = currentLineup.length ? currentLineup.slice(0, 9) : await fetchLastKnownLineup(team.id);
  const rows = [];
  for (const person of lineup.slice(0, 9)) {
    const hitting = await fetchHitterSeasonStats(person.id);
    rows.push({
      obp: hitting?.obp ?? null,
      slg: hitting?.slg ?? null,
      ops: hitting?.ops ?? null,
      kPct: hitting?.strikeOuts && hitting?.plateAppearances ? (hitting.strikeOuts / hitting.plateAppearances) * 100 : null,
    });
  }
  return {
    obp: average(rows.map((r) => r.obp)),
    slg: average(rows.map((r) => r.slg)),
    ops: average(rows.map((r) => r.ops)),
    kPct: average(rows.map((r) => r.kPct)),
  };
}

/**
 * @param {object} game  A normalized schedule game entry with
 *   { gamePk, away: { id, abbreviation, record, probablePitcher }, home: {...} }
 * @returns {Promise<object|null>} MlbGameDetail-shaped object (fields
 *   computeModelEdgeCore reads only), or null if required data is missing.
 */
export async function fetchMlGameDetail(game) {
  const homeStarterId = game.home.probablePitcher?.id || null;
  const awayStarterId = game.away.probablePitcher?.id || null;

  const boxscore = await fetchBoxscore(game.gamePk);
  const currentHomeLineup = extractLineupFromTeamBox(boxscore?.teams?.home);
  const currentAwayLineup = extractLineupFromTeamBox(boxscore?.teams?.away);

  const [
    homeScheduleGames, awayScheduleGames,
    homePitcherStat, awayPitcherStat,
    homePitcherPerson, awayPitcherPerson,
  ] = await Promise.all([
    fetchTeamSeasonSchedule(game.home.id),
    fetchTeamSeasonSchedule(game.away.id),
    fetchPitcherSeasonStats(homeStarterId),
    fetchPitcherSeasonStats(awayStarterId),
    homeStarterId ? fetchJson(`https://statsapi.mlb.com/api/v1/people/${homeStarterId}`) : null,
    awayStarterId ? fetchJson(`https://statsapi.mlb.com/api/v1/people/${awayStarterId}`) : null,
  ]);

  const homePitcherHand = homePitcherPerson?.people?.[0]?.pitchHand?.code || "R";
  const awayPitcherHand = awayPitcherPerson?.people?.[0]?.pitchHand?.code || "R";

  const [awayBattingVsHomeStarter, homeBattingVsAwayStarter, homeLineupSummary, awayLineupSummary] = await Promise.all([
    fetchTeamHittingSplit(game.away.id, homePitcherHand),
    fetchTeamHittingSplit(game.home.id, awayPitcherHand),
    buildLineupSummary(game.home, currentHomeLineup),
    buildLineupSummary(game.away, currentAwayLineup),
  ]);

  const homeContext = summarizeTeamSchedule(homeScheduleGames, game.home.id);
  const awayContext = summarizeTeamSchedule(awayScheduleGames, game.away.id);

  return {
    game: {
      away: { abbreviation: game.away.abbreviation, record: game.away.record },
      home: { abbreviation: game.home.abbreviation, record: game.home.record },
    },
    homeContext,
    awayContext,
    starters: {
      home: {
        era: homePitcherStat?.era ?? null,
        strikeOuts: homePitcherStat?.strikeOuts ?? null,
        inningsPitched: homePitcherStat?.inningsPitched ?? null,
        homeRuns: homePitcherStat?.homeRuns ?? null,
        battersFaced: homePitcherStat?.battersFaced ?? null,
        baseOnBalls: homePitcherStat?.baseOnBalls ?? null,
        // regressionScore intentionally omitted -- see file header note.
        // gamesStarted: Phase 2 addition -- already present in the raw
        // StatsAPI response (homePitcherStat), just not previously passed
        // through. Used ONLY by the Phase 2.1 projected-IP shadow model
        // (mlb-ml-projected-ip-shadow.mjs). computeModelEdgeCore() does
        // not read this field, so this is additive and does not change
        // any live output.
        gamesStarted: homePitcherStat?.gamesStarted ?? null,
      },
      away: {
        era: awayPitcherStat?.era ?? null,
        strikeOuts: awayPitcherStat?.strikeOuts ?? null,
        inningsPitched: awayPitcherStat?.inningsPitched ?? null,
        homeRuns: awayPitcherStat?.homeRuns ?? null,
        battersFaced: awayPitcherStat?.battersFaced ?? null,
        baseOnBalls: awayPitcherStat?.baseOnBalls ?? null,
        gamesStarted: awayPitcherStat?.gamesStarted ?? null,
      },
    },
    opponentSplits: {
      awayBattingVsHomeStarter: awayBattingVsHomeStarter
        ? { ops: awayBattingVsHomeStarter.ops ?? null, strikeOuts: awayBattingVsHomeStarter.strikeOuts ?? null, plateAppearances: awayBattingVsHomeStarter.plateAppearances ?? null }
        : null,
      homeBattingVsAwayStarter: homeBattingVsAwayStarter
        ? { ops: homeBattingVsAwayStarter.ops ?? null, strikeOuts: homeBattingVsAwayStarter.strikeOuts ?? null, plateAppearances: homeBattingVsAwayStarter.plateAppearances ?? null }
        : null,
    },
    lineupSummaries: {
      home: homeLineupSummary,
      away: awayLineupSummary,
    },
  };
}
