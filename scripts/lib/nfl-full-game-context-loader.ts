/**
 * WU3.3.1 -- I/O wrapper that reads every upstream JKB artifact off disk for
 * ONE game and calls the pure WU1 builder (`buildFullGameContext`,
 * nfl-full-game-context.ts) to produce a FRESH `NflGameContextPacket`.
 *
 * This is the exact same loading logic
 * scripts/generate-nfl-full-game-context-fixture.ts used to write the
 * checked-in `data/nfl/game-context/...` fixture file, extracted here so it
 * can be called programmatically (by update mode,
 * scripts/run-nfl-grok-research.ts, and by the fixture script itself) rather
 * than duplicated. There is exactly ONE context generator
 * (`buildFullGameContext`); this module is I/O wiring around it, never a
 * second implementation of context-building logic.
 *
 * "Fresh" here means: every source file is re-read from disk on every call,
 * and the resulting packet's `generatedAt`/`provenance.builtAt` reflect the
 * moment of THIS call -- never a cached object, never a previously-written
 * file's contents reused as-is. Whether the underlying VALUES have actually
 * changed since the last call is a separate question the caller answers
 * with nfl-snapshot-context-freshness.ts; this loader's only job is to
 * guarantee the read itself is live.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFullGameContext,
  sourceRef,
  type BuildFullGameContextInput,
  type BuildFullGameContextResult,
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
} from "./nfl-full-game-context";
import type { EpaPriorSeasonWindow, MetricsPriorSeasonWindow, TrenchSeasonData } from "./nfl-game-context";
import { createCoachingSnapshotSelector } from "./nfl-coaching-snapshot-source";
import type { PriorSeasonResultRow } from "./nfl-prior-season-baseline";
import { loadMatchupFormFacts } from "./nfl-team-form-facts-loader";
import { buildCurrentMarketView, buildLineMovementView, parseBettingLinesCurrentArtifact, parseBettingLinesHistoryArtifact, toBettingLinesGameToken } from "../../src/lib/nfl/bettingLinesView";

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readSource(root: string, logicalName: string, relativePath: string): { content: unknown; ref: ProvenanceSourceRef } {
  const filePath = join(root, relativePath);
  const content = loadJsonIfExists<unknown>(filePath);
  if (content == null) {
    return { content: null, ref: sourceRef(logicalName, relativePath, null, null) };
  }
  const generatedAt = typeof (content as { _meta?: { generatedAt?: unknown } })?._meta?.generatedAt === "string"
    ? (content as { _meta: { generatedAt: string } })._meta.generatedAt
    : typeof (content as { generatedAt?: unknown })?.generatedAt === "string"
      ? (content as { generatedAt: string }).generatedAt
      : null;
  return { content, ref: sourceRef(logicalName, relativePath, content, generatedAt) };
}

export interface LoadFreshGameContextInput {
  root: string;
  gameId: string;
  season: number;
  week: number;
  /** Injectable for deterministic tests; defaults to the current wall-clock time. */
  now?: () => Date;
}

export interface LoadFreshGameContextResult {
  result: BuildFullGameContextResult;
  /** The raw source list assembled for this call -- exposed so a caller can compute a content hash over the exact bytes read, without re-reading the files itself. */
  provenanceSources: ProvenanceSourceRef[];
}

/**
 * Reads every WU1 upstream artifact for `gameId` off disk RIGHT NOW and
 * builds a fresh `NflGameContextPacket` via the pure WU1 builder. Never
 * reads or reuses a previously-written `data/nfl/game-context/...json` file
 * -- that checked-in path is a snapshot OF this loader's past output, never
 * an input to it.
 */
