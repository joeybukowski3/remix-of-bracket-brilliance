/**
 * RESEARCH ONLY — leakage-safe historical reconstruction of JKB TD Score.
 *
 * Phase 2 of the TD Score calibration study. Produces one row per
 * regular-season player-game (2022-2025) with the JKB TD Score and every
 * component recomputed strictly AS OF that game's week, plus the realized
 * anytime-TD outcome. Nothing here is wired into production; no production
 * artifact is modified.
 *
 * Faithfulness: the score math is the unmodified production implementation
 * (`src/lib/nfl/touchdown-preview/model.ts` -> `buildTouchdownScores`). The
 * only thing this script changes is the *window of games* fed to the model:
 * every candidate's `playerGames` / `opponentGames` list is pre-filtered to
 * games that kicked off before the target game, and the population /
 * percentile / league-prior / position-mean machinery therefore operates on
 * point-in-time values only.
 *
 * Windows reproduced (see docs — README in the output dir):
 *   - "production": the window the live site would show for that week.
 *       Week 1  -> prior full regular season (S-1), matching the live
 *                  `defaultWindow === "2025"` behaviour at 2026 Week 1.
 *       Week 2+ -> current season to date (season S, weeks < W), matching the
 *                  live `"2026"` window used from Week 2 on.
 *   - "trailing8": the live "last 8 applicable games across seasons" toggle,
 *       made strictly as-of (latest 8 games that kicked off before the target).
 *
 * Usage: npx tsx scripts/research/build-nfl-td-calibration-dataset.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTouchdownScores } from "../../src/lib/nfl/touchdown-preview/model.ts";
import type {
  TouchdownCandidateInput,
  TouchdownOpponentGame,
  TouchdownPlayerGame,
  TouchdownPosition,
} from "../../src/lib/nfl/touchdown-preview/types.ts";
import {
  aggregateOpponentPositionTouchdowns,
  indexOpponentGamesByDefense,
  normalizeTouchdownTeam,
  opponentGamesForTeam,
  touchdownTeamGameKey,
} from "../../src/lib/nfl/touchdown-preview/opponentHistory.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = path.join(ROOT, "data", "nfl", "research", "td-calibration");

/** Seasons we build calibration rows for. */
const TARGET_SEASONS = [2022, 2023, 2024, 2025] as const;
/**
 * Seasons of compact touchdown-context + player-week stats we load.
 *
 * Ideally this would include 2021 as a support season so 2022 Week 1 has a
 * leakage-safe prior-season window (what the live model would have used at
 * 2022 Week 1). 2021 compact touchdown-context was backfilled, but the
 * canonical player-week-stats cache only covers 2022+, and its producer
 * (`refresh-nfl-fantasy-history-source-cache.mjs`) also rewrites the shared
 * `schedules/games.csv` as a side effect, so it is not run here. Consequence:
 * 2022 Week 1 candidates get an empty prior window and a null score
 * (fail-closed — exactly the live behaviour for a player with no prior data).
 * Those ~250 rows are excluded from calibration and reported in QA. This is
 * one reason the 2023-2025 subset is the recommended primary.
 */
const CONTEXT_SEASONS = [2022, 2023, 2024, 2025] as const;
const POSITIONS = new Set<TouchdownPosition>(["QB", "RB", "WR", "TE"]);
const EARLY_SEASON_MAX_WEEK = 4;

/**
 * Trailing-window / early-season prior strategies. Each is a leakage-safe
 * selector over a player's (or defense's) games that kicked off before the
 * target game. All are fed to the UNMODIFIED production `buildTouchdownScores`
 * via the season-relabel trick (see `scoreWithStrategy`).
 *
 *   production        Week 1 -> prior full season (S-1); Week 2+ -> season S,
 *                     weeks < W. Mirrors the live site default. (baseline A)
 *   trailing8         latest 8 games before kickoff, crossing seasons. Live
 *                     "last 8" toggle, made as-of.
 *   trailing10        latest 10 games before kickoff (a touch more stability
 *                     early; a crude sample-size shrinkage — strategy C).
 *   priorSeasonThruW4 Weeks 1-4 -> prior full season (S-1); Week 5+ -> season S
 *                     to date. Hard switch. (strategy B, coarse)
 *   blendThruW4       Week 1 -> S-1 full; Weeks 2-4 -> (S-1 full) union
 *                     (S to date); Week 5+ -> S to date. Prior-season weight
 *                     fades automatically as current-season games accrue.
 *                     (strategy B, self-fading)
 */
