import { describe, expect, it } from "vitest";
import {
  assertBlindEvidenceHasNoMarketPricing,
  assertBlindPacketHasNoMarketLeakage,
  auditStageAPromptForMarketPricing,
  filterEvidenceRecordsForBlindStageA,
  isMarketPricingEvidence,
  sanitizeGameContextPacketForAiInput,
  sanitizeGameContextPacketForBlindStageA,
} from "./nfl-ai-context-sanitizer";
import { buildCitableEvidenceLines as buildGrokCitableEvidenceLines, buildStageAInitialPrompt as buildGrokStageAInitialPrompt } from "./nfl-grok-analysis-adapter";
import { buildCitableEvidenceLines as buildChatgptCitableEvidenceLines, buildStageAInitialPrompt as buildChatgptStageAInitialPrompt } from "./nfl-chatgpt-analysis-adapter";
import {
  FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY,
  FIXTURE_ANALYSIS_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_GAME,
} from "./__fixtures__/nfl-grok-analysis-fixtures";

describe("sanitizeGameContextPacketForAiInput", () => {
  it("strips jkbModels.projectedSpread/projectedTotal/modelMarketEdge -- JKB's own fair-line opinion is never handed to the model", () => {
    const safe = sanitizeGameContextPacketForAiInput(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(safe.jkbModels).not.toHaveProperty("projectedSpread");
    expect(safe.jkbModels).not.toHaveProperty("projectedTotal");
    expect(safe.jkbModels).not.toHaveProperty("modelMarketEdge");
  });

  it("keeps jkbModels.powerRating -- descriptive team-strength data, not a betting conclusion", () => {
    const safe = sanitizeGameContextPacketForAiInput(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(safe.jkbModels.powerRating).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.jkbModels.powerRating);
  });

  it("leaves every other section (market, teamMetrics, matchup, coaching, situational, weather) untouched", () => {
    const safe = sanitizeGameContextPacketForAiInput(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(safe.market).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.market);
    expect(safe.teamMetrics).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.teamMetrics);
  });

  it("never mutates the original packet", () => {
    const before = JSON.stringify(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    sanitizeGameContextPacketForAiInput(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(JSON.stringify(FIXTURE_ANALYSIS_CONTEXT_PACKET)).toBe(before);
  });
});

describe("sanitizeGameContextPacketForBlindStageA (WU4.6)", () => {
  it("removes the entire market section -- not nulled, physically absent", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(blind).not.toHaveProperty("market");
    expect(JSON.stringify(blind)).not.toContain(String(FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine));
  });

  it("still strips JKB's own fair-line opinion on top of removing market", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(blind.jkbModels).not.toHaveProperty("projectedSpread");
    expect(blind.jkbModels).not.toHaveProperty("projectedTotal");
    expect(blind.jkbModels).not.toHaveProperty("modelMarketEdge");
  });

  it("keeps every underlying football section (teamMetrics, matchup, coaching, situational, weather, schedule, identity)", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(blind.teamMetrics).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.teamMetrics);
    expect(blind.matchup).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.matchup);
    expect(blind.coaching).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.coaching);
    expect(blind.situational).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.situational);
    expect(blind.weather).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.weather);
    expect(blind.schedule).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.schedule);
    expect(blind.identity).toEqual(FIXTURE_ANALYSIS_CONTEXT_PACKET.identity);
  });

  it("never mutates the original packet", () => {
    const before = JSON.stringify(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(JSON.stringify(FIXTURE_ANALYSIS_CONTEXT_PACKET)).toBe(before);
  });
});

