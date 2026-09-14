/**
 * WU4.3 -- one-time bootstrap that creates the canonical "initial"
 * AnalysisSnapshot for a game whose first live ChatGPT research pass already
 * ran (WU4/WU4.1/WU4.2) but predates the WU3.2 snapshot framework, so no
 * snapshot was ever written for it. Direct ChatGPT counterpart of
 * scripts/bootstrap-nfl-grok-initial-snapshot.ts -- same bootstrap shape,
 * same reasoning, only the source evidence stream and model differ.
 *
 * For 2026_01_BAL_IND specifically:
 *   1. Source evidence: `data/nfl/analysis/2026/1/2026_01_BAL_IND/chatgpt/evidence.live-test.json`
 *      -- the 14 real EvidenceRecords written by WU4.2's live-confirmed
 *      `runChatGptResearch` call (mode:"initial": gpt-5.6-luna,
 *      reasoning_effort:"none", 4 actual web-search requests, 92
 *      provider-discovered source URLs, raw-vs-parsed grounding status
 *      "consistent_grounded"). This file, NOT the canonical `evidence.json`
 *      (the WU2 SYNTHETIC fixture, untouched), is the real evidence stream
 *      this bootstrap and all future WU4.3 update passes read/append to --
 *      same deliberate choice as the Grok bootstrap, for the same reason.
 *   2. researchCutoff: the live-test artifact's own `generatedAt` field --
 *      the real wall-clock moment that research pass ran.
 *   3. kickoff: read from the real Game Context Packet
 *      (`data/nfl/game-context/2026/1/2026_01_BAL_IND.json`'s
 *      `schedule.kickoffUtc`).
 *   4. context: `contextVersion` is the packet's own `provenance.contextVersion`;
 *      `contextHash` is a fresh content hash of the ENTIRE packet file as it
 *      exists on disk right now -- an approximation, not the packet's state
 *      at the exact moment the live research ran (no historical packet
 *      snapshot exists to hash instead), same known limitation as the Grok
 *      bootstrap.
 *   5. evidence: all evidenceIds from the live-test artifact, all listed as
 *      `addedEvidenceIds` (first snapshot in the lineage -- nothing to diff
 *      against), no superseded/conflicting ids.
 *   6. market: the CURRENT deterministic market read from the same Game
 *      Context Packet. Every "previous"/"*Delta" field is null (initial
 *      snapshot).
 *   7. analysisState: null. updateAssessment: null -- research-only initial
 *      snapshot, no opinion manufactured.
 *   8. snapshotId: computed via the standard `computeSnapshotId()` content
 *      hash (model, gameId, snapshotType:"initial", researchCutoff,
 *      contextHash, evidenceIds).
 *
 * MODEL ISOLATION: this script only ever opens `.../chatgpt/` paths -- it
 * never reads or references any path under `.../grok/`.
 *
 * Run by hand, once, for a game with no existing ChatGPT snapshot history:
 *   `npx tsx scripts/bootstrap-nfl-chatgpt-initial-snapshot.ts --game=2026_01_BAL_IND`
 * Idempotent: if the resulting snapshotId already exists on disk with
 * identical content, writeSnapshot() safely no-ops; if a DIFFERENT snapshot
 * already exists for this (game, model), the script refuses to run.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "./lib/nfl-production-prediction-archive";
import { readEvidenceArtifact, evidenceArtifactPath } from "./lib/nfl-evidence-store";
import { computeSnapshotId, readSnapshotHistory, writeSnapshot } from "./lib/nfl-snapshot-store";
import type { AnalysisSnapshot } from "./lib/nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface GameContextPacketShape {
  identity: { gameId: string; season: number; week: number };
  schedule: { kickoffUtc: string };
  market: {
    sportsbook: string | null;
    spread: { homeLine: number | null; awayLine: number | null };
    total: { line: number | null };
    moneyline: { homePrice: number | null; awayPrice: number | null };
  };
  provenance: { contextVersion: string; builtAt: string };
}

function parseArgs(argv: string[]): { gameId: string } {
  const match = argv.map((a) => /^--game=(.+)$/.exec(a)).find(Boolean);
  return { gameId: match ? match[1] : "2026_01_BAL_IND" };
}

function main(): void {
  const { gameId } = parseArgs(process.argv.slice(2));
  const [seasonStr, weekStr] = gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);

  const existing = readSnapshotHistory(ROOT, season, week, gameId, "chatgpt");
  if (existing.length > 0) {
    console.error(`Refusing to bootstrap: ${existing.length} snapshot(s) already exist for chatgpt/${gameId}. This script only seeds the FIRST snapshot.`);
    process.exitCode = 1;
    return;
  }

  const liveTestPath = join(dirname(evidenceArtifactPath(ROOT, season, week, gameId, "chatgpt")), "evidence.live-test.json");
  const liveArtifact = readEvidenceArtifact(liveTestPath);
  if (!liveArtifact) {
    console.error(`No live-test evidence artifact found at ${liveTestPath} -- nothing to bootstrap from. Run scripts/run-nfl-chatgpt-research.ts --live first.`);
    process.exitCode = 1;
    return;
  }
  if (liveArtifact.fixture) {
    console.error(`${liveTestPath} is marked fixture:true -- refusing to bootstrap a real snapshot lineage from synthetic data.`);
    process.exitCode = 1;
    return;
  }

  const contextPath = join(ROOT, "data", "nfl", "game-context", seasonStr, String(week), `${gameId}.json`);
  if (!existsSync(contextPath)) {
    console.error(`No Game Context Packet found at ${contextPath}.`);
    process.exitCode = 1;
    return;
  }
  const contextRaw = readFileSync(contextPath, "utf8");
  const context = JSON.parse(contextRaw) as GameContextPacketShape;

  const researchCutoff = liveArtifact.generatedAt;
  const contextHashValue = contentHash(contextRaw);
  const evidenceIds = liveArtifact.evidence.map((e) => e.evidenceId);

  const snapshotId = computeSnapshotId({ model: "chatgpt", gameId, snapshotType: "initial", researchCutoff, contextHash: contextHashValue, evidenceIds });

  const snapshot: AnalysisSnapshot = {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId,
    model: "chatgpt",
    gameId,
    season,
    week,
    snapshotType: "initial",
    createdAt: new Date().toISOString(),
    researchCutoff,
    kickoff: context.schedule.kickoffUtc,
    previousSnapshotId: null,
    context: { contextVersion: context.provenance.contextVersion, contextHash: contextHashValue, contextGeneratedAt: context.provenance.builtAt },
    evidence: { evidenceIds, addedEvidenceIds: [...evidenceIds], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: {
      sportsbook: context.market.sportsbook,
      spread: context.market.spread,
      total: context.market.total,
      moneyline: context.market.moneyline,
      asOf: context.provenance.builtAt,
      previousSpread: null,
      previousTotal: null,
      spreadDelta: null,
      totalDelta: null,
      moneylineHomeDelta: null,
      moneylineAwayDelta: null,
      sportsbookChanged: false,
      asOfDeltaMs: null,
    },
    analysisState: null,
    updateAssessment: null,
  };

  writeSnapshot(ROOT, snapshot);
  console.log(`Bootstrapped initial snapshot ${snapshotId} for chatgpt/${gameId} from ${liveTestPath} (${evidenceIds.length} evidence records, researchCutoff=${researchCutoff}).`);
}

main();
