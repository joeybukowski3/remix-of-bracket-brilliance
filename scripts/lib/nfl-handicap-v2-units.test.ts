import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { filterEvidenceRecordsForBlindStageA, filterEvidenceRecordsForStageBV2, isBettingOpinionEvidence } from "./nfl-ai-context-sanitizer";
import { V2_EVIDENCE, V2_GAME, V2_MARKET_MINUS_5_5, V2_MARKET_MINUS_7, V2_MARKET_MINUS_7_5, stageARaw, stageBRaw, trustedStageA, V2_CONTEXT_HASH, V2_STAGE_B_TIME } from "./__fixtures__/nfl-handicap-v2-fixtures";
import { buildBookRange, buildKeyNumberContext, formatSignedLine, keyNumbersCrossed, renderHandicapV2MarketLines, teamNickname } from "./nfl-handicap-v2-market";
import { buildHandicapV2Record, buildHandicapV2Sources, readLatestHandicapV2Record, sourceTypeForCategory, writeHandicapV2Record } from "./nfl-handicap-v2-record";
import { countWords, deriveFairScore, findFormatViolations, findSpecificityViolations, mentionsAny, mentionsSignedLine, nameVariants, overlapRatio, parseAnalysisMarkdown } from "./nfl-handicap-v2-text";
import type { StageBV2 } from "./nfl-handicap-v2-types";

describe("market formatting and key-number metadata (arithmetic, not opinion)", () => {
  it("formats signed lines", () => {
    expect([formatSignedLine(-7), formatSignedLine(7), formatSignedLine(-7.5), formatSignedLine(2.5), formatSignedLine(0)]).toEqual(["-7", "+7", "-7.5", "+2.5", "PK"]);
    expect(teamNickname("Los Angeles Chargers")).toBe("Chargers");
  });

  it("finds the key numbers whose result changes between two lines", () => {
    expect(keyNumbersCrossed(7, 7.5)).toEqual([7]);
    expect(keyNumbersCrossed(7, 6.5)).toEqual([7]);
    expect(keyNumbersCrossed(3, 3.5)).toEqual([3]);
    expect(keyNumbersCrossed(2.5, 3)).toEqual([3]);
    expect(keyNumbersCrossed(7.5, 8)).toEqual([]);
    expect(keyNumbersCrossed(5.5, 6)).toEqual([]);
  });

  it("marks a line on 7 as material, with both half-point moves crossing 7", () => {
    const k = buildKeyNumberContext(7, null);
    expect(k).toMatchObject({ favoriteLine: 7, onKeyNumber: 7, nearKeyNumber: 7, material: true });
    expect(k.halfPointBetterForFavorite.crossesKeyNumbers).toEqual([7]);
    expect(k.halfPointWorseForFavorite.crossesKeyNumbers).toEqual([7]);
  });

  it("marks 6.5 / 7.5 / 3.5 as near a key number and 5.5 as not material", () => {
    expect(buildKeyNumberContext(7.5, null).material).toBe(true);
    expect(buildKeyNumberContext(6.5, null).material).toBe(true);
    expect(buildKeyNumberContext(2.5, null).material).toBe(true);
    expect(buildKeyNumberContext(5.5, null)).toMatchObject({ nearKeyNumber: null, material: false });
  });

  it("marks a book range that straddles a key number as material even when the line is not near one", () => {
    const range = buildBookRange({ books: [-5.5, -6, -6.5, -7.5].map((h) => ({ spread: { homeLine: h } })) as never });
    expect(buildKeyNumberContext(6, range).bookRangeCrossesKeyNumber).toBe(true);
  });

  it("groups the books by line and summarizes the totals", () => {
    const range = V2_MARKET_MINUS_7.bookRange!;
    expect(range.bookCount).toBe(9);
    expect(range.spreadByHomeLine).toEqual([{ homeLine: -7.5, bookCount: 5 }, { homeLine: -7, bookCount: 4 }]);
    expect([range.totalMin, range.totalMax]).toEqual([50, 50.5]);
  });

  it("labels both sides by team so home/away cannot be inverted", () => {
    expect(V2_MARKET_MINUS_7.sideLabels).toEqual({ home: "Bills -7", away: "Chargers +7" });
    expect(V2_MARKET_MINUS_7.favorite).toEqual({ side: "home", team: "buf", line: 7 });
    const lines = renderHandicapV2MarketLines(V2_MARKET_MINUS_7).join("\n");
    expect(lines).toContain("HOME BUF (Bills) -7");
    expect(lines).toContain("AWAY LAC (Chargers) +7");
    expect(lines).toContain("Bills -7.5 at 5 books");
    expect(lines).toContain("MATERIAL");
    expect(lines).toContain("laying 7 points");
    expect(renderHandicapV2MarketLines(V2_MARKET_MINUS_5_5).join("\n")).toContain("NOT material");
  });

  it("returns no market context when there is no usable spread", () => {
    expect(V2_MARKET_MINUS_7_5.spread.homeLine).toBe(-7.5);
  });
});

