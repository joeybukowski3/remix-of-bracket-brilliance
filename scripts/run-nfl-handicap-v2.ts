/**
 * AI Picks v2 WU3 -- CLI for ONE game and ONE provider through the v2
 * handicap pipeline (shared prompts: nfl-handicap-v2-prompts.ts).
 *
 * DRY RUN (default, free): rebuilds the fresh deterministic context, evidence
 * sets and market context; builds the Stage A prompt and runs the Stage A
 * market-blindness audit; builds the Stage B prompt around a clearly-labeled
 * PLACEHOLDER Stage A (there is no real Stage A output without a paid call);
 * prints everything; makes NO provider call and writes NOTHING.
 *
 * LIVE (--live): the same setup, then Stage A -> validate -> Stage B ->
 * validate -> write-once v2 record. Two billed calls. A validation failure is
 * reported and the run stops; it never retries with a different prompt.
 *
 *   npx tsx scripts/run-nfl-handicap-v2.ts --provider=grok --game=2026_03_LAC_BUF
 *   npx tsx scripts/run-nfl-handicap-v2.ts --provider=chatgpt --game=2026_03_LAC_BUF --live
 *
 * --mode=repricing (market-only change): reuses the LOCKED Stage A stored on the
 * game's newest record byte-for-byte and runs Stage B alone against the current
 * market (one billed call). It refuses when the football context or the
 * Stage A-visible evidence has changed since that record -- that needs a full
 * run. Written by scripts/run-nfl-ai-handicap-v2-slate.ts; safe to run by hand.
 *
 * Evidence is read from the provider's evidence.live-test.json (the same real
 * research stream the v1 runners use). Independence and pregame guards are
 * unchanged: Stage A gets no market and no JKB opinion (WU2 sanitizer plus the
 * existing prompt audit), and no run happens after kickoff.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditStageAPromptForMarketPricing, filterEvidenceRecordsForBlindStageA, filterEvidenceRecordsForStageBV2, sanitizeGameContextPacketForBlindStageA } from "./lib/nfl-ai-context-sanitizer";
import { buildCitableEvidenceLines as buildChatGptEvidenceLines, runChatGptHandicapV2Stage } from "./lib/nfl-chatgpt-analysis-adapter";
import { evidenceArtifactPath, readEvidenceArtifact, resolveEvidenceAuthority } from "./lib/nfl-evidence-store";
import type { EvidenceModel, EvidenceRecord } from "./lib/nfl-evidence-types";
import { footballContextHash, type NflGameContextPacket, type TeamsArtifact } from "./lib/nfl-full-game-context";
import { loadFreshGameContextPacket } from "./lib/nfl-full-game-context-loader";
import { validateGameContextPacket } from "./lib/nfl-game-context-validators";
import { buildCitableEvidenceLines as buildGrokEvidenceLines, runGrokHandicapV2Stage } from "./lib/nfl-grok-analysis-adapter";
import { buildInputFingerprint, type HandicapV2InputFingerprint, loadHandicapV2MarketContext, recordFingerprint, stageAEvidenceHash } from "./lib/nfl-handicap-v2-inputs";
import { emitTelemetryMarker, type AnyProviderTelemetry } from "./lib/nfl-ai-telemetry";
import { formatFailureMarker, providerCallFailure, validationFailure, type V2HandicapFailure } from "./lib/nfl-ai-v2-failure";
import type { HandicapV2MarketContext } from "./lib/nfl-handicap-v2-market";
import { buildStageAV2Prompt, buildStageBV2Prompt, type HandicapV2GameFacts } from "./lib/nfl-handicap-v2-prompts";
import { buildHandicapV2Record, lockedStageAFromRecord, writeHandicapV2Record } from "./lib/nfl-handicap-v2-record";
import { readLatestPublishableHandicapV2Record } from "./lib/nfl-handicap-v2-presentation";
import { deriveFairScore } from "./lib/nfl-handicap-v2-text";
import { HANDICAP_V2_SCHEMA_VERSION, type StageAV2 } from "./lib/nfl-handicap-v2-types";
import { validateStageAV2, validateStageBV2 } from "./lib/nfl-handicap-v2-validator";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./lib/nfl-snapshot-lock";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface ProviderBindings {
  buildEvidenceLines: (records: readonly EvidenceRecord[], authority: ReturnType<typeof resolveEvidenceAuthority>) => string[];
  runStage: (input: { stage: "A" | "B"; prompt: string; apiKey: string }) => Promise<{ ok: true; raw: unknown; telemetry: unknown } | { ok: false; error: string; telemetry: unknown }>;
  apiKey: () => string | undefined;
  apiKeyHint: string;
}

const PROVIDERS: Record<EvidenceModel, ProviderBindings> = {
  grok: { buildEvidenceLines: buildGrokEvidenceLines, runStage: runGrokHandicapV2Stage, apiKey: () => process.env.GROK_API_KEY || process.env.XAI_API_KEY, apiKeyHint: "GROK_API_KEY or XAI_API_KEY" },
  chatgpt: { buildEvidenceLines: buildChatGptEvidenceLines, runStage: runChatGptHandicapV2Stage, apiKey: () => process.env.OPENAI_API_KEY, apiKeyHint: "OPENAI_API_KEY" },
};

function parseArgs(argv: string[]): { provider: EvidenceModel | null; gameId: string; live: boolean; mode: "full" | "repricing" | null } {
  const flags = new Map<string, string>();
  let live = false;
  for (const arg of argv) {
    if (arg === "--live") live = true;
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  const provider = flags.get("provider");
  const mode = flags.get("mode") ?? "full";
  return { provider: provider === "grok" || provider === "chatgpt" ? provider : null, gameId: flags.get("game") ?? "", live, mode: mode === "full" || mode === "repricing" ? mode : null };
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Machine-readable failure line for the slate executor (nfl-ai-v2-failure.ts). Carries a transport error or validator reasons only -- never the model's output, which is printed separately for an operator and never stored. */
function reportFailure(failure: V2HandicapFailure): void {
  console.error(formatFailureMarker(failure));
}

