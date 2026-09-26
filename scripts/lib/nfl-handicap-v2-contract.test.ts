/**
 * AI Picks v2 WU3 -- contract tests for the v2 prompts and validators, run for
 * BOTH providers. Assertions target structure and consistency, not exact prose.
 */
import { describe, expect, it } from "vitest";
import { auditStageAPromptForMarketPricing, filterEvidenceRecordsForBlindStageA, filterEvidenceRecordsForStageBV2, sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { buildCitableEvidenceLines as chatgptEvidenceLines, runChatGptHandicapV2Stage } from "./nfl-chatgpt-analysis-adapter";
import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildCitableEvidenceLines as grokEvidenceLines, runGrokHandicapV2Stage } from "./nfl-grok-analysis-adapter";
import { buildStageAV2Prompt, buildStageBV2Prompt } from "./nfl-handicap-v2-prompts";
import { validateStageAV2, validateStageBV2, type StageAV2ValidationContext, type StageBV2ValidationContext } from "./nfl-handicap-v2-validator";
import { HANDICAP_V2_OUTPUT_TOKENS } from "./nfl-handicap-v2-types";
import {
  V2_CONTEXT_HASH,
  V2_EVIDENCE,
  V2_FACT_REFS,
  V2_GAME,
  V2_GAME_ID,
  V2_MARKET_MINUS_5_5,
  V2_MARKET_MINUS_7,
  V2_MARKET_MINUS_7_5,
  V2_PACKET,
  V2_STAGE_A_TIME,
  V2_STAGE_B_TIME,
  stageARaw,
  stageBBet,
  stageBPass,
  stageBRaw,
  trustedStageA,
} from "./__fixtures__/nfl-handicap-v2-fixtures";
import type { HandicapV2MarketContext } from "./nfl-handicap-v2-market";

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];

function stageACtx(model: EvidenceModel): StageAV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

function stageBCtx(model: EvidenceModel, market: HandicapV2MarketContext = V2_MARKET_MINUS_7): StageBV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: trustedStageA(model), market, contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

function evidenceLines(model: EvidenceModel, records = V2_EVIDENCE[model].all): string[] {
  const authority = resolveEvidenceAuthority(V2_EVIDENCE[model].all);
  return (model === "grok" ? grokEvidenceLines : chatgptEvidenceLines)(records, authority);
}

function reasonsA(model: EvidenceModel, patch: Record<string, unknown>): string {
  const result = validateStageAV2({ ...stageARaw(model), ...patch }, stageACtx(model));
  return result.ok ? "" : result.reasons.join(" | ");
}

function reasonsB(model: EvidenceModel, raw: Record<string, unknown>, market?: HandicapV2MarketContext): string {
  const result = validateStageBV2(raw, stageBCtx(model, market));
  return result.ok ? "" : result.reasons.join(" | ");
}

function withMarkdown(model: EvidenceModel, transform: (md: string) => string, base: Record<string, unknown> = stageBRaw(model)): Record<string, unknown> {
  return { ...base, analysisMarkdown: transform(base.analysisMarkdown as string) };
}

