/**
 * generate-mlb-power-rankings.mjs
 *
 * Generates MLB team power rankings composite score from:
 *   - ERA / FIP (lower is better, proxies for xERA/xFIP)
 *   - xBA, OPS, wRC+ (from existing team-wrc-plus.json + MLB Stats API)
 *   - Run differential per game (from MLB standings API)
 *   - Schedule-adjusted performance (win% vs expectation)
 *   - SOS: current, next-30, rest-of-season
 *
 * Writes: public/data/mlb/power-rankings.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "power-rankings.json");
const SEASON = new Date().getFullYear();

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.mlb.com/",
};

// Weights must sum to 1.0
export const WEIGHTS = {
  era:                    0.18,
  fip:                    0.12,
  xba:                    0.10,
  ops:                    0.13,
  wrcPlus:                0.12,
  runDifferential:        0.20,
  scheduleAdjPerformance: 0.15,
};

const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a,b)=>a+b,0);
if (Math.abs(WEIGHT_SUM - 1.0) > 0.001) throw new Error(`Weights sum to ${WEIGHT_SUM}`);

const MLB_TEAM_IDS = new Set([
  108,109,110,111,112,113,114,115,116,117,118,119,120,121,
  133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,158,
]);

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function safeNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function getEtDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00-05:00");
  d.setDate(d.getDate() + n);
  return getEtDate(d);
}

export function normalize(values, lowerIsBetter = false) {
  const valid = values.filter(v => v != null && Number.isFinite(v));
  if (valid.length < 2) return values.map(() => null);
  const sorted = [...valid].sort((a,b) => a-b);
  const p5  = sorted[Math.max(0, Math.floor(sorted.length * 0.05))];
  const p95 = sorted[Math.min(sorted.length-1, Math.floor(sorted.length * 0.95))];
  if (p95 === p5) return values.map(v => v != null ? 50 : null);
  return values.map(v => {
    if (v == null || !Number.isFinite(v)) return null;
    const clamped = Math.max(p5, Math.min(p95, v));
    const raw = (clamped - p5) / (p95 - p5) * 100;
    return parseFloat((lowerIsBetter ? 100 - raw : raw).toFixed(1));
  });
}

export function composite(normArrays, weights, idx) {
  let wSum = 0, totalW = 0, present = 0;
  const total = Object.keys(weights).length;
  for (const [key, w] of Object.entries(weights)) {
    const val = normArrays[key]?.[idx];
    if (val != null && Number.isFinite(val)) { wSum += w * val; totalW += w; present++; }
  }
  if (present / total < 5/7 || totalW <= 0) return null;
  return parseFloat(Math.min(100, Math.max(0, wSum / totalW)).toFixed(1));
}

export function rankOf(values, idx, lowerBetter = false) {
  const arr = values.map((v,i) => ({v: v ?? (lowerBetter ? Infinity : -Infinity), i}));
  arr.sort((a,b) => lowerBetter ? a.v-b.v : b.v-a.v);
  return arr.findIndex(x => x.i === idx) + 1;
}

function metricDetail(value, normArr, idx, rank) {
  return {
    value: value != null ? parseFloat(Number(value).toFixed(3)) : null,
    rank: rank ?? null,
    normalizedScore: normArr?.[idx] ?? null,
  };
}

async function main() {
  const now = new Date();
  const todayEt   = getEtDate(now);
  const ago30     = addDays(todayEt, -30);
  const next30End = addDays(todayEt, 30);
  const seasonEnd = `${SEASON}-09-28`;
  const julyStart = `${SEASON}-07-01`;
  const julyEnd   = `${SEASON}-07-31`;

  console.log(`[power-rankings] ${todayEt} season=${SEASON}`);

  // 1. Teams
  const teamsJson = await fetchJson(
    `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}&activeStatus=Active`
  );
  const teams = (teamsJson.teams || [])
    .filter(t => MLB_TEAM_IDS.has(t.id))
    .map(t => ({
      id: t.id,
      abbreviation: t.abbreviation,
      name: t.teamName,
      league: t.league?.name ?? "",
      division: t.division?.name ?? "",
      leagueId: t.league?.id,
      divisionId: t.division?.id,
    }));
  console.log(`[power-rankings] ${teams.length} teams`);

  // 2. Standings
  const stdJson = await fetchJson(
    `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${SEASON}&standingsTypes=regularSeason`
  );
  const standings = new Map();
  for (const div of stdJson.records ?? []) {
    for (const tr of div.teamRecords ?? []) {
      const id = tr.team?.id;
      if (id) standings.set(id, {
        wins: tr.wins ?? 0, losses: tr.losses ?? 0,
        gamesPlayed: (tr.wins??0)+(tr.losses??0),
        runDifferential: safeNum(tr.runDifferential),
        runsScored: safeNum(tr.runsScored),
        runsAllowed: safeNum(tr.runsAllowed),
        winPct: safeNum(tr.winningPercentage),
      });
    }
  }

  // 3. Load team-wrc-plus.json
  const wrcPath = path.join(DATA_DIR, "team-wrc-plus.json");
  let wrcTeams = [];
  if (existsSync(wrcPath)) {
    try { wrcTeams = JSON.parse(readFileSync(wrcPath,"utf8")).teams ?? []; } catch {}
  }
  const wrcById   = new Map(wrcTeams.map(t => [t.id, t]));
  const wrcByAbbr = new Map(wrcTeams.map(t => [t.abbreviation, t]));

  // 4. Team pitching
  console.log("[power-rankings] Fetching pitching…");
  const pitching = new Map();
  for (const team of teams) {
    try {
      const json = await fetchJson(
        `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=season&group=pitching&season=${SEASON}`
      );
      const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
      if (!stat) continue;
      const hr = safeNum(stat.homeRuns)??0, bb = safeNum(stat.baseOnBalls)??0;
      const k = safeNum(stat.strikeOuts)??0, hbp = safeNum(stat.hitByPitch)??0;
      const era = safeNum(stat.era);
      const [wh, wf="0"] = String(stat.inningsPitched??"0").split(".");
      const ip = parseInt(wh) + parseInt(wf)/3;
      const fip = ip > 10 ? parseFloat(((13*hr+3*(bb+hbp)-2*k)/ip+3.10).toFixed(2)) : null;
      pitching.set(team.id, { era, fip, whip: safeNum(stat.whip) });
    } catch(e) { console.warn(`  Pit ${team.abbreviation}: ${e.message}`); }
  }

  // 5. Season batting
  console.log("[power-rankings] Fetching season batting…");
  const batting = new Map();
  for (const team of teams) {
    try {
      const json = await fetchJson(
        `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=season&group=hitting&season=${SEASON}`
      );
      const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
      if (stat) batting.set(team.id, { ops: safeNum(stat.ops), avg: safeNum(stat.avg) });
    } catch(e) { console.warn(`  Bat ${team.abbreviation}: ${e.message}`); }
  }

  // 6. Last-30 batting
  console.log("[power-rankings] Fetching last-30 batting…");
  const bat30 = new Map();
  for (const team of teams) {
    try {
      const json = await fetchJson(
        `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${ago30}&endDate=${todayEt}`
      );
      const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
      if (stat) bat30.set(team.id, { ops: safeNum(stat.ops), avg: safeNum(stat.avg) });
    } catch(e) { console.warn(`  Bat30 ${team.abbreviation}: ${e.message}`); }
  }

  // 7. Last-30 results
  console.log("[power-rankings] Fetching last-30 results…");
  const res30 = new Map();
  for (const team of teams) {
    try {
      const json = await fetchJson(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${team.id}&startDate=${ago30}&endDate=${todayEt}&season=${SEASON}&gameType=R&hydrate=linescore`
      );
      let w=0, l=0, rs=0, ra=0;
      for (const dateObj of json.dates??[]) {
        for (const game of dateObj.games??[]) {
          if (game.status?.abstractGameState !== "Final") continue;
          const ls = game.linescore; if (!ls) continue;
          const isHome = game.teams?.home?.team?.id === team.id;
          const my  = isHome ? (ls.teams?.home?.runs??0) : (ls.teams?.away?.runs??0);
          const opp = isHome ? (ls.teams?.away?.runs??0) : (ls.teams?.home?.runs??0);
          rs+=my; ra+=opp;
          if (my>opp) w++; else if (opp>my) l++;
        }
      }
      const gp=w+l;
      res30.set(team.id, { wins:w, losses:l, gamesPlayed:gp,
        runDifferential:rs-ra, rdPerGame: gp>0?(rs-ra)/gp:null, winPct: gp>0?w/gp:null });
    } catch(e) { console.warn(`  Res30 ${team.abbreviation}: ${e.message}`); }
  }

  // 8. Future schedule
  console.log("[power-rankings] Fetching future schedule…");
  let futSched = { dates: [] };
  try {
    futSched = await fetchJson(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${todayEt}&endDate=${seasonEnd}&season=${SEASON}&gameType=R&hydrate=team`
    );
  } catch(e) { console.warn(`  Future sched: ${e.message}`); }

  const futureGames = new Map(teams.map(t => [t.id, []]));
  for (const dateObj of futSched.dates ?? []) {
    const gameDate = dateObj.date;
    for (const game of dateObj.games ?? []) {
      if (game.status?.abstractGameState === "Final") continue;
      const detail = game.status?.detailedState ?? "";
      if (["Postponed","Cancelled","Suspended"].includes(detail)) continue;
      if (game.gameType !== "R") continue;
      const homeId = game.teams?.home?.team?.id;
      const awayId = game.teams?.away?.team?.id;
      if (!homeId || !awayId || homeId === awayId) continue;
      const homeAbbr = game.teams?.home?.team?.abbreviation ?? "?";
      const awayAbbr = game.teams?.away?.team?.abbreviation ?? "?";
      if (futureGames.has(homeId)) futureGames.get(homeId).push({ date:gameDate, opponentId:awayId, opponentAbbr:awayAbbr, home:true, gamePk:game.gamePk });
      if (futureGames.has(awayId)) futureGames.get(awayId).push({ date:gameDate, opponentId:homeId, opponentAbbr:homeAbbr, home:false, gamePk:game.gamePk });
    }
  }

  // Dedup by gamePk
  for (const [id, games] of futureGames) {
    const seen = new Set();
    futureGames.set(id, games.filter(g => { if (seen.has(g.gamePk)) return false; seen.add(g.gamePk); return true; }));
  }

  const next30GameMap = new Map(teams.map(t => [t.id, (futureGames.get(t.id)??[]).filter(g => g.date <= next30End)]));
  const rosGameMap    = new Map(teams.map(t => [t.id, futureGames.get(t.id)??[]]));

  // 9. Build season metric arrays
  const teamData = teams.map(team => {
    const std = standings.get(team.id) ?? {};
    const pit = pitching.get(team.id) ?? {};
    const bat = batting.get(team.id) ?? {};
    const wrc = wrcById.get(team.id) ?? wrcByAbbr.get(team.abbreviation) ?? {};
    const gp  = std.gamesPlayed ?? 0;
    return {
      team,
      season: {
        era: pit.era??null, fip: pit.fip??null,
        xba: wrc.seasonXba??null, ops: bat.ops??null, wrcPlus: wrc.seasonWrcPlus??null,
        rdPerGame: gp>0 && std.runDifferential!=null ? std.runDifferential/gp : null,
        winPct: std.winPct??null, wins: std.wins??null, losses: std.losses??null,
        gamesPlayed: gp, runDifferential: std.runDifferential??null,
        runsScored: std.runsScored??null, runsAllowed: std.runsAllowed??null,
      },
      last30: {
        era: pit.era??null, fip: pit.fip??null,
        ops: bat30.get(team.id)?.ops??null, xba: bat30.get(team.id)?.avg??null,
        wrcPlus: wrc.recentWrcPlus??null,
        rdPerGame: res30.get(team.id)?.rdPerGame??null,
        winPct: res30.get(team.id)?.winPct??null,
        gamesPlayed: res30.get(team.id)?.gamesPlayed??0,
        runDifferential: res30.get(team.id)?.runDifferential??null,
      },
    };
  });

  // 10. Normalize season metrics (pass 1)
  const snorm = {
    era:             normalize(teamData.map(t=>t.season.era),      true),
    fip:             normalize(teamData.map(t=>t.season.fip),      true),
    xba:             normalize(teamData.map(t=>t.season.xba),      false),
    ops:             normalize(teamData.map(t=>t.season.ops),      false),
    wrcPlus:         normalize(teamData.map(t=>t.season.wrcPlus),  false),
    runDifferential: normalize(teamData.map(t=>t.season.rdPerGame),false),
    scheduleAdjPerformance: teamData.map(()=>50),
  };

  const pass1 = teamData.map((_,i) => composite(snorm, WEIGHTS, i) ?? 50);
  const lgAvg = pass1.reduce((a,b)=>a+b,0)/pass1.length;

  // 11. Schedule-adjusted performance
  const schedAdj = teamData.map((t,i) => {
    if (!t.season.winPct || t.season.gamesPlayed < 15) return null;
    const expected = 0.5 + (pass1[i] - lgAvg) / 200;
    return parseFloat(((t.season.winPct - expected)*100).toFixed(2));
  });
  const schedAdj30 = teamData.map((t,i) => {
    if (!t.last30.winPct || t.last30.gamesPlayed < 5) return null;
    const expected = 0.5 + (pass1[i] - lgAvg) / 200;
    return parseFloat(((t.last30.winPct - expected)*100).toFixed(2));
  });

  // 12. Final season normalization + composites
  snorm.scheduleAdjPerformance = normalize(schedAdj, false);
  const seasonComposites = teamData.map((_,i) => composite(snorm, WEIGHTS, i));

  // 13. Last-30 normalization + shrinkage
  const lnorm = {
    era:             snorm.era, fip: snorm.fip,
    xba:             normalize(teamData.map(t=>t.last30.xba),    false),
    ops:             normalize(teamData.map(t=>t.last30.ops),    false),
    wrcPlus:         normalize(teamData.map(t=>t.last30.wrcPlus),false),
    runDifferential: normalize(teamData.map(t=>t.last30.rdPerGame),false),
    scheduleAdjPerformance: normalize(schedAdj30, false),
  };
  const rawL30 = teamData.map((_,i) => composite(lnorm, WEIGHTS, i));
  const SHRINK = 10;
  const last30Composites = rawL30.map((raw,i) => {
    if (raw == null) return null;
    const gp = teamData[i].last30.gamesPlayed;
    if (gp >= SHRINK) return raw;
    const season = seasonComposites[i] ?? 50;
    return parseFloat((gp/SHRINK*raw + (1-gp/SHRINK)*season).toFixed(1));
  });

  // 14. Rankings
  const makeRankMap = comps => {
    const idx = comps.map((v,i)=>({i,v:v??-1})).sort((a,b)=>b.v-a.v);
    return new Map(idx.map((x,r)=>[x.i,r+1]));
  };
  const seasonRankMap = makeRankMap(seasonComposites);
  const l30RankMap    = makeRankMap(last30Composites);

  // 15. SOS
  const compById = new Map(teams.map((t,i)=>[t.id, seasonComposites[i]??50]));

  const currentSos = teamData.map((_,i) => {
    const others = seasonComposites.filter((_,j)=>j!==i).filter(v=>v!=null);
    return others.length>0 ? parseFloat((others.reduce((a,b)=>a+b,0)/others.length).toFixed(1)) : 50;
  });

  const calcSos = games => {
    if (!games?.length) return null;
    const total = games.reduce((s,g)=>s+(compById.get(g.opponentId)??50),0);
    return parseFloat((total/games.length).toFixed(1));
  };

  const next30Sos = teamData.map(t => calcSos(next30GameMap.get(t.team.id)));
  const rosSos    = teamData.map(t => calcSos(rosGameMap.get(t.team.id)));

  const sosRankMap = arr => {
    const indexed = arr.map((v,i)=>({i,v:v??-1})).sort((a,b)=>b.v-a.v);
    return new Map(indexed.map((x,r)=>[x.i,r+1]));
  };
  const curSosRM  = sosRankMap(currentSos);
  const n30SosRM  = sosRankMap(next30Sos);
  const rosSosRM  = sosRankMap(rosSos);

  // 16. Build output
  const eraV=teamData.map(t=>t.season.era), fipV=teamData.map(t=>t.season.fip);
  const xbaV=teamData.map(t=>t.season.xba), opsV=teamData.map(t=>t.season.ops);
  const wrcV=teamData.map(t=>t.season.wrcPlus), rdV=teamData.map(t=>t.season.rdPerGame);

  const output = {
    generatedAt: now.toISOString(),
    season: SEASON,
    modelVersion: "mlb-power-rankings-v1",
    weights: WEIGHTS,
    teamsCount: teamData.length,
    teams: teamData.map((t,i) => {
      const s=t.season, l=t.last30;
      const n30=next30GameMap.get(t.team.id)??[];
      const ros=rosGameMap.get(t.team.id)??[];
      const nextMonthGames=(futureGames.get(t.team.id)??[])
        .filter(g=>g.date>=julyStart&&g.date<=julyEnd)
        .map(g=>({date:g.date,opponent:g.opponentAbbr,opponentId:g.opponentId,home:g.home}));

      return {
        team: t.team.abbreviation,
        teamName: t.team.name,
        teamId: t.team.id,
        league: t.team.league, division: t.team.division,
        leagueId: t.team.leagueId, divisionId: t.team.divisionId,
        seasonRank: seasonRankMap.get(i)??null,
        seasonCompositeScore: seasonComposites[i],
        last30Rank: l30RankMap.get(i)??null,
        last30CompositeScore: last30Composites[i],
        record: s.wins!=null&&s.losses!=null ? `${s.wins}-${s.losses}` : null,
        gamesPlayed: s.gamesPlayed,
        runDifferential: s.runDifferential,
        currentSos: currentSos[i],
        currentSosRank: curSosRM.get(i)??null,
        next30Sos: next30Sos[i],
        next30SosRank: n30SosRM.get(i)??null,
        next30GamesCount: n30.length,
        restOfSeasonSos: rosSos[i],
        restOfSeasonSosRank: rosSosRM.get(i)??null,
        restOfSeasonGamesCount: ros.length,
        seasonMetrics: {
          era:                    metricDetail(s.era,      snorm.era,      i, rankOf(eraV,i,true)),
          fip:                    metricDetail(s.fip,      snorm.fip,      i, rankOf(fipV,i,true)),
          xba:                    metricDetail(s.xba,      snorm.xba,      i, rankOf(xbaV,i,false)),
          ops:                    metricDetail(s.ops,      snorm.ops,      i, rankOf(opsV,i,false)),
          wrcPlus:                metricDetail(s.wrcPlus,  snorm.wrcPlus,  i, rankOf(wrcV,i,false)),
          runDifferential:        metricDetail(s.rdPerGame,snorm.runDifferential,i, rankOf(rdV,i,false)),
          scheduleAdjPerformance: metricDetail(schedAdj[i],snorm.scheduleAdjPerformance,i, rankOf(schedAdj,i,false)),
        },
        last30Metrics: {
          era:                    metricDetail(l.era,    lnorm.era,    i, null),
          fip:                    metricDetail(l.fip,    lnorm.fip,    i, null),
          xba:                    metricDetail(l.xba,    lnorm.xba,    i, null),
          ops:                    metricDetail(l.ops,    lnorm.ops,    i, null),
          wrcPlus:                metricDetail(l.wrcPlus,lnorm.wrcPlus,i, null),
          runDifferential:        metricDetail(l.rdPerGame,lnorm.runDifferential,i, null),
          scheduleAdjPerformance: metricDetail(schedAdj30[i],lnorm.scheduleAdjPerformance,i, null),
        },
        nextMonthGames,
      };
    }),
  };

  // 17. Validate
  const errs = [];
  if (output.teams.length < 30) errs.push(`Only ${output.teams.length} teams`);
  const abbrs = output.teams.map(t=>t.team);
  if (new Set(abbrs).size !== abbrs.length) errs.push("Duplicate abbrs");
  const sRanks = output.teams.map(t=>t.seasonRank).filter(Boolean);
  if (new Set(sRanks).size !== sRanks.length) errs.push("Duplicate season ranks");
  for (const t of output.teams) {
    const sc=t.seasonCompositeScore;
    if (sc!=null && (!Number.isFinite(sc)||sc<0||sc>100)) errs.push(`${t.team} score ${sc} invalid`);
    for (const [m,d] of Object.entries(t.seasonMetrics)) {
      if (d.normalizedScore!=null && !Number.isFinite(d.normalizedScore)) errs.push(`${t.team} ${m} NaN`);
    }
  }
  if (errs.length>0) { console.error("[power-rankings] ERRORS:", errs); process.exit(1); }

  // 18. Write
  mkdirSync(DATA_DIR, { recursive: true });
  const str = JSON.stringify(output, null, 2) + "\n";
  if (existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(readFileSync(OUTPUT_PATH,"utf8"));
    if (JSON.stringify({...existing,generatedAt:""}) === JSON.stringify({...output,generatedAt:""})) {
      console.log("[power-rankings] No changes."); process.exit(0);
    }
  }
  writeFileSync(OUTPUT_PATH, str, "utf8");
  console.log(`[power-rankings] ✓ ${OUTPUT_PATH}`);
  const top5=[...output.teams].sort((a,b)=>(a.seasonRank??99)-(b.seasonRank??99)).slice(0,5);
  console.log("[power-rankings] Top 5:", top5.map(t=>`${t.seasonRank}.${t.team}(${t.seasonCompositeScore})`).join(", "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error("[power-rankings] Fatal:", err); process.exitCode = 1; });
}