describe("text helpers", () => {
  it("derives the fair score from the model's own spread and total", () => {
    expect(deriveFairScore({ team: "buf", line: -7.5 }, 50, "buf")).toEqual({ home: 29, away: 21 });
    expect(deriveFairScore({ team: "lac", line: -3 }, 47.5, "buf")).toEqual({ home: 22, away: 25 });
    expect(deriveFairScore({ team: "buf", line: 0 }, 44, "buf")).toEqual({ home: 22, away: 22 });
  });

  it("counts words ignoring markdown symbols", () => {
    expect(countWords("**Bills -7: ~56% cover probability**")).toBe(5);
  });

  it("matches signed lines exactly, tolerating .0 and rejecting longer numbers", () => {
    expect(mentionsSignedLine("I like Bills -7 here", -7)).toBe(true);
    expect(mentionsSignedLine("I like Bills -7.0 here", -7)).toBe(true);
    expect(mentionsSignedLine("at Chargers +7.", 7)).toBe(true);
    expect(mentionsSignedLine("Bills -7.5", -7)).toBe(false);
    expect(mentionsSignedLine("Bills -7.5", -7.5)).toBe(true);
    expect(mentionsSignedLine("Bills -17", -7)).toBe(false);
    expect(mentionsSignedLine("Bills +7", -7)).toBe(false);
    expect(mentionsSignedLine("a pick'em", 0)).toBe(true);
  });

  it("names teams by full name, nickname, abbreviation and (unless shared) city", () => {
    expect(nameVariants("Buffalo Bills", "buf", "Los Angeles Chargers")).toEqual(["Buffalo Bills", "Bills", "BUF", "Buffalo"]);
    expect(nameVariants("Los Angeles Chargers", "lac", "Los Angeles Rams")).toEqual(["Los Angeles Chargers", "Chargers", "LAC"]);
    expect(mentionsAny("I like the Bills here", ["Bills"])).toBe(true);
    expect(mentionsAny("Billsville", ["Bills"])).toBe(false);
  });

  it("parses the write-up into analytical paragraphs, a final read and a closing", () => {
    const parsed = parseAnalysisMarkdown(stageBRaw("grok").analysisMarkdown as string);
    expect(parsed.hasFinalRead).toBe(true);
    expect(parsed.analytical).toHaveLength(5);
    expect(parsed.finalReadLines).toHaveLength(4);
    expect(parsed.closing).toHaveLength(1);
    expect(parsed.wordCount).toBeGreaterThan(200);
  });

  it("flags retired scaffolding, headings, lists and JKB references", () => {
    expect(findFormatViolations("## Key Takeaways\n\ntext")).not.toEqual([]);
    expect(findFormatViolations("text\n\n- a bullet")).not.toEqual([]);
    expect(findFormatViolations("Matchup Keys\n\ntext")).not.toEqual([]);
    expect(findFormatViolations("The JKB model likes Buffalo.")).not.toEqual([]);
    expect(findFormatViolations("**Bills -7: ~56% cover probability**\n\nA normal paragraph.")).toEqual([]);
  });

  it("rejects generic or thin risk statements and accepts a specific one", () => {
    const options = { label: "risk", minWords: 12, maxWords: 80 };
    expect(findSpecificityViolations("Anything can happen in the NFL, so who knows what will happen out there on the day.", options)).not.toEqual([]);
    expect(findSpecificityViolations("Injuries could matter.", options)).not.toEqual([]);
    expect(findSpecificityViolations("Buffalo's defense has allowed 31 points per game, so if Los Angeles stops turning the ball over it could keep this close.", options)).toEqual([]);
  });

  it("measures how much of a statement is reflected in the corpus", () => {
    expect(overlapRatio("Buffalo defense allowed thirty-one points", "Buffalo defense allowed thirty-one points per game")).toBe(1);
    expect(overlapRatio("Herbert scrambles unpredictably", "Nothing relevant here at all")).toBe(0);
  });
});

describe("evidence: facts in, outside betting opinion out", () => {
  const { injury, weather, bettingOpinion } = V2_EVIDENCE.grok;

  it("classifies pick/prediction language as betting opinion and injuries/weather as facts", () => {
    expect(isBettingOpinionEvidence(bettingOpinion)).toBe(true);
    expect(isBettingOpinionEvidence(injury)).toBe(false);
    expect(isBettingOpinionEvidence(weather)).toBe(false);
    for (const claim of ["Sharp money is on Buffalo.", "The best bet of the week is the Bills.", "Buffalo is 5-1 ATS at home.", "ESPN FPI gives Buffalo a 78% win probability."]) {
      expect(isBettingOpinionEvidence({ claim })).toBe(true);
    }
    expect(isBettingOpinionEvidence({ claim: "Coach said the offense will lean on the run game." })).toBe(false);
  });

  it("removes betting opinion from BOTH the Stage A and Stage B evidence sets and keeps the facts", () => {
    for (const filtered of [filterEvidenceRecordsForBlindStageA(V2_EVIDENCE.grok.all), filterEvidenceRecordsForStageBV2(V2_EVIDENCE.grok.all)]) {
      expect(filtered.map((r) => r.evidenceId)).toEqual([injury.evidenceId, weather.evidenceId]);
    }
  });
});

