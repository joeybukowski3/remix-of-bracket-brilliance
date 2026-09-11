/**
 * WU2 (docs/nfl-grok-chatgpt-handicap-architecture.md §5) -- writes SYNTHETIC
 * fixture evidence artifacts for the documented first-test game
 * (2026_01_BAL_IND) to data/nfl/analysis/<season>/<week>/<gameId>/<model>/evidence.json.
 *
 * This is a manual/dev fixture script, NOT a scheduled workflow, and it does
 * NOT call any AI/research API -- every candidate comes from
 * scripts/lib/__fixtures__/nfl-evidence-fixtures.ts, which is explicitly
 * synthetic (see that file's header comment). Each written artifact is
 * tagged `fixture: true` with a `fixtureNote` so nothing here is ever
 * mistaken for real research output.
 *
 * Run by hand: `npx tsx scripts/generate-nfl-evidence-fixture.ts`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeExternalEvidence } from "./lib/nfl-evidence-normalizer";
import { appendEvidence, createEvidenceStore, evidenceArtifactPath, writeEvidenceArtifact } from "./lib/nfl-evidence-store";
import {
  CHATGPT_FIXTURE_CANDIDATES,
  FIXTURE_CONTEXT,
  FIXTURE_GAME_ID,
  FIXTURE_SEASON,
  FIXTURE_WEEK,
  GROK_FIXTURE_CANDIDATES,
} from "./lib/__fixtures__/nfl-evidence-fixtures";
import type { EvidenceModel, RawEvidenceCandidate } from "./lib/nfl-evidence-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function buildStoreFor(model: EvidenceModel, candidates: RawEvidenceCandidate[]) {
  let store = createEvidenceStore(model, FIXTURE_GAME_ID);
  const skipped: string[] = [];
  for (const candidate of candidates) {
    const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
    if (!result.ok) {
      skipped.push(`${candidate.claim.slice(0, 60)}... -- ${result.reasons.join("; ")}`);
      continue;
    }
    const append = appendEvidence(store, result.evidence);
    store = append.store;
  }
  return { store, skipped };
}

function main(): void {
  const grok = buildStoreFor("grok", GROK_FIXTURE_CANDIDATES);
  const chatgpt = buildStoreFor("chatgpt", CHATGPT_FIXTURE_CANDIDATES);

  const grokPath = evidenceArtifactPath(ROOT, FIXTURE_SEASON, FIXTURE_WEEK, FIXTURE_GAME_ID, "grok");
  const chatgptPath = evidenceArtifactPath(ROOT, FIXTURE_SEASON, FIXTURE_WEEK, FIXTURE_GAME_ID, "chatgpt");

  writeEvidenceArtifact(grokPath, grok.store, {
    fixture: true,
    fixtureNote: "WU2 synthetic fixture -- not real Grok research output. See scripts/lib/__fixtures__/nfl-evidence-fixtures.ts.",
  });
  writeEvidenceArtifact(chatgptPath, chatgpt.store, {
    fixture: true,
    fixtureNote: "WU2 synthetic fixture -- not real ChatGPT research output. See scripts/lib/__fixtures__/nfl-evidence-fixtures.ts.",
  });

  console.log(`grok: wrote ${grok.store.records.length} record(s) to ${grokPath}`);
  if (grok.skipped.length) console.log(`grok: ${grok.skipped.length} candidate(s) failed hard validation:\n  ${grok.skipped.join("\n  ")}`);
  console.log(`chatgpt: wrote ${chatgpt.store.records.length} record(s) to ${chatgptPath}`);
  if (chatgpt.skipped.length) console.log(`chatgpt: ${chatgpt.skipped.length} candidate(s) failed hard validation:\n  ${chatgpt.skipped.join("\n  ")}`);
}

main();
