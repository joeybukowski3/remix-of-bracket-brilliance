/**
 * WU5 -- deterministic, local-only exporter: internal Grok/ChatGPT
 * AnalysisSnapshot chains (scripts/lib/nfl-snapshot-store.ts) -> a single
 * sanitized public artifact the browser can fetch directly
 * (public/data/nfl/<season>/ai-handicaps/<gameId>.json, contract in
 * src/lib/nfl/aiHandicapPresentation.ts).
 *
 * For each provider, resolves the LATEST WU4.6-COMPATIBLE analysis-bearing
 * snapshot via readLatestWu46CompatibleAnalysisSnapshot() (WU4.6.1) -- never
 * readLatestSnapshot() (may return a research-only snapshot with no
 * opinion) and never readPreviousAnalysisSnapshot() alone (the WU4.4.2
 * update-mode guard, which accepts ANY analysis-bearing snapshot including
 * a legacy pre-WU4.6 one with no blindPrediction/marketDecision -- exactly
 * the shape that must never be surfaced as the current public opinion,
 * since its thesis/side/total may still carry JKB-contaminated reasoning
 * from before the market-blind architecture existed).
 * readPreviousAnalysisSnapshot() is still used here, separately, only to
 * distinguish the two analysis_unavailable reasons: "no_analysis_yet" (no
 * analysis-bearing snapshot exists at all) vs
 * "independent_handicap_not_generated" (a legacy analysis-bearing snapshot
 * exists but isn't WU4.6-compatible yet).
 *
 * No network call, no provider API key needed -- this only reads what is
 * already on disk. Safe to re-run any time; each run overwrites the one
 * public artifact for the requested game(s) with the freshest resolution.
 *
 * Run by hand:
 *   npx tsx scripts/generate-nfl-ai-handicap-presentation.ts --game=2026_01_BAL_IND
 *   npx tsx scripts/generate-nfl-ai-handicap-presentation.ts --season=2026 --week=1   (every game that has analysis data that week)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readLatestWu46CompatibleAnalysisSnapshot, readPreviousAnalysisSnapshot } from "./lib/nfl-snapshot-store";
import { isWu46CompatibleAnalysisState } from "./lib/nfl-snapshot-analysis-lifecycle";
import { computeSideEdgePoints, computeTotalEdgePoints } from "./lib/nfl-market-edge";
import type { AnalysisSnapshot } from "./lib/nfl-snapshot-types";
import {
  nflAiHandicapArtifactPath,
  type AiHandicapCard,
  type AiHandicapProvider,
  type NflAiHandicapPresentation,
} from "../src/lib/nfl/aiHandicapPresentation";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DISPLAY_NAMES: Record<AiHandicapProvider, string> = {
  grok: "Grokowski",
  chatgpt: "Chatty Ice",
};

interface GameIdentity {
  gameId: string;
  season: number;
  week: number;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
}

function readGameIdentity(root: string, gameId: string, season: number, week: number): GameIdentity {
  const path = join(root, "data", "nfl", "game-context", String(season), String(week), `${gameId}.json`);
  if (!existsSync(path)) {
    throw new Error(`No deterministic game-context artifact at ${path} -- cannot resolve team identity/kickoff for ${gameId}.`);
  }
  const packet = JSON.parse(readFileSync(path, "utf8")) as {
    identity: { homeTeam: string; awayTeam: string };
    schedule: { kickoffUtc: string };
  };
  return { gameId, season, week, kickoff: packet.schedule.kickoffUtc, homeTeam: packet.identity.homeTeam, awayTeam: packet.identity.awayTeam };
}

/**
 * WU4.6.1 -- a provider is only status:"ok" once its LATEST WU4.6-compatible
 * snapshot exists (resolved by readLatestWu46CompatibleAnalysisSnapshot(),
 * never readPreviousAnalysisSnapshot()/readLatestSnapshot(), both of which
 * may return a legacy pre-WU4.6 or research-only snapshot). A provider whose
 * only analysis-bearing snapshot lacks blindPrediction/marketDecision is
 * reported analysis_unavailable/independent_handicap_not_generated -- its
 * old thesis/side/total/factors are never surfaced as the current opinion.
 */
