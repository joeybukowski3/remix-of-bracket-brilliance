/**
 * Generate public/data/nfl/{season}/team-performance-analytics.json (Phase 6).
 *
 * Consumes:
 *  - data/nfl/nflverse/performance-team-game/performance_team_game_{season}.csv
 *    (production compact cache, written by refresh-nfl-performance-source-cache.mjs)
 *  - public/data/nfl/{season}/results.json (existing production schedule/results
 *    artifact) for point differential per game and the opponents faced list —
 *    reused rather than re-derived, so this pipeline never invents a second
 *    source of truth for final scores.
 *  - public/data/nfl/teams.json for the canonical 32-team roster.
 *
 * Computes last4/last8/fullSeason windows from each team's OWN completed-game
 * sequence (never a league week number), and calls the Phase 5 modules
 * (src/lib/nfl/performanceMetricsCore2026.ts,
 * src/lib/nfl/performanceComposite2026.ts) for every metric derivation and
 * every composite/rating calculation — this file contains zero rating math
 * of its own, only aggregation and artifact assembly.
 *
 * A team with zero completed games (the entire 2026 season, at the time this
 * was written) gets gamesPlayed=0, every window's sampleSize=0, all rate
 * fields null, and every performance rating/rank null. Nothing is ever
 * substituted from a prior season or from the preseason v0.4 projection.
 *
 * Run via tsx (not plain node) because it imports TypeScript modules
 * directly: `npx tsx scripts/generate-nfl-team-performance-analytics.mts`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error -- plain .mjs sibling, no type declarations
import { parsePerformanceCompactRow, PERFORMANCE_COMPACT_COLUMNS } from "./lib/nfl-performance-metrics-core.mjs";
import {
  deriveTeamPerformanceMetrics,
  type PerformanceDriveSums,
  type PerformancePlaySums,
  type TeamPerformanceWindowInput,
} from "../src/lib/nfl/performanceMetricsCore2026.ts";
import {
  buildPerformanceRatingBoard,
  PERFORMANCE_SCALE_DIVISORS,
  type TeamPerformanceSeasonEntry,
} from "../src/lib/nfl/performanceComposite2026.ts";
import {
  OFFENSE_METRIC_RANK_DIRECTIONS,
  DEFENSE_METRIC_RANK_DIRECTIONS,
  TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION,
  type TeamPerformanceAnalyticsArtifact,
  type TeamPerformanceAnalyticsRow,
  type TeamPerformanceMetricRanks,
  type TeamPerformanceWindowMetrics,
} from "../src/lib/nfl/teamPerformanceAnalytics.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

type CompactRow = ReturnType<typeof parsePerformanceCompactRow>;

async function readCompactCache(path: string): Promise<CompactRow[]> {
  if (!existsSync(path)) return [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header: string[] | null = null;
  const rows: CompactRow[] = [];
  for await (const line of rl) {
    if (line === "") continue;
    const cells = splitCsvLine(line);
    if (header === null) { header = cells; continue; }
    const record: Record<string, string> = {};
    header.forEach((h, i) => { record[h] = cells[i] ?? ""; });
    rows.push(parsePerformanceCompactRow(record));
  }
  return rows;
}

function emptySums(): PerformancePlaySums {
  return {
    offEpa: 0, offPlays: 0, successNum: 0, successDen: 0, epaPosNum: 0, epaPosDen: 0,
    earlyEpa: 0, earlyPlays: 0, earlySuccessNum: 0, earlySuccessDen: 0,
    passEpa: 0, passPlays: 0, passSuccessNum: 0, passSuccessDen: 0,
    rushEpa: 0, rushPlays: 0, rushSuccessNum: 0, rushSuccessDen: 0,
    explosivePass: 0, explosiveRush: 0,
    thirdEpa: 0, thirdPlays: 0, thirdSuccessNum: 0, thirdSuccessDen: 0,
    thirdRawConvNum: 0, thirdRawConvDen: 0, sacks: 0, dropbacks: 0,
  };
}

function addSums(target: PerformancePlaySums, source: PerformancePlaySums): void {
  for (const key of Object.keys(target) as (keyof PerformancePlaySums)[]) {
    target[key] += source[key];
  }
}

/** Sum a list of the team's own compact rows plus their opponents' rows for the same games into one window input. */
export function buildWindowInput(
  team: string,
  teamRows: readonly CompactRow[],
  rowsByGameTeam: Map<string, CompactRow>
): TeamPerformanceWindowInput {
  const offAll = emptySums();
  const offFiltered = emptySums();
  const defAll = emptySums();
  const defFiltered = emptySums();
  const driveOff: PerformanceDriveSums = { drives: 0, points: 0 };
  const driveDefAllowed: PerformanceDriveSums = { drives: 0, points: 0 };

  for (const row of teamRows) {
    addSums(offAll, row.all);
    addSums(offFiltered, row.filtered);
    driveOff.drives += row.drivesOff;
    driveOff.points += row.drivePointsOff;

    const oppRow = rowsByGameTeam.get(`${row.gameId}|${row.opponent}`);
    if (oppRow) {
      addSums(defAll, oppRow.all);
      addSums(defFiltered, oppRow.filtered);
      driveDefAllowed.drives += oppRow.drivesOff;
      driveDefAllowed.points += oppRow.drivePointsOff;
    }
  }

  return {
    team,
    gamesPlayed: teamRows.length,
    offense: { all: offAll, filtered: offFiltered },
    defenseAllowed: { all: defAll, filtered: defFiltered },
    driveOff,
    driveDefAllowed,
  };
}

