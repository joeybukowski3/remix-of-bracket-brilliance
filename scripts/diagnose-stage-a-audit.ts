/**
 * WU4.6.1 -- no-cost Stage A market-blindness dry-run diagnostic.
 *
 * Rebuilds the exact Stage A prompt each provider would receive (using the
 * SAME builders/sanitizers as run-nfl-grok-handicap.ts /
 * run-nfl-chatgpt-handicap.ts) and runs the shared audit
 * (nfl-ai-context-sanitizer.ts's auditStageAPromptForMarketPricing) against
 * it, WITHOUT making any Grok/OpenAI API call and WITHOUT requiring
 * GROK_API_KEY/XAI_API_KEY/OPENAI_API_KEY to be set. Prints:
 *   - evidence count before/after blind filtering
 *   - Stage A audit PASS/FAIL
 *   - every matched forbidden item (rule, source class, snippet) on FAILURE
 *
 * Run by hand (no cost, no live calls):
 *   npx tsx scripts/diagnose-stage-a-audit.ts --game=2026_01_BAL_IND
 *   npx tsx scripts/diagnose-stage-a-audit.ts --game=2026_01_BAL_IND --model=grok
 *   npx tsx scripts/diagnose-stage-a-audit.ts --game=2026_01_BAL_IND --model=chatgpt
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFreshGameContextPacket } from "./lib/nfl-full-game-context-loader";
import { evidenceArtifactPath, readEvidenceArtifact, resolveEvidenceAuthority } from "./lib/nfl-evidence-store";
import { auditStageAPromptForMarketPricing, filterEvidenceRecordsForBlindStageA, sanitizeGameContextPacketForBlindStageA } from "./lib/nfl-ai-context-sanitizer";
import {
  buildCitableEvidenceLines as buildGrokCitableEvidenceLines,
  buildStageAInitialPrompt as buildGrokStageAInitialPrompt,
  type AnalysisGameFacts,
} from "./lib/nfl-grok-analysis-adapter";
import {
  buildCitableEvidenceLines as buildChatgptCitableEvidenceLines,
  buildStageAInitialPrompt as buildChatgptStageAInitialPrompt,
} from "./lib/nfl-chatgpt-analysis-adapter";
import type { SnapshotModel } from "./lib/nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BUILDERS: Record<SnapshotModel, { buildStageAInitialPrompt: typeof buildGrokStageAInitialPrompt; buildCitableEvidenceLines: typeof buildGrokCitableEvidenceLines }> = {
  grok: { buildStageAInitialPrompt: buildGrokStageAInitialPrompt, buildCitableEvidenceLines: buildGrokCitableEvidenceLines },
  chatgpt: { buildStageAInitialPrompt: buildChatgptStageAInitialPrompt, buildCitableEvidenceLines: buildChatgptCitableEvidenceLines },
};

function parseArgs(argv: string[]): { gameId: string; models: SnapshotModel[] } {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  const gameId = flags.get("game") ?? "2026_01_BAL_IND";
  const modelFlag = flags.get("model");
  const models: SnapshotModel[] = modelFlag === "grok" || modelFlag === "chatgpt" ? [modelFlag] : ["grok", "chatgpt"];
  return { gameId, models };
}

function diagnoseModel(gameId: string, season: number, week: number, model: SnapshotModel): boolean {
  console.log(`\n=== ${model.toUpperCase()} -- Stage A market-blindness dry-run (${gameId}) ===`);

  const now = new Date();
  const { result: freshContextResult } = loadFreshGameContextPacket({ root: ROOT, gameId, season, week, now: () => now });
  if (freshContextResult.status !== "ok") {
    console.error(`Failed to build Game Context Packet: ${freshContextResult.reason}`);
    return false;
  }
  const packet = freshContextResult.packet;

  const canonicalPath = evidenceArtifactPath(ROOT, season, week, gameId, model);
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  const evidenceArtifact = readEvidenceArtifact(liveTestPath);
  if (!evidenceArtifact) {
    console.error(`No evidence artifact found at ${liveTestPath} -- cannot build a Stage A prompt to audit.`);
    return false;
  }
  const allEvidenceRecords = evidenceArtifact.evidence;
  const authority = resolveEvidenceAuthority(allEvidenceRecords);
  const blindEvidenceRecords = filterEvidenceRecordsForBlindStageA(allEvidenceRecords);
  const blindEvidenceLines = BUILDERS[model].buildCitableEvidenceLines(blindEvidenceRecords, authority);

  console.log(`Evidence count before blind filtering: ${allEvidenceRecords.length}`);
  console.log(`Evidence count after blind filtering:  ${blindEvidenceRecords.length}`);
  console.log(`Excluded as market-pricing commentary:  ${allEvidenceRecords.length - blindEvidenceRecords.length}`);

  const game: AnalysisGameFacts = {
    gameId: packet.identity.gameId,
    homeTeamFull: packet.identity.homeTeamFull,
    awayTeamFull: packet.identity.awayTeamFull,
    homeTeam: packet.identity.homeTeam,
    awayTeam: packet.identity.awayTeam,
    kickoffUtc: packet.schedule.kickoffUtc,
  };

  const prompt = BUILDERS[model].buildStageAInitialPrompt(game, packet, blindEvidenceLines);
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  const result = auditStageAPromptForMarketPricing(prompt, blindPacket, blindEvidenceRecords);

  console.log(`Stage A audit: ${result.pass ? "PASS" : "FAIL"}`);
  if (!result.pass) {
    for (const finding of result.findings) {
      console.log(`  - rule=${finding.matched} sourceClass=${finding.sourceClass} snippet="${finding.snippet}"`);
    }
  }
  return result.pass;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);

  const results = args.models.map((model) => diagnoseModel(args.gameId, season, week, model));
  const allPass = results.every(Boolean);

  console.log(`\n=== SUMMARY ===`);
  console.log(allPass ? "All requested providers PASSED the Stage A market-blindness audit. Safe to run the live --live handicap command(s)." : "At least one provider FAILED -- do NOT run any --live handicap command until this is fixed.");
  process.exitCode = allPass ? 0 : 1;
}

main();