describe("isMarketPricingEvidence / filterEvidenceRecordsForBlindStageA (WU4.6)", () => {
  it("flags a record with category:'market' regardless of claim text", () => {
    expect(isMarketPricingEvidence({ category: "market", claim: "The Colts are a good team this year." })).toBe(true);
  });

  it("flags a record whose claim text carries sportsbook-pricing language even if miscategorized", () => {
    expect(isMarketPricingEvidence({ category: "news", claim: "The spread opened at IND -3.5 and has since moved to -2.5." })).toBe(true);
    expect(isMarketPricingEvidence({ category: "news", claim: "Sharp money reportedly pushed the total from 47.5 to 45." })).toBe(true);
  });

  it("does not flag an ordinary football claim", () => {
    expect(isMarketPricingEvidence({ category: "injury", claim: "The starting left tackle is listed as questionable with an ankle injury." })).toBe(false);
  });

  it("8. excludes every market-pricing record from the set handed to Stage A, keeping every other record", () => {
    const withMarketRecord = [
      ...FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
      { ...FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS[0], evidenceId: "grok-fixture-market-commentary", category: "market" as const, claim: "The line moved from IND -1 to IND -3 overnight." },
    ];
    const filtered = filterEvidenceRecordsForBlindStageA(withMarketRecord);
    expect(filtered.some((r) => r.evidenceId === "grok-fixture-market-commentary")).toBe(false);
    expect(filtered).toHaveLength(withMarketRecord.length - 1);
  });

  it("9. excludes an embedded sportsbook-pricing claim even when categorized as ordinary news, keeping every other record", () => {
    const withEmbeddedPricing = [
      ...FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
      { ...FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS[0], evidenceId: "grok-fixture-embedded-pricing", category: "news" as const, claim: "The spread opened at IND -3.5 and has since moved to IND -1.5." },
    ];
    const filtered = filterEvidenceRecordsForBlindStageA(withEmbeddedPricing);
    expect(filtered.some((r) => r.evidenceId === "grok-fixture-embedded-pricing")).toBe(false);
    expect(filtered).toHaveLength(withEmbeddedPricing.length - 1);
  });
});

/**
 * WU4.6.1 -- STAGE A MARKET-BLIND AUDIT DIAGNOSTICS.
 *
 * Root cause of the first live WU4.6 run's false FAIL on both providers:
 * the original audit rejected the prompt on ANY occurrence of the quoted
 * substring `"market"`, and Stage A's own output-schema instructions
 * legitimately say `there is no "market" section to reference; it was
 * never supplied to you` (BLIND_OUTPUT_DISCIPLINE in
 * nfl-grok-analysis-adapter.ts/nfl-chatgpt-analysis-adapter.ts) -- a
 * sentence that reinforces blindness, not a leak of it. Tests 5-7 below
 * lock in that this class of false positive can never return; tests 1-4
 * lock in that a REAL leak is still caught.
 */