describe.each(PROVIDERS)("STAGE A v2 (%s)", (model) => {
  const stageAPrompt = buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: evidenceLines(model, filterEvidenceRecordsForBlindStageA(V2_EVIDENCE[model].all)) });

  it("1. stays market blind: passes the prompt audit and carries no market or JKB opinion", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(V2_PACKET);
    expect(auditStageAPromptForMarketPricing(stageAPrompt, blind, filterEvidenceRecordsForBlindStageA(V2_EVIDENCE[model].all))).toEqual({ pass: true, findings: [] });
    for (const token of ["draftkings", "sportsbook=", "spread(home)=", "jkbModels", "powerRating", "projectedSpread", "modelMarketEdge", "offenseVsDefense"]) expect(stageAPrompt).not.toContain(token);
    expect(stageAPrompt).not.toContain(V2_PACKET.market.sportsbook ?? "no-such-book");
    expect(stageAPrompt).not.toMatch(/"market"\s*:/);
  });

  it("2. drops the exhaustive category dump: no matchupFactors, failure-mode list, evidence-quality essay or area taxonomy", () => {
    // (raw trench metric names such as def_pass_rush_win_rate legitimately appear in the DATA block, so the area-taxonomy check looks for the taxonomy itself)
    for (const token of ["matchupFactors", "failureModes", "evidenceQualityAssessment", '"area"', "protection|pass_rush", "FACT vs INTERPRETATION", "footballThesis"]) expect(stageAPrompt).not.toContain(token);
    expect(stageAPrompt).toContain("Do NOT cover every unit or category");
  });

  it("carries the WU1 current-form facts, evidence rules and the sample-size instruction", () => {
    expect(stageAPrompt).toContain("record=0-2");
    expect(stageAPrompt).toContain("score=14-26");
    expect(stageAPrompt).toContain("Current-season samples may still be small.");
    expect(stageAPrompt).toContain(V2_EVIDENCE[model].injury.evidenceId);
    expect(stageAPrompt).not.toContain(V2_EVIDENCE[model].bettingOpinion.evidenceId);
    expect(stageAPrompt).toContain("every injury, availability, weather or reporting claim you make must come from a cited evidence record");
  });

  it("3. accepts a 3-driver handicap and assigns the trusted fields", () => {
    const result = validateStageAV2(stageARaw(model), stageACtx(model));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.keyDrivers).toHaveLength(3);
    expect(result.analysis.generatedAt).toBe(V2_STAGE_A_TIME);
    expect(result.analysis.fairSpread).toEqual({ team: "buf", line: -7.5 });
    expect(result.analysis.fairScore).toEqual({ home: 29, away: 21 });
    expect(result.analysis.contextHash).toBe(V2_CONTEXT_HASH);
  });

  it("3. requires 3-5 key drivers", () => {
    const drivers = stageARaw(model).keyDrivers as Record<string, unknown>[];
    expect(reasonsA(model, { keyDrivers: drivers.slice(0, 2) })).toMatch(/3-5 items/);
    expect(reasonsA(model, { keyDrivers: [...drivers, ...drivers] })).toMatch(/3-5 items/);
    expect(reasonsA(model, { keyDrivers: [...drivers, drivers[0]] })).toBe("");
    expect(reasonsA(model, { keyDrivers: [...drivers, drivers[0], drivers[1]] })).toBe("");
  });

  it("3. requires each driver to be tied to data or evidence, with refs that resolve", () => {
    const [first, ...rest] = stageARaw(model).keyDrivers as Record<string, unknown>[];
    expect(reasonsA(model, { keyDrivers: [{ ...first, factRefs: [], evidenceRefs: [] }, ...rest] })).toMatch(/at least one factRef or evidenceRef/);
    expect(reasonsA(model, { keyDrivers: [{ ...first, factRefs: ["teamForm.away.nope.nothing"] }, ...rest] })).toMatch(/does not resolve/);
    expect(reasonsA(model, { keyDrivers: [{ ...first, factRefs: ["jkbModels.powerRating"] }, ...rest] })).toMatch(/does not refer to a real Game Context Packet section/);
    expect(reasonsA(model, { keyDrivers: [{ ...first, evidenceRefs: ["no-such-id"] }, ...rest] })).toMatch(/does not exist/);
  });

  it("3. rejects evidence that is an outside betting opinion, and cross-provider citations", () => {
    const [first, ...rest] = stageARaw(model).keyDrivers as Record<string, unknown>[];
    expect(reasonsA(model, { keyDrivers: [{ ...first, evidenceRefs: [V2_EVIDENCE[model].bettingOpinion.evidenceId] }, ...rest] })).toMatch(/outside betting opinion/);
    const other: EvidenceModel = model === "grok" ? "chatgpt" : "grok";
    const both = { ...stageACtx(model), allEvidenceRecords: [...V2_EVIDENCE[model].all, ...V2_EVIDENCE[other].all] };
    const crossed = validateStageAV2({ ...stageARaw(model), keyDrivers: [{ ...first, evidenceRefs: [V2_EVIDENCE[other].injury.evidenceId] }, ...rest] }, both);
    expect(crossed.ok ? "" : crossed.reasons.join(" | ")).toMatch(/cross-model citation is forbidden/);
  });

  it("4. requires a real mainRisk", () => {
    expect(reasonsA(model, { mainRisk: "" })).toMatch(/mainRisk/);
    expect(reasonsA(model, { mainRisk: "Anything can happen in the NFL so who knows what might go wrong on the day for anybody." })).toMatch(/generic boilerplate/);
    expect(reasonsA(model, { mainRisk: "Injuries could matter." })).toMatch(/too thin/);
    expect(reasonsA(model, { mainRisk: "Los Angeles' quarterback could simply play better than the facts I was given suggest." })).toBe("");
    expect(reasonsA(model, { mainRisk: ((stageARaw(model).keyDrivers as { summary: string }[])[0]).summary })).toMatch(/duplicates a keyDriver/);
  });

  it("validates the fair spread, total and uncertainty", () => {
    expect(reasonsA(model, { fairSpread: { team: "BUF", line: 3 } })).toMatch(/must be <= 0/);
    expect(reasonsA(model, { fairSpread: { team: "KC", line: -3 } })).toMatch(/must be one of the game's teams/);
    expect(reasonsA(model, { projectedTotal: 5 })).toMatch(/projectedTotal/);
    expect(reasonsA(model, { uncertainty: "SORTA" })).toMatch(/uncertainty/);
    expect(reasonsA(model, { fairSpread: { team: "buf", line: -7.5 } })).toBe("");
  });

  it("rejects a wrong model, game or schema version", () => {
    expect(reasonsA(model, { model: model === "grok" ? "chatgpt" : "grok" })).toMatch(/model must be/);
    expect(reasonsA(model, { gameId: "2026_03_XXX_YYY" })).toMatch(/gameId must be/);
    expect(reasonsA(model, { schemaVersion: "nfl-grok-analysis-v1" })).toMatch(/schemaVersion/);
  });
});

