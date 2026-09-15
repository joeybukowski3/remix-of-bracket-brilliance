/**
 * WU3.4 -- manual, cost-controlled CLI for running ONE live Grok
 * HANDICAPPING pass (reasoning only, no web_search) against the
 * `/v1/responses` endpoint, for ONE game.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER: a "pass" is now TWO
 * sequential, separately-billed Grok calls:
 *   STAGE A -- the blind football projection, built from a packet/evidence
 *     set with NO sportsbook pricing anywhere (nfl-ai-context-sanitizer.ts).
 *     Its output (fair spread/projected total/thesis) is LOCKED the moment
 *     it validates.
 *   STAGE B -- the market decision, given the LOCKED Stage A output revealed
 *     verbatim plus the current sportsbook price for the first time. Stage
 *     B cannot revise the locked prediction; its schema has no field for one.
 *
 * Modes:
 *   --mode=initial: runs Stage A then Stage B fresh, and links the result to
 *     the game's latest FACTUAL snapshot (from WU3.3's research pipeline)
 *     via previousSnapshotId. updateAssessment is null (there is no PRIOR
 *     opinion to assess a delta against yet).
 *   --mode=update: reads the latest Grok snapshot that already carries a
 *     non-null analysisState, runs a Stage A blind re-projection (which may
 *     reaffirm or revise the prior fair spread/total) followed by a Stage B
 *     market decision, and produces a fully mechanical UpdateAssessment
 *     (nfl-grok-analysis-pipeline.ts) plus a new snapshot. The previous
 *     sportsbook price is NEVER passed into the Stage A re-projection call.
 *
 * LIVE DATA REQUIREMENT (both modes, before any Grok call):
 *   1. Rebuild the deterministic Game Context Packet fresh via the shared
 *      WU3.3.1 loader (nfl-full-game-context-loader.ts) -- never read the
 *      possibly-stale checked-in file.
 *   2. Load the canonical Grok evidence store (evidence.live-test.json --
 *      see scripts/bootstrap-nfl-grok-initial-snapshot.ts's header for why
 *      this file, not the WU2 synthetic evidence.json, is the real stream).
 *   3. Resolve evidence authority/supersession/conflict
 *      (resolveEvidenceAuthority, nfl-evidence-store.ts) fresh from that
 *      full record set, then filter market-pricing commentary out of the
 *      set Stage A is shown (nfl-ai-context-sanitizer.ts's
 *      filterEvidenceRecordsForBlindStageA) -- Stage B may still see it.
 *   4. Read the current deterministic market from the FRESH context, never
 *      from an older snapshot's stored market. Stage A never sees it.
 *   5. Validate the fresh context and check pregame safety
 *      (isPregameStreamLocked/canCreatePregameSnapshot) before spending
 *      money on a request.
 *
 * Cost guardrails (unchanged posture from WU3/WU3.3): requires --live,
 * processes exactly one game per invocation, never retries with a bigger
 * budget or a different prompt because the first result "looks wrong" --
 * a validation failure is reported and the run stops.
 *
 * Run by hand:
 *   `npx tsx scripts/run-nfl-grok-handicap.ts --live [--game=2026_01_BAL_IND] [--mode=initial|update]`
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFreshGameContextPacket } from "./lib/nfl-full-game-context-loader";
import { validateGameContextPacket } from "./lib/nfl-game-context-validators";
import { checkContextFreshness } from "./lib/nfl-snapshot-context-freshness";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./lib/nfl-snapshot-lock";
import { computeMarketDelta } from "./lib/nfl-snapshot-market-delta";
import { computeSnapshotId, readLatestSnapshot, writeSnapshot } from "./lib/nfl-snapshot-store";
import { evidenceArtifactPath, readEvidenceArtifact, resolveEvidenceAuthority } from "./lib/nfl-evidence-store";
import { footballContextHash } from "./lib/nfl-full-game-context";
import { auditStageAPromptForMarketPricing, filterEvidenceRecordsForBlindStageA, sanitizeGameContextPacketForBlindStageA } from "./lib/nfl-ai-context-sanitizer";
import {
  buildStageAInitialPrompt,
  buildCitableEvidenceLines,
  runGrokStageAInitial,
  runGrokStageAUpdate,
  runGrokStageBInitial,
  runGrokStageBUpdate,
  type AnalysisGameFacts,
  type PreviousBlindState,
} from "./lib/nfl-grok-analysis-adapter";
import {
  validateGrokStageA,
  validateGrokStageAUpdate,
  validateGrokStageB,
  validateGrokStageBUpdate,
  type GrokStageAValidationContext,
  type GrokStageBValidationContext,
} from "./lib/nfl-grok-analysis-validator";
import { combineInitialStages, combineUpdateStages } from "./lib/nfl-grok-analysis-pipeline";
import type { TeamsArtifact } from "./lib/nfl-full-game-context";
import type { AnalysisSnapshot, MarketAtDecision, SnapshotAnalysisState, SnapshotMarketState } from "./lib/nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): { live: boolean; gameId: string; mode: "initial" | "update" } {
  const flags = new Map<string, string>();
  let live = false;
  for (const arg of argv) {
    if (arg === "--live") { live = true; continue; }
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  return { live, gameId: flags.get("game") ?? "2026_01_BAL_IND", mode: (flags.get("mode") as "initial" | "update" | undefined) ?? "initial" };
}

function currentMarketStateFromPacket(packet: import("./lib/nfl-full-game-context").NflGameContextPacket): SnapshotMarketState {
  return { sportsbook: packet.market.sportsbook, spread: packet.market.spread, total: packet.market.total, moneyline: packet.market.moneyline, asOf: packet.provenance.builtAt };
}

/** Mechanical, from the authoritative current market read -- never echoed from provider output. */
function buildMarketAtDecision(currentMarketState: SnapshotMarketState): MarketAtDecision {
  return { spread: currentMarketState.spread, total: currentMarketState.total.line, asOf: currentMarketState.asOf };
}