describe("auditStageAPromptForMarketPricing (WU4.6.1)", () => {
  it("10. a WU4.6.1-sanitized blind packet has no structural leak (structural check baseline)", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    expect(assertBlindPacketHasNoMarketLeakage(blind)).toEqual([]);
    expect(assertBlindEvidenceHasNoMarketPricing(filterEvidenceRecordsForBlindStageA(FIXTURE_ANALYSIS_EVIDENCE_RECORDS))).toEqual([]);
  });

  it("1. fails on an actual team spread figure ('BAL -3.5')", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const prompt = "Some analysis text mentioning BAL -3.5 as a real market figure.";
    const result = auditStageAPromptForMarketPricing(prompt, blind, []);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.matched === "team-abbr-signed-spread")).toBe(true);
  });

  it("2. fails on an actual total figure in betting context ('total 47.5')", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const prompt = "Sharp money reportedly likes the total 47.5 tonight.";
    const result = auditStageAPromptForMarketPricing(prompt, blind, []);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.matched === "prose-total-figure")).toBe(true);
  });

  it("3. fails on currentHomeLine/currentAwayLine/currentTotal (Stage B-only fields leaking into Stage A)", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    for (const [name, field] of [
      ["stage-b-current-home-line-field", "marketAssessment.currentHomeLine: 3.5"],
      ["stage-b-current-away-line-field", "marketAssessment.currentAwayLine: -3.5"],
      ["stage-b-current-total-field", "marketAssessment.currentTotal: 47.5"],
    ] as const) {
      const result = auditStageAPromptForMarketPricing(`Some prompt text with ${field}`, blind, []);
      expect(result.pass).toBe(false);
      expect(result.findings.some((f) => f.matched === name)).toBe(true);
    }
  });

  it("4. fails on JKB's projected spread/total/model-market-edge fields leaking in", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    for (const [name, field] of [
      ["jkb-projected-spread-path", "jkbModels.projectedSpread: {\"homeLine\":-3.5}"],
      ["jkb-projected-total-path", "jkbModels.projectedTotal: {\"line\":47.5}"],
      ["jkb-model-market-edge", "modelMarketEdge: {\"spread\":1,\"total\":0.5}"],
    ] as const) {
      const result = auditStageAPromptForMarketPricing(`Some prompt text with ${field}`, blind, []);
      expect(result.pass).toBe(false);
      expect(result.findings.some((f) => f.matched === name)).toBe(true);
    }
  });

  it("5. does NOT fail on the generic phrase 'market-blind handicapper'", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const prompt = "You are a market-blind handicapper -- form your own independent view.";
    expect(auditStageAPromptForMarketPricing(prompt, blind, []).pass).toBe(true);
  });

  it("6. does NOT fail on the bare word 'sportsbook' appearing in an instruction, nor on quoted 'market' in an instructional sentence", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const prompt = "You are not given the sportsbook spread. There is no \"market\" section to reference; it was never supplied to you.";
    expect(auditStageAPromptForMarketPricing(prompt, blind, []).pass).toBe(true);
  });

  it("7. does NOT false-positive on ordinary football statistics (EPA/YPP/rate figures)", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const prompt = "The offense posted EPA 0.08 with yards/play 6.1 and a pass-block rate 69 this season.";
    expect(auditStageAPromptForMarketPricing(prompt, blind, []).pass).toBe(true);
  });

  it("8. structural check fails when the blind packet still carries a market key (defense-in-depth, independent of the string scan)", () => {
    const withLeak = { ...sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET), market: FIXTURE_ANALYSIS_CONTEXT_PACKET.market } as ReturnType<typeof sanitizeGameContextPacketForBlindStageA>;
    const result = auditStageAPromptForMarketPricing("harmless prompt text", withLeak, []);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.matched === "structural-packet")).toBe(true);
  });

  it("9. structural check fails when a market-pricing evidence record is (incorrectly) included in the blind evidence set", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const leakedRecord = { ...FIXTURE_ANALYSIS_EVIDENCE_RECORDS[0], evidenceId: "grok-fixture-leaked-market", category: "market" as const, claim: "The line moved from IND -1 to IND -3 overnight." };
    const result = auditStageAPromptForMarketPricing("harmless prompt text", blind, [leakedRecord]);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.matched === "structural-evidence")).toBe(true);
  });

  it("11. Grok's real Stage A prompt passes the audit on the BAL-IND fixture", () => {
    const blindEvidence = filterEvidenceRecordsForBlindStageA(FIXTURE_ANALYSIS_EVIDENCE_RECORDS);
    const evidenceLines = buildGrokCitableEvidenceLines(blindEvidence, FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY);
    const prompt = buildGrokStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines);
    const blindPacket = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const result = auditStageAPromptForMarketPricing(prompt, blindPacket, blindEvidence);
    expect(result.pass).toBe(true);
  });

  it("12. ChatGPT's real Stage A prompt passes the audit on the BAL-IND fixture", () => {
    const blindEvidence = filterEvidenceRecordsForBlindStageA(FIXTURE_ANALYSIS_EVIDENCE_RECORDS);
    const evidenceLines = buildChatgptCitableEvidenceLines(blindEvidence, FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY);
    const prompt = buildChatgptStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines);
    const blindPacket = sanitizeGameContextPacketForBlindStageA(FIXTURE_ANALYSIS_CONTEXT_PACKET);
    const result = auditStageAPromptForMarketPricing(prompt, blindPacket, blindEvidence);
    expect(result.pass).toBe(true);
  });
});
