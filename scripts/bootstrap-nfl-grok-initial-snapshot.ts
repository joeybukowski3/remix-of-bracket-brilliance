/**
 * WU3.3 -- one-time bootstrap that creates the canonical "initial"
 * AnalysisSnapshot for a game whose first live Grok research pass already
 * ran (WU3) but predates the WU3.2 snapshot framework, so no snapshot was
 * ever written for it.
 *
 * EXACTLY how this bootstrap works for 2026_01_BAL_IND (documented here,
 * not just in the WU3.3 report, so it is reproducible):
 *
 *   1. Source evidence: `data/nfl/analysis/2026/1/2026_01_BAL_IND/grok/evidence.live-test.json`
 *      -- the 14 real EvidenceRecords written by WU3's live `runGrokResearch`
 *      call (mode:"initial"). This file, NOT the canonical `evidence.json`
 *      (which stays the WU2 SYNTHETIC fixture, untouched -- see
 *      generate-nfl-evidence-fixture.ts's header), becomes the real evidence
 *      stream this bootstrap and all future WU3.3 update passes read/append
 *      to. This is a deliberate choice, not an oversight: it avoids
 *      overwriting the existing, explicitly-synthetic fixture artifact that
 *      other WU2 tooling/tests depend on.
 *   2. researchCutoff: the live-test artifact's own `generatedAt` field
 *      (2026-09-11T17:38:31.740Z) -- the real wall-clock moment that
 *      research pass ran, not a fabricated or rounded value.
 *   3. kickoff: read from the real Game Context Packet
 *      (`data/nfl/game-context/2026/1/2026_01_BAL_IND.json`'s
 *      `schedule.kickoffUtc`).
 *   4. context: `contextVersion` is the packet's own `provenance.contextVersion`;
 *      `contextHash` is a fresh content hash of the ENTIRE packet file as it
 *      exists on disk right now (nfl-production-prediction-archive.ts's
 *      `contentHash`) -- an approximation, not the packet's state at the
 *      exact moment the live research ran (no historical packet snapshot
 *      exists to hash instead). Documented as a known limitation in the
 *      WU3.3 report; acceptable because a bootstrap's job is only to seed
 *      lineage, not to reconstruct exact historical provenance that was
 *      never captured.
 *   5. evidence: all 14 evidenceIds from the live-test artifact, all listed
 *      as `addedEvidenceIds` (this is the first snapshot in the lineage --
 *      there is no "previous" set to diff against), no
 *      superseded/conflicting ids (single-pass ingestion, nothing to
 *      supersede yet).
 *   6. market: the CURRENT deterministic market read from the same Game
 *      Context Packet (not a historical snapshot from research time --
 *      same limitation as #4/§WU1's market pipeline does not retain
 *      point-in-time reads keyed to arbitrary past timestamps beyond its
 *      own line-history file, which this bootstrap does not attempt to
 *      join). Every "previous" and "*Delta" field is null (initial snapshot).
 *   7. analysisState: null. updateAssessment: null. Per the explicit WU3.3
 *      instruction: "Do NOT manufacture an analysisState... A research-only
 *      initial snapshot ... is valid."
 *   8. snapshotId: computed via the standard `computeSnapshotId()` content
 *      hash (model, gameId, snapshotType:"initial", researchCutoff,
 *      contextHash, evidenceIds) -- not a hand-picked or random value.
 *
 * Run by hand, once, for a game with no existing snapshot history:
 *   `npx tsx scripts/bootstrap-nfl-grok-initial-snapshot.ts --game=2026_01_BAL_IND`
 * Idempotent: if the resulting snapshotId already exists on disk with
 * identical content, writeSnapshot() safely no-ops; if a DIFFERENT snapshot
 * already exists for this (game, model), the script refuses to run (this is
 * a bootstrap for the FIRST snapshot only, never a way to rewrite history).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { footballContextHash, type NflGameContextPacket } from "./lib/nfl-full-game-context";
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

  const existing = readSnapshotHistory(ROOT, season, week, gameId, "grok");
  if (existing.length > 0) {
    console.error(`Refusing to bootstrap: ${existing.length} snapshot(s) already exist for grok/${gameId}. This script only seeds the FIRST snapshot.`);
    process.exitCode = 1;
    return;
  }

  const liveTestPath = join(dirname(evidenceArtifactPath(ROOT, season, week, gameId, "grok")), "evidence.live-test.json");
  const liveArtifact = readEvidenceArtifact(liveTestPath);
  if (!liveArtifact) {
    console.error(`No live-test evidence artifact found at ${liveTestPath} -- nothing to bootstrap from. Run scripts/run-nfl-grok-research.ts --live first.`);
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
  const fullContextPacket = JSON.parse(contextRaw) as NflGameContextPacket;

  const researchCutoff = liveArtifact.generatedAt;
  const contextHash = footballContextHash(fullContextPacket);
  const evidenceIds = liveArtifact.evidence.map((e) => e.evidenceId);

  const snapshotId = computeSnapshotId({ model: "grok", gameId, snapshotType: "initial", researchCutoff, contextHash, evidenceIds });

  const snapshot: AnalysisSnapshot = {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId,
    model: "grok",
    gameId,
    season,
    week,
    snapshotType: "initial",
    createdAt: new Date().toISOString(),
    researchCutoff,
    kickoff: context.schedule.kickoffUtc,
    previousSnapshotId: null,
    context: { contextVersion: context.provenance.contextVersion, contextHash, contextGeneratedAt: context.provenance.builtAt },
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
  console.log(`Bootstrapped initial snapshot ${snapshotId} for grok/${gameId} from ${liveTestPath} (${evidenceIds.length} evidence records, researchCutoff=${researchCutoff}).`);
}

main();