type Strategy = "production" | "trailing8" | "trailing10" | "priorSeasonThruW4" | "blendThruW4";
const STRATEGIES: readonly Strategy[] = ["production", "trailing8", "trailing10", "priorSeasonThruW4", "blendThruW4"];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function csvLine(line: string): string[] {
  const out: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(value);
      value = "";
    } else value += ch;
  }
  out.push(value);
  return out;
}

function csvRecords(file: string): Record<string, string>[] {
  const text = readFileSync(file, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = csvLine(lines.shift() ?? "");
  return lines
    .filter(Boolean)
    .map((line) => Object.fromEntries(csvLine(line).map((v, i) => [header[i], v])));
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nullableNum = (v: unknown): number | null =>
  v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const normId = (id: string): string => (id.startsWith("gsis:") ? id : `gsis:${id}`);
const asPosition = (v: unknown): TouchdownPosition | null =>
  POSITIONS.has(String(v) as TouchdownPosition) ? (String(v) as TouchdownPosition) : null;
const round = (v: number | null, digits = 6): number | null =>
  v == null || !Number.isFinite(v) ? null : Number(v.toFixed(digits));

// ---------------------------------------------------------------------------
// Load raw sources
// ---------------------------------------------------------------------------
type WeekStat = {
  playerId: string;
  playerName: string;
  position: TouchdownPosition;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  carries: number;
  targets: number;
  rushingTds: number;
  receivingTds: number;
  passingTds: number;
  specialTeamsTds: number;
};

const weekStats: WeekStat[] = [];
for (const season of CONTEXT_SEASONS) {
  const file = path.join(
    ROOT,
    "data",
    "nfl",
    "nflverse",
    "player-week-stats",
    `stats_player_week_${season}.csv`,
  );
  if (!existsSync(file)) throw new Error(`missing player-week stats: ${file}`);
  for (const row of csvRecords(file)) {
    const position = asPosition(row.position);
    if (row.season_type !== "REG" || !position || !row.player_id) continue;
    weekStats.push({
      playerId: normId(row.player_id),
      playerName: row.player_name || row.player_display_name || row.player_id,
      position,
      season: num(row.season),
      week: num(row.week),
      gameId: row.game_id,
      team: normalizeTouchdownTeam(row.team),
      opponent: normalizeTouchdownTeam(row.opponent_team),
      carries: num(row.carries),
      targets: num(row.targets),
      rushingTds: num(row.rushing_tds),
      receivingTds: num(row.receiving_tds),
      passingTds: num(row.passing_tds),
      specialTeamsTds: num(row.special_teams_tds),
    });
  }
}

type ContextRow = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  playerId: string;
  rz: number;
  i10: number;
  gl: number;
  yardlineKnown: boolean;
  touchdown: number;
};
const contextRows: ContextRow[] = [];
for (const season of CONTEXT_SEASONS) {
  const file = path.join(
    ROOT,
    "data",
    "nfl",
    "nflverse",
    "touchdown-context",
    `touchdown_context_${season}.csv`,
  );
  if (!existsSync(file)) throw new Error(`missing touchdown-context: ${file}`);
  for (const row of csvRecords(file)) {
    const yl = row.yardline_100;
    const yardlineKnown = yl != null && yl !== "";
    contextRows.push({
      gameId: row.game_id,
      season: num(row.season),
      week: num(row.week),
      team: normalizeTouchdownTeam(row.team),
      opponent: normalizeTouchdownTeam(row.opponent),
      playerId: normId(row.player_id),
      rz: num(row.rz_opportunity),
      i10: num(row.inside_10_opportunity),
      gl: num(row.goal_line_opportunity),
      yardlineKnown,
      touchdown: num(row.touchdown),
    });
  }
}

// Results — team/opponent score + home/away. dateUtc is not present in these
// artifacts, so kickoff timestamps are null; game ordering uses season/week.
type ResultGame = { homeAbbr: string; awayAbbr: string; homeScore: number | null; awayScore: number | null };
const resultsByGame = new Map<string, ResultGame>();
for (const season of CONTEXT_SEASONS) {
  const file = path.join(ROOT, "public", "data", "nfl", String(season), "results.json");
  if (!existsSync(file)) continue;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    results?: Array<ResultGame & { gameId: string; seasonType: string; final: boolean }>;
  };
  for (const g of parsed.results ?? []) {
    if (g.seasonType === "REG" && g.final) {
      resultsByGame.set(g.gameId, {
        homeAbbr: g.homeAbbr,
        awayAbbr: g.awayAbbr,
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
      });
    }
  }
}

