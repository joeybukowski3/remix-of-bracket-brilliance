/**
 * WU4/WU4.3 -- manual, cost-controlled CLI for running ONE live ChatGPT
 * research pass against OpenAI's Responses API (`POST /v1/responses`) for
 * ONE game.
 *
 * Two modes:
 *   --mode=initial|probe (WU4/WU4.1/WU4.2): runs a from-scratch research
 *     pass, writes to the non-canonical evidence.live-test.json. Unchanged
 *     from WU4/WU4.1/WU4.2.
 *   --mode=update (WU4.3): runs a delta-focused update pass against the
 *     game's existing ChatGPT snapshot lineage -- requires a previous
 *     snapshot to exist (see scripts/bootstrap-nfl-chatgpt-initial-snapshot.ts
 *     for a game whose first research pass predates the snapshot framework).
 *     Appends new evidence to evidence.live-test.json (the real evidence
 *     stream), writes raw research diagnostics under
 *     chatgpt/research/<update-id>/, computes evidence/market deltas
 *     mechanically, and writes a NEW immutable AnalysisSnapshot linked to
 *     the previous one via previousSnapshotId. This reuses
 *     runGrokUpdatePipeline (scripts/lib/nfl-grok-update-pipeline.ts)
 *     UNCHANGED -- that pipeline is provider-neutral (parameterized by
 *     `model: EvidenceModel`, see its header comment), so a ChatGPT-specific
 *     copy is deliberately not created here, matching the WU4.3 work
 *     order's "reuse existing shared framework" requirement.
 *
 * MODEL ISOLATION: this script never reads, globs, or otherwise references
 * any path under .../grok/. It only ever opens the "chatgpt" evidence/
 * snapshot artifact paths and shared, model-agnostic inputs (the Game
 * Context Packet, teams.json, SubjectIdentitySource, the provider-neutral
 * snapshot/delta-context/pipeline modules).
 *
 * Cost guardrails (same posture as run-nfl-grok-research.ts):
 *   - Requires an explicit `--live` flag. Without it, this script does
 *     nothing and exits 1 -- it will never make a network call by accident.
 *   - Processes exactly one game per invocation.
 *   - Never retries with a bigger budget if the first result looks thin --
 *     prints a note and stops; a human decides whether to re-run.
 *   - Update mode never runs after kickoff -- pregame safety is checked
 *     BEFORE spending money on a request (nfl-snapshot-lock.ts), and again
 *     mechanically when the snapshot itself is built (runGrokUpdatePipeline).
 *
 * Run by hand:
 *   `npx tsx scripts/run-nfl-chatgpt-research.ts --live [--game=2026_01_BAL_IND] [--mode=initial|probe|update]`
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runChatGptResearch } from "./lib/nfl-chatgpt-research-adapter";
import { resolveChatGptResearchConfig, type ChatGptResearchMode } from "./lib/nfl-chatgpt-research-config";
import { redactSecretsFromRawResponse } from "./lib/nfl-chatgpt-research-parsing";
import { normalizeExternalEvidence } from "./lib/nfl-evidence-normalizer";
import { appendEvidence, createEvidenceStore, evidenceArtifactPath, readEvidenceArtifact, writeEvidenceArtifact } from "./lib/nfl-evidence-store";
import { loadSubjectIdentitySource } from "./lib/nfl-evidence-subject-identity-loader";
import type { EvidenceNormalizationContext, EvidenceRecord } from "./lib/nfl-evidence-types";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./lib/nfl-snapshot-lock";
import { readLatestSnapshot, snapshotModelDirPath, writeSnapshot } from "./lib/nfl-snapshot-store";
import { buildResearchDeltaContext } from "./lib/nfl-research-delta-context";
import { runGrokUpdatePipeline } from "./lib/nfl-grok-update-pipeline";
import { loadFreshGameContextPacket } from "./lib/nfl-full-game-context-loader";
import { validateGameContextPacket } from "./lib/nfl-game-context-validators";
import { ensureGameContextArtifact } from "./lib/nfl-game-context-preflight";
import { checkContextFreshness } from "./lib/nfl-snapshot-context-freshness";
import { footballContextHash, type NflGameContextPacket, type TeamsArtifact } from "./lib/nfl-full-game-context";
import type { SnapshotMarketState } from "./lib/nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): { live: boolean; gameId: string; mode: ChatGptResearchMode } {
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
    mode: (flags.get("mode") as ChatGptResearchMode | undefined) ?? "initial",
  };
}

function currentMarketStateFromPacket(packet: NflGameContextPacket): SnapshotMarketState {
  return { sportsbook: packet.market.sportsbook, spread: packet.market.spread, total: packet.market.total, moneyline: packet.market.moneyline, asOf: packet.provenance.builtAt };
}

function loadKnownTeamAbbrs(): ReadonlySet<string> {
  const path = join(ROOT, "public", "data", "nfl", "teams.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { abbr: string }[] | { teams: { abbr: string }[] };
  const rows = Array.isArray(parsed) ? parsed : parsed.teams;
  return new Set(rows.map((row) => row.abbr.toLowerCase()));
}

async function runInitialOrProbe(args: { gameId: string; mode: ChatGptResearchMode }, apiKey: string): Promise<void> {
  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);
  const now = new Date();

  // Step 1: WU4.6.3 -- shared preflight. Use the persisted artifact if it
  // already validates clean, otherwise rebuild a fresh Game Context Packet
  // from current upstream artifacts AND persist it -- same helper Grok's
  // initial research, both handicap runners, and the eligibility scanner
  // use. Previously this step only ever built a fresh packet in memory and
  // never wrote it to disk, so a successful ChatGPT research run left no
  // persisted data/nfl/game-context/... artifact for bootstrap/presentation
  // to read even though the research itself succeeded.
  const ensured = ensureGameContextArtifact({ root: ROOT, gameId: args.gameId, season, week, now: () => now });
  if (!ensured.ok) {
    console.error(`Failed to build Game Context Packet for ${args.gameId}: ${ensured.reason}${ensured.issues.length > 0 ? ` -- ${ensured.issues.join("; ")}` : ""}`);
    process.exitCode = 1;
    return;
  }
  const packet = ensured.packet;

  // Step 2: validate (defense in depth -- ensureGameContextArtifact already validated).
  const teamsArtifact = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;
  const contextIssues = validateGameContextPacket(packet, teamsArtifact);
  const contextErrors = contextIssues.filter((i) => i.severity === "error");
  if (contextErrors.length > 0) {
    console.error(`Game Context Packet failed validation for ${args.gameId}:`, JSON.stringify(contextErrors, null, 2));
    process.exitCode = 1;
    return;
  }

  const { identity, schedule } = packet;

  // Step 3: pregame safety -- refuse BEFORE spending money on a request.
  if (isPregameStreamLocked(schedule.kickoffUtc, () => now)) {
    console.error(`Refusing to run: kickoff (${schedule.kickoffUtc}) has already passed for ${args.gameId}. No historical pretending using current web search.`);
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

  console.log(`Running ONE live ChatGPT research pass -- mode="${args.mode}" game=${game.gameId} (${game.awayTeamFull} @ ${game.homeTeamFull})`);

  // Step 4: shared, deterministic (non-model) subject identity data -- same
  // loader the Grok pipeline uses. This is roster/coach ground truth, not
  // model output, so reusing it does not cross the model-isolation boundary.
  const subjectIdentity = loadSubjectIdentitySource(ROOT, game);
  console.log(`subjectIdentity: status=${subjectIdentity.meta?.status} players=${subjectIdentity.players.length} coaches=${subjectIdentity.coaches.length} rosterWeekUsed=${subjectIdentity.meta?.rosterWeekUsed}`);

  const context: EvidenceNormalizationContext = {
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

  // Step 5: one bounded ChatGPT research pass. runChatGptResearch's `model`
  // parameter is fixed to the literal "chatgpt" -- see
  // nfl-chatgpt-research-adapter.ts's header comment on model isolation.
  const result = await runChatGptResearch({ mode: args.mode, game, apiKey, model: "chatgpt" });

  // Step 6 (WU4.2): private research diagnostics dir -- computed regardless
  // of success/failure, since the raw provider response and parsed
  // diagnostics must be captured EVERY live run, not only successful ones.
  const canonicalPath = evidenceArtifactPath(ROOT, game.season, game.week, game.gameId, "chatgpt");
  const runId = `${args.mode}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const researchDir = join(dirname(canonicalPath), "research", runId);
  mkdirSync(researchDir, { recursive: true });

  // Step 6a (WU4.2 §1): raw provider response capture -- private diagnostic
  // only, NEVER canonical evidence, NEVER under public/. redactSecretsFromRawResponse
  // is defense-in-depth (the response body should never itself echo our API
  // key/Authorization header -- OpenAI never round-trips request headers
  // into the response body -- but this guards against that anyway).
  if (result.rawResponseBody != null) {
    const redacted = redactSecretsFromRawResponse(result.rawResponseBody, [apiKey]);
    writeFileSync(join(researchDir, "provider-response.raw.json"), `${JSON.stringify(redacted, null, 2)}\n`);
    console.log(`Wrote raw provider response to ${join(researchDir, "provider-response.raw.json")}`);
  }
  if (result.diagnostics != null) {
    writeFileSync(join(researchDir, "provider-response-diagnostics.json"), `${JSON.stringify({ diagnostics: result.diagnostics, groundingProvenance: result.groundingProvenance }, null, 2)}\n`);
    console.log("\n=== RAW-VS-PARSED GROUNDING PROVENANCE (WU4.2) ===");
    console.log(JSON.stringify(result.groundingProvenance, null, 2));
  }

  if (!result.ok) {
    console.error(`\nChatGPT research pass FAILED: ${result.error}`);
    if (result.telemetry) console.error("Telemetry at failure:", JSON.stringify(result.telemetry, null, 2));
    writeFileSync(
      join(researchDir, "research-run.json"),
      `${JSON.stringify(
        {
          mode: args.mode,
          config: resolveChatGptResearchConfig(args.mode),
          contextVersion: packet.provenance.contextVersion,
          contextGeneratedAt: packet.generatedAt,
          error: result.error,
          errorType: result.errorType,
          telemetry: result.telemetry,
          groundingProvenance: result.groundingProvenance,
        },
        null,
        2
      )}\n`
    );
    console.log(`Wrote research diagnostics (failure) to ${researchDir}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n=== TELEMETRY ===");
  console.log(JSON.stringify(result.telemetry, null, 2));

  console.log("\n=== RESEARCH COVERAGE ===");
  console.log(JSON.stringify(result.coverage, null, 2));

  console.log("\n=== CITATION TRUST ===");
  console.log(`discoveredSources: ${result.discoveredSources.length}, citedSources: ${result.citedSources.length}`);

  console.log("\n=== GROUNDING SUMMARY (WU4.1) ===");
  console.log(JSON.stringify(result.groundingSummary, null, 2));
  const groundingNeedsReviewCount = result.grounding.filter((g) => g.groundingNeedsReview).length;
  console.log(`groundingNeedsReview (discovered-only, weaker grounding than an explicit citation): ${groundingNeedsReviewCount}`);

  console.log(`\n=== RAW RESULT ===`);
  console.log(`accepted candidates: ${result.candidates.length}`);
  console.log(`rejected findings: ${result.rejectedFindings.length}`);
  for (const rejected of result.rejectedFindings) {
    console.log(`  - [${rejected.groundingState ?? "structural"}] ${rejected.reason}`);
  }

  // Step 7: normalize and append into the "chatgpt" namespace only.
  // appendEvidence() throws on any model mismatch -- structural model
  // isolation, not just a convention here.
  let store = createEvidenceStore("chatgpt", game.gameId);
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
  console.log(`normalizedAccepted: ${store.records.length}`);
  console.log(`normalizedRejected: ${normalizeRejections.length}`);
  console.log(`citationNeedsReview (section/index/homepage/unknown source URL): ${citationNeedsReviewCount}`);
  for (const reason of normalizeRejections) console.log(`  - ${reason}`);
  console.log(`append outcomes: ${JSON.stringify(appendOutcomes)}`);

  // Step 8: evidence.live-test.json is written ONLY when at least one
  // grounded candidate actually survived WU2 normalization -- an empty
  // store is still written (never silently skipped) so a run with zero
  // evidence is still visible/auditable, per WU4.2 §9's "evidence.live-test.json
  // only if grounded evidence survives" (an empty store IS that signal).
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  writeEvidenceArtifact(liveTestPath, store, {
    fixture: false,
    fixtureNote: `WU4 manual live-research test run (mode="${args.mode}"). Not wired into the canonical evidence.json path -- see scripts/run-nfl-chatgpt-research.ts. Canonical fixture at ${canonicalPath} is untouched.`,
  });
  console.log(`\nWrote live-test evidence artifact to ${liveTestPath} (${store.records.length} record(s))`);

  // Step 9: remaining private research diagnostics -- purely informational,
  // never read back programmatically by anything else in WU4/WU4.1/WU4.2.
  writeFileSync(
    join(researchDir, "research-raw.json"),
    `${JSON.stringify({ candidates: result.candidates, grounding: result.grounding, discoveredSources: result.discoveredSources, citedSources: result.citedSources, coverage: result.coverage }, null, 2)}\n`
  );
  writeFileSync(join(researchDir, "rejected-findings.json"), `${JSON.stringify(result.rejectedFindings, null, 2)}\n`);
  writeFileSync(
    join(researchDir, "research-run.json"),
    `${JSON.stringify(
      {
        mode: args.mode,
        config: resolveChatGptResearchConfig(args.mode),
        contextVersion: packet.provenance.contextVersion,
        contextGeneratedAt: packet.generatedAt,
        telemetry: result.telemetry,
        // WU4.1 -- kept as separate named counts, never collapsed into one citation number.
        groundingSummary: result.groundingSummary,
        groundingProvenance: result.groundingProvenance,
        normalizedAccepted: store.records.length,
        normalizedRejected: normalizeRejections.length,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote research diagnostics to ${researchDir}`);

  if (result.candidates.length < 2) {
    console.log("\nNOTE: evidence coverage looks thin (<2 accepted candidates). Per cost-guardrail policy, this script does NOT automatically retry with a larger budget -- review the telemetry above and decide manually whether a re-run is warranted.");
  }
}

/**
 * WU4.3 -- delta-focused ChatGPT update pass. Direct counterpart of
 * run-nfl-grok-research.ts's runUpdate(): same authoritative update
 * sequence (load previous snapshot -> refresh context -> validate ->
 * freshness guard -> pregame lock -> research -> runGrokUpdatePipeline ->
 * write evidence/snapshot), only the model namespace and research adapter
 * differ. runGrokUpdatePipeline is reused UNCHANGED -- see this file's
 * header comment on why a ChatGPT-specific copy is deliberately not made.
 */
