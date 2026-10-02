/**
 * AI Picks v2 -- model-facing evidence aliases (E1, E2, ...) over strict canonical
 * validation. The model cites `E3`; the alias layer resolves it to the canonical id
 * BEFORE the unchanged validator runs; only canonical ids are ever stored.
 *
 * No provider call is made: these tests exercise prompts, the resolver, the strict
 * validator and the record builder directly.
 */
import { describe, expect, it } from "vitest";
import { filterEvidenceRecordsForBlindStageA, filterEvidenceRecordsForStageBV2 } from "./nfl-ai-context-sanitizer";
import { buildCitableEvidenceLines as chatgptEvidenceLines } from "./nfl-chatgpt-analysis-adapter";
import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceModel, EvidenceRecord } from "./nfl-evidence-types";
import { buildCitableEvidenceLines as grokEvidenceLines } from "./nfl-grok-analysis-adapter";
import { buildEvidenceAliasMap, orderedCitableEvidence, resolveStageAEvidenceAliases, resolveStageBEvidenceAliases } from "./nfl-handicap-v2-evidence-aliases";
import { buildStageAV2Prompt, buildStageBV2Prompt } from "./nfl-handicap-v2-prompts";
import { buildHandicapV2Record } from "./nfl-handicap-v2-record";
import { validateStageAV2, validateStageBV2, type StageAV2ValidationContext, type StageBV2ValidationContext } from "./nfl-handicap-v2-validator";
import { V2_CONTEXT_HASH, V2_EVIDENCE, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_A_TIME, V2_STAGE_B_TIME, stageARaw, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];
const lines = (model: EvidenceModel, records: readonly EvidenceRecord[]): string[] => (model === "grok" ? grokEvidenceLines : chatgptEvidenceLines)(records, resolveEvidenceAuthority(V2_EVIDENCE[model].all));

function stageACtx(model: EvidenceModel, records: readonly EvidenceRecord[] = V2_EVIDENCE[model].all): StageAV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: records };
}

function stageBCtx(model: EvidenceModel): StageBV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

/** A copy of `record` under another canonical id (and optionally another category) -- enough to exercise aliasing and filtering without the normalizer. */
const variant = (record: EvidenceRecord, evidenceId: string, over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({ ...record, evidenceId, ...over });

/** What a model that was shown aliases would return: every canonical evidence id replaced by its alias. */
function aliasify<T>(raw: T, model: EvidenceModel): T {
  const map = buildEvidenceAliasMap(V2_EVIDENCE[model].all, model);
  return JSON.parse(JSON.stringify(raw), (_key, value) => (typeof value === "string" ? map.idToAlias.get(value) ?? value : value)) as T;
}

describe.each(PROVIDERS)("alias map (%s)", (model) => {
  const records = V2_EVIDENCE[model];

  it("assigns E1.. in the documented order and each alias maps to exactly one canonical id", () => {
    const map = buildEvidenceAliasMap(records.all, model);
    // the betting-opinion record is not citable at all, so only the injury and weather records are aliased
    expect(map.entries).toEqual([
      { alias: "E1", evidenceId: records.injury.evidenceId },
      { alias: "E2", evidenceId: records.weather.evidenceId },
    ]);
    expect(map.aliasToId.get("E1")).toBe(records.injury.evidenceId);
    expect(new Set(map.entries.map((e) => e.alias)).size).toBe(map.entries.length);
    expect(new Set(map.entries.map((e) => e.evidenceId)).size).toBe(map.entries.length);
  });

  it("is deterministic: the same ordered set always yields the same map", () => {
    expect(buildEvidenceAliasMap(records.all, model).entries).toEqual(buildEvidenceAliasMap([...records.all], model).entries);
  });

  it("follows the order given: reordering the evidence reorders the aliases, predictably", () => {
    const reversed = buildEvidenceAliasMap([records.weather, records.injury, records.bettingOpinion], model);
    expect(reversed.entries).toEqual([
      { alias: "E1", evidenceId: records.weather.evidenceId },
      { alias: "E2", evidenceId: records.injury.evidenceId },
    ]);
  });

  it("numbers the records Stage A may see first, so Stage A's list is contiguous and an alias means the same record in Stage B", () => {
    const market = variant(records.weather, `${model}-fixture-market-record`, { category: "market", claim: "The spread has moved to Bills -7 at several books." });
    const order = [market, records.injury, records.weather];
    const map = buildEvidenceAliasMap(order, model);
    expect(map.entries.map((e) => e.evidenceId)).toEqual([records.injury.evidenceId, records.weather.evidenceId, market.evidenceId]);
    expect(map.idToAlias.get(market.evidenceId)).toBe("E3");
    const a = buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines(model, filterEvidenceRecordsForBlindStageA(order)), evidenceAliases: map });
    const b = buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: lines(model, filterEvidenceRecordsForStageBV2(order)), evidenceAliases: map });
    expect(a).toMatch(/\(E1, E2\)/);
    expect(a).not.toMatch(/^E3 \|/m);
    expect(b).toMatch(/\(E1, E2, E3\)/);
    // the SAME record carries the SAME alias in both stages
    const claimLine = (prompt: string, alias: string) => prompt.split("\n").find((l) => l.startsWith(`${alias} | `));
    expect(claimLine(a, "E1")).toBe(claimLine(b, "E1"));
    expect(claimLine(a, "E2")).toBe(claimLine(b, "E2"));
  });

  it("excludes records a stage may never cite: other-model, rejected, not pregame-safe, betting opinion", () => {
    const other = PROVIDERS.find((p) => p !== model) as EvidenceModel;
    const rejected = variant(records.injury, `${model}-fixture-rejected`, { verificationStatus: "rejected" });
    const unsafe = variant(records.injury, `${model}-fixture-unsafe`, { pregameSafe: false });
    const set = [V2_EVIDENCE[other].injury, rejected, unsafe, records.bettingOpinion, records.injury];
    expect(orderedCitableEvidence(set, model).map((r) => r.evidenceId)).toEqual([records.injury.evidenceId]);
    expect(buildEvidenceAliasMap(set, model).entries).toHaveLength(1);
  });

  it("gives a repeated canonical id one alias, never two", () => {
    const map = buildEvidenceAliasMap([records.injury, records.injury, records.weather], model);
    expect(map.entries.map((e) => e.alias)).toEqual(["E1", "E2"]);
  });
});