// Historical implied team totals (closing spread/total derived — pregame proxy).
const impliedTeamTotalByKey = new Map<string, number>();
{
  const file = path.join(ROOT, "data", "nfl", "props", "historical-market-context-2022-2025.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    rows?: Array<{ season: number; week: number; team: string; impliedTeamTotal: number | null }>;
  };
  for (const r of parsed.rows ?? []) {
    if (r.impliedTeamTotal == null) continue;
    impliedTeamTotalByKey.set(
      `${r.season}|${r.week}|${normalizeTouchdownTeam(r.team)}`,
      r.impliedTeamTotal,
    );
  }
}

// ---------------------------------------------------------------------------
// Build full game logs (all loaded seasons) — mirrors generate-nfl-touchdown-preview.ts
// ---------------------------------------------------------------------------
type PlayerCtx = { total: number; rz: number; i10: number; gl: number; yardlinesKnown: boolean };
type TeamCtx = { total: number; rz: number; gl: number; yardlinesKnown: boolean };
type DefCtx = { rz: number; i10: number; gl: number; yardlinesKnown: boolean };

const contextByPlayerGame = new Map<string, PlayerCtx>();
const contextByTeamGame = new Map<string, TeamCtx>();
const opportunityAllowedByDefGame = new Map<string, DefCtx>();
const contextTdByPlayerGame = new Map<string, number>();

for (const row of contextRows) {
  const pKey = `${row.playerId}|${row.gameId}`;
  const p = contextByPlayerGame.get(pKey) ?? { total: 0, rz: 0, i10: 0, gl: 0, yardlinesKnown: true };
  p.total += 1;
  p.yardlinesKnown &&= row.yardlineKnown;
  p.rz += row.rz;
  p.i10 += row.i10;
  p.gl += row.gl;
  contextByPlayerGame.set(pKey, p);
  contextTdByPlayerGame.set(pKey, (contextTdByPlayerGame.get(pKey) ?? 0) + row.touchdown);

  const tKey = touchdownTeamGameKey(row.gameId, row.team);
  const t = contextByTeamGame.get(tKey) ?? { total: 0, rz: 0, gl: 0, yardlinesKnown: true };
  t.total += 1;
  t.yardlinesKnown &&= row.yardlineKnown;
  t.rz += row.rz;
  t.gl += row.gl;
  contextByTeamGame.set(tKey, t);

  const dKey = touchdownTeamGameKey(row.gameId, row.opponent);
  const d = opportunityAllowedByDefGame.get(dKey) ?? { rz: 0, i10: 0, gl: 0, yardlinesKnown: true };
  d.yardlinesKnown &&= row.yardlineKnown;
  d.rz += row.rz;
  d.i10 += row.i10;
  d.gl += row.gl;
  opportunityAllowedByDefGame.set(dKey, d);
}

function scoreFor(gameId: string, team: string): { teamScore: number | null; opponentScore: number | null; homeAway: "home" | "away" } {
  const g = resultsByGame.get(gameId);
  if (!g) return { teamScore: null, opponentScore: null, homeAway: "away" };
  const home = normalizeTouchdownTeam(g.homeAbbr) === normalizeTouchdownTeam(team);
  return {
    teamScore: home ? g.homeScore : g.awayScore,
    opponentScore: home ? g.awayScore : g.homeScore,
    homeAway: home ? "home" : "away",
  };
}

