/**
 * AI Picks v2 -- short evidence aliases (E1, E2, ...) for everything the MODEL sees.
 *
 * Why: canonical evidence ids are `{model}-{gameId}-{16 hex}`. Twice in production
 * (2026_04_PIT_CLE) ChatGPT could not reproduce them -- it dropped a character, and
 * once spliced the tail of one real id onto another -- and strict validation then
 * rejected the whole paid Stage A. Copying an opaque hash is the thing a language
 * model is worst at, so the model never sees one: the prompt lists
 *
 *     E1 | (category=injury, ...) <claim>
 *
 * and the model answers `"evidenceRefs": ["E1", "E3"]`.
 *
 * Trust boundary (unchanged): an alias is resolved to its canonical evidenceId HERE,
 * deterministically and before anything else reads the output. The strict validator
 * (nfl-handicap-v2-validator.ts) then runs, untouched, on canonical ids only -- model
 * match, not rejected, pregame-safe, not betting opinion, not market pricing in the
 * blind stage. An unknown alias, a canonical id, or any other string is rejected here;
 * nothing is repaired, guessed or stripped. Stored records, the evidence store and
 * the locked Stage A carry canonical ids only; aliases exist for one call.
 *
 * Alias order (documented, deterministic): citable records for the provider, with the
 * records Stage A may see first, then the records only Stage B may see, each group in
 * the order given. That makes an alias mean the same record in Stage A and Stage B of
 * a run, keeps Stage A's list contiguous (E1..En, no gap that hints at a hidden
 * record), and means reordering the evidence array reorders the aliases predictably.
 */
import { isBettingOpinionEvidence, isMarketPricingEvidence } from "./nfl-ai-context-sanitizer";
import type { EvidenceModel, EvidenceRecord } from "./nfl-evidence-types";

/** The only shape of model-facing evidence reference. */
export const EVIDENCE_ALIAS_PATTERN = /^E[1-9]\d{0,2}$/;

export interface EvidenceAliasEntry {
  alias: string;
  evidenceId: string;
}

export interface EvidenceAliasMap {
  /** In alias order: E1, E2, ... */
  readonly entries: readonly EvidenceAliasEntry[];
  readonly aliasToId: ReadonlyMap<string, string>;
  readonly idToAlias: ReadonlyMap<string, string>;
}

/** Records a handicap stage may cite for `model`, in alias order. Mirrors the provider evidence-line builders' own filter plus the v2 betting-opinion exclusion. */
export function orderedCitableEvidence(records: readonly EvidenceRecord[], model: EvidenceModel): EvidenceRecord[] {
  const citable = records.filter((r) => r.model === model && r.verificationStatus !== "rejected" && r.pregameSafe && !isBettingOpinionEvidence(r));
  const blindVisible = citable.filter((r) => !isMarketPricingEvidence(r));
  const blindIds = new Set(blindVisible.map((r) => r.evidenceId));
  return [...blindVisible, ...citable.filter((r) => !blindIds.has(r.evidenceId))];
}

/** Assigns E1..En over the ordered citable set. One alias per canonical id (a repeated id keeps its first alias), so a duplicate alias cannot exist. */
export function buildEvidenceAliasMap(records: readonly EvidenceRecord[], model: EvidenceModel): EvidenceAliasMap {
  const entries: EvidenceAliasEntry[] = [];
  const idToAlias = new Map<string, string>();
  for (const record of orderedCitableEvidence(records, model)) {
    if (idToAlias.has(record.evidenceId)) continue;
    const alias = `E${entries.length + 1}`;
    entries.push({ alias, evidenceId: record.evidenceId });
    idToAlias.set(record.evidenceId, alias);
  }
  return { entries, aliasToId: new Map(entries.map((e) => [e.alias, e.evidenceId] as const)), idToAlias };
}

export type AliasResolution<T> = { ok: true; raw: T } | { ok: false; reasons: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refProblem(ref: string, aliases: EvidenceAliasMap): string | null {
  if (aliases.aliasToId.has(ref)) return null;
  if (aliases.entries.length === 0) return `"${ref}" is not allowed: no evidence was supplied, so this array must be empty`;
  const last = aliases.entries[aliases.entries.length - 1].alias;
  return `"${ref}" is not one of the supplied evidence references (E1..${last}) -- cite only references printed in the evidence list, exactly as printed`;
}

/** Resolves an array of aliases to canonical ids. A non-array or non-string entry is left for the validator, which already reports it. */
function resolveRefs(value: unknown, label: string, aliases: EvidenceAliasMap, reasons: string[]): unknown {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return value;
  return (value as string[]).map((ref) => {
    const problem = refProblem(ref, aliases);
    if (problem) {
      reasons.push(`${label} ${problem}`);
      return ref;
    }
    return aliases.aliasToId.get(ref) as string;
  });
}

/** A prose field must never contain an alias: aliases are pipeline identifiers, not football English. */
function aliasLeaks(text: unknown, label: string, aliases: EvidenceAliasMap, reasons: string[]): void {
  if (typeof text !== "string" || aliases.entries.length === 0) return;
  const found = new Set<string>();
  for (const match of text.matchAll(/\bE[1-9]\d{0,2}\b/g)) if (aliases.aliasToId.has(match[0])) found.add(match[0]);
  if (found.size > 0) reasons.push(`${label} contains the evidence reference ${[...found].join(", ")} -- references belong only in the evidence reference arrays, never in prose`);
}

/** Stage A: resolve every `keyDrivers[].evidenceRefs` alias. Returns a NEW payload; the input is not mutated. */
export function resolveStageAEvidenceAliases(raw: unknown, aliases: EvidenceAliasMap): AliasResolution<unknown> {
  if (!isRecord(raw)) return { ok: true, raw };
  const reasons: string[] = [];
  const keyDrivers = Array.isArray(raw.keyDrivers)
    ? raw.keyDrivers.map((driver, index) => {
        if (!isRecord(driver)) return driver;
        aliasLeaks(driver.summary, `keyDrivers[${index}].summary`, aliases, reasons);
        return { ...driver, evidenceRefs: resolveRefs(driver.evidenceRefs, `keyDrivers[${index}].evidenceRefs`, aliases, reasons) };
      })
    : raw.keyDrivers;
  aliasLeaks(raw.mainRisk, "mainRisk", aliases, reasons);
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, raw: { ...raw, keyDrivers } };
}

/** Stage B: resolve `evidenceRefsUsed` and refuse any alias in the prose fields (notably analysisMarkdown). Returns a NEW payload. */
export function resolveStageBEvidenceAliases(raw: unknown, aliases: EvidenceAliasMap): AliasResolution<unknown> {
  if (!isRecord(raw)) return { ok: true, raw };
  const reasons: string[] = [];
  const evidenceRefsUsed = resolveRefs(raw.evidenceRefsUsed, "evidenceRefsUsed", aliases, reasons);
  for (const field of ["analysisMarkdown", "counterargument", "keyNumberSensitivity"] as const) aliasLeaks(raw[field], field, aliases, reasons);
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, raw: { ...raw, evidenceRefsUsed } };
}