describe.each(PROVIDERS)("resolution to canonical ids (%s)", (model) => {
  const records = V2_EVIDENCE[model];
  const map = buildEvidenceAliasMap(records.all, model);

  it("resolves E1 in Stage A drivers to the correct canonical id", () => {
    const aliased = aliasify(stageARaw(model), model);
    expect(JSON.stringify(aliased)).toContain('"E1"');
    const resolved = resolveStageAEvidenceAliases(aliased, map);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect((resolved.raw as { keyDrivers: Array<{ evidenceRefs: string[] }> }).keyDrivers[2].evidenceRefs).toEqual([records.injury.evidenceId]);
    expect(validateStageAV2(resolved.raw, stageACtx(model)).ok).toBe(true);
  });

  it("resolves Stage B evidenceRefsUsed the same way", () => {
    const resolved = resolveStageBEvidenceAliases({ ...stageBRaw(model), evidenceRefsUsed: ["E2", "E1"] }, map);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect((resolved.raw as { evidenceRefsUsed: string[] }).evidenceRefsUsed).toEqual([records.weather.evidenceId, records.injury.evidenceId]);
  });

  it.each([["E99"], ["e1"], ["[E1]"], ["E01"], ["E0"], ["E1 "], [""], ["E1,E2"]])("rejects the unknown or malformed reference %j", (ref) => {
    const stageA = resolveStageAEvidenceAliases({ ...stageARaw(model), keyDrivers: [{ summary: "x", factRefs: [], evidenceRefs: [ref] }] }, map);
    expect(stageA.ok).toBe(false);
    if (!stageA.ok) expect(stageA.reasons.join(" ")).toMatch(/is not one of the supplied evidence references \(E1\.\.E2\)/);
    const stageB = resolveStageBEvidenceAliases({ ...stageBRaw(model), evidenceRefsUsed: [ref] }, map);
    expect(stageB.ok).toBe(false);
  });

  it("rejects a canonical id: the model is never shown one, so its appearance is a fabrication, valid or not", () => {
    const real = resolveStageBEvidenceAliases({ ...stageBRaw(model), evidenceRefsUsed: [records.injury.evidenceId] }, map);
    expect(real.ok).toBe(false);
  });

  it("does not mutate the model output it was given", () => {
    const aliased = aliasify(stageARaw(model), model);
    const before = JSON.stringify(aliased);
    resolveStageAEvidenceAliases(aliased, map);
    expect(JSON.stringify(aliased)).toBe(before);
  });

  it("never lets an alias into prose: Stage A driver/risk text and Stage B analysisMarkdown, counterargument, keyNumberSensitivity", () => {
    const raw = stageBRaw(model);
    for (const field of ["analysisMarkdown", "counterargument", "keyNumberSensitivity"]) {
      const leaked = resolveStageBEvidenceAliases({ ...raw, evidenceRefsUsed: ["E1"], [field]: `${raw[field]} The tight end report (E1) matters.` }, map);
      expect(leaked.ok, field).toBe(false);
      if (!leaked.ok) expect(leaked.reasons.join(" ")).toContain(`${field} contains the evidence reference E1`);
    }
    const a = aliasify(stageARaw(model), model) as { keyDrivers: Array<Record<string, unknown>>; mainRisk: string };
    expect(resolveStageAEvidenceAliases({ ...a, keyDrivers: [{ ...a.keyDrivers[0], summary: `${a.keyDrivers[0].summary} (see E2)` }, ...a.keyDrivers.slice(1)] }, map).ok).toBe(false);
    expect(resolveStageAEvidenceAliases({ ...a, mainRisk: `${a.mainRisk} E1` }, map).ok).toBe(false);
  });

  it("ignores letters that are not a supplied alias (E100, a stray E, 'Week E')", () => {
    const raw = stageBRaw(model);
    expect(resolveStageBEvidenceAliases({ ...raw, evidenceRefsUsed: ["E1"], analysisMarkdown: `${raw.analysisMarkdown} E100 and E are not references.` }, map).ok).toBe(true);
  });

  it("leaves factRefs exactly as the model wrote them", () => {
    const aliased = aliasify(stageARaw(model), model) as { keyDrivers: Array<{ factRefs: string[] }> };
    const resolved = resolveStageAEvidenceAliases(aliased, map);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect((resolved.raw as { keyDrivers: Array<{ factRefs: string[] }> }).keyDrivers.map((d) => d.factRefs)).toEqual(aliased.keyDrivers.map((d) => d.factRefs));
  });
});

