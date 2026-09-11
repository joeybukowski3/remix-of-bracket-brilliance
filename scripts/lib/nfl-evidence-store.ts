/**
 * WU2 -- model-namespaced, append-only evidence store.
 *
 * An EvidenceStore holds ONE model's ("grok" xor "chatgpt") evidence for
 * ONE game. There is deliberately no function anywhere in this module that
 * accepts two stores of different models and merges them -- that is the
 * comparison engine's job, and it is explicitly out of scope for WU2 (see
 * docs/nfl-grok-chatgpt-handicap-architecture.md §9/§13). Model isolation is
 * enforced structurally:
 *   - appendEvidence() throws if the record's model does not match the
 *     store's own model.
 *   - storage lives at one path per (season, week, gameId, model) --
 *     physically separate directories, never a shared file.
 *
 * Within one model's stream, this module detects duplicates (skip),
 * corroboration (retain both, tag as corroborating), and conflicts (retain
 * both, never overwrite history) -- append-only throughout. Whether an
 * older record is still "current" or has been "superseded" is a derived
 * view computed by resolveEvidenceAuthority(), never a mutation of the
 * stored record itself.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite, canonicalJson, type JsonValue } from "./nfl-production-prediction-archive";
import type { EvidenceModel, EvidenceRecord, EvidenceSupersessionStatus } from "./nfl-evidence-types";
import { EVIDENCE_SCHEMA_VERSION } from "./nfl-evidence-types";
import { sourceTier } from "./nfl-evidence-policy";

export interface EvidenceStore {
  readonly model: EvidenceModel;
  readonly gameId: string;
  readonly records: readonly EvidenceRecord[];
}

export function createEvidenceStore(model: EvidenceModel, gameId: string): EvidenceStore {
  return { model, gameId, records: [] };
}

const STATUS_BEARING_CATEGORIES = new Set(["injury", "availability", "depth_chart"]);

/**
 * Cheap, mechanical stance detector for availability-style claims. Not NLP
 * -- a fixed keyword set that lets the store tell "two sources agree the
 * player is out" (corroboration) apart from "one source says out, another
 * says he'll play" (conflict) without needing full language understanding.
 */