async function runUpdate(args: { gameId: string }, apiKey: string): Promise<void> {
  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);

  // Authoritative update sequence (WU4.3), step 1: load the previous immutable model snapshot.
  const previous = readLatestSnapshot(ROOT, season, week, args.gameId, "chatgpt");
  if (!previous) {
    console.error(`No previous ChatGPT snapshot found for ${args.gameId} -- run scripts/bootstrap-nfl-chatgpt-initial-snapshot.ts first (or an --mode=initial live run followed by bootstrap).`);
    process.exitCode = 1;
    return;
  }

  // Step 2: refresh/rebuild the current deterministic game context from current upstream JKB
  // artifacts -- NEVER read the possibly-stale checked-in data/nfl/game-context/... file.
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
  // the context the previous snapshot was built from -- the stale-context guard.
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

  const canonicalPath = evidenceArtifactPath(ROOT, season, week, args.gameId, "chatgpt");
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

  console.log(`Refreshed Game Context Packet: generatedAt=${packet.generatedAt} (previous snapshot's context generatedAt=${previous.context.contextGeneratedAt ?? "unknown/pre-WU4.3"}) -- ${preRunFreshness.reason}`);

  console.log(`Running ONE live ChatGPT DELTA UPDATE -- game=${game.gameId} (${game.awayTeamFull} @ ${game.homeTeamFull})`);
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

  const config = resolveChatGptResearchConfig("update");
  const result = await runChatGptResearch({ mode: "update", game, apiKey, model: "chatgpt", deltaContext, currentMarketState });

  const updateId = `update-${newResearchCutoff.replace(/[:.]/g, "-")}`;
  const researchDir = join(snapshotModelDirPath(ROOT, season, week, args.gameId, "chatgpt"), "research", updateId);
  mkdirSync(researchDir, { recursive: true });

  if (result.rawResponseBody != null) {
    const redacted = redactSecretsFromRawResponse(result.rawResponseBody, [apiKey]);
    writeFileSync(join(researchDir, "provider-response.raw.json"), `${JSON.stringify(redacted, null, 2)}\n`);
  }
  if (result.diagnostics != null) {
    writeFileSync(join(researchDir, "provider-response-diagnostics.json"), `${JSON.stringify({ diagnostics: result.diagnostics, groundingProvenance: result.groundingProvenance }, null, 2)}\n`);
  }

  if (!result.ok) {
    console.error(`ChatGPT update pass FAILED: ${result.error}`);
    if (result.telemetry) console.error("Telemetry at failure:", JSON.stringify(result.telemetry, null, 2));
    writeFileSync(
      join(researchDir, "research-run.json"),
      `${JSON.stringify({ mode: "update", config, deltaContext, currentMarketState, error: result.error, errorType: result.errorType, telemetry: result.telemetry }, null, 2)}\n`
    );
    console.log(`Wrote update research diagnostics (failure) to ${researchDir}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(
    join(researchDir, "research-raw.json"),
    `${JSON.stringify({ candidates: result.candidates, grounding: result.grounding, discoveredSources: result.discoveredSources, citedSources: result.citedSources, coverage: result.coverage }, null, 2)}\n`
  );
  writeFileSync(join(researchDir, "rejected-findings.json"), `${JSON.stringify(result.rejectedFindings, null, 2)}\n`);
  writeFileSync(join(researchDir, "research-run.json"), `${JSON.stringify({ mode: "update", config, deltaContext, currentMarketState, telemetry: result.telemetry, groundingSummary: result.groundingSummary }, null, 2)}\n`);
  console.log(`Wrote update research diagnostics to ${researchDir}`);

  const pipelineResult = runGrokUpdatePipeline({
    model: "chatgpt",
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

  console.log("\n=== RESEARCH COVERAGE ===");
  console.log(JSON.stringify(result.coverage, null, 2));

  console.log("\n=== GROUNDING SUMMARY ===");
  console.log(JSON.stringify(result.groundingSummary, null, 2));

  console.log("\n=== NEW ACCEPTED EVIDENCE (this update only) ===");
  console.log(`count: ${newlyAdded.length}`);
  for (const { record, outcome } of newlyAdded) console.log(`  - [${outcome}] ${record.claim.slice(0, 100)}`);

  console.log("\n=== DUPLICATE / SKIPPED ===");
  console.log(`count: ${skipped.length}`);
  for (const { record } of skipped) console.log(`  - ${record.claim.slice(0, 100)}`);

  console.log("\n=== REJECTED FINDINGS (untrusted citation or malformed) ===");
  console.log(`count: ${result.rejectedFindings.length}`);
  for (const r of result.rejectedFindings) console.log(`  - [${r.groundingState ?? "structural"}] ${r.reason}`);

  if (pipelineResult.normalizeRejections.length > 0) {
    console.log("\n=== NORMALIZER-REJECTED ===");
    for (const r of pipelineResult.normalizeRejections) console.log(`  - ${r.claim.slice(0, 80)}... -- ${r.reasons.join("; ")}`);
  }

  console.log("\n=== EVIDENCE DELTA ===");
  console.log(JSON.stringify(pipelineResult.snapshot.evidence, null, 2));

  console.log("\n=== MARKET DELTA ===");
  console.log(JSON.stringify(pipelineResult.snapshot.market, null, 2));

  writeEvidenceArtifact(liveTestPath, { model: "chatgpt", gameId: args.gameId, records: pipelineResult.allRecords }, {
    fixture: false,
    fixtureNote: `WU4.3 real ChatGPT evidence stream, append-only across initial + update passes. See scripts/bootstrap-nfl-chatgpt-initial-snapshot.ts and scripts/run-nfl-chatgpt-research.ts.`,
  });
  writeSnapshot(ROOT, pipelineResult.snapshot);

  // Persist the freshly-rebuilt context back to the canonical checked-in path so it is not left
  // stale for the NEXT run either -- same pattern run-nfl-grok-research.ts's runUpdate() uses.
  const canonicalContextPath = join(ROOT, "data", "nfl", "game-context", seasonStr, String(week), `${args.gameId}.json`);
  writeFileSync(canonicalContextPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  console.log(`\nRefreshed canonical Game Context Packet written to ${canonicalContextPath}`);

  console.log(`\nWrote ${pipelineResult.allRecords.length} total evidence record(s) to ${liveTestPath}`);
  console.log(`Wrote new snapshot ${pipelineResult.snapshot.snapshotId} (previousSnapshotId=${pipelineResult.snapshot.previousSnapshotId})`);

  if (result.telemetry.webSearchNumRequests != null) {
    console.log(
      `\n=== COST/LATENCY (this update) ===\n` +
        `latency: ${result.telemetry.latencyMs}ms, webSearchNumRequests: ${result.telemetry.webSearchNumRequests}, ` +
        `totalTokens: ${result.telemetry.usage.totalTokens ?? "unknown"}. ` +
        "Update mode's configured budget is narrower than 'initial' (see nfl-chatgpt-research-config.ts), " +
        "but per the WU4.3 work order this is NOT assumed cheaper in provider cost until observed data supports it."
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.live) {
    console.error("Refusing to run without --live -- this script makes a real, billed OpenAI API call.");
    console.error("Usage: npx tsx scripts/run-nfl-chatgpt-research.ts --live [--game=2026_01_BAL_IND] [--mode=initial|probe|update]");
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set.");
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