function banner(title: string): void {
  console.log(`\n${"=".repeat(8)} ${title} ${"=".repeat(8)}`);
}

/** The placeholder Stage A used ONLY to render a Stage B prompt in a dry run. It is not a projection and is never stored. */
function placeholderStageA(packet: NflGameContextPacket, game: HandicapV2GameFacts, contextHash: string, total: number | null): StageAV2 {
  const fairSpread = { team: game.homeTeam, line: 0 };
  const projectedTotal = total ?? 45;
  return {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model: "grok",
    gameId: game.gameId,
    contextHash,
    generatedAt: packet.generatedAt,
    fairSpread,
    projectedTotal,
    fairScore: deriveFairScore(fairSpread, projectedTotal, game.homeTeam),
    keyDrivers: [
      { summary: "(dry-run placeholder) A real run inserts your Stage 1 key driver here, with its references.", factRefs: [], evidenceRefs: [] },
      { summary: "(dry-run placeholder) A real run inserts your second Stage 1 key driver here, with its references.", factRefs: [], evidenceRefs: [] },
      { summary: "(dry-run placeholder) A real run inserts your third Stage 1 key driver here, with its references.", factRefs: [], evidenceRefs: [] },
    ],
    mainRisk: "(dry-run placeholder) A real run inserts your Stage 1 main risk here.",
    uncertainty: "MEDIUM",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.provider || !args.gameId || !args.mode) {
    console.error("Usage: npx tsx scripts/run-nfl-handicap-v2.ts --provider=grok|chatgpt --game=2026_03_LAC_BUF [--mode=full|repricing] [--live]");
    process.exitCode = 1;
    return;
  }
  const provider = args.provider;
  const bindings = PROVIDERS[provider];
  const [seasonToken, weekToken] = args.gameId.split("_");
  const season = Number(seasonToken);
  const week = Number(weekToken);

  const now = new Date();
  const { result } = loadFreshGameContextPacket({ root: ROOT, gameId: args.gameId, season, week, now: () => now });
  if (result.status !== "ok") {
    console.error(`Failed to build the Game Context Packet: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  const packet = result.packet;
  const teams = readJson<TeamsArtifact>(join(ROOT, "public", "data", "nfl", "teams.json"));
  const contextErrors = teams ? validateGameContextPacket(packet, teams).filter((i) => i.severity === "error") : [];
  if (contextErrors.length > 0) {
    console.error("Game Context Packet failed validation:", JSON.stringify(contextErrors, null, 2));
    process.exitCode = 1;
    return;
  }
  if (isPregameStreamLocked(packet.schedule.kickoffUtc, () => now)) {
    console.error(`Refusing to run: kickoff (${packet.schedule.kickoffUtc}) has passed.`);
    process.exitCode = 1;
    return;
  }
  const preflight = canCreatePregameSnapshot({ kickoffUtc: packet.schedule.kickoffUtc, researchCutoff: now.toISOString(), snapshotType: "daily_update", now: () => now });
  if (!preflight.ok) {
    console.error(`Refusing to run: ${preflight.reason}`);
    process.exitCode = 1;
    return;
  }

  const game: HandicapV2GameFacts = {
    gameId: packet.identity.gameId,
    homeTeam: packet.identity.homeTeam,
    awayTeam: packet.identity.awayTeam,
    homeTeamFull: packet.identity.homeTeamFull,
    awayTeamFull: packet.identity.awayTeamFull,
    kickoffUtc: packet.schedule.kickoffUtc,
  };
  const contextHash = footballContextHash(packet);

  // Evidence: the provider's real research stream (same file the v1 runners use).
  const canonicalPath = evidenceArtifactPath(ROOT, season, week, args.gameId, provider);
  const evidenceArtifact = readEvidenceArtifact(join(dirname(canonicalPath), "evidence.live-test.json"));
  if (args.live && (!evidenceArtifact || evidenceArtifact.fixture)) {
    console.error(`No real ${provider} evidence found for ${args.gameId} (or it is marked fixture:true) -- a live handicap needs validated evidence. Run the research pass first.`);
    process.exitCode = 1;
    return;
  }
  const allEvidence = evidenceArtifact && !evidenceArtifact.fixture ? evidenceArtifact.evidence : [];
  if (allEvidence.length === 0) console.log("NOTE: no real evidence is available for this game/provider; prompts below carry an explicit 'no citable evidence' section.");
  const authority = resolveEvidenceAuthority(allEvidence);
  const blindEvidence = filterEvidenceRecordsForBlindStageA(allEvidence);
  const stageBEvidence = filterEvidenceRecordsForStageBV2(allEvidence);
  console.log(`Evidence: ${allEvidence.length} total, ${blindEvidence.length} citable in Stage A (market/betting-opinion records excluded), ${stageBEvidence.length} citable in Stage B.`);

  // Market context: the exact line JKB displays, plus the range across the other books.
  const market = loadHandicapV2MarketContext(ROOT, packet, args.gameId);
  if (!market) {
    console.error("No usable current spread for this game -- Stage B needs the exact displayed line. Stopping.");
    process.exitCode = 1;
    return;
  }

  const inputs = buildInputFingerprint({ packet, evidence: allEvidence, market });

  if (args.mode === "repricing") {
    const prior = readLatestPublishableHandicapV2Record(ROOT, season, week, args.gameId, provider);
    if (!prior) {
      console.error("Refusing to reprice: there is no stored v2 record to take a locked Stage A from. Run a full pass first.");
      process.exitCode = 1;
      return;
    }
    if (prior.contextHash !== contextHash) {
      console.error(`Refusing to reprice: the football context changed since the stored record (${prior.contextHash.slice(0, 12)} -> ${contextHash.slice(0, 12)}). Stage A must rerun -- use the full mode.`);
      process.exitCode = 1;
      return;
    }
    const priorInputs = recordFingerprint(prior);
    if (priorInputs && priorInputs.stageAEvidenceHash !== stageAEvidenceHash(allEvidence)) {
      console.error("Refusing to reprice: the Stage A-visible evidence changed since the stored record. Stage A must rerun -- use the full mode.");
      process.exitCode = 1;
      return;
    }
    const lockedStageA = lockedStageAFromRecord(prior);
    const repriceBEvidenceLines = bindings.buildEvidenceLines(stageBEvidence, authority);
    const repricePrompt = buildStageBV2Prompt({ provider, game, packet, lockedStageA, market, evidenceLines: repriceBEvidenceLines });
    if (!args.live) {
      banner(`DRY RUN REPRICING (${provider}, ${game.gameId}) -- no provider call is made and nothing is written`);
      console.log(repricePrompt);
      console.log(`
To run for real: npx tsx scripts/run-nfl-handicap-v2.ts --provider=${provider} --game=${game.gameId} --mode=repricing --live   (needs ${bindings.apiKeyHint}; ONE billed call, Stage A reused)`);
      return;
    }
    const repriceKey = bindings.apiKey();
    if (!repriceKey) {
      console.error(`${bindings.apiKeyHint} is not set.`);
      process.exitCode = 1;
      return;
    }
    banner(`STAGE B REPRICING (${provider}) -- locked Stage A from ${prior.stageAGeneratedAt}`);
    await runStageBAndWrite({ provider, bindings, apiKey: repriceKey, game, packet, lockedStageA, market, stageBEvidenceLines: repriceBEvidenceLines, allEvidence, contextHash, season, week, inputs, cliMode: "repricing" });
    return;
  }

  const stageAPrompt = buildStageAV2Prompt({ provider, game, packet, evidenceLines: bindings.buildEvidenceLines(blindEvidence, authority) });
  const audit = auditStageAPromptForMarketPricing(stageAPrompt, sanitizeGameContextPacketForBlindStageA(packet), blindEvidence);
  if (!audit.pass) {
    for (const f of audit.findings) console.error(`  [Stage A audit] rule=${f.matched} class=${f.sourceClass} snippet="${f.snippet}"`);
    console.error("Refusing to continue: the Stage A prompt failed the market-blindness audit.");
    process.exitCode = 1;
    return;
  }
  console.log("Stage A market-blindness audit: PASSED");

  const stageBEvidenceLines = bindings.buildEvidenceLines(stageBEvidence, authority);

  if (!args.live) {
    banner(`DRY RUN (${provider}, ${game.gameId}) -- no provider call is made and nothing is written`);
    banner("STAGE A PROMPT");
    console.log(stageAPrompt);
    banner("STAGE B PROMPT (built around a placeholder Stage A)");
    console.log(buildStageBV2Prompt({ provider, game, packet, lockedStageA: placeholderStageA(packet, game, contextHash, market.total.line), market, evidenceLines: stageBEvidenceLines }));
    banner("SUMMARY");
    console.log(`Stage A prompt: ${stageAPrompt.length} chars; market: ${market.sideLabels.home} / ${market.sideLabels.away}, total ${market.total.line}; key numbers material: ${market.keyNumbers.material}`);
    console.log(`To run for real: npx tsx scripts/run-nfl-handicap-v2.ts --provider=${provider} --game=${game.gameId} --live   (needs ${bindings.apiKeyHint}; two billed calls)`);
    return;
  }

  const apiKey = bindings.apiKey();
  if (!apiKey) {
    console.error(`${bindings.apiKeyHint} is not set.`);
    process.exitCode = 1;
    return;
  }

  banner(`STAGE A (${provider}) -- blind projection`);
  const stageAResult = await bindings.runStage({ stage: "A", prompt: stageAPrompt, apiKey });
  console.log(JSON.stringify(stageAResult.telemetry, null, 2));
  if (!stageAResult.ok) {
    reportFailure(providerCallFailure("A", stageAResult.error));
    console.error(`Stage A FAILED: ${stageAResult.error}`);
    process.exitCode = 1;
    return;
  }
  emitTelemetryMarker({ provider, gameId: game.gameId, cliMode: "initial", stage: "A", telemetry: stageAResult.telemetry as AnyProviderTelemetry });
  const stageA = validateStageAV2(stageAResult.raw, { model: provider, gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash, homeTeam: game.homeTeam, awayTeam: game.awayTeam, contextPacket: packet, allEvidenceRecords: allEvidence });
  if (!stageA.ok) {
    reportFailure(validationFailure("A", stageA.reasons));
    console.error("Stage A FAILED validation:");
    for (const reason of stageA.reasons) console.error(`  - ${reason}`);
    console.error("Raw Stage A output:", JSON.stringify(stageAResult.raw, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`LOCKED: ${stageA.analysis.fairSpread.team.toUpperCase()} ${stageA.analysis.fairSpread.line}, total ${stageA.analysis.projectedTotal}, uncertainty ${stageA.analysis.uncertainty}`);

  banner(`STAGE B (${provider}) -- market decision and write-up`);
  await runStageBAndWrite({ provider, bindings, apiKey, game, packet, lockedStageA: stageA.analysis, market, stageBEvidenceLines, allEvidence, contextHash, season, week, inputs, cliMode: "initial" });
}

interface StageBRunInput {
  provider: EvidenceModel;
  bindings: ProviderBindings;
  apiKey: string;
  game: HandicapV2GameFacts;
  packet: NflGameContextPacket;
  lockedStageA: StageAV2;
  market: HandicapV2MarketContext;
  stageBEvidenceLines: string[];
  allEvidence: EvidenceRecord[];
  contextHash: string;
  season: number;
  week: number;
  inputs: HandicapV2InputFingerprint;
  cliMode: "initial" | "repricing";
}

/** Stage B -> validate -> write-once record. Shared by the full run and the market-only repricing run. */
async function runStageBAndWrite(run: StageBRunInput): Promise<void> {
  const { provider, game, market } = run;
  const stageBPrompt = buildStageBV2Prompt({ provider, game, packet: run.packet, lockedStageA: run.lockedStageA, market, evidenceLines: run.stageBEvidenceLines });
  const stageBResult = await run.bindings.runStage({ stage: "B", prompt: stageBPrompt, apiKey: run.apiKey });
  console.log(JSON.stringify(stageBResult.telemetry, null, 2));
  if (!stageBResult.ok) {
    reportFailure(providerCallFailure("B", stageBResult.error));
    console.error(`Stage B FAILED: ${stageBResult.error}`);
    process.exitCode = 1;
    return;
  }
  emitTelemetryMarker({ provider, gameId: game.gameId, cliMode: run.cliMode, stage: "B", telemetry: stageBResult.telemetry as AnyProviderTelemetry });
  const stageB = validateStageBV2(stageBResult.raw, { model: provider, gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash: run.contextHash, game, lockedStageA: run.lockedStageA, market, contextPacket: run.packet, allEvidenceRecords: run.allEvidence });
  if (!stageB.ok) {
    reportFailure(validationFailure("B", stageB.reasons));
    console.error("Stage B FAILED validation:");
    for (const reason of stageB.reasons) console.error(`  - ${reason}`);
    console.error("Raw Stage B output:", JSON.stringify(stageBResult.raw, null, 2));
    process.exitCode = 1;
    return;
  }

  const record = buildHandicapV2Record({ stageA: run.lockedStageA, stageB: stageB.analysis, market, evidenceRecords: run.allEvidence, inputs: run.inputs });
  const path = writeHandicapV2Record(ROOT, run.season, run.week, record);
  banner("RESULT");
  console.log(`${record.verdict} | preferred ${market.sideLabels[record.preferredSide]} | cover ${record.coverProbabilityPreferred}% vs ${record.coverProbabilityOther}% | confidence ${record.confidence} | ${record.wordCount} words`);
  if (record.warnings.length > 0) console.log(`warnings: ${record.warnings.join(" | ")}`);
  console.log(`
${record.analysisMarkdown}
`);
  console.log(`sources: ${JSON.stringify(record.sources, null, 2)}`);
  console.log(`written (write-once): ${path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