const NEGATIVE_AVAILABILITY_PATTERN = /\b(ruled out|is out\b|was out\b|did not travel|inactive|doubtful|will not play|won't play)\b/i;
const POSITIVE_AVAILABILITY_PATTERN = /\b(expected to play|will play|is active|cleared to play|full participant|no injury designation|played through)\b/i;

function availabilityStance(claim: string): "negative" | "positive" | "neutral" {
  if (NEGATIVE_AVAILABILITY_PATTERN.test(claim)) return "negative";
  if (POSITIVE_AVAILABILITY_PATTERN.test(claim)) return "positive";
  return "neutral";
}

function canonicalClaimKey(record: EvidenceRecord): string {
  return record.claim.trim().replace(/\s+/g, " ").toLowerCase();
}

function sharesSubject(existing: EvidenceRecord, incoming: EvidenceRecord): boolean {
  const sameTeamSubject = existing.subjects.teams.some((t) => incoming.subjects.teams.includes(t));
  const samePlayerSubject =
    existing.subjects.players.length > 0 && incoming.subjects.players.length > 0 && existing.subjects.players.some((p) => incoming.subjects.players.includes(p));
  return sameTeamSubject && (samePlayerSubject || (existing.subjects.players.length === 0 && incoming.subjects.players.length === 0));
}

/** Same normalized claim text + same source URL (or syndicated identical report) within one model's stream. */
function isDuplicate(existing: EvidenceRecord, incoming: EvidenceRecord): boolean {
  if (existing.evidenceId === incoming.evidenceId) return true;
  if (existing.category !== incoming.category) return false;
  const sameClaim = canonicalClaimKey(existing) === canonicalClaimKey(incoming);
  const sameUrl = existing.source.url != null && existing.source.url === incoming.source.url;
  return sameClaim && sameUrl;
}

/**
 * Same underlying fact, independently sourced -- different reporter/URL,
 * overlapping subjects. For status-bearing categories (injury/availability/
 * depth_chart), two independently sourced claims that don't contradict each
 * other's availability stance count as corroboration even when worded
 * completely differently (the canonical "OUT" + "did not travel" example
 * from the architecture doc). For everything else, fall back to a lexical
 * overlap proxy since there's no fixed stance vocabulary to check.
 */
function isCorroborating(existing: EvidenceRecord, incoming: EvidenceRecord): boolean {
  if (existing.category !== incoming.category) return false;
  if (existing.source.url === incoming.source.url) return false; // that's duplication, not corroboration
  if (!sharesSubject(existing, incoming)) return false;

  if (STATUS_BEARING_CATEGORIES.has(existing.category)) {
    const stanceA = availabilityStance(existing.claim);
    const stanceB = availabilityStance(incoming.claim);
    const contradicts = (stanceA === "negative" && stanceB === "positive") || (stanceA === "positive" && stanceB === "negative");
    return !contradicts;
  }

  const wordsA = new Set(canonicalClaimKey(existing).split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(canonicalClaimKey(incoming).split(" ").filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return shared / Math.min(wordsA.size, wordsB.size) >= 0.4;
}

export type AppendOutcome = "added" | "added_duplicate_skipped" | "added_corroborating" | "added_conflicting";

export interface AppendResult {
  store: EvidenceStore;
  outcome: AppendOutcome;
  /** evidenceIds of existing records this one corroborates or conflicts with, if any. */
  relatedEvidenceIds: string[];
}

/**
 * Append-only insert. Never mutates an existing record; at most declines to
 * add an exact duplicate. Returns a NEW store (immutability) plus a
 * classification of what happened, so callers (and tests) can assert on
 * duplicate/corroboration/conflict behavior without inspecting internals.
 */
export function appendEvidence(store: EvidenceStore, record: EvidenceRecord): AppendResult {
  if (record.model !== store.model) {
    throw new Error(`model isolation violation: cannot append a "${record.model}" record into a "${store.model}" store`);
  }
  if (record.gameId !== store.gameId) {
    throw new Error(`gameId mismatch: cannot append evidence for "${record.gameId}" into a store for "${store.gameId}"`);
  }

  for (const existing of store.records) {
    if (isDuplicate(existing, record)) {
      return { store, outcome: "added_duplicate_skipped", relatedEvidenceIds: [existing.evidenceId] };
    }
  }

  const corroborates = store.records.filter((existing) => isCorroborating(existing, record)).map((r) => r.evidenceId);
  if (corroborates.length > 0) {
    return { store: { ...store, records: [...store.records, record] }, outcome: "added_corroborating", relatedEvidenceIds: corroborates };
  }

  // Conflict: same status-bearing category + overlapping subject, but the
  // availability stance actually contradicts (isCorroborating already ruled
  // out the non-contradicting case above) -- exactly the "status flips" the
  // architecture calls out (e.g. "expected to play" vs. "ruled out").
  const conflicts = STATUS_BEARING_CATEGORIES.has(record.category)
    ? store.records
        .filter((existing) => existing.category === record.category && existing.source.url !== record.source.url)
        .filter((existing) => sharesSubject(existing, record))
        .map((r) => r.evidenceId)
    : [];

  if (conflicts.length > 0) {
    return { store: { ...store, records: [...store.records, record] }, outcome: "added_conflicting", relatedEvidenceIds: conflicts };
  }

  return { store: { ...store, records: [...store.records, record] }, outcome: "added", relatedEvidenceIds: [] };
}

export interface EvidenceAuthorityView {
  evidenceId: string;
  status: EvidenceSupersessionStatus;
  reason: string;
}

/**
 * Derived view over an immutable evidence stream: which records are still
 * "current," which have been "superseded" by a strictly better later
 * record, and which remain genuinely "conflicting" (no record dominates).
 * Never mutates store.records -- this is recomputed on demand.
 *
 * Dominance rule: record B supersedes record A (same status-bearing
 * category + overlapping player/team subject) only when B's source tier is
 * at least as good as A's AND B's reference timestamp is strictly later.
 * Otherwise both are "conflicting" -- a newer report from a worse source
 * does not automatically win.
 */
const AUTHORITY_STATUS_RANK: Record<EvidenceSupersessionStatus, number> = { current: 0, conflicting: 1, superseded: 2 };

export function resolveEvidenceAuthority(records: readonly EvidenceRecord[]): EvidenceAuthorityView[] {
  const referenceMs = (r: EvidenceRecord) => Date.parse(r.source.publishedAt ?? r.source.retrievedAt);

  const results = new Map<string, EvidenceAuthorityView>(
    records.map((r) => [r.evidenceId, { evidenceId: r.evidenceId, status: "current", reason: "no conflicting record found" }])
  );

  function upgrade(evidenceId: string, status: EvidenceSupersessionStatus, reason: string): void {
    const current = results.get(evidenceId);
    if (current && AUTHORITY_STATUS_RANK[status] > AUTHORITY_STATUS_RANK[current.status]) {
      results.set(evidenceId, { evidenceId, status, reason });
    }
  }

  for (let i = 0; i < records.length; i += 1) {
    const a = records[i];
    if (!STATUS_BEARING_CATEGORIES.has(a.category)) continue;
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j];
      if (b.category !== a.category) continue;
      if (b.source.url === a.source.url) continue;
      if (!sharesSubject(a, b)) continue;
      const stanceA = availabilityStance(a.claim);
      const stanceB = availabilityStance(b.claim);
      const contradicts = (stanceA === "negative" && stanceB === "positive") || (stanceA === "positive" && stanceB === "negative");
      if (!contradicts) continue; // non-contradicting, differently-worded records are corroboration, not conflict

      const aDominatesB = sourceTier(a.source.sourceType) <= sourceTier(b.source.sourceType) && referenceMs(a) > referenceMs(b);
      const bDominatesA = sourceTier(b.source.sourceType) <= sourceTier(a.source.sourceType) && referenceMs(b) > referenceMs(a);

      if (bDominatesA) {
        upgrade(a.evidenceId, "superseded", `superseded by ${b.evidenceId} (later, equal-or-better source tier)`);
      } else if (aDominatesB) {
        upgrade(b.evidenceId, "superseded", `superseded by ${a.evidenceId} (later, equal-or-better source tier)`);
      } else {
        upgrade(a.evidenceId, "conflicting", `conflicts with ${b.evidenceId}, no record dominates`);
        upgrade(b.evidenceId, "conflicting", `conflicts with ${a.evidenceId}, no record dominates`);
      }
    }
  }

  return [...results.values()];
}

export function evidenceArtifactPath(root: string, season: number, week: number, gameId: string, model: EvidenceModel): string {
  return join(root, "data", "nfl", "analysis", String(season), String(week), gameId, model, "evidence.json");
}

export interface EvidenceArtifact {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  model: EvidenceModel;
  gameId: string;
  fixture: boolean;
  fixtureNote: string | null;
  generatedAt: string;
  evidence: EvidenceRecord[];
}

export function writeEvidenceArtifact(filePath: string, store: EvidenceStore, options: { fixture: boolean; fixtureNote?: string }): void {
  const artifact: EvidenceArtifact = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    model: store.model,
    gameId: store.gameId,
    fixture: options.fixture,
    fixtureNote: options.fixture ? options.fixtureNote ?? "Synthetic WU2 fixture data -- not real research." : null,
    generatedAt: new Date().toISOString(),
    evidence: [...store.records],
  };
  atomicWrite(filePath, `${canonicalJson(artifact as unknown as JsonValue)}\n`);
}

export function readEvidenceArtifact(filePath: string): EvidenceArtifact | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as EvidenceArtifact;
}