const playerGamesById = new Map<string, TouchdownPlayerGame[]>();
for (const s of weekStats) {
  const scoring = scoreFor(s.gameId, s.team);
  const pCtx = contextByPlayerGame.get(`${s.playerId}|${s.gameId}`);
  const tCtx = contextByTeamGame.get(touchdownTeamGameKey(s.gameId, s.team));
  const game: TouchdownPlayerGame = {
    gameId: s.gameId,
    season: s.season,
    week: s.week,
    date: null,
    team: s.team,
    opponent: s.opponent,
    homeAway: scoring.homeAway,
    teamScore: scoring.teamScore,
    opponentScore: scoring.opponentScore,
    carries: s.carries,
    targets: s.targets,
    scorerOpportunities: pCtx?.total ?? 0,
    teamScorerOpportunities: tCtx?.total ?? 0,
    teamRzOpportunities: (tCtx?.yardlinesKnown ?? true) ? tCtx?.rz ?? 0 : null,
    teamGoalLineOpportunities: (tCtx?.yardlinesKnown ?? true) ? tCtx?.gl ?? 0 : null,
    rushingTds: s.rushingTds,
    receivingTds: s.receivingTds,
    touchdowns: s.rushingTds + s.receivingTds,
    rzOpportunities: (pCtx?.yardlinesKnown ?? true) ? pCtx?.rz ?? 0 : null,
    inside10Opportunities: (pCtx?.yardlinesKnown ?? true) ? pCtx?.i10 ?? 0 : null,
    goalLineOpportunities: (pCtx?.yardlinesKnown ?? true) ? pCtx?.gl ?? 0 : null,
  };
  const list = playerGamesById.get(s.playerId) ?? [];
  list.push(game);
  playerGamesById.set(s.playerId, list);
}

const defenseByGame = aggregateOpponentPositionTouchdowns(
  weekStats.map((s) => ({
    gameId: s.gameId,
    team: s.team,
    opponent: s.opponent,
    position: s.position,
    rushingTds: s.rushingTds,
    receivingTds: s.receivingTds,
    passingTds: s.passingTds,
    specialTeamsTds: s.specialTeamsTds,
  })),
);

const opponentGamesAll: TouchdownOpponentGame[] = [];
for (const [key, aggregate] of defenseByGame) {
  const gameId = key.split("|")[0];
  const scoring = scoreFor(gameId, aggregate.defense);
  const opp = opportunityAllowedByDefGame.get(key);
  opponentGamesAll.push({
    gameId,
    season: num(gameId.split("_")[0]),
    week: num(gameId.split("_")[1]),
    date: null,
    defense: aggregate.defense,
    opponent: aggregate.opponent,
    homeAway: scoring.homeAway,
    defenseScore: scoring.teamScore,
    opponentScore: scoring.opponentScore,
    offensiveTdsAllowed: Object.values(aggregate.positionTds).reduce((a, b) => a + b, 0),
    rzOpportunitiesAllowed: (opp?.yardlinesKnown ?? true) ? opp?.rz ?? 0 : null,
    inside10OpportunitiesAllowed: (opp?.yardlinesKnown ?? true) ? opp?.i10 ?? 0 : null,
    goalLineOpportunitiesAllowed: (opp?.yardlinesKnown ?? true) ? opp?.gl ?? 0 : null,
    touchdownsAllowedByPosition: aggregate.positionTds,
  });
}
const opponentGamesByDefense = indexOpponentGamesByDefense(opponentGamesAll);

// ---------------------------------------------------------------------------
// As-of strategy selectors — all return a subset of games that kicked off
// strictly before target (season S, week W). Leakage-safe by construction.
// ---------------------------------------------------------------------------
type GameLike = { season: number; week: number };
const chrono = <T extends GameLike>(a: T, b: T) => b.season - a.season || b.week - a.week;
const before = <T extends GameLike>(g: readonly T[], s: number, w: number): T[] =>
  g.filter((x) => x.season < s || (x.season === s && x.week < w));
const seasonToDate = <T extends GameLike>(g: readonly T[], s: number, w: number): T[] =>
  g.filter((x) => x.season === s && x.week < w);