describe("source attribution is mechanical", () => {
  it("maps categories to source types", () => {
    expect([sourceTypeForCategory("injury"), sourceTypeForCategory("weather"), sourceTypeForCategory("market"), sourceTypeForCategory("news"), sourceTypeForCategory("other")]).toEqual(["injury", "weather", "market", "news", "other"]);
  });

  it("builds sources only from the cited evidence records plus JKB-internal entries with no url", () => {
    const sources = buildHandicapV2Sources({ evidenceRefsUsed: [V2_EVIDENCE.grok.injury.evidenceId, V2_EVIDENCE.grok.injury.evidenceId, "does-not-exist"], factRefsUsed: ["teamForm.away.seasonToDate.points"], evidenceRecords: V2_EVIDENCE.grok.all, market: V2_MARKET_MINUS_7 });
    expect(sources.filter((s) => s.evidenceId)).toEqual([{ label: "Chargers Official Injury Report (fixture)", url: "https://example-fixture.test/chargers/injury-report/2026-w3", type: "injury", evidenceId: V2_EVIDENCE.grok.injury.evidenceId }]);
    expect(sources.filter((s) => !s.evidenceId).every((s) => s.url === null)).toBe(true);
    expect(sources.map((s) => s.type)).toEqual(["injury", "market", "other"]);
  });
});

describe("the v2 record and its write-once store", () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  function record() {
    const stageB = {
      schemaVersion: "nfl-handicap-v2",
      model: "grok",
      gameId: V2_GAME.gameId,
      contextHash: V2_CONTEXT_HASH,
      generatedAt: V2_STAGE_B_TIME,
      verdict: "LEAN",
      preferredTeam: "buf",
      preferredSide: "home",
      preferredLine: -7,
      otherLine: 7,
      coverProbabilityPreferred: 56,
      coverProbabilityOther: 40,
      impliedPushProbability: 4,
      confidence: "MEDIUM",
      keyNumberSensitivity: "sits on seven",
      counterargument: "c",
      analysisMarkdown: "md",
      wordCount: 300,
      factRefsUsed: ["teamForm.away.seasonToDate.points"],
      evidenceRefsUsed: [V2_EVIDENCE.grok.injury.evidenceId],
      warnings: [],
    } as unknown as StageBV2;
    return buildHandicapV2Record({ stageA: trustedStageA("grok"), stageB, market: V2_MARKET_MINUS_7, evidenceRecords: V2_EVIDENCE.grok.all });
  }

  it("attaches the mechanical fields (market, fair score, key-number metadata) alongside the model's judgments", () => {
    const r = record();
    expect(r).toMatchObject({
      schemaVersion: "nfl-handicap-v2",
      provider: "grok",
      marketSpread: { sportsbook: "draftkings", homeLine: -7, awayLine: 7, homePrice: -115, awayPrice: -105 },
      marketTotal: 50.5,
      preferredSide: "home",
      preferredLine: -7,
      fairSpread: { team: "buf", line: -7.5 },
      fairScoreAway: 21,
      fairScoreHome: 29,
      projectedTotal: 50,
      verdict: "LEAN",
      coverProbabilityPreferred: 56,
      coverProbabilityOther: 40,
    });
    expect(r.keyNumberContext.onKeyNumber).toBe(7);
    expect(r.keyDrivers).toHaveLength(3);
    expect(r.sources.map((s) => s.type)).toEqual(["injury", "market", "other"]);
  });

  it("is write-once and readable back", () => {
    root = mkdtempSync(join(tmpdir(), "handicap-v2-"));
    const r = record();
    const path = writeHandicapV2Record(root, 2026, 3, r);
    expect(() => writeHandicapV2Record(root as string, 2026, 3, r)).toThrow(/overwrite/);
    expect(readLatestHandicapV2Record(root, 2026, 3, r.gameId, "grok")).toEqual(r);
    expect(path).toContain("handicap-v2");
    expect(readLatestHandicapV2Record(root, 2026, 3, r.gameId, "chatgpt")).toBeNull();
  });
});

describe("stage A fixture is the small handicap shape", () => {
  it("has no scouting-report fields", () => {
    const raw = stageARaw("grok");
    expect(Object.keys(raw).sort()).toEqual(["contextHash", "fairSpread", "gameId", "keyDrivers", "mainRisk", "model", "projectedTotal", "schemaVersion", "uncertainty"]);
  });
});