function buildHandicapCard(
  snapshot: AnalysisSnapshot | null,
  anyAnalysisExists: boolean,
  provider: AiHandicapProvider,
  identity: GameIdentity
): AiHandicapCard {
  const displayName = DISPLAY_NAMES[provider];
  if (!snapshot || !snapshot.analysisState || !isWu46CompatibleAnalysisState(snapshot.analysisState)) {
    return {
      status: "analysis_unavailable",
      provider,
      displayName,
      reason: anyAnalysisExists ? "independent_handicap_not_generated" : "no_analysis_yet",
    };
  }
  const { analysisState } = snapshot;
  const { blindPrediction, marketDecision } = analysisState;
  const { side, total } = marketDecision;
  const independentPrediction = { fairSpread: blindPrediction.fairSpread, projectedTotal: blindPrediction.projectedTotal };

  const sideTeam = side.lean === "home" ? identity.homeTeam : side.lean === "away" ? identity.awayTeam : null;
  const sideLine = side.lean === "home" ? side.spreadLineAtOpinion?.homeLine ?? null : side.lean === "away" ? side.spreadLineAtOpinion?.awayLine ?? null : null;

  const marketHomeLine = snapshot.market.spread.homeLine;
  const marketAwayLine = snapshot.market.spread.awayLine;
  const marketTotal = snapshot.market.total.line;

  return {
    status: "ok",
    provider,
    displayName,
    analysisSnapshotId: snapshot.snapshotId,
    analyzedAt: snapshot.createdAt,
    prediction: independentPrediction,
    market: { spread: { homeLine: marketHomeLine, awayLine: marketAwayLine }, total: marketTotal },
    edges: {
      sidePoints: computeSideEdgePoints(independentPrediction, identity.homeTeam, marketHomeLine),
      totalPoints: computeTotalEdgePoints(independentPrediction, marketTotal),
    },
    side: {
      lean: side.lean,
      team: sideTeam,
      line: sideLine,
      confidence: side.confidence,
      rationale: side.rationale ?? null,
    },
    total: {
      lean: total.lean,
      line: total.totalLineAtOpinion,
      confidence: total.confidence,
      rationale: total.rationale ?? null,
    },
    centralThesis: blindPrediction.footballThesis,
    keyFactors: (analysisState.matchupFactors ?? []).map((factor) => ({
      area: factor.area,
      finding: factor.finding,
      supports: factor.supports,
      importance: factor.importance,
    })),
    failureModes: (analysisState.failureModes ?? []).map((mode) => ({ scenario: mode.scenario, whyItMatters: mode.whyItMatters })),
    evidenceQualitySummary: analysisState.evidenceQualityAssessment
      ? { strengths: [...analysisState.evidenceQualityAssessment.strengths], limitations: [...analysisState.evidenceQualityAssessment.limitations] }
      : null,
  };
}

export function generatePresentationForGame(root: string, gameId: string, season: number, week: number): NflAiHandicapPresentation {
  const identity = readGameIdentity(root, gameId, season, week);
  const grokSnapshot = readLatestWu46CompatibleAnalysisSnapshot(root, season, week, gameId, "grok");
  const chatgptSnapshot = readLatestWu46CompatibleAnalysisSnapshot(root, season, week, gameId, "chatgpt");
  const grokHasAnyAnalysis = readPreviousAnalysisSnapshot(root, season, week, gameId, "grok") !== null;
  const chatgptHasAnyAnalysis = readPreviousAnalysisSnapshot(root, season, week, gameId, "chatgpt") !== null;

  return {
    schemaVersion: "nfl-ai-handicap-presentation-v1",
    gameId,
    season,
    week,
    kickoff: identity.kickoff,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    generatedAt: new Date().toISOString(),
    handicappers: {
      grokowski: buildHandicapCard(grokSnapshot, grokHasAnyAnalysis, "grok", identity),
      chattyIce: buildHandicapCard(chatgptSnapshot, chatgptHasAnyAnalysis, "chatgpt", identity),
    },
  };
}

function writePresentation(root: string, presentation: NflAiHandicapPresentation): string {
  const outputPath = join(root, "public", nflAiHandicapArtifactPath(presentation.season, presentation.gameId));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(presentation, null, 2)}\n`, "utf8");
  return outputPath;
}

function parseArgs(argv: string[]): { game: string | null; season: number | null; week: number | null } {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  return {
    game: flags.get("game") ?? null,
    season: flags.has("season") ? Number(flags.get("season")) : null,
    week: flags.has("week") ? Number(flags.get("week")) : null,
  };
}

/** Every gameId that has an analysis directory (grok and/or chatgpt) for this season/week. */
function discoverGameIds(root: string, season: number, week: number): string[] {
  const weekDir = join(root, "data", "nfl", "analysis", String(season), String(week));
  if (!existsSync(weekDir)) return [];
  return readdirSync(weekDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  let targets: { gameId: string; season: number; week: number }[];
  if (args.game) {
    const [seasonStr, weekStr] = args.game.split("_");
    targets = [{ gameId: args.game, season: Number(seasonStr), week: Number(weekStr) }];
  } else if (args.season != null && args.week != null) {
    targets = discoverGameIds(ROOT, args.season, args.week).map((gameId) => ({ gameId, season: args.season!, week: args.week! }));
    if (targets.length === 0) {
      console.error(`No analysis directories found under data/nfl/analysis/${args.season}/${args.week}.`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Usage: npx tsx scripts/generate-nfl-ai-handicap-presentation.ts --game=2026_01_BAL_IND");
    console.error("   or: npx tsx scripts/generate-nfl-ai-handicap-presentation.ts --season=2026 --week=1");
    process.exitCode = 1;
    return;
  }

  for (const target of targets) {
    const presentation = generatePresentationForGame(ROOT, target.gameId, target.season, target.week);
    const outputPath = writePresentation(ROOT, presentation);
    console.log(`\n=== ${target.gameId} ===`);
    console.log(`Wrote ${outputPath}`);
    console.log(`Grokowski: ${JSON.stringify(presentation.handicappers.grokowski)}`);
    console.log(`Chatty Ice: ${JSON.stringify(presentation.handicappers.chattyIce)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