function toWindowMetrics(input: TeamPerformanceWindowInput): TeamPerformanceWindowMetrics {
  const metrics = deriveTeamPerformanceMetrics(input);
  return {
    sampleSize: input.gamesPlayed,
    offense: metrics.offense,
    defenseAllowed: metrics.defenseAllowed,
    pointsPerDriveOff: metrics.pointsPerDriveOff,
    pointsPerDriveAllowed: metrics.pointsPerDriveAllowed,
  };
}

function rankMetric(
  teamValues: ReadonlyMap<string, number | null>,
  direction: "higher-is-better" | "lower-is-better"
): TeamPerformanceMetricRanks {
  const entries = [...teamValues.entries()].filter(([, v]) => v !== null) as [string, number][];
  entries.sort((a, b) => (direction === "higher-is-better" ? b[1] - a[1] : a[1] - b[1]) || a[0].localeCompare(b[0]));
  const ranks: Record<string, number | null> = {};
  for (const [team] of teamValues) ranks[team] = null;
  entries.forEach(([team], i) => { ranks[team] = i + 1; });
  return ranks;
}

type FinalGame = { gameId: string; team: string; opponent: string; margin: number };

function loadFinalGames(resultsPath: string, teamsByFullName: Map<string, string>): FinalGame[] {
  if (!existsSync(resultsPath)) return [];
  const json = JSON.parse(readFileSync(resultsPath, "utf-8")) as {
    results: { gameId: string; seasonType: string; final: boolean; homeAbbr: string; awayAbbr: string; homeScore: number; awayScore: number }[];
  };
  const games: FinalGame[] = [];
  for (const r of json.results) {
    if (r.seasonType !== "REG" || r.final !== true) continue;
    games.push({ gameId: r.gameId, team: r.homeAbbr, opponent: r.awayAbbr, margin: r.homeScore - r.awayScore });
    games.push({ gameId: r.gameId, team: r.awayAbbr, opponent: r.homeAbbr, margin: r.awayScore - r.homeScore });
  }
  void teamsByFullName;
  return games;
}