function toPreviousBlindState(state: SnapshotAnalysisState): PreviousBlindState {
  if (state.blindPrediction) {
    return { thesis: state.blindPrediction.footballThesis, fairSpread: state.blindPrediction.fairSpread, projectedTotal: state.blindPrediction.projectedTotal };
  }
  // Pre-WU4.6 snapshot: fall back to the legacy independentPrediction field.
  return { thesis: state.thesis, fairSpread: state.independentPrediction?.fairSpread ?? null, projectedTotal: state.independentPrediction?.projectedTotal ?? null };
}

/**
 * WU4.6.1 -- defense-in-depth audit: independently rebuilds the exact Stage
 * A prompt and runs the shared structural + pattern-based audit
 * (nfl-ai-context-sanitizer.ts's auditStageAPromptForMarketPricing) BEFORE
 * trusting the request that was actually sent (which used the same
 * builder). Prints full diagnostics on FAILURE -- matched rule, a short
 * snippet, and the source class -- without leaking the API key or any
 * other secret (everything printed here is local prompt/evidence text).
 * Exits the run if this ever fails.
 */
function auditStageAPromptHasNoMarketPricing(
  game: AnalysisGameFacts,
  packet: import("./lib/nfl-full-game-context").NflGameContextPacket,
  evidenceLines: readonly string[],
  blindEvidenceRecords: readonly import("./lib/nfl-evidence-types").EvidenceRecord[]
): boolean {
  const prompt = buildStageAInitialPrompt(game, packet, evidenceLines);
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  const result = auditStageAPromptForMarketPricing(prompt, blindPacket, blindEvidenceRecords);
  if (!result.pass) {
    for (const finding of result.findings) {
      console.error(`  [Stage A audit] rule=${finding.matched} sourceClass=${finding.sourceClass} snippet="${finding.snippet}"`);
    }
  }
  return result.pass;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.live) {
    console.error("Refusing to run without --live -- this script makes real, billed xAI API calls.");
    console.error("Usage: npx tsx scripts/run-nfl-grok-handicap.ts --live [--game=2026_01_BAL_IND] [--mode=initial|update]");
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("GROK_API_KEY or XAI_API_KEY is not set.");
    process.exitCode = 1;
    return;
  }

  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);

  // LIVE DATA REQUIREMENT step 1: fresh context, never the stale checked-in file.
  const now = new Date();
  const { result: freshContextResult } = loadFreshGameContextPacket({ root: ROOT, gameId: args.gameId, season, week, now: () => now });
  if (freshContextResult.status !== "ok") {
    console.error(`Failed to refresh Game Context Packet: ${freshContextResult.reason}`);
    process.exitCode = 1;
    return;
  }
  const packet = freshContextResult.packet;

  // step 5a: validate the fresh context.
  const teamsArtifact = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;
  const contextIssues = validateGameContextPacket(packet, teamsArtifact);
  const contextErrors = contextIssues.filter((i) => i.severity === "error");
  if (contextErrors.length > 0) {
    console.error("Refreshed Game Context Packet failed validation:", JSON.stringify(contextErrors, null, 2));
    process.exitCode = 1;
    return;
  }

  // step 5b: pregame safety before spending money.
  if (isPregameStreamLocked(packet.schedule.kickoffUtc, () => now)) {
    console.error(`Refusing to run: kickoff (${packet.schedule.kickoffUtc}) has already passed. No handicap after kickoff.`);
    process.exitCode = 1;
    return;
  }

  // step 2: load the canonical (real) Grok evidence store.
  const canonicalPath = evidenceArtifactPath(ROOT, season, week, args.gameId, "grok");
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  const evidenceArtifact = readEvidenceArtifact(liveTestPath);
  if (!evidenceArtifact || evidenceArtifact.fixture) {
    console.error(`No real Grok evidence found at ${liveTestPath} (or it is marked fixture:true) -- cannot handicap without validated evidence.`);
    process.exitCode = 1;
    return;
  }
  const allEvidenceRecords = evidenceArtifact.evidence;

  // step 3: resolve authority/supersession/conflict fresh from the full evidence set, then
  // filter market-pricing commentary out of what Stage A (blind) is shown.
  const authority = resolveEvidenceAuthority(allEvidenceRecords);
  const blindEvidenceRecords = filterEvidenceRecordsForBlindStageA(allEvidenceRecords);
  const blindCitableEvidenceLines = buildCitableEvidenceLines(blindEvidenceRecords, authority);
  const excludedForMarketCommentary = allEvidenceRecords.length - blindEvidenceRecords.length;
  if (excludedForMarketCommentary > 0) {
    console.log(`Excluded ${excludedForMarketCommentary} market-pricing evidence record(s) from Stage A's blind evidence set.`);
  }

  // step 4: current market from the FRESH context (not any older snapshot's stored market). Stage A never sees this.
  const currentMarketState = currentMarketStateFromPacket(packet);
  const freshContextHash = footballContextHash(packet);

  const previousSnapshot = readLatestSnapshot(ROOT, season, week, args.gameId, "grok");
  if (!previousSnapshot) {
    console.error(`No prior Grok snapshot found for ${args.gameId} -- run the WU3 bootstrap / WU3.3 factual pipeline first.`);
    process.exitCode = 1;
    return;
  }

  const freshness = checkContextFreshness(previousSnapshot.context.contextGeneratedAt, packet.generatedAt);
  console.log(`Context freshness: ${freshness.status} -- ${freshness.reason}`);
  if (freshness.status === "stale_or_reused") {
    console.error("Refusing to run: stale-context guard tripped.");
    process.exitCode = 1;
    return;
  }

  const game: AnalysisGameFacts = {
    gameId: packet.identity.gameId,
    homeTeamFull: packet.identity.homeTeamFull,
    awayTeamFull: packet.identity.awayTeamFull,
    homeTeam: packet.identity.homeTeam,
    awayTeam: packet.identity.awayTeam,
    kickoffUtc: packet.schedule.kickoffUtc,
  };

  // WU4.6 defense-in-depth: independently confirm the Stage A prompt carries no market pricing BEFORE spending money.
  if (!auditStageAPromptHasNoMarketPricing(game, packet, blindCitableEvidenceLines, blindEvidenceRecords)) {
    console.error("Refusing to run: Stage A prompt audit detected possible market-pricing content. This should be structurally impossible -- investigate nfl-ai-context-sanitizer.ts before proceeding.");
    process.exitCode = 1;
    return;
  }
  console.log("Stage A market-pricing audit: PASSED -- no sportsbook spread/total figures found in the Stage A prompt.");

  const newResearchCutoff = now.toISOString();
  const preflight = canCreatePregameSnapshot({ kickoffUtc: packet.schedule.kickoffUtc, researchCutoff: newResearchCutoff, snapshotType: "daily_update", now: () => now });
  if (!preflight.ok) {
    console.error(`Refusing to run: ${preflight.reason}`);
    process.exitCode = 1;
    return;
  }

  const previousMarketState: SnapshotMarketState = { sportsbook: previousSnapshot.market.sportsbook, spread: previousSnapshot.market.spread, total: previousSnapshot.market.total, moneyline: previousSnapshot.market.moneyline, asOf: previousSnapshot.market.asOf };
  const marketRecord = computeMarketDelta(previousMarketState, currentMarketState);
  const marketAtDecision = buildMarketAtDecision(currentMarketState);

  console.log(`Running ONE live Grok two-stage HANDICAP pass -- mode="${args.mode}" game=${game.gameId} (${game.awayTeamFull} @ ${game.homeTeamFull})`);
  console.log(`previousSnapshotId=${previousSnapshot.snapshotId} previousSnapshotType=${previousSnapshot.snapshotType} previousAnalysisState=${previousSnapshot.analysisState ? "present" : "null"}`);

  if (args.mode === "initial") {
    console.log("\n=== STAGE A: BLIND FOOTBALL PROJECTION ===");
    const stageAResult = await runGrokStageAInitial({ game, packet, evidenceLines: blindCitableEvidenceLines, apiKey });
    if (!stageAResult.ok) {
      console.error(`Grok Stage A FAILED: ${stageAResult.error}`);
      if (stageAResult.telemetry) console.error("Telemetry at failure:", JSON.stringify(stageAResult.telemetry, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(stageAResult.telemetry, null, 2));

    // WU4.6.5: the trusted orchestration timestamp for this stage -- minted here, at the moment
    // Stage A's output is accepted for validation, never read from the provider's own response.
    const stageAContext: GrokStageAValidationContext = { model: "grok", gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash: freshContextHash, contextPacket: packet, homeTeam: game.homeTeam, awayTeam: game.awayTeam, allEvidenceRecords };
    const stageA = validateGrokStageA(stageAResult.raw, stageAContext);
    if (!stageA.ok) {
      console.error("Stage A FAILED validation:");
      for (const reason of stageA.reasons) console.error(`  - ${reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`LOCKED footballThesis: ${stageA.analysis.footballThesis}`);
    console.log(`LOCKED prediction: ${JSON.stringify(stageA.analysis.prediction)}`);

    console.log("\n=== STAGE B: MARKET DECISION ===");
    const stageBResult = await runGrokStageBInitial({ game, lockedStageA: stageA.analysis, currentMarketState, apiKey });
    if (!stageBResult.ok) {
      console.error(`Grok Stage B FAILED: ${stageBResult.error}`);
      if (stageBResult.telemetry) console.error("Telemetry at failure:", JSON.stringify(stageBResult.telemetry, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(stageBResult.telemetry, null, 2));

    // WU4.6.5: same trusted-timestamp contract, minted fresh here for Stage B -- always strictly
    // after stageAContext.generatedAt above, since Stage B only ever runs after Stage A locks.
    const stageBContext: GrokStageBValidationContext = { model: "grok", gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash: freshContextHash, currentMarketState, homeTeam: game.homeTeam, lockedPrediction: stageA.analysis.prediction };
    const stageB = validateGrokStageB(stageBResult.raw, stageBContext);
    if (!stageB.ok) {
      console.error("Stage B FAILED validation:");
      for (const reason of stageB.reasons) console.error(`  - ${reason}`);
      process.exitCode = 1;
      return;
    }

    const analysisState = combineInitialStages({ stageA: stageA.analysis, stageB: stageB.analysis, marketAtDecision });
    const snapshotId = computeSnapshotId({ model: "grok", gameId: game.gameId, snapshotType: "daily_update", researchCutoff: newResearchCutoff, contextHash: freshContextHash, evidenceIds: previousSnapshot.evidence.evidenceIds });
    const snapshot: AnalysisSnapshot = {
      ...previousSnapshot,
      snapshotId,
      snapshotType: "daily_update",
      createdAt: now.toISOString(),
      researchCutoff: newResearchCutoff,
      previousSnapshotId: previousSnapshot.snapshotId,
      context: { contextVersion: packet.provenance.contextVersion, contextHash: freshContextHash, contextGeneratedAt: packet.generatedAt },
      market: marketRecord,
      analysisState,
      updateAssessment: null,
    };
    writeSnapshot(ROOT, snapshot);

    console.log("\n=== INITIAL HANDICAP (LOCKED BLIND PREDICTION + MARKET DECISION) ===");
    console.log(`blindPrediction: ${JSON.stringify(analysisState.blindPrediction)}`);
    console.log(`marketDecision: ${JSON.stringify(analysisState.marketDecision)}`);
    console.log(`side: ${JSON.stringify(analysisState.side)}`);
    console.log(`total: ${JSON.stringify(analysisState.total)}`);
    console.log(`\nWrote snapshot ${snapshot.snapshotId} (previousSnapshotId=${snapshot.previousSnapshotId})`);
  } else {
    if (!previousSnapshot.analysisState) {
      console.error("Refusing to run mode=update: the latest snapshot has no prior analysisState to evaluate a delta against. Run mode=initial first.");
      process.exitCode = 1;
      return;
    }
    const previousBlindState = toPreviousBlindState(previousSnapshot.analysisState);

    console.log("\n=== STAGE A: BLIND FOOTBALL RE-PROJECTION ===");
    const stageAResult = await runGrokStageAUpdate({ game, packet, previous: previousBlindState, newEvidenceLines: blindCitableEvidenceLines, apiKey });
    if (!stageAResult.ok) {
      console.error(`Grok Stage A update FAILED: ${stageAResult.error}`);
      if (stageAResult.telemetry) console.error("Telemetry at failure:", JSON.stringify(stageAResult.telemetry, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(stageAResult.telemetry, null, 2));

    // WU4.6.5: trusted orchestration timestamp, minted at the moment this update-mode Stage A
    // output is accepted for validation -- never read from the provider's own response.
    const stageAContext: GrokStageAValidationContext = { model: "grok", gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash: freshContextHash, contextPacket: packet, homeTeam: game.homeTeam, awayTeam: game.awayTeam, allEvidenceRecords };
    const stageAUpdate = validateGrokStageAUpdate(stageAResult.raw, stageAContext);
    if (!stageAUpdate.ok) {
      console.error("Stage A update FAILED validation:");
      for (const reason of stageAUpdate.reasons) console.error(`  - ${reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`LOCKED (re-affirmed or revised) prediction: ${JSON.stringify(stageAUpdate.proposal.prediction)}`);

    console.log("\n=== STAGE B: MARKET DECISION ===");
    const stageBResult = await runGrokStageBUpdate({ game, lockedFairSpread: stageAUpdate.proposal.prediction.fairSpread, lockedProjectedTotal: stageAUpdate.proposal.prediction.projectedTotal, marketRecord, apiKey });
    if (!stageBResult.ok) {
      console.error(`Grok Stage B update FAILED: ${stageBResult.error}`);
      if (stageBResult.telemetry) console.error("Telemetry at failure:", JSON.stringify(stageBResult.telemetry, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(stageBResult.telemetry, null, 2));

    // WU4.6.5: trusted orchestration timestamp for this update-mode Stage B, minted fresh here --
    // always strictly after stageAContext.generatedAt above.
    const stageBContext: GrokStageBValidationContext = { model: "grok", gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash: freshContextHash, currentMarketState, homeTeam: game.homeTeam, lockedPrediction: stageAUpdate.proposal.prediction };
    const stageBUpdate = validateGrokStageBUpdate(stageBResult.raw, stageBContext);
    if (!stageBUpdate.ok) {
      console.error("Stage B update FAILED validation:");
      for (const reason of stageBUpdate.reasons) console.error(`  - ${reason}`);
      process.exitCode = 1;
      return;
    }

    const { assessment, newAnalysisState } = combineUpdateStages({ previous: previousSnapshot.analysisState, stageAUpdate: stageAUpdate.proposal, stageBUpdate: stageBUpdate.proposal, marketAtDecision });
    const snapshotId = computeSnapshotId({ model: "grok", gameId: game.gameId, snapshotType: "daily_update", researchCutoff: newResearchCutoff, contextHash: freshContextHash, evidenceIds: previousSnapshot.evidence.evidenceIds });
    const snapshot: AnalysisSnapshot = {
      ...previousSnapshot,
      snapshotId,
      snapshotType: "daily_update",
      createdAt: now.toISOString(),
      researchCutoff: newResearchCutoff,
      previousSnapshotId: previousSnapshot.snapshotId,
      context: { contextVersion: packet.provenance.contextVersion, contextHash: freshContextHash, contextGeneratedAt: packet.generatedAt },
      market: marketRecord,
      analysisState: newAnalysisState,
      updateAssessment: assessment,
    };
    writeSnapshot(ROOT, snapshot);

    console.log("\n=== UPDATE ASSESSMENT ===");
    console.log(`developments (${assessment.developments.length}):`);
    for (const d of assessment.developments) console.log(`  - [${d.significance}/${d.direction}] ${d.summary}`);
    console.log(`thesisAssessment: ${JSON.stringify(assessment.thesisAssessment)}`);
    console.log(`sideAssessment: ${JSON.stringify(assessment.sideAssessment)}`);
    console.log(`totalAssessment: ${JSON.stringify(assessment.totalAssessment)}`);
    console.log(`overallChange: ${assessment.overallChange}`);
    console.log(`conciseCommentary: ${assessment.conciseCommentary}`);
    console.log(`blindPrediction: ${JSON.stringify(newAnalysisState.blindPrediction)}`);
    console.log(`marketDecision: ${JSON.stringify(newAnalysisState.marketDecision)}`);
    console.log(`\nWrote snapshot ${snapshot.snapshotId} (previousSnapshotId=${snapshot.previousSnapshotId})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
