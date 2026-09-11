/**
 * WU1 (docs/nfl-grok-chatgpt-handicap-architecture.md §4/§21/§22) -- builds
 * ONE private/dev Game Context Packet for the documented first-test game
 * (2026_01_BAL_IND, selected per §22's rule: current, not-yet-final week-1
 * game with a live market line and full EPA/YPP/trench/yardage/TD-score
 * coverage for both teams) and writes it to
 * data/nfl/game-context/<season>/<week>/<gameId>.json.
 *
 * This is a manual/dev fixture script, NOT a scheduled workflow -- it is not
 * wired into any GitHub Actions cron (WU1 explicitly forbids adding
 * workflows). Run it by hand: `npx tsx scripts/generate-nfl-full-game-context-fixture.ts`.
 *
 * I/O wiring only -- all leakage-safety and section-assembly logic lives in
 * scripts/lib/nfl-full-game-context.ts (pure, unit-tested).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFullGameContext,
  sourceRef,
  type BuildFullGameContextInput,
  type DfsWeekArtifact,
  type GamesArtifact,
  type MatchupInjuriesArtifact,
  type MatchupProjectionsArtifact,
  type PowerRatingsArtifact,
  type ProvenanceSourceRef,
  type TdPreviewArtifact,
  type TeamsArtifact,
  type TeamTotalsArtifact,
  type YardageProjectionsArtifact,
} from "./lib/nfl-full-game-context";
import { validateGameContextPacket } from "./lib/nfl-game-context-validators";
import { createCoachingSnapshotSelector } from "./lib/nfl-coaching-snapshot-source";
import type { EpaPriorSeasonWindow, MetricsPriorSeasonWindow, TrenchSeasonData } from "./lib/nfl-game-context";
import {
  buildCurrentMarketView,
  buildLineMovementView,
  parseBettingLinesCurrentArtifact,
  parseBettingLinesHistoryArtifact,
  toBettingLinesGameToken,
} from "../src/lib/nfl/bettingLinesView";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readSource(logicalName: string, relativePath: string): { content: unknown; ref: ProvenanceSourceRef } {
  const filePath = join(ROOT, relativePath);
  if (!existsSync(filePath)) {
    return { content: null, ref: sourceRef(logicalName, relativePath, null, null) };
  }
  const raw = readFileSync(filePath, "utf8");
  const content = JSON.parse(raw);
  const generatedAt = typeof content?._meta?.generatedAt === "string" ? content._meta.generatedAt : (content?.generatedAt ?? null);
  return { content, ref: sourceRef(logicalName, relativePath, content, generatedAt) };
}

function main(): void {
  const sources: ProvenanceSourceRef[] = [];

  const games = readSource("games", "public/data/nfl/2026/games.json");
  sources.push(games.ref);
  const teams = readSource("teams", "public/data/nfl/teams.json");
  sources.push(teams.ref);
  const epa = readSource("matchup-epa", "public/data/nfl/matchup-epa.json");
  sources.push(epa.ref);
  const metrics = readSource("matchup-metrics", "public/data/nfl/matchup-metrics.json");
  sources.push(metrics.ref);
  const trench = readSource("matchup-trench-metrics", "public/data/nfl/matchup-trench-metrics.json");
  sources.push(trench.ref);
  const powerRatings = readSource("power-ratings", "public/data/nfl/2026/power-ratings.json");
  sources.push(powerRatings.ref);
  const matchupProjections = readSource("matchup-projections", "public/data/nfl/matchup-projections.json");
  sources.push(matchupProjections.ref);
  const teamTotals = readSource("team-totals", "public/data/nfl/team-totals.json");
  sources.push(teamTotals.ref);
  const yardageProjections = readSource("yardage-projections", "public/data/nfl/2026/yardage-projections.json");
  sources.push(yardageProjections.ref);
  const tdPreview = readSource("touchdown-preview", "public/data/nfl/2026/touchdown-preview.json");
  sources.push(tdPreview.ref);
  const matchupInjuries = readSource("matchup-injuries", "public/data/nfl/matchup-injuries.json");
  sources.push(matchupInjuries.ref);
  const dfsWeek = readSource("dfs-lineup-context", "public/data/nfl/dfs/2026/week-01.json");
  sources.push(dfsWeek.ref);
  const bettingLinesCurrent = readSource("betting-lines-current", "public/data/market/betting-lines-current.json");
  sources.push(bettingLinesCurrent.ref);
  const historyPath = `public/data/market/betting-lines-history/nfl/${toBettingLinesGameToken(GAME_ID)}.json`;
  const bettingLinesHistory = readSource("betting-lines-history", historyPath);
  sources.push(bettingLinesHistory.ref);
  const priorSeasonResults = readSource("results-2025", "public/data/nfl/2025/results.json");
  sources.push(priorSeasonResults.ref);

  const selectCoachingSnapshot = createCoachingSnapshotSelector(ROOT);
  const gameForKickoff = (games.content as GamesArtifact)?.games.find((g) => g.gameId === GAME_ID);
  const coachingSnapshot = gameForKickoff
    ? selectCoachingSnapshot({ season: SEASON, week: WEEK, kickoffUtc: gameForKickoff.dateUtc })
    : null;

  const currentArtifact = bettingLinesCurrent.content ? parseBettingLinesCurrentArtifact(bettingLinesCurrent.content) : null;
  const currentMarketView = currentArtifact ? buildCurrentMarketView({ artifact: currentArtifact, jkbGameId: GAME_ID }) : null;
  const historyArtifact = bettingLinesHistory.content ? parseBettingLinesHistoryArtifact(bettingLinesHistory.content) : null;
  const lineMovementView =
    historyArtifact && currentMarketView
      ? buildLineMovementView({ history: historyArtifact, sportsbookId: currentMarketView.sportsbook.id })
      : null;

  const epaWindow = (epa.content as { windows?: { "prior-season-full"?: EpaPriorSeasonWindow } } | null)?.windows?.[
    "prior-season-full"
  ] ?? null;
  const metricsWindow = (metrics.content as { windows?: { "prior-season-full"?: MetricsPriorSeasonWindow } } | null)
    ?.windows?.["prior-season-full"] ?? null;
  const trenchSeasons = (trench.content as { seasons?: Record<string, TrenchSeasonData> } | null)?.seasons ?? {};
  const trenchSeasonKey = Object.keys(trenchSeasons).map(Number).sort((a, b) => b - a)[0] ?? null;
  const trenchSeasonData = trenchSeasonKey != null ? (trenchSeasons[String(trenchSeasonKey)] ?? null) : null;

  const priorResults = (priorSeasonResults.content as { results?: { homeAbbr: string; awayAbbr: string }[] } | null)?.results ?? [];

  const input: BuildFullGameContextInput = {
    games: games.content as GamesArtifact,
    teams: teams.content as TeamsArtifact,
    gameId: GAME_ID,
    epaWindow,
    yppWindow: metricsWindow,
    trenchSeasonData,
    trenchSeasonKey,
    coachingSnapshot,
    currentMarketView,
    lineMovementView,
    powerRatings: powerRatings.content as PowerRatingsArtifact | null,
    matchupProjections: matchupProjections.content as MatchupProjectionsArtifact | null,
    teamTotals: teamTotals.content as TeamTotalsArtifact | null,
    yardageProjections: yardageProjections.content as YardageProjectionsArtifact | null,
    tdPreview: tdPreview.content as TdPreviewArtifact | null,
    matchupInjuries: matchupInjuries.content as MatchupInjuriesArtifact | null,
    dfsWeek: dfsWeek.content as DfsWeekArtifact | null,
    priorSeasonResults: priorResults,
    provenanceSources: sources,
    generatedAt: new Date().toISOString(),
  };

  const result = buildFullGameContext(input);
  if (result.status !== "ok") {
    throw new Error(`buildFullGameContext failed: ${result.reason}`);
  }

  const issues = validateGameContextPacket(result.packet, input.teams);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    console.error("Validation errors:", JSON.stringify(errors, null, 2));
    throw new Error(`Context packet failed validation (${errors.length} error(s))`);
  }

  const outDir = join(ROOT, "data", "nfl", "game-context", String(SEASON), String(WEEK));
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${GAME_ID}.json`);
  writeFileSync(outFile, JSON.stringify(result.packet, null, 2) + "\n", "utf8");

  console.log(`Wrote ${outFile}`);
  console.log(`Validation: ${issues.length === 0 ? "PASSED" : `${issues.length} warning(s)`}`);
}

main();