export function loadFreshGameContextPacket(input: LoadFreshGameContextInput): LoadFreshGameContextResult {
  const { root, gameId } = input;
  const nowFn = input.now ?? (() => new Date());
  const sources: ProvenanceSourceRef[] = [];

  const games = readSource(root, "games", `public/data/nfl/${input.season}/games.json`);
  sources.push(games.ref);
  const teams = readSource(root, "teams", "public/data/nfl/teams.json");
  sources.push(teams.ref);
  const epa = readSource(root, "matchup-epa", "public/data/nfl/matchup-epa.json");
  sources.push(epa.ref);
  const metrics = readSource(root, "matchup-metrics", "public/data/nfl/matchup-metrics.json");
  sources.push(metrics.ref);
  const trench = readSource(root, "matchup-trench-metrics", "public/data/nfl/matchup-trench-metrics.json");
  sources.push(trench.ref);
  const powerRatings = readSource(root, "power-ratings", `public/data/nfl/${input.season}/power-ratings.json`);
  sources.push(powerRatings.ref);
  const matchupProjections = readSource(root, "matchup-projections", "public/data/nfl/matchup-projections.json");
  sources.push(matchupProjections.ref);
  const teamTotals = readSource(root, "team-totals", "public/data/nfl/team-totals.json");
  sources.push(teamTotals.ref);
  const yardageProjections = readSource(root, "yardage-projections", `public/data/nfl/${input.season}/yardage-projections.json`);
  sources.push(yardageProjections.ref);
  const tdPreview = readSource(root, "touchdown-preview", `public/data/nfl/${input.season}/touchdown-preview.json`);
  sources.push(tdPreview.ref);
  const matchupInjuries = readSource(root, "matchup-injuries", "public/data/nfl/matchup-injuries.json");
  sources.push(matchupInjuries.ref);
  const weekToken = String(input.week).padStart(2, "0");
  const dfsWeek = readSource(root, "dfs-lineup-context", `public/data/nfl/dfs/${input.season}/week-${weekToken}.json`);
  sources.push(dfsWeek.ref);
  const bettingLinesCurrent = readSource(root, "betting-lines-current", "public/data/market/betting-lines-current.json");
  sources.push(bettingLinesCurrent.ref);
  const historyPath = `public/data/market/betting-lines-history/nfl/${toBettingLinesGameToken(gameId)}.json`;
  const bettingLinesHistory = readSource(root, "betting-lines-history", historyPath);
  sources.push(bettingLinesHistory.ref);
  const priorSeasonResults = readSource(root, `results-${input.season - 1}`, `public/data/nfl/${input.season - 1}/results.json`);
  sources.push(priorSeasonResults.ref);

  // WU2 -- deterministic current-season team-form facts (raw, descriptive). Their source files join the provenance list so a change in any of them is visible to the freshness check.
  const teamFormResult = loadMatchupFormFacts({ root, season: input.season, gameId });
  if (teamFormResult.status === "ok") sources.push(...teamFormResult.sources);

  const selectCoachingSnapshot = createCoachingSnapshotSelector(root);
  const gameForKickoff = (games.content as GamesArtifact | null)?.games.find((g) => g.gameId === gameId);
  const coachingSnapshot = gameForKickoff ? selectCoachingSnapshot({ season: input.season, week: input.week, kickoffUtc: gameForKickoff.dateUtc }) : null;

  const currentArtifact = bettingLinesCurrent.content ? parseBettingLinesCurrentArtifact(bettingLinesCurrent.content) : null;
  const currentMarketView = currentArtifact ? buildCurrentMarketView({ artifact: currentArtifact, jkbGameId: gameId }) : null;
  const historyArtifact = bettingLinesHistory.content ? parseBettingLinesHistoryArtifact(bettingLinesHistory.content) : null;
  const lineMovementView = historyArtifact && currentMarketView ? buildLineMovementView({ history: historyArtifact, sportsbookId: currentMarketView.sportsbook.id }) : null;

  const epaWindow = (epa.content as { windows?: { "prior-season-full"?: EpaPriorSeasonWindow } } | null)?.windows?.["prior-season-full"] ?? null;
  const metricsWindow = (metrics.content as { windows?: { "prior-season-full"?: MetricsPriorSeasonWindow } } | null)?.windows?.["prior-season-full"] ?? null;
  const trenchSeasons = (trench.content as { seasons?: Record<string, TrenchSeasonData> } | null)?.seasons ?? {};
  // buildTrenchesContext's contract is the PRIOR completed season. Never "the newest key": once ESPN publishes an in-season archive (e.g. 2026 "Through Week 2") that would silently swap current-season data in under a prior-season label.
  const trenchSeasonKey = trenchSeasons[String(input.season - 1)] ? input.season - 1 : null;
  const trenchSeasonData = trenchSeasonKey != null ? trenchSeasons[String(trenchSeasonKey)] : null;
  const priorResults = (priorSeasonResults.content as { results?: PriorSeasonResultRow[] } | null)?.results ?? [];

  const buildInput: BuildFullGameContextInput = {
    games: games.content as GamesArtifact,
    teams: teams.content as TeamsArtifact,
    gameId,
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
    teamForm: teamFormResult.status === "ok" ? { home: teamFormResult.home, away: teamFormResult.away } : null,
    priorSeasonResults: priorResults,
    provenanceSources: sources,
    generatedAt: nowFn().toISOString(),
  };

  return { result: buildFullGameContext(buildInput), provenanceSources: sources };
}