describe.each(PROVIDERS)("STAGE B v2 prompt (%s)", (model) => {
  const stageBPrompt = buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: evidenceLines(model, filterEvidenceRecordsForStageBV2(V2_EVIDENCE[model].all)) });

  it("5. receives the WU1 current-form facts for both teams", () => {
    expect(stageBPrompt).toContain("away (LAC):");
    expect(stageBPrompt).toContain("home (BUF):");
    expect(stageBPrompt).toContain("record=0-2");
    expect(stageBPrompt).toContain("record=2-0");
    expect(stageBPrompt).toContain("Week 2 vs LV, home, result=L, score=14-26");
    expect(stageBPrompt).toContain('"epaPerPlay":-0.3013');
  });

  it("6. receives the locked Stage A projection, drivers and main risk -- not just a thesis", () => {
    const stageA = trustedStageA(model);
    expect(stageBPrompt).toContain("fair spread: BUF -7.5");
    expect(stageBPrompt).toContain("projected total: 50");
    expect(stageBPrompt).toContain("fair-ish score: Chargers 21, Bills 29");
    for (const driver of stageA.keyDrivers) expect(stageBPrompt).toContain(driver.summary);
    expect(stageBPrompt).toContain(stageA.mainRisk);
    expect(stageBPrompt).toContain("uncertainty: MEDIUM");
    expect(stageBPrompt).not.toContain("footballThesis");
  });

  it("7. receives the exact market: labeled sides, prices, total, book range and key-number metadata", () => {
    for (const text of ["HOME BUF (Bills) -7 (price -115)", "AWAY LAC (Chargers) +7 (price -105)", '"Bills -7" and "Chargers +7"', "total: 50.5", "Bills -7.5 at 5 books", "sits exactly on the key number 7", "MATERIAL"]) expect(stageBPrompt).toContain(text);
  });

  it("carries the validated evidence and excludes outside betting opinion", () => {
    expect(stageBPrompt).toContain(V2_EVIDENCE[model].injury.evidenceId);
    expect(stageBPrompt).toContain(V2_EVIDENCE[model].weather.evidenceId);
    expect(stageBPrompt).not.toContain(V2_EVIDENCE[model].bettingOpinion.evidenceId);
  });

  it("asks for the target format: length, order, final read, closing, counterargument, and allows PASS", () => {
    for (const text of ["250-450 words", "No headings", "no bullet or numbered lists", "Your opinion on the EXACT displayed number", "Your strongest hesitation", "cover probability**", "Fair-ish score: Chargers 21, Bills 29", "Projected total: ~50", "ONE closing paragraph", "PASS is fully valid"]) expect(stageBPrompt).toContain(text);
    expect(stageBPrompt).not.toMatch(/Key Takeaways"?\s*(section|heading)/);
  });

  it("does not reintroduce JKB conclusions and does not ask the model for market numbers or a fair spread", () => {
    for (const token of ["jkbModels", "powerRating", "projectedSpread", "modelMarketEdge", "offenseVsDefense"]) expect(stageBPrompt).not.toContain(token);
    expect(stageBPrompt).toContain("Do NOT include a fair spread, projected total, market numbers, fair score or sources");
  });
});

