/**
 * WU3/WU3.3 -- manual, cost-controlled CLI for running ONE live Grok
 * research pass against xAI's Agent Tools API (`POST /v1/responses`) for
 * ONE game.
 *
 * Two modes:
 *   --mode=initial|probe (WU3): runs a from-scratch research pass, writes to
 *     the non-canonical evidence.live-test.json. Unchanged from WU3/WU3.1.
 *   --mode=update (WU3.3): runs a delta-focused update pass against the
 *     game's existing Grok snapshot lineage -- requires a previous snapshot
 *     to exist (see scripts/bootstrap-nfl-grok-initial-snapshot.ts for a
 *     game whose first research pass predates the snapshot framework).
 *     Appends new evidence to evidence.live-test.json (the real evidence
 *     stream -- see the bootstrap script's header comment for why this file,
 *     not the WU2 synthetic evidence.json, is treated as canonical for real
 *     Grok research), writes raw research diagnostics under
 *     grok/research/<update-id>/, computes evidence/market deltas
 *     mechanically, and writes a NEW immutable AnalysisSnapshot linked to
 *     the previous one via previousSnapshotId.
 *
 * Cost guardrails (unchanged from WU3/WU3.1, extended to update mode):
 *   - Requires an explicit `--live` flag. Without it, this script does
 *     nothing and exits 1 -- it will never make a network call by accident.
 *   - Processes exactly one game per invocation (no batch/loop mode).
 *   - Never retries with a bigger budget if the first result looks thin --
 *     prints a note and stops; a human decides whether to re-run.
 *   - Update mode never runs after kickoff -- pregame safety is checked
 *     BEFORE spending money on a request (nfl-snapshot-lock.ts), and again
 *     mechanically when the snapshot itself is built
 *     (nfl-grok-update-pipeline.ts).
 *
 * Run by hand:
 *   `npx tsx scripts/run-nfl-grok-research.ts --live [--game=2026_01_BAL_IND] [--mode=initial|probe|update]`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runGrokResearch } from "./lib/nfl-grok-research-adapter";
import { resolveGrokResearchConfig, type GrokResearchMode } from "./lib/nfl-grok-research-config";
import { normalizeExternalEvidence } from "./lib/nfl-evidence-normalizer";
import { redactSecretsFromRawResponse } from "./lib/nfl-chatgpt-research-parsing";
import { emitTelemetryMarker } from "./lib/nfl-ai-telemetry";
import { appendEvidence, createEvidenceStore, evidenceArtifactPath, readEvidenceArtifact, writeEvidenceArtifact } from "./lib/nfl-evidence-store";
import { loadSubjectIdentitySource } from "./lib/nfl-evidence-subject-identity-loader";
import type { EvidenceNormalizationContext, EvidenceRecord } from "./lib/nfl-evidence-types";
import { contentHash } from "./lib/nfl-production-prediction-archive";
import { footballContextHash } from "./lib/nfl-full-game-context";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./lib/nfl-snapshot-lock";
import { readLatestSnapshot, snapshotModelDirPath, writeSnapshot } from "./lib/nfl-snapshot-store";
import { buildResearchDeltaContext } from "./lib/nfl-research-delta-context";
import { runGrokUpdatePipeline } from "./lib/nfl-grok-update-pipeline";
import { loadFreshGameContextPacket } from "./lib/nfl-full-game-context-loader";
import { validateGameContextPacket } from "./lib/nfl-game-context-validators";
import { ensureGameContextArtifact } from "./lib/nfl-game-context-preflight";
import { checkContextFreshness } from "./lib/nfl-snapshot-context-freshness";
import type { NflGameContextPacket, TeamsArtifact } from "./lib/nfl-full-game-context";
import type { SnapshotMarketState } from "./lib/nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface GameContextPacketShape {
  identity: { gameId: string; season: number; week: number; homeTeam: string; awayTeam: string; homeTeamFull: string; awayTeamFull: string };
  schedule: { kickoffUtc: string; venue: { isDome: boolean } };
  market: { sportsbook: string | null; spread: { homeLine: number | null; awayLine: number | null }; total: { line: number | null }; moneyline: { homePrice: number | null; awayPrice: number | null } };
  provenance: { contextVersion: string; builtAt: string };
}

interface TeamsJsonRow {
  abbr: string;
}

function parseArgs(argv: string[]): { live: boolean; gameId: string; mode: GrokResearchMode } {
  const flags = new Map<string, string>();
  let live = false;
  for (const arg of argv) {
    if (arg === "--live") { live = true; continue; }
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  return {
    live,
    gameId: flags.get("game") ?? "2026_01_BAL_IND",
    mode: (flags.get("mode") as GrokResearchMode | undefined) ?? "initial",
  };
}

function loadContextPacket(gameId: string): { packet: GameContextPacketShape; raw: string; contextHash: string } {
  // WU4.6.3 -- shared preflight: use the persisted artifact if it already
  // validates clean, otherwise rebuild+persist a fresh one now (fails closed
  // post-kickoff). Same helper ChatGPT's initial research, both handicap
  // runners, and the eligibility scanner use -- see
  // scripts/lib/nfl-game-context-preflight.ts's header for why this used to
  // diverge between Grok and ChatGPT.
  const [seasonStr, weekStr] = gameId.split("_");
  const ensured = ensureGameContextArtifact({ root: ROOT, gameId, season: Number(seasonStr), week: Number(weekStr) });
  if (!ensured.ok) {
    throw new Error(`${ensured.reason}${ensured.issues.length > 0 ? ` -- ${ensured.issues.join("; ")}` : ""}`);
  }
  const raw = readFileSync(ensured.contextArtifactPath, "utf8");
  return { packet: JSON.parse(raw) as GameContextPacketShape, raw, contextHash: contentHash(raw) };
}

function loadKnownTeamAbbrs(): ReadonlySet<string> {
  const path = join(ROOT, "public", "data", "nfl", "teams.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as TeamsJsonRow[] | { teams: TeamsJsonRow[] };
  const rows = Array.isArray(parsed) ? parsed : parsed.teams;
  return new Set(rows.map((row) => row.abbr.toLowerCase()));
}

function currentMarketStateFromPacket(packet: NflGameContextPacket): SnapshotMarketState {
  return { sportsbook: packet.market.sportsbook, spread: packet.market.spread, total: packet.market.total, moneyline: packet.market.moneyline, asOf: packet.provenance.builtAt };
}

async function runInitialOrProbe(args: { gameId: string; mode: GrokResearchMode }, apiKey: string): Promise<void> {
  const { packet } = loadContextPacket(args.gameId);
  const { identity, schedule } = packet;

  const game = {
    gameId: identity.gameId,
    season: identity.season,
    week: identity.week,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    homeTeamFull: identity.homeTeamFull,
    awayTeamFull: identity.awayTeamFull,
    kickoffUtc: schedule.kickoffUtc,
    isDome: schedule.venue.isDome,
  };

  console.log(`Running ONE live Grok research pass -- mode="${args.mode}" game=${game.gameId} (${game.awayTeamFull} @ ${game.homeTeamFull})`);

  const subjectIdentity = loadSubjectIdentitySource(ROOT, game);
  console.log(
    `subjectIdentity: status=${subjectIdentity.meta?.status} players=${subjectIdentity.players.length} coaches=${subjectIdentity.coaches.length} rosterWeekUsed=${subjectIdentity.meta?.rosterWeekUsed}`
  );

  const context: EvidenceNormalizationContext = {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    kickoffUtc: game.kickoffUtc,
    contextVersion: "nfl-game-context-v1",
    knownTeamAbbrs: loadKnownTeamAbbrs(),
    subjectIdentity,
  };

  const result = await runGrokResearch({ mode: args.mode, game, apiKey, model: "grok" });

  // WU7.3 -- private per-run diagnostics dir, computed regardless of success/failure, mirroring
  // ChatGPT's initial-mode pattern (run-nfl-chatgpt-research.ts) -- the raw provider response and
  // telemetry must be captured EVERY live run, not only successful ones. Previously this branch
  // (mode="initial"/"probe") wrote NOTHING here -- only mode="update" (below, in runUpdate) did --
  // so a live Grok initial research call's token usage/cost and raw response were computed in
  // memory, printed to console, and then silently discarded once the process exited.
  const now = new Date();
  const canonicalPath = evidenceArtifactPath(ROOT, game.season, game.week, game.gameId, "grok");
  const runId = `${args.mode}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const researchDir = join(dirname(canonicalPath), "research", runId);
  mkdirSync(researchDir, { recursive: true });
  if (result.rawResponseBody != null) {
    const redacted = redactSecretsFromRawResponse(result.rawResponseBody, [apiKey]);
    writeFileSync(join(researchDir, "provider-response.raw.json"), `${JSON.stringify(redacted, null, 2)}\n`);
    console.log(`Wrote raw provider response to ${join(researchDir, "provider-response.raw.json")}`);
  }

  if (!result.ok) {
    console.error(`Grok research pass FAILED: ${result.error}`);
    if (result.telemetry) console.error("Telemetry at failure:", JSON.stringify(result.telemetry, null, 2));
    writeFileSync(
      join(researchDir, "research-run.json"),
      `${JSON.stringify({ mode: args.mode, contextVersion: "nfl-game-context-v1", error: result.error, telemetry: result.telemetry }, null, 2)}\n`
    );
    console.log(`Wrote research diagnostics (failure) to ${researchDir}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n=== TELEMETRY ===");
  console.log(JSON.stringify(result.telemetry, null, 2));
  if (result.telemetry.searchBudgetOutcome === "exceeded_configured_turns") {
    console.log(
      `NOTE: actualWebSearchCalls (${result.telemetry.actualWebSearchCalls}) exceeded configuredMaxTurns (${result.telemetry.configuredMaxTurns}) -- ` +
        "this is expected, not an error: max_turns is not a verified hard ceiling on search-call count. See nfl-grok-research-config.ts."
    );
  }

  console.log("\n=== RESEARCH COVERAGE ===");
  console.log(JSON.stringify(result.coverage, null, 2));

  console.log(`\n=== RAW RESULT ===`);
  console.log(`accepted candidates: ${result.candidates.length}`);
  console.log(`rejected findings: ${result.rejectedFindings.length}`);
  for (const rejected of result.rejectedFindings) {
    console.log(`  - rejected: ${rejected.reason}`);
  }

  let store = createEvidenceStore("grok", game.gameId);
  const normalizeRejections: string[] = [];
  const appendOutcomes: Record<string, number> = {};
  for (const candidate of result.candidates) {
    const normalized = normalizeExternalEvidence(candidate, context);
    if (!normalized.ok) {
      normalizeRejections.push(`${candidate.claim.slice(0, 80)}... -- ${normalized.reasons.join("; ")}`);
      continue;
    }
    const appended = appendEvidence(store, normalized.evidence);
    store = appended.store;
    appendOutcomes[appended.outcome] = (appendOutcomes[appended.outcome] ?? 0) + 1;
  }

  const citationNeedsReviewCount = store.records.filter((r) => r.citationNeedsReview).length;

  console.log(`\n=== NORMALIZATION ===`);
  console.log(`normalized+stored: ${store.records.length}`);
  console.log(`citationNeedsReview (section/index/homepage/unknown source URL): ${citationNeedsReviewCount}`);
  console.log(`normalizer-rejected: ${normalizeRejections.length}`);
  for (const reason of normalizeRejections) console.log(`  - ${reason}`);
  console.log(`append outcomes: ${JSON.stringify(appendOutcomes)}`);

  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  writeEvidenceArtifact(liveTestPath, store, {
    fixture: false,
    fixtureNote: `WU3 manual live-research test run (mode="${args.mode}"). Not wired into the canonical evidence.json path -- see scripts/run-nfl-grok-research.ts. Canonical fixture at ${canonicalPath} is untouched.`,
  });
  console.log(`\nWrote live-test evidence artifact to ${liveTestPath}`);

  // WU7.3 -- remaining private research diagnostics, mirroring ChatGPT's initial-mode "Step 9"
  // (run-nfl-chatgpt-research.ts): purely informational, never read back programmatically by
  // anything else. Grok's parser has no raw-vs-parsed consistency-check concept the way ChatGPT's
  // WU4.1/WU4.2 diagnostics/groundingProvenance does -- that is not reproduced here since the two
  // providers' diagnostic provenance does not need to be field-for-field identical, only
  // comparably present (see WU7.3's provider-parity goal).
  writeFileSync(join(researchDir, "research-raw.json"), `${JSON.stringify({ candidates: result.candidates, citationUrls: result.citationUrls, coverage: result.coverage }, null, 2)}\n`);
  writeFileSync(join(researchDir, "rejected-findings.json"), `${JSON.stringify(result.rejectedFindings, null, 2)}\n`);
  writeFileSync(
    join(researchDir, "research-run.json"),
    `${JSON.stringify(
      {
        mode: args.mode,
        contextVersion: "nfl-game-context-v1",
        telemetry: result.telemetry,
        coverage: result.coverage,
        normalizedAccepted: store.records.length,
        normalizedRejected: normalizeRejections.length,
        normalizeRejectionReasons: normalizeRejections,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote research diagnostics to ${researchDir}`);

  emitTelemetryMarker({
    kind: "research",
    provider: "grok",
    gameId: game.gameId,
    cliMode: args.mode === "update" ? "research_update" : "research_initial",
    telemetry: result.telemetry,
  });

  if (result.candidates.length < 2) {
    console.log("\nNOTE: evidence coverage looks thin (<2 accepted candidates). Per cost-guardrail policy, this script does NOT automatically retry with a larger budget -- review the telemetry above and decide manually whether a re-run is warranted.");
  }
}

async function runUpdate(args: { gameId: string }, apiKey: string): Promise<void> {
  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);

  // Authoritative update sequence (WU3.3.1), step 1: load the previous immutable model snapshot.
  const previous = readLatestSnapshot(ROOT, season, week, args.gameId, "grok");
  if (!previous) {
    console.error(`No previous Grok snapshot found for ${args.gameId} -- run scripts/bootstrap-nfl-grok-initial-snapshot.ts first (or an --mode=initial live run followed by bootstrap).`);
    process.exitCode = 1;
    return;
  }

  // Step 2: refresh/rebuild the current deterministic game context from current upstream JKB
  // artifacts -- NEVER read the possibly-stale checked-in data/nfl/game-context/... file. This is
  // the SAME builder WU1's fixture script uses (nfl-full-game-context.ts's buildFullGameContext),
  // called fresh here via the shared I/O loader (nfl-full-game-context-loader.ts).
  const now = new Date();
  const { result: freshContextResult } = loadFreshGameContextPacket({ root: ROOT, gameId: args.gameId, season, week, now: () => now });
  if (freshContextResult.status !== "ok") {
    console.error(`Failed to refresh Game Context Packet for ${args.gameId}: ${freshContextResult.reason}`);
    process.exitCode = 1;
    return;
  }
  const packet = freshContextResult.packet;

  // Step 3: validate the current context.
  const teamsArtifact = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;
  const contextIssues = validateGameContextPacket(packet, teamsArtifact);
  const contextErrors = contextIssues.filter((i) => i.severity === "error");
  if (contextErrors.length > 0) {
    console.error(`Refreshed Game Context Packet failed validation for ${args.gameId}:`, JSON.stringify(contextErrors, null, 2));
    process.exitCode = 1;
    return;
  }

  // Step 4: verify the current context's generatedAt is newer/appropriately current relative to
  // the context the previous snapshot was built from -- the stale-context guard. This checks
  // PROVENANCE (was this freshly regenerated), never whether values changed (an unchanged market
  // is valid -- see nfl-snapshot-context-freshness.ts).
  const preRunFreshness = checkContextFreshness(previous.context.contextGeneratedAt, packet.generatedAt);
  if (preRunFreshness.status === "stale_or_reused") {
    console.error(`Refusing to run: ${preRunFreshness.reason}`);
    process.exitCode = 1;
    return;
  }

  const { identity, schedule } = packet;

  if (isPregameStreamLocked(schedule.kickoffUtc)) {
    console.error(`Refusing to run: kickoff (${schedule.kickoffUtc}) has already passed for ${args.gameId}. No historical pretending using current web search.`);
    process.exitCode = 1;
    return;
  }

  const newResearchCutoff = now.toISOString();

  const preflight = canCreatePregameSnapshot({ kickoffUtc: schedule.kickoffUtc, researchCutoff: newResearchCutoff, snapshotType: "daily_update", now: () => now });
  if (!preflight.ok) {
    console.error(`Refusing to run: ${preflight.reason}`);
    process.exitCode = 1;
    return;
  }

  const game = {
    gameId: identity.gameId,
    season: identity.season,
    week: identity.week,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    homeTeamFull: identity.homeTeamFull,
    awayTeamFull: identity.awayTeamFull,
    kickoffUtc: schedule.kickoffUtc,
    isDome: schedule.venue.isDome,
  };

  const canonicalPath = evidenceArtifactPath(ROOT, season, week, args.gameId, "grok");
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  const existingArtifact = readEvidenceArtifact(liveTestPath);
  if (!existingArtifact) {
    console.error(`No existing evidence artifact at ${liveTestPath} -- cannot run an update without prior evidence to diff against.`);
    process.exitCode = 1;
    return;
  }
  const existingRecords: EvidenceRecord[] = existingArtifact.evidence;
  const priorRecordsById = new Map(existingRecords.map((r) => [r.evidenceId, r]));
  const priorEvidenceClaims = previous.evidence.evidenceIds
    .map((id) => priorRecordsById.get(id))
    .filter((r): r is EvidenceRecord => Boolean(r))
    .map((r) => ({ evidenceId: r.evidenceId, claim: r.claim }));

  const deltaContext = buildResearchDeltaContext({ previousSnapshot: previous, priorEvidenceClaims });
  const currentMarketState = currentMarketStateFromPacket(packet);
  const freshContextHash = footballContextHash(packet);

  console.log(`Refreshed Game Context Packet: generatedAt=${packet.generatedAt} (previous snapshot's context generatedAt=${previous.context.contextGeneratedAt ?? "unknown/pre-WU3.3.1"}) -- ${preRunFreshness.reason}`);

  console.log(`Running ONE live Grok DELTA UPDATE -- game=${game.gameId} (${game.awayTeamFull} @ ${game.homeTeamFull})`);
  console.log(`previousSnapshotId=${previous.snapshotId} previousResearchCutoff=${previous.researchCutoff} newResearchCutoff=${newResearchCutoff}`);

  const subjectIdentity = loadSubjectIdentitySource(ROOT, game);
  const normalizationContext: EvidenceNormalizationContext = {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    kickoffUtc: game.kickoffUtc,
    contextVersion: packet.provenance.contextVersion,
    knownTeamAbbrs: loadKnownTeamAbbrs(),
    subjectIdentity,
  };

  const config = resolveGrokResearchConfig("update");
  const result = await runGrokResearch({ mode: "update", game, apiKey, model: "grok", deltaContext, currentMarketState });

  if (!result.ok) {
    console.error(`Grok update pass FAILED: ${result.error}`);
    if (result.telemetry) console.error("Telemetry at failure:", JSON.stringify(result.telemetry, null, 2));
    process.exitCode = 1;
    return;
  }

  const updateId = `update-${newResearchCutoff.replace(/[:.]/g, "-")}`;
  const researchDir = join(snapshotModelDirPath(ROOT, season, week, args.gameId, "grok"), "research", updateId);
  mkdirSync(researchDir, { recursive: true });
  writeFileSync(join(researchDir, "research-raw.json"), `${JSON.stringify({ candidates: result.candidates, citationUrls: result.citationUrls, coverage: result.coverage }, null, 2)}\n`);
  writeFileSync(join(researchDir, "rejected-evidence.json"), `${JSON.stringify(result.rejectedFindings, null, 2)}\n`);
  writeFileSync(join(researchDir, "research-run.json"), `${JSON.stringify({ mode: "update", config, deltaContext, currentMarketState, telemetry: result.telemetry }, null, 2)}\n`);
  console.log(`Wrote update research diagnostics to ${researchDir}`);

  emitTelemetryMarker({ kind: "research", provider: "grok", gameId: args.gameId, cliMode: "research_update", telemetry: result.telemetry });

  const pipelineResult = runGrokUpdatePipeline({
    model: "grok",
    previousSnapshot: previous,
    existingRecords,
    newCandidates: result.candidates,
    normalizationContext,
    currentMarketState,
    newResearchCutoff,
    newContextHash: freshContextHash,
    newContextVersion: packet.provenance.contextVersion,
    newContextGeneratedAt: packet.generatedAt,
    snapshotType: "daily_update",
    now: () => now,
  });

  if (!pipelineResult.ok) {
    console.error(`Update pipeline FAILED: ${pipelineResult.error}`);
    process.exitCode = 1;
    return;
  }

  const newlyAdded = pipelineResult.appendedOutcomes.filter((o) => o.outcome === "added" || o.outcome === "added_corroborating" || o.outcome === "added_conflicting");
  const skipped = pipelineResult.appendedOutcomes.filter((o) => o.outcome === "added_duplicate_skipped");

  console.log("\n=== TELEMETRY ===");
  console.log(JSON.stringify(result.telemetry, null, 2));
  if (result.telemetry.searchBudgetOutcome === "exceeded_configured_turns") {
    console.log(`NOTE: actualWebSearchCalls (${result.telemetry.actualWebSearchCalls}) exceeded configuredMaxTurns (${result.telemetry.configuredMaxTurns}) -- expected, not an error.`);
  }

  console.log("\n=== RESEARCH COVERAGE ===");
  console.log(JSON.stringify(result.coverage, null, 2));

  console.log("\n=== NEW ACCEPTED EVIDENCE (this update only) ===");
  console.log(`count: ${newlyAdded.length}`);
  for (const { record, outcome } of newlyAdded) console.log(`  - [${outcome}] ${record.claim.slice(0, 100)}`);

  console.log("\n=== DUPLICATE / SKIPPED ===");
  console.log(`count: ${skipped.length}`);
  for (const { record } of skipped) console.log(`  - ${record.claim.slice(0, 100)}`);

  console.log("\n=== REJECTED FINDINGS (untrusted citation or malformed) ===");
  console.log(`count: ${result.rejectedFindings.length}`);
  for (const r of result.rejectedFindings) console.log(`  - ${r.reason}`);

  if (pipelineResult.normalizeRejections.length > 0) {
    console.log("\n=== NORMALIZER-REJECTED ===");
    for (const r of pipelineResult.normalizeRejections) console.log(`  - ${r.claim.slice(0, 80)}... -- ${r.reasons.join("; ")}`);
  }

  console.log("\n=== EVIDENCE DELTA ===");
  console.log(JSON.stringify(pipelineResult.snapshot.evidence, null, 2));

  console.log("\n=== MARKET DELTA ===");
  console.log(JSON.stringify(pipelineResult.snapshot.market, null, 2));

  writeEvidenceArtifact(liveTestPath, { model: "grok", gameId: args.gameId, records: pipelineResult.allRecords }, {
    fixture: false,
    fixtureNote: `WU3.3 real Grok evidence stream, append-only across initial + update passes. See scripts/bootstrap-nfl-grok-initial-snapshot.ts and scripts/run-nfl-grok-research.ts.`,
  });
  writeSnapshot(ROOT, pipelineResult.snapshot);

  // Step 2 (continued): persist the freshly-rebuilt context back to the canonical checked-in path
  // so it is not left stale for the NEXT run either -- same file scripts/generate-nfl-full-game-context-fixture.ts
  // writes by hand; this is that same write, performed programmatically as part of the update.
  const canonicalContextPath = join(ROOT, "data", "nfl", "game-context", seasonStr, String(week), `${args.gameId}.json`);
  writeFileSync(canonicalContextPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  console.log(`\nRefreshed canonical Game Context Packet written to ${canonicalContextPath}`);

  console.log(`\nWrote ${pipelineResult.allRecords.length} total evidence record(s) to ${liveTestPath}`);
  console.log(`Wrote new snapshot ${pipelineResult.snapshot.snapshotId} (previousSnapshotId=${pipelineResult.snapshot.previousSnapshotId})`);

  // WU3.3.1 Issue 3: report observed cost/latency/search-count HONESTLY, never claim update mode
  // is proven cheaper in provider cost until observed data actually supports that claim.
  const initialCostUsd = 0.145;
  const initialLatencyMs = 50000;
  const initialSearchCalls = 8;
  if (result.telemetry.costUsd != null) {
    const latencyImprovedPct = (((initialLatencyMs - result.telemetry.latencyMs) / initialLatencyMs) * 100).toFixed(1);
    const costDeltaPct = (((initialCostUsd - result.telemetry.costUsd) / initialCostUsd) * 100).toFixed(1);
    const searchesMatched = result.telemetry.actualWebSearchCalls === initialSearchCalls;
    console.log(
      `\n=== COST/LATENCY vs WU3 INITIAL RUN ($${initialCostUsd}, ${initialLatencyMs}ms, ${initialSearchCalls} searches) ===\n` +
        `this update: $${result.telemetry.costUsd.toFixed(4)}, ${result.telemetry.latencyMs}ms, ${result.telemetry.actualWebSearchCalls ?? "unknown"} searches.\n` +
        `Delta-first prompting improved latency by ~${latencyImprovedPct}% and shrank output size (see usage.outputTokens above).\n` +
        `Provider still chose ${result.telemetry.actualWebSearchCalls ?? "an unknown number of"} search calls this run` +
        (searchesMatched ? ` (matching the initial run's ${initialSearchCalls} -- the configured narrower budget did NOT reduce actual search count).` : ".") +
        `\nCost changed by ${costDeltaPct}% vs initial. Update mode is NOT proven materially cheaper in provider cost based on ` +
        `observed data so far -- treat lower cost as an objective for this mode, not a guarantee, until more runs show a consistent pattern.`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.live) {
    console.error("Refusing to run without --live -- this script makes a real, billed xAI API call.");
    console.error("Usage: npx tsx scripts/run-nfl-grok-research.ts --live [--game=2026_01_BAL_IND] [--mode=initial|probe|update]");
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("GROK_API_KEY or XAI_API_KEY is not set.");
    process.exitCode = 1;
    return;
  }

  if (args.mode === "update") {
    await runUpdate({ gameId: args.gameId }, apiKey);
    return;
  }

  await runInitialOrProbe({ gameId: args.gameId, mode: args.mode }, apiKey);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