describe.each(PROVIDERS)("the canonical validator is untouched (%s)", (model) => {
  it("still rejects an alias handed to it directly: only resolved canonical ids are valid", () => {
    const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
    const result = validateStageAV2({ ...raw, keyDrivers: [raw.keyDrivers[0], raw.keyDrivers[1], { ...raw.keyDrivers[2], evidenceRefs: ["E1"] }] }, stageACtx(model));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/cites evidenceId "E1" which does not exist in the supplied/);
  });

  it("still rejects an unknown canonical id after resolution has run (nothing is auto-accepted)", () => {
    const result = validateStageBV2({ ...stageBRaw(model), evidenceRefsUsed: [`${V2_EVIDENCE[model].injury.evidenceId}0`] }, stageBCtx(model));
    expect(result.ok).toBe(false);
  });

  it("still rejects a resolved id that is a betting opinion", () => {
    const result = validateStageBV2({ ...stageBRaw(model), evidenceRefsUsed: [V2_EVIDENCE[model].bettingOpinion.evidenceId] }, stageBCtx(model));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/outside betting opinion/);
  });
});

describe.each(PROVIDERS)("prompts (%s)", (model) => {
  const records = V2_EVIDENCE[model];
  const map = buildEvidenceAliasMap(records.all, model);
  const stageA = () => buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines(model, filterEvidenceRecordsForBlindStageA(records.all)), evidenceAliases: map });
  const stageB = () => buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: lines(model, filterEvidenceRecordsForStageBV2(records.all)), evidenceAliases: map });

  it.each([["Stage A", stageA], ["Stage B", stageB]])("%s lists the evidence as 'E<n> | ...' lines in alias order and never asks for an opaque hash", (_name, build) => {
    const prompt = build();
    const rows = prompt.split("\n").filter((l) => /^E\d+ \| /.test(l));
    expect(rows.map((l) => l.split(" | ")[0])).toEqual(["E1", "E2"]);
    expect(rows[0]).toContain("category=injury");
    expect(prompt).toContain("Cite evidence ONLY by its short reference (E1, E2)");
    for (const record of records.all) expect(prompt).not.toContain(record.evidenceId);
  });

  it("Stage B shows the locked Stage A's evidence through this call's aliases, not canonical ids", () => {
    const prompt = stageB();
    const lockedBlock = prompt.slice(prompt.indexOf("YOUR LOCKED FOOTBALL PROJECTION"), prompt.indexOf("=== FOOTBALL DATA"));
    expect(lockedBlock).toMatch(/\[refs: [^\]]*E1[^\]]*\]/);
    expect(lockedBlock).not.toContain(records.injury.evidenceId);
  });

  it("zero evidence: the prompt requires empty arrays and the resolver accepts [] but rejects any reference", () => {
    const empty = buildEvidenceAliasMap([], model);
    const prompt = buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: [], evidenceAliases: empty });
    expect(prompt).toMatch(/every evidenceRefs \/ evidenceRefsUsed array must be empty/);
    const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
    const factOnly = { ...raw, keyDrivers: raw.keyDrivers.map((d) => ({ ...d, evidenceRefs: [] })) };
    const ok = resolveStageAEvidenceAliases(factOnly, empty);
    expect(ok.ok).toBe(true);
    const bad = resolveStageAEvidenceAliases({ ...raw, keyDrivers: [{ ...raw.keyDrivers[0], evidenceRefs: ["E1"] }] }, empty);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons.join(" ")).toMatch(/no evidence was supplied, so this array must be empty/);
  });
});

