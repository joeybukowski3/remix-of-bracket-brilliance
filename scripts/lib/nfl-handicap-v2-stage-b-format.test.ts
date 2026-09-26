/**
 * AI Picks v2 -- Stage B output-format rules that failed the first live
 * ChatGPT run: cover probabilities must be JSON numbers (not "59%"), and
 * evidence/fact ids must never appear inside analysisMarkdown.
 */
import { describe, expect, it } from "vitest";
import { buildCitableEvidenceLines as chatgptEvidenceLines } from "./nfl-chatgpt-analysis-adapter";
import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildCitableEvidenceLines as grokEvidenceLines } from "./nfl-grok-analysis-adapter";
import { buildStageAV2Prompt, buildStageBV2Prompt } from "./nfl-handicap-v2-prompts";
import { validateStageBV2, type StageBV2ValidationContext } from "./nfl-handicap-v2-validator";
import { filterEvidenceRecordsForStageBV2 } from "./nfl-ai-context-sanitizer";
import { V2_CONTEXT_HASH, V2_EVIDENCE, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_B_TIME, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];

function ctx(model: EvidenceModel): StageBV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

function run(model: EvidenceModel, patch: Record<string, unknown>): { ok: boolean; reasons: string } {
  const result = validateStageBV2({ ...stageBRaw(model), ...patch }, ctx(model));
  return { ok: result.ok, reasons: result.ok ? "" : result.reasons.join(" | ") };
}

function stageBPrompt(model: EvidenceModel): string {
  const authority = resolveEvidenceAuthority(V2_EVIDENCE[model].all);
  const lines = (model === "grok" ? grokEvidenceLines : chatgptEvidenceLines)(filterEvidenceRecordsForStageBV2(V2_EVIDENCE[model].all), authority);
  return buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines, market: V2_MARKET_MINUS_7, lockedStageA: trustedStageA(model) });
}

describe.each(PROVIDERS)("Stage B output format (%s)", (model) => {
  it('rejects string percentages such as "59%" (validator unchanged)', () => {
    const raw = stageBRaw(model);
    const bad = run(model, { coverProbabilityPreferred: `${raw.coverProbabilityPreferred}%`, coverProbabilityOther: `${raw.coverProbabilityOther}%` });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toMatch(/must be finite numbers/);
  });

  it("accepts plain numeric percentages", () => {
    expect(run(model, {}).ok).toBe(true);
  });

  it("rejects evidence ids pasted into analysisMarkdown", () => {
    const id = V2_EVIDENCE[model].injury.evidenceId;
    const md = (stageBRaw(model).analysisMarkdown as string).replace("\n\n", ` [${id}]\n\n`);
    const bad = run(model, { analysisMarkdown: md });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toMatch(/analysisMarkdown/);
  });

  it("still resolves valid evidenceRefsUsed and rejects unknown ones", () => {
    expect(run(model, { evidenceRefsUsed: [V2_EVIDENCE[model].injury.evidenceId] }).ok).toBe(true);
    expect(run(model, { evidenceRefsUsed: ["no-such-id"] }).reasons).toMatch(/does not exist/);
  });

  it("the Stage B prompt tells the model to emit numbers and keep ids out of prose", () => {
    const text = stageBPrompt(model);
    expect(text).toContain("a JSON NUMBER from 0 to 100 with no percent sign");
    expect(text).toContain('59, not "59%"');
    expect(text).toContain("Do not paste evidence IDs, fact IDs, JSON paths, schema field names, or internal identifiers");
    expect(text).toContain("evidenceRefsUsed");
  });
});

describe("both providers get identical format instructions", () => {
  const strip = (p: string) => p.replace(/chatgpt|grok/gi, "PROVIDER");
  const rules = (p: string) => p.split("\n").filter((l) => /JSON NUMBER|Do not paste evidence IDs|59, not/.test(l)).map(strip).join("\n");
  it("Stage B", () => {
    expect(rules(stageBPrompt("grok"))).toBe(rules(stageBPrompt("chatgpt")));
    expect(rules(stageBPrompt("grok")).length).toBeGreaterThan(200);
  });
  it("Stage A carries the no-ids-in-prose rule too", () => {
    const a = (m: EvidenceModel) => buildStageAV2Prompt({ provider: m, game: V2_GAME, packet: V2_PACKET, evidenceLines: [] });
    expect(a("grok")).toContain("Do not paste evidence IDs");
    expect(a("chatgpt")).toContain("Do not paste evidence IDs");
  });
});

describe.each(PROVIDERS)("Stage B price, injury-naming and voice guidance (%s)", (model) => {
  const text = stageBPrompt(model);

  it("invites price / break-even reasoning without forcing it or fixing the verdict", () => {
    expect(text).toContain("Price matters: you know the exact price on each side");
    expect(text).toContain("break-even cover rate is a little above 52%");
    expect(text).toContain("Do not force a price sentence into every write-up");
    expect(text).toContain("the verdict stays your judgment, not a formula");
  });

  it("encourages naming the few material players and forbids dumping every injury", () => {
    expect(text).toContain("name the few players who actually move the handicap");
    expect(text).toContain('vague phrases like "skill-position uncertainty"');
    expect(text).toContain("Do not list every injured player");
  });

  it("asks for direct conversational prose without a banned-phrase list", () => {
    expect(text).toContain("write like a person talking, in direct sentences");
    expect(text).toContain("What keeps me from calling it a bet is");
    expect(text).toContain("At -7.5, I'd back off.");
    expect(text).toContain("Avoid stiff, consultant-style phrasing");
  });

  it("leaves word range, paragraph order and the verdict rules alone", () => {
    expect(text).toContain("250-450 words");
    expect(text.indexOf("1. Your opinion on the EXACT")).toBeLessThan(text.indexOf("5. Your strongest hesitation"));
    expect(text).toContain("PASS is fully valid and expected when there is no clear edge");
  });

  it("a write-up that names players and reasons about price still validates (validator unchanged)", () => {
    const base = stageBRaw(model);
    const md = (base.analysisMarkdown as string) + " At -112 the break-even rate is a little above 52%, so this is an edge but not a big one, with Trey Pipkins III and Kayode Awosika out up front.";
    expect(run(model, { analysisMarkdown: md }).reasons).not.toMatch(/machine|snake|camel|does not match|word/i);
  });
});

it("Stage B price / injury / voice guidance is identical for both providers", () => {
  const pick = (p: string) => p.split("\n").filter((l) => /^\s*"?(Price matters|Voice:|4\. Injuries)/.test(l.trim()) || l.includes("Price matters") || l.includes("Voice: write")).map((l) => l.replace(/chatgpt|grok/gi, "P")).join("\n");
  expect(pick(stageBPrompt("grok"))).toBe(pick(stageBPrompt("chatgpt")));
  expect(pick(stageBPrompt("grok")).length).toBeGreaterThan(500);
});