describe.each(PROVIDERS)("STAGE B v2 validation (%s)", (model) => {
  it("8-10. accepts BET, LEAN and PASS as first-class outcomes", () => {
    for (const [verdict, raw] of [["BET", stageBBet(model)], ["LEAN", stageBRaw(model)], ["PASS", stageBPass(model)]] as const) {
      const result = validateStageBV2(raw, stageBCtx(model));
      expect(result.ok, `${verdict}: ${result.ok ? "" : result.reasons.join(" | ")}`).toBe(true);
      if (result.ok) expect(result.analysis.verdict).toBe(verdict);
    }
  });

  it("attaches the mechanical fields and never lets the provider set the market", () => {
    const result = validateStageBV2({ ...stageBRaw(model), marketSpread: { homeLine: -1 }, sources: [{ label: "x", url: "https://evil.test" }] }, stageBCtx(model));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis).toMatchObject({ preferredSide: "home", preferredLine: -7, otherLine: 7, generatedAt: V2_STAGE_B_TIME, impliedPushProbability: 4 });
    expect(JSON.stringify(result.analysis)).not.toContain("evil.test");
    expect(result.analysis).not.toHaveProperty("marketSpread");
    expect(result.analysis).not.toHaveProperty("sources");
  });

  it("11. requires numerically sensible, internally consistent cover probabilities", () => {
    const patch = (p: number, o: number) => ({ ...stageBRaw(model, { probabilityPreferred: p, probabilityOther: o }) });
    expect(reasonsB(model, patch(0.56, 0.4))).toMatch(/percents/);
    expect(reasonsB(model, patch(97, 2))).toMatch(/credible/);
    expect(reasonsB(model, patch(70, 60))).toMatch(/more than 100/);
    expect(reasonsB(model, patch(40, 56))).toMatch(/lower than coverProbabilityOther/);
    expect(reasonsB(model, patch(56, 20))).toMatch(/push chance of at most/);
    expect(reasonsB(model, { ...stageBRaw(model), coverProbabilityPreferred: "56" })).toMatch(/finite numbers/);
    expect(reasonsB(model, patch(56, 44))).toBe("");
  });

  it("11. on a half-point line the two probabilities must sum to 100", () => {
    const halfPointRaw = (p: number, o: number) => ({ ...stageBRaw(model, { probabilityPreferred: p, probabilityOther: o, preferredLabel: "Bills -7.5", otherLabel: "Chargers +7.5", keyNumberSensitivity: "Bills -7.5 is already past the key number 7, so it needs a win by eight or more." }), });
    const fixHalf = (raw: Record<string, unknown>) => withMarkdown(model, (md) => md.replace(/-7\b(?!\.)/g, "-7.5").replace(/\+7\b(?!\.)/g, "+7.5"), raw);
    expect(reasonsB(model, fixHalf(halfPointRaw(56, 40)), V2_MARKET_MINUS_7_5)).toMatch(/must sum to 100/);
    expect(reasonsB(model, fixHalf(halfPointRaw(56, 44)), V2_MARKET_MINUS_7_5)).toBe("");
  });

  it("11. rejects verdicts that contradict the probabilities", () => {
    expect(reasonsB(model, stageBRaw(model, { verdict: "LEAN", probabilityPreferred: 48, probabilityOther: 48 }))).toMatch(/strictly more likely/);
    expect(reasonsB(model, stageBRaw(model, { verdict: "PASS", probabilityPreferred: 72, probabilityOther: 24, closing: "So I would pass at the exact line, and Bills -6.5 would interest me." }))).toMatch(/contradicts/);
  });

  it("11. rejects a preferred side that contradicts the model's own locked fair spread", () => {
    // Locked fair spread: BUF -7.5. On a market of BUF -5.5, LAC +5.5 is 2 points worse than the fair line, so a 60% LAC cover contradicts Stage 1.
    const chargers = { ...stageBRaw(model, { probabilityPreferred: 60, probabilityOther: 40, preferredLabel: "Chargers +5.5", otherLabel: "Bills -5.5" }), preferredTeam: "LAC", keyNumberSensitivity: null };
    const md = withMarkdown(model, (t) => t.replace(/Bills -7/g, "Bills -5.5").replace(/Chargers \+7/g, "Chargers +5.5"), chargers);
    expect(reasonsB(model, md, V2_MARKET_MINUS_5_5)).toMatch(/contradicts your own Stage 1 projection/);
  });

  it("11. only WARNS when a probability is far from a normal-model reference -- the model's estimate is kept, never replaced", () => {
    const result = validateStageBV2(stageBRaw(model, { probabilityPreferred: 80, probabilityOther: 16 }), stageBCtx(model));
    expect(result.ok, result.ok ? "" : result.reasons.join(" | ")).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.coverProbabilityPreferred).toBe(80);
    expect(result.analysis.coverProbabilityOther).toBe(16);
    expect(result.analysis.warnings.join(" | ")).toMatch(/normal-model reference/);
  });

  it("12. the preferred side and line must agree with the final read and the prose", () => {
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("**Bills -7: ~56%", "**Bills -7.5: ~56%")))).toMatch(/first final-read line must name the preferred side/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("**Bills -7: ~56%", "**Chargers +7: ~56%")))).toMatch(/first final-read line must name the preferred side/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("~56% cover", "~62% cover")))).toMatch(/does not match coverProbabilityPreferred/);
    expect(reasonsB(model, { ...stageBRaw(model), preferredTeam: "LAC" })).toMatch(/first final-read line must name the preferred side|state the preferred side/);
    expect(reasonsB(model, { ...stageBRaw(model), preferredTeam: "SEA" })).toMatch(/preferredTeam/);
  });

  it("12. detects a team paired with the other team's line (home/away inversion)", () => {
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("**Chargers +7**", "**Chargers -7**").replace("more than **Chargers -7**", "more than **Bills +7**")))).toMatch(/inverted/);
  });

  it("12. the closing must match the verdict", () => {
    expect(reasonsB(model, stageBRaw(model, { verdict: "PASS", probabilityPreferred: 52, probabilityOther: 44 }))).toMatch(/does not say to pass/);
    expect(reasonsB(model, stageBRaw(model, { closing: "Anyway, that is my read on the game for this week and nothing more to add here." }))).toMatch(/does not name the preferred side/);
  });

  it("13. the fair-ish score and projected total must reconcile to the locked projection", () => {
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("Chargers 21, Bills 29", "Chargers 17, Bills 31")))).toMatch(/derived score/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("~50**", "~57**")))).toMatch(/projected total line/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace(/\*\*Fair-ish score.*\*\*\n/, "")))).toMatch(/fair-ish score/);
  });

  it("14. enforces the length target with tolerance", () => {
    const paragraphs = (stageBRaw(model).analysisMarkdown as string).split("\n\n");
    const short = { ...stageBRaw(model), analysisMarkdown: [paragraphs[0], paragraphs[4], ...paragraphs.slice(5)].join("\n\n") };
    expect(reasonsB(model, short)).toMatch(/words|analytical paragraphs/);
    const padding = " The Chargers have to find a way to finish drives against a defense that does not give much away in the red zone.".repeat(40);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("**Bills -7: ~56%", `${padding}\n\n**Bills -7: ~56%`)))).toMatch(/words/);
    const ok = validateStageBV2(stageBRaw(model), stageBCtx(model));
    expect(ok.ok && ok.analysis.wordCount).toBeGreaterThanOrEqual(210);
    expect(ok.ok && ok.analysis.wordCount).toBeLessThanOrEqual(520);
  });

  it("14. warns (does not reject) when the length is inside the hard limits but outside the target", () => {
    const result = validateStageBV2(stageBRaw(model), stageBCtx(model));
    if (!result.ok) throw new Error(result.reasons.join("; "));
    const inTarget = result.analysis.wordCount >= 250 && result.analysis.wordCount <= 450;
    expect(result.analysis.warnings.some((w) => /outside the \d+-\d+ target/.test(w))).toBe(!inTarget);
  });

  it("15. rejects the old article headings, lists and stat-dump scaffolding", () => {
    expect(reasonsB(model, withMarkdown(model, (md) => `## Key Takeaways\n\n${md}`))).toMatch(/heading|scaffolding/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("The current-season evidence", "Matchup Keys: the current-season evidence")))).toMatch(/scaffolding/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("I like **Bills -7**", "- I like **Bills -7**")))).toMatch(/list/);
    expect(reasonsB(model, withMarkdown(model, (md) => `The Read\n\n${md}`))).toMatch(/scaffolding/);
  });

  it("15. rejects machine language and JKB references inside the prose", () => {
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("scored 14 points", "scored 14 points (off_epaPerPlay)")))).toMatch(/machine\/internal language/);
    expect(reasonsB(model, withMarkdown(model, (md) => md.replace("I would not call it", "the JKB model says I would not call it")))).toMatch(/JKB/);
  });

  it("16. requires a specific counterargument that is reflected in the write-up", () => {
    expect(reasonsB(model, { ...stageBRaw(model), counterargument: "Anything can happen in the NFL so anybody could win on any given Sunday for sure." })).toMatch(/generic boilerplate/);
    expect(reasonsB(model, { ...stageBRaw(model), counterargument: "" })).toMatch(/counterargument/);
    expect(reasonsB(model, { ...stageBRaw(model), counterargument: "Herbert scrambling repeatedly outside the pocket extends drives unpredictably against soft coverage." })).toMatch(/not reflected/);
    expect(reasonsB(model, stageBRaw(model))).toBe("");
  });

  it("17. requires keyNumberSensitivity when key numbers are material and allows null when they are not", () => {
    expect(reasonsB(model, stageBRaw(model, { keyNumberSensitivity: null }))).toMatch(/keyNumberSensitivity/);
    expect(reasonsB(model, stageBRaw(model, { keyNumberSensitivity: "Matters." }))).toMatch(/too thin/);
    const notMaterial = (raw: Record<string, unknown>) => withMarkdown(model, (md) => md.replace(/Bills -7\b(?!\.)/g, "Bills -5.5").replace(/Chargers \+7\b/g, "Chargers +5.5").replace("exactly seven", "exactly six"), { ...raw, keyNumberSensitivity: null });
    const raw = notMaterial(stageBRaw(model, { probabilityPreferred: 55, probabilityOther: 45, preferredLabel: "Bills -5.5", otherLabel: "Chargers +5.5" }));
    expect(reasonsB(model, raw, V2_MARKET_MINUS_5_5)).toBe("");
  });

  it("18. fact and evidence refs must resolve; injury claims must cite evidence", () => {
    expect(reasonsB(model, { ...stageBRaw(model), factRefsUsed: [] })).toMatch(/factRefsUsed must list/);
    expect(reasonsB(model, { ...stageBRaw(model), factRefsUsed: ["teamForm.away.seasonToDate.nope"] })).toMatch(/does not resolve/);
    expect(reasonsB(model, { ...stageBRaw(model), factRefsUsed: ["jkbModels.powerRating"] })).toMatch(/does not refer to a real/);
    expect(reasonsB(model, { ...stageBRaw(model), evidenceRefsUsed: ["nope"] })).toMatch(/does not exist/);
    expect(reasonsB(model, { ...stageBRaw(model), evidenceRefsUsed: [] })).toMatch(/traceable to cited evidence/);
    expect(reasonsB(model, { ...stageBRaw(model), evidenceRefsUsed: [V2_EVIDENCE[model].bettingOpinion.evidenceId] })).toMatch(/outside betting opinion/);
    expect(reasonsB(model, { ...stageBRaw(model), factRefsUsed: [V2_FACT_REFS.lacPoints, V2_FACT_REFS.bufEpa] })).toBe("");
  });
});