describe("Grok and ChatGPT use equivalent alias mapping", () => {
  it("assign the same aliases to equivalent evidence, each resolving to its OWN canonical ids", () => {
    const grok = buildEvidenceAliasMap(V2_EVIDENCE.grok.all, "grok");
    const chatgpt = buildEvidenceAliasMap(V2_EVIDENCE.chatgpt.all, "chatgpt");
    expect(grok.entries.map((e) => e.alias)).toEqual(chatgpt.entries.map((e) => e.alias));
    expect(grok.aliasToId.get("E1")).toBe(V2_EVIDENCE.grok.injury.evidenceId);
    expect(chatgpt.aliasToId.get("E1")).toBe(V2_EVIDENCE.chatgpt.injury.evidenceId);
    // a grok alias can never resolve to a chatgpt id
    for (const id of chatgpt.aliasToId.values()) expect([...grok.aliasToId.values()]).not.toContain(id);
  });

  it("produce byte-identical Stage A and Stage B prompts apart from the model name", () => {
    const unify = (prompt: string) => prompt.replace(/"model": "(grok|chatgpt)"/, '"model": "<provider>"');
    const a = (model: EvidenceModel) => buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines(model, filterEvidenceRecordsForBlindStageA(V2_EVIDENCE[model].all)), evidenceAliases: buildEvidenceAliasMap(V2_EVIDENCE[model].all, model) });
    const b = (model: EvidenceModel) => buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: lines(model, filterEvidenceRecordsForStageBV2(V2_EVIDENCE[model].all)), evidenceAliases: buildEvidenceAliasMap(V2_EVIDENCE[model].all, model) });
    expect(unify(a("grok"))).toBe(unify(a("chatgpt")));
    expect(unify(b("grok"))).toBe(unify(b("chatgpt")));
  });
});