const priorSeasonFull = <T extends GameLike>(g: readonly T[], s: number): T[] => g.filter((x) => x.season === s - 1);
const latestN = <T extends GameLike>(g: readonly T[], s: number, w: number, n: number): T[] =>
  [...before(g, s, w)].sort(chrono).slice(0, n);

function selectGames<T extends GameLike>(strategy: Strategy, g: readonly T[], s: number, w: number): T[] {
  switch (strategy) {
    case "production":
      return w === 1 ? priorSeasonFull(g, s) : seasonToDate(g, s, w);
    case "trailing8":
      return latestN(g, s, w, 8);
    case "trailing10":
      return latestN(g, s, w, 10);
    case "priorSeasonThruW4":
      return w <= 4 ? priorSeasonFull(g, s) : seasonToDate(g, s, w);
    case "blendThruW4": {
      if (w === 1) return priorSeasonFull(g, s);
      if (w <= 4) {
        const set = new Map<string, T>();
        for (const x of [...priorSeasonFull(g, s), ...seasonToDate(g, s, w)]) set.set(`${x.season}_${x.week}`, x);
        return [...set.values()];
      }
      return seasonToDate(g, s, w);
    }
  }
}

/**
 * Score a pool with an arbitrary (possibly cross-season, possibly >8) game
 * set using the UNMODIFIED production `buildTouchdownScores`. Its window key
 * only drives `selectPlayerGames`' season filter, so we relabel every
 * pre-selected game to a single sentinel season and a monotonic pseudo-week
 * (origSeason*100 + origWeek) that preserves true chronology, then pass
 * "sentinel" as the key. The season filter then keeps every game and the
 * "latest 5" ordering is still correct. The returned player exposes the
 * computed metrics under every window key; we read `windows["2026"]`.
 */
const SENTINEL = "3000";
function relabel<T extends GameLike>(games: readonly T[]): T[] {
  return games.map((g) => ({ ...g, season: Number(SENTINEL), week: g.season * 100 + g.week }));
}

// ---------------------------------------------------------------------------
// Per (season, week) reconstruction
// ---------------------------------------------------------------------------
type OutRow = Record<string, unknown>;
const outRows: OutRow[] = [];

let crossCheckTotal = 0;
let crossCheckMismatch = 0;
const crossCheckExamples: Array<Record<string, unknown>> = [];

const statByPlayerWeek = new Map<string, WeekStat>();
for (const s of weekStats) statByPlayerWeek.set(`${s.playerId}|${s.season}|${s.week}`, s);

