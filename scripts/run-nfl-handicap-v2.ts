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
import { buildBookRange, buildHandicapV2MarketContext, type HandicapV2MarketContext } from "./lib/nfl-handicap-v2-market";
import { buildStageAV2Prompt, buildStageBV2Prompt, type HandicapV2GameFacts } from "./lib/nfl-handicap-v2-prompts";
import { buildHandicapV2Record, writeHandicapV2Record } from "./lib/nfl-handicap-v2-record";
import { deriveFairScore } from "./lib/nfl-handicap-v2-text";
import { HANDICAP_V2_SCHEMA_VERSION, type StageAV2 } from "./lib/nfl-handicap-v2-types";
import { validateStageAV2, validateStageBV2 } from "./lib/nfl-handicap-v2-validator";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./lib/nfl-snapshot-lock";
import { buildCurrentMarketView, findCurrentGame, parseBettingLinesCurrentArtifact } from "../src/lib/nfl/bettingLinesView";

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

function parseArgs(argv: string[]): { provider: EvidenceModel | null; gameId: string; live: boolean } {
  const flags = new Map<string, string>();
  let live = false;
  for (const arg of argv) {
    if (arg === "--live") live = true;
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  const provider = flags.get("provider");
  return { provider: provider === "grok" || provider === "chatgpt" ? provider : null, gameId: flags.get("game") ?? "", live };
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
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
  if (!args.provider || !args.gameId) {
    console.error("Usage: npx tsx scripts/run-nfl-handicap-v2.ts --provider=grok|chatgpt --game=2026_03_LAC_BUF [--live]");
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
  const bettingLines = readJson<unknown>(join(ROOT, "public", "data", "market", "betting-lines-current.json"));
  const artifact = bettingLines ? parseBettingLinesCurrentArtifact(bettingLines) : null;
  const bookRange = artifact ? buildBookRange(findCurrentGame(artifact, args.gameId)) : null;
  const displayed = artifact ? buildCurrentMarketView({ artifact, jkbGameId: args.gameId }) : null;
  const market: HandicapV2MarketContext | null = buildHandicapV2MarketContext({
    market: packet.market,
    teams: { homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeTeamFull: game.homeTeamFull, awayTeamFull: game.awayTeamFull },
    bookRange,
    asOf: displayed?.lastObservedAt ?? packet.market.firstObserved.observedAt ?? packet.provenance.builtAt,
  });
  if (!market) {
    console.error("No usable current spread for this game -- Stage B needs the exact displayed line. Stopping.");
    process.exitCode = 1;
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
    console.error(`Stage A FAILED: ${stageAResult.error}`);
    process.exitCode = 1;
    return;
  }
  const stageA = validateStageAV2(stageAResult.raw, { model: provider, gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash, homeTeam: game.homeTeam, awayTeam: game.awayTeam, contextPacket: packet, allEvidenceRecords: allEvidence });
  if (!stageA.ok) {
    console.error("Stage A FAILED validation:");
    for (const reason of stageA.reasons) console.error(`  - ${reason}`);
    console.error("Raw Stage A output:", JSON.stringify(stageAResult.raw, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`LOCKED: ${stageA.analysis.fairSpread.team.toUpperCase()} ${stageA.analysis.fairSpread.line}, total ${stageA.analysis.projectedTotal}, uncertainty ${stageA.analysis.uncertainty}`);

  banner(`STAGE B (${provider}) -- market decision and write-up`);
  const stageBPrompt = buildStageBV2Prompt({ provider, game, packet, lockedStageA: stageA.analysis, market, evidenceLines: stageBEvidenceLines });
  const stageBResult = await bindings.runStage({ stage: "B", prompt: stageBPrompt, apiKey });
  console.log(JSON.stringify(stageBResult.telemetry, null, 2));
  if (!stageBResult.ok) {
    console.error(`Stage B FAILED: ${stageBResult.error}`);
    process.exitCode = 1;
    return;
  }
  const stageB = validateStageBV2(stageBResult.raw, { model: provider, gameId: game.gameId, generatedAt: new Date().toISOString(), contextHash, game, lockedStageA: stageA.analysis, market, contextPacket: packet, allEvidenceRecords: allEvidence });
  if (!stageB.ok) {
    console.error("Stage B FAILED validation:");
    for (const reason of stageB.reasons) console.error(`  - ${reason}`);
    console.error("Raw Stage B output:", JSON.stringify(stageBResult.raw, null, 2));
    process.exitCode = 1;
    return;
  }

  const record = buildHandicapV2Record({ stageA: stageA.analysis, stageB: stageB.analysis, market, evidenceRecords: allEvidence });
  const path = writeHandicapV2Record(ROOT, season, week, record);
  banner("RESULT");
  console.log(`${record.verdict} | preferred ${market.sideLabels[record.preferredSide]} | cover ${record.coverProbabilityPreferred}% vs ${record.coverProbabilityOther}% | confidence ${record.confidence} | ${record.wordCount} words`);
  if (record.warnings.length > 0) console.log(`warnings: ${record.warnings.join(" | ")}`);
  console.log(`\n${record.analysisMarkdown}\n`);
  console.log(`sources: ${JSON.stringify(record.sources, null, 2)}`);
  console.log(`written (write-once): ${path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