describe.each(PROVIDERS)("stored record carries canonical ids only (%s)", (model) => {
  it("alias output -> resolve -> validate -> record: canonical ids stored, no alias anywhere", () => {
    const map = buildEvidenceAliasMap(V2_EVIDENCE[model].all, model);
    const a = resolveStageAEvidenceAliases(aliasify(stageARaw(model), model), map);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const stageA = validateStageAV2(a.raw, stageACtx(model));
    expect(stageA.ok).toBe(true);
    const b = resolveStageBEvidenceAliases(aliasify(stageBRaw(model), model), map);
    expect(b.ok).toBe(true);
    if (!b.ok || !stageA.ok) return;
    const stageB = validateStageBV2(b.raw, { ...stageBCtx(model), lockedStageA: stageA.analysis });
    expect(stageB.ok).toBe(true);
    if (!stageB.ok) return;

    const record = buildHandicapV2Record({ stageA: stageA.analysis, stageB: stageB.analysis, market: V2_MARKET_MINUS_7, evidenceRecords: V2_EVIDENCE[model].all, researchMode: "live" });
    const injuryId = V2_EVIDENCE[model].injury.evidenceId;
    expect(record.evidenceRefsUsed).toEqual([injuryId]);
    expect(record.keyDrivers.flatMap((d) => d.evidenceRefs)).toEqual([injuryId]);
    expect(record.sources.find((s) => s.evidenceId)?.evidenceId).toBe(injuryId);
    const stored = JSON.stringify(record);
    expect(stored).not.toMatch(/"E[1-9]\d*"/);
    expect(record.analysisMarkdown).not.toMatch(/\bE[1-9]\d*\b/);
  });
});

describe("the PIT-CLE failure shape is reproduced and prevented", () => {
  // The twelve canonical ChatGPT ids of the failed production run, and the two strings the model produced instead.
  const PIT_IDS = [
    "chatgpt-2026_04_PIT_CLE-e286412bf9fa17f4", "chatgpt-2026_04_PIT_CLE-7fe4ee1c8ce26d67", "chatgpt-2026_04_PIT_CLE-4234322eb86da433", "chatgpt-2026_04_PIT_CLE-582eef67173dd5a0",
    "chatgpt-2026_04_PIT_CLE-36b860e53544ecc8", "chatgpt-2026_04_PIT_CLE-3ca55af859dd9d53", "chatgpt-2026_04_PIT_CLE-37151e0501dd1643", "chatgpt-2026_04_PIT_CLE-50b125118c4fff33",
    "chatgpt-2026_04_PIT_CLE-52238b958b1677b2", "chatgpt-2026_04_PIT_CLE-13e39e3fe21d5966", "chatgpt-2026_04_PIT_CLE-0e818006b457a364", "chatgpt-2026_04_PIT_CLE-3671f6cf6fa244e9",
  ];
  const FABRICATED = ["chatgpt-2026_04_PIT_CLE-0e818006b457a364e9" /* real id + the tail of another */, "chatgpt-2026_04_PIT_CLE-582eef67173dd5a" /* real id minus its last character */];
  const records = PIT_IDS.map((id) => variant(V2_EVIDENCE.chatgpt.injury, id));
  const map = buildEvidenceAliasMap(records, "chatgpt");

  it("the model now sees E1..E12 and not one of the twelve hashes", () => {
    expect(map.entries.map((e) => e.alias)).toEqual(Array.from({ length: 12 }, (_, i) => `E${i + 1}`));
    const prompt = buildStageAV2Prompt({ provider: "chatgpt", game: V2_GAME, packet: V2_PACKET, evidenceLines: lines("chatgpt", records), evidenceAliases: map });
    for (const id of PIT_IDS) expect(prompt).not.toContain(id);
    expect(prompt).toContain("(E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12)");
  });

  it("a driver citing E3 and E11 resolves to those exact records", () => {
    const raw = { ...stageARaw("chatgpt"), keyDrivers: [{ summary: "x", factRefs: [], evidenceRefs: ["E3", "E11"] }] };
    const resolved = resolveStageAEvidenceAliases(raw, map);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect((resolved.raw as { keyDrivers: Array<{ evidenceRefs: string[] }> }).keyDrivers[0].evidenceRefs).toEqual([PIT_IDS[2], PIT_IDS[10]]);
  });

  it.each(FABRICATED)("the production fabrication %s is still rejected, never accepted or repaired", (fabricated) => {
    const resolved = resolveStageAEvidenceAliases({ ...stageARaw("chatgpt"), keyDrivers: [{ summary: "x", factRefs: [], evidenceRefs: [fabricated] }] }, map);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reasons.join(" ")).toContain(`"${fabricated}" is not one of the supplied evidence references (E1..E12)`);
    // ...and the canonical validator would have rejected it independently
    const direct = validateStageAV2({ ...stageARaw("chatgpt"), keyDrivers: [{ summary: "x", factRefs: [], evidenceRefs: [fabricated] }] }, stageACtx("chatgpt", records));
    expect(direct.ok).toBe(false);
  });
});