export async function generateTeamPerformanceAnalytics(season: number): Promise<TeamPerformanceAnalyticsArtifact> {
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8")) as {
    teams: { abbr: string }[];
  };
  const allAbbrs = teamsJson.teams.map((t) => t.abbr).sort();

  const cachePath = join(ROOT, "data", "nfl", "nflverse", "performance-team-game", `performance_team_game_${season}.csv`);
  const compactRows = await readCompactCache(cachePath);

  const rowsByGameTeam = new Map<string, CompactRow>();
  for (const row of compactRows) rowsByGameTeam.set(`${row.gameId}|${row.team}`, row);

  const rowsByTeam = new Map<string, CompactRow[]>();
  for (const row of compactRows) {
    if (!rowsByTeam.has(row.team)) rowsByTeam.set(row.team, []);
    rowsByTeam.get(row.team)!.push(row);
  }
  for (const rows of rowsByTeam.values()) rows.sort((a, b) => a.week - b.week);

  const finalGames = loadFinalGames(join(ROOT, "public", "data", "nfl", String(season), "results.json"), new Map());
  const finalGamesByTeam = new Map<string, FinalGame[]>();
  for (const g of finalGames) {
    if (!finalGamesByTeam.has(g.team)) finalGamesByTeam.set(g.team, []);
    finalGamesByTeam.get(g.team)!.push(g);
  }

  // Build fullSeason metrics + window metrics for every team.
  const fullSeasonMetricsByTeam = new Map<string, ReturnType<typeof deriveTeamPerformanceMetrics>>();
  const windowsByTeam = new Map<string, { last4: TeamPerformanceWindowMetrics; last8: TeamPerformanceWindowMetrics; fullSeason: TeamPerformanceWindowMetrics }>();

  for (const team of allAbbrs) {
    const rows = rowsByTeam.get(team) ?? [];
    const last4Input = buildWindowInput(team, rows.slice(-4), rowsByGameTeam);
    const last8Input = buildWindowInput(team, rows.slice(-8), rowsByGameTeam);
    const fullInput = buildWindowInput(team, rows, rowsByGameTeam);

    windowsByTeam.set(team, {
      last4: toWindowMetrics(last4Input),
      last8: toWindowMetrics(last8Input),
      fullSeason: toWindowMetrics(fullInput),
    });
    fullSeasonMetricsByTeam.set(team, deriveTeamPerformanceMetrics(fullInput));
  }

  // Build the composite board only from teams with at least 1 completed game.
  const playedTeams = allAbbrs.filter((t) => (rowsByTeam.get(t)?.length ?? 0) > 0);
  const seasonEntries: TeamPerformanceSeasonEntry[] = playedTeams.map((team) => {
    const games = finalGamesByTeam.get(team) ?? [];
    const pointDifferentialPerGame = games.length > 0 ? games.reduce((s, g) => s + g.margin, 0) / games.length : 0;
    return {
      team,
      metrics: fullSeasonMetricsByTeam.get(team)!,
      opponents: games.map((g) => g.opponent),
      pointDifferentialPerGame,
    };
  });
  const board = playedTeams.length > 0 ? buildPerformanceRatingBoard(seasonEntries) : { rows: [], scaleDivisors: PERFORMANCE_SCALE_DIVISORS };
  const boardRowByTeam = new Map(board.rows.map((r) => [r.team, r]));

  // Full-season 9+9 metric ranks (played teams only), with correct direction per metric.
  function collect(pick: (team: string) => number | null): Map<string, number | null> {
    const map = new Map<string, number | null>();
    for (const team of playedTeams) map.set(team, pick(team));
    return map;
  }
  const offenseMetricRanksByTeam = new Map<string, TeamPerformanceMetricRanks>();
  const defenseMetricRanksByTeam = new Map<string, TeamPerformanceMetricRanks>();
  const offenseRankTables: Record<string, TeamPerformanceMetricRanks> = {};
  const defenseRankTables: Record<string, TeamPerformanceMetricRanks> = {};
  for (const metric of Object.keys(OFFENSE_METRIC_RANK_DIRECTIONS)) {
    const filterVariant = metric === "epaPerPlay" || metric === "successRate" ? "filtered" : metric === "explosiveRate" ? "all" : "all";
    const values = collect((team) => {
      const m = fullSeasonMetricsByTeam.get(team)!;
      return (m.offense[filterVariant] as unknown as Record<string, number | null>)[metric] ?? null;
    });
    offenseRankTables[metric] = rankMetric(values, OFFENSE_METRIC_RANK_DIRECTIONS[metric]);
  }
  for (const metric of Object.keys(DEFENSE_METRIC_RANK_DIRECTIONS)) {
    const filterVariant = metric === "epaPerPlay" || metric === "successRate" ? "filtered" : metric === "explosiveRate" ? "all" : "all";
    const values = collect((team) => {
      const m = fullSeasonMetricsByTeam.get(team)!;
      return (m.defenseAllowed[filterVariant] as unknown as Record<string, number | null>)[metric] ?? null;
    });
    defenseRankTables[metric] = rankMetric(values, DEFENSE_METRIC_RANK_DIRECTIONS[metric]);
  }
  for (const team of allAbbrs) {
    const off: Record<string, number | null> = {};
    const def: Record<string, number | null> = {};
    for (const metric of Object.keys(OFFENSE_METRIC_RANK_DIRECTIONS)) off[metric] = offenseRankTables[metric][team] ?? null;
    for (const metric of Object.keys(DEFENSE_METRIC_RANK_DIRECTIONS)) def[metric] = defenseRankTables[metric][team] ?? null;
    offenseMetricRanksByTeam.set(team, off);
    defenseMetricRanksByTeam.set(team, def);
  }

  const teams: TeamPerformanceAnalyticsRow[] = allAbbrs.map((team) => {
    const windows = windowsByTeam.get(team)!;
    const gamesPlayed = rowsByTeam.get(team)?.length ?? 0;
    const boardRow = boardRowByTeam.get(team) ?? null;

    return {
      team,
      gamesPlayed,
      windows: {
        last4: windows.last4,
        last8: windows.last8,
        fullSeason: {
          ...windows.fullSeason,
          adjusted: boardRow
            ? {
                offense: {
                  epaPerPlay: boardRow.offense.epaPerPlayAdjusted,
                  successRate: boardRow.offense.successRateAdjusted,
                  explosiveRate: boardRow.offense.explosiveRateAdjusted,
                },
                defenseAllowed: {
                  epaPerPlay: boardRow.defense.epaPerPlayAllowedAdjusted,
                  successRate: boardRow.defense.successRateAllowedAdjusted,
                  explosiveRate: boardRow.defense.explosiveRateAllowedAdjusted,
                },
                pointDifferentialPerGame: { raw: boardRow.pointDifferential.raw, adjusted: boardRow.pointDifferential.adjusted },
              }
            : {
                offense: { epaPerPlay: null, successRate: null, explosiveRate: null },
                defenseAllowed: { epaPerPlay: null, successRate: null, explosiveRate: null },
                pointDifferentialPerGame: { raw: null, adjusted: null },
              },
          metricRanks: {
            offense: offenseMetricRanksByTeam.get(team)!,
            defenseAllowed: defenseMetricRanksByTeam.get(team)!,
          },
        },
      },
      performance: {
        offenseRating: boardRow?.offensePerformanceRating ?? null,
        offenseRank: boardRow?.offensePerformanceRank ?? null,
        defenseRating: boardRow?.defensePerformanceRating ?? null,
        defenseRank: boardRow?.defensePerformanceRank ?? null,
        performanceRating: boardRow?.performanceRating ?? null,
        performanceRank: boardRow?.performanceRank ?? null,
      },
    };
  });

  return {
    schemaVersion: TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION,
    _meta: {
      season,
      generatedAt: new Date().toISOString(),
      source: "nflverse (play-by-play, nflfastR EPA + traditional Success Rate + drives) + public/data/nfl results.json",
      ratingFormula:
        "OFF = mean(z(EPA/Play, garbage-time-filtered, opponent-adjusted), z(Traditional Success Rate, filtered, adjusted), z(Explosive Rate, unfiltered, adjusted)); " +
        "DEF = mean(-z(same 3 metrics, allowed)); Overall = 0.40*OFF + 0.40*DEF + 0.20*z(opponent-adjusted Point Differential/Game); " +
        "opponent adjustment applied only at the fullSeason window (v0.3.1-style: raw - (opponentMean - leagueMean)); " +
        "scale = 50 + 15*(compositeZ / divisor), clamped [1, 99].",
      scaleDivisors: PERFORMANCE_SCALE_DIVISORS,
    },
    teams,
  };
}

async function main() {
  const seasonArg = process.argv.find((a) => a.startsWith("--season="));
  const season = seasonArg ? Number(seasonArg.slice("--season=".length)) : 2026;
  const artifact = await generateTeamPerformanceAnalytics(season);
  const outDir = join(ROOT, "public", "data", "nfl", String(season));
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "team-performance-analytics.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  const played = artifact.teams.filter((t) => t.gamesPlayed > 0).length;
  console.log(`[nfl:performance-analytics] ${season}: wrote ${artifact.teams.length} teams (${played} with completed games) -> ${outPath}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(`[nfl:performance-analytics] FAILED: ${err.message}`);
    process.exit(1);
  });
}