describe("20. Grok and ChatGPT implement the same v2 contract", () => {
  const unify = (prompt: string) => prompt.replace(/"model": "(grok|chatgpt)"/, '"model": "<provider>"');

  it("build byte-identical Stage A and Stage B prompts apart from the model name", () => {
    const lines = evidenceLines("grok", filterEvidenceRecordsForBlindStageA(V2_EVIDENCE.grok.all)).map((l) => l.replace(/\[[^\]]+\]/, "[id]"));
    const a = (provider: EvidenceModel) => buildStageAV2Prompt({ provider, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines });
    const b = (provider: EvidenceModel) => buildStageBV2Prompt({ provider, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA("grok"), market: V2_MARKET_MINUS_7, evidenceLines: lines });
    expect(unify(a("grok"))).toBe(unify(a("chatgpt")));
    expect(unify(b("grok"))).toBe(unify(b("chatgpt")));
  });

  it("accept and reject the same structural payloads", () => {
    const outcome = (model: EvidenceModel, raw: (m: EvidenceModel) => Record<string, unknown>) => {
      const a = validateStageAV2(raw(model), stageACtx(model));
      return a.ok;
    };
    expect(outcome("grok", stageARaw)).toBe(outcome("chatgpt", stageARaw));
    for (const build of [stageBRaw, stageBBet, stageBPass]) {
      expect(validateStageBV2(build("grok"), stageBCtx("grok")).ok).toBe(true);
      expect(validateStageBV2(build("chatgpt"), stageBCtx("chatgpt")).ok).toBe(true);
    }
    const bad = (m: EvidenceModel) => ({ ...stageBRaw(m), coverProbabilityPreferred: 30 });
    expect(validateStageBV2(bad("grok"), stageBCtx("grok")).ok).toBe(false);
    expect(validateStageBV2(bad("chatgpt"), stageBCtx("chatgpt")).ok).toBe(false);
  });

  it("send both stages through the same budgets and no tools", async () => {
    for (const [name, run] of [["grok", runGrokHandicapV2Stage], ["chatgpt", runChatGptHandicapV2Stage]] as const) {
      for (const stage of ["A", "B"] as const) {
        let body: Record<string, unknown> = {};
        const fetchImpl = (async (_url: string, init: { body: string }) => {
          body = JSON.parse(init.body);
          return { ok: false, status: 500, text: async () => "boom" };
        }) as unknown as typeof fetch;
        const result = await run({ stage, prompt: "PROMPT", apiKey: "test-key", fetchImpl });
        expect(result.ok, name).toBe(false);
        expect(body.max_output_tokens, `${name} ${stage}`).toBe(HANDICAP_V2_OUTPUT_TOKENS[stage].first);
        expect(body).not.toHaveProperty("tools");
      }
    }
  });
});