for (const season of TARGET_SEASONS) {
  for (let week = 1; week <= 18; week += 1) {
    const pool = weekStats.filter(
      (s) => s.season === season && s.week === week && resultsByGame.has(s.gameId),
    );
    if (pool.length === 0) continue;

    // one candidate per (player, game); de-dupe defensively
    const seen = new Set<string>();
    const poolRows: WeekStat[] = [];
    for (const s of pool) {
      const k = `${s.playerId}|${s.gameId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      poolRows.push(s);
    }

    // movement / history classification per pool player (computed once)
    const meta = new Map<string, { priorTeam: string | null; priorGamesAllTime: number; movementClass: string; limitedHistory: boolean }>();
    for (const s of poolRows) {
      const allTime = (playerGamesById.get(s.playerId) ?? [])
        .filter((g) => g.season < season || (g.season === season && g.week < week))
        .sort(chrono);
      const priorTeam = allTime.length ? allTime[0].team : null;
      const movementClass =
        allTime.length === 0
          ? "rookie_or_no_prior"
          : priorTeam !== s.team
            ? "returning_new_team"
            : "returning_same_team";
      meta.set(s.playerId + "|" + s.gameId, {
        priorTeam,
        priorGamesAllTime: allTime.length,
        movementClass,
        limitedHistory: allTime.length >= 1 && allTime.length <= 4,
      });
    }

    for (const strategy of STRATEGIES) {
      const select = <T extends GameLike>(g: readonly T[]) => relabel(selectGames(strategy, g, season, week));
      const candidates: TouchdownCandidateInput[] = poolRows.map((s) => {
        const allPlayer = playerGamesById.get(s.playerId) ?? [];
        const allOpp = opponentGamesForTeam(opponentGamesByDefense, s.opponent);
        return {
          playerId: s.playerId,
          playerName: s.playerName,
          team: s.team,
          opponent: s.opponent,
          homeAway: scoreFor(s.gameId, s.team).homeAway,
          position: s.position,
          gameId: s.gameId,
          kickoff: null,
          impliedTeamPoints: impliedTeamTotalByKey.get(`${season}|${week}|${s.team}`) ?? null,
          playerGames: select(allPlayer),
          opponentGames: select(allOpp),
        };
      });

      const built = buildTouchdownScores(candidates, SENTINEL as never);

      for (let i = 0; i < poolRows.length; i += 1) {
        const s = poolRows[i];
        const player = built[i];
        const wm = player.windows["2026"];
        const priorPlayer = selectGames(strategy, playerGamesById.get(s.playerId) ?? [], season, week);
        const m = meta.get(s.playerId + "|" + s.gameId)!;
        const actualTd = s.rushingTds + s.receivingTds >= 1 ? 1 : 0;

        // cross-check (once, on the production strategy pass)
        if (strategy === "production") {
          const ctxTd = contextTdByPlayerGame.get(`${s.playerId}|${s.gameId}`) ?? 0;
          const ctxLabel = ctxTd >= 1 ? 1 : 0;
          crossCheckTotal += 1;
          if (ctxLabel !== actualTd) {
            crossCheckMismatch += 1;
            if (crossCheckExamples.length < 25) {
              crossCheckExamples.push({
                playerId: s.playerId,
                playerName: s.playerName,
                gameId: s.gameId,
                position: s.position,
                weekStatTds: s.rushingTds + s.receivingTds,
                contextTds: ctxTd,
              });
            }
          }
        }

        const c = wm.components;
        const teamPriorGames = new Set(priorPlayer.map((g) => g.gameId)).size;

        const row: OutRow = {
          strategy,
          season,
          week,
          gameId: s.gameId,
          kickoff: null,
          playerId: s.playerId,
          playerName: s.playerName,
          position: s.position,
          team: s.team,
          opponent: s.opponent,
          homeAway: player.homeAway,

          jkbTdScore: wm.jkbTdScore,
          scoreState: wm.jkbTdScore == null ? "null" : "available",
          sampleState: wm.sampleState,
          sampleGames: wm.sampleGames,

          // normalized component scores (0-100 percentiles) — the score inputs
          tdOpportunitiesComponent: c.tdOpportunities.percentile,
          playerUsageComponent: c.playerUsage.percentile,
          teamUsageComponent: c.teamUsage.percentile,
          tdSuccessComponent: c.tdSuccess.percentile,
          oppTdOpportunitiesComponent: c.opponentTdOpportunities.percentile,
          oppTdAllowedPositionComponent: c.opponentPositionTdsAllowed.percentile,
          impliedTeamPointsComponent: c.impliedTeamPoints.percentile,

          // raw component inputs (pregame, trailing-window aggregates)
          rawUsagePerGame: wm.usagePerGame,
          rawUsageIndexValue: c.playerUsage.value,
          rawTeamUsageShare: wm.teamUsageShare,
          rawRzOppPerGame: wm.rzOpportunitiesPerGame,
          rawInside10OppPerGame: wm.inside10OpportunitiesPerGame,
          rawGoalLineOppPerGame: wm.goalLineOpportunitiesPerGame,
          rawTdSuccessRate: wm.tdSuccessRate,
          rawOppTdOpportunitiesPerGame: wm.opponentTdOpportunitiesPerGame,
          rawOppPositionTdsAllowedPerGame: wm.opponentPositionTdsAllowedPerGame,
          rawOppPositionIndexValue: c.opponentPositionTdsAllowed.value,
          impliedTeamPoints: wm.impliedTeamPoints,

          // outcome
          actualTd,
          rushingTds: s.rushingTds,
          receivingTds: s.receivingTds,
          carries: s.carries,
          targets: s.targets,

          // prior-history context
          playerPriorGames: priorPlayer.length,
          playerPriorGamesAllTime: m.priorGamesAllTime,
          teamPriorGames,
          gamesOfPriorHistory: priorPlayer.length,

          earlySeasonFlag: week <= EARLY_SEASON_MAX_WEEK,
          weekBand: week === 1 ? "w1" : week <= 4 ? "w2-4" : "w5-18",
          rookieOrNoPriorFlag: m.priorGamesAllTime === 0,

          // player movement / history class
          priorTeam: m.priorTeam,
          teamChanged: m.movementClass === "returning_new_team",
          movementClass: m.movementClass,
          limitedHistoryFlag: m.limitedHistory,
        };
        outRows.push(row);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Write dataset + summary
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });

const datasetPath = path.join(OUT_DIR, "player-game-dataset.jsonl");
writeFileSync(datasetPath, outRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

function summarize(rows: OutRow[]) {
  const n = rows.length;
  const scored = rows.filter((r) => r.scoreState === "available");
  const tdRate = n ? rows.reduce((a, r) => a + (r.actualTd as number), 0) / n : null;
  const scoredTdRate = scored.length
    ? scored.reduce((a, r) => a + (r.actualTd as number), 0) / scored.length
    : null;
  const bySeason: Record<string, number> = {};
  const byPosition: Record<string, number> = {};
  const scoredBySeason: Record<string, number> = {};
  for (const r of rows) {
    bySeason[String(r.season)] = (bySeason[String(r.season)] ?? 0) + 1;
    byPosition[String(r.position)] = (byPosition[String(r.position)] ?? 0) + 1;
    if (r.scoreState === "available") scoredBySeason[String(r.season)] = (scoredBySeason[String(r.season)] ?? 0) + 1;
  }
  // score bins (deciles) over scored rows
  const bins: Array<Record<string, unknown>> = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const inBin = scored.filter((r) => {
      const v = r.jkbTdScore as number;
      return lo === 90 ? v >= lo && v <= hi : v >= lo && v < hi;
    });
    const bn = inBin.length;
    const rate = bn ? inBin.reduce((a, r) => a + (r.actualTd as number), 0) / bn : null;
    bins.push({
      bin: `${lo}-${hi}`,
      n: bn,
      avgScore: bn ? round(inBin.reduce((a, r) => a + (r.jkbTdScore as number), 0) / bn, 2) : null,
      actualTdRate: round(rate, 4),
      se: bn && rate != null ? round(Math.sqrt((rate * (1 - rate)) / bn), 4) : null,
    });
  }
  const componentMissing: Record<string, number> = {};
  for (const key of [
    "tdOpportunitiesComponent",
    "playerUsageComponent",
    "teamUsageComponent",
    "tdSuccessComponent",
    "oppTdOpportunitiesComponent",
    "oppTdAllowedPositionComponent",
    "impliedTeamPointsComponent",
  ]) {
    componentMissing[key] = rows.filter((r) => r[key] == null).length;
  }
  return {
    n,
    scored: scored.length,
    nullScore: n - scored.length,
    actualTdRate: round(tdRate, 4),
    scoredActualTdRate: round(scoredTdRate, 4),
    bySeason,
    scoredBySeason,
    byPosition,
    earlySeason: rows.filter((r) => r.earlySeasonFlag).length,
    earlySeasonScored: scored.filter((r) => r.earlySeasonFlag).length,
    rookieOrNoPrior: rows.filter((r) => r.rookieOrNoPriorFlag).length,
    rookieOrNoPriorScored: scored.filter((r) => r.rookieOrNoPriorFlag).length,
    componentMissing,
    scoreBins: bins,
  };
}

const strategySummaries = Object.fromEntries(
  STRATEGIES.map((st) => [st, summarize(outRows.filter((r) => r.strategy === st))]),
);

const summary = {
  schemaVersion: "nfl-td-calibration-dataset-v2",
  generatedAt: new Date().toISOString(),
  targetSeasons: TARGET_SEASONS,
  contextSeasons: CONTEXT_SEASONS,
  contextSeasonNote:
    "player-week stats cover 2022+ only, so 2022 Week 1 has an empty prior-season window and null scores (fail-closed). 2021 compact touchdown-context was backfilled but is unused pending a 2021 player-week-stats cache.",
  strategies: {
    production: "Week 1 -> prior full regular season (S-1); Week 2+ -> season S weeks < W. Mirrors the live site's defaultWindow. Baseline.",
    trailing8: "Latest 8 games before the target game, crossing seasons. Live 'last 8' toggle, made as-of.",
    trailing10: "Latest 10 games before the target game. Crude sample-size shrinkage (strategy C).",
    priorSeasonThruW4: "Weeks 1-4 -> prior full season (S-1); Week 5+ -> season S to date. Hard switch (strategy B, coarse).",
    blendThruW4: "Week 1 -> S-1 full; Weeks 2-4 -> (S-1 full) union (S to date); Week 5+ -> S to date. Prior-season weight self-fades (strategy B).",
  },
  leakageProtections: [
    "Score math is the unmodified production buildTouchdownScores.",
    "Every candidate's playerGames/opponentGames pre-filtered to games with an earlier (season, week) than the target.",
    "League TD/opportunity prior (empirical-Bayes) computed inside buildTouchdownScores from the pre-filtered pool games only.",
    "Position usage mean and league positional-TD mean computed from the pre-filtered pool only.",
    "Percentile population = that week's reconstructed candidate pool; all percentile inputs are trailing-window values.",
    "Implied team points from closing spread/total (pregame proxy); no postgame market data.",
    "actualTd is the only field derived from the target game and is the label, never a feature.",
  ],
  membershipAssumption:
    "Candidate pool for (season, week) = players with a REG player-week stat line that week (QB/RB/WR/TE) on a team that played. This is ex-post 'appeared', the one unavoidable deviation from the live yardage-projection pool; feature values remain strictly pregame. A sensitivity cut to established contributors (playerPriorGames >= 1) is reported in the calibration run.",
  crossCheck: {
    description:
      "player-week (rushing_tds+receiving_tds>=1) vs compact-PBP touchdown flag sum per player-game (production strategy rows).",
    total: crossCheckTotal,
    mismatch: crossCheckMismatch,
    mismatchRate: crossCheckTotal ? round(crossCheckMismatch / crossCheckTotal, 5) : null,
    examples: crossCheckExamples,
  },
  overall: summarize(outRows),
  byStrategy: strategySummaries,
  productionStrategy_2023_2025: summarize(
    outRows.filter((r) => r.strategy === "production" && (r.season as number) >= 2023),
  ),
};

writeFileSync(path.join(OUT_DIR, "dataset-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

// Compact, gzipped calibration dataset — only the fields the calibration
// evaluator reads. This is the committed artifact; the full JSONL above is
// regenerable and git-ignored.
const COMPACT_FIELDS = [
  "strategy", "season", "week", "weekBand", "gameId", "playerId", "position",
  "jkbTdScore", "scoreState", "sampleGames", "actualTd",
  "playerPriorGames", "playerPriorGamesAllTime", "teamPriorGames",
  "earlySeasonFlag", "rookieOrNoPriorFlag", "teamChanged", "movementClass", "limitedHistoryFlag",
] as const;
const compact = outRows.map((r) => {
  const o: Record<string, unknown> = {};
  for (const f of COMPACT_FIELDS) o[f] = r[f];
  return o;
});
const compactJsonl = compact.map((r) => JSON.stringify(r)).join("\n") + "\n";
// mtime:0 -> deterministic bytes for a stable committed artifact
const compactGz = gzipSync(Buffer.from(compactJsonl, "utf8"), { mtime: 0 });
writeFileSync(path.join(OUT_DIR, "calibration-dataset.jsonl.gz"), compactGz);
writeFileSync(path.join(OUT_DIR, "calibration-dataset.sample.jsonl"), compact.slice(0, 50).map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(`rows=${outRows.length} (${STRATEGIES.length} strategies) -> ${datasetPath} (full, git-ignored)`);
console.log(`compact -> calibration-dataset.jsonl.gz (${(compactGz.length / 1024).toFixed(0)} KiB, committed)`);
for (const st of STRATEGIES) {
  const s = strategySummaries[st];
  console.log(`  ${st.padEnd(18)} n=${s.n} scored=${s.scored} tdRate(scored)=${s.scoredActualTdRate}`);
}
console.log(`cross-check mismatch: ${crossCheckMismatch}/${crossCheckTotal} (${summary.crossCheck.mismatchRate})`);
