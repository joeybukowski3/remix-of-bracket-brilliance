import { describe, expect, it } from "vitest";
import { buildLegacyEditorialArticle } from "./nfl-legacy-editorial-adapter";
import type { SnapshotAnalysisState } from "./nfl-snapshot-types";

function baseAnalysisState(overrides: Partial<SnapshotAnalysisState> = {}): SnapshotAnalysisState {
  return {
    thesis: "Atlanta holds a modest edge but Week 2 quarterback uncertainty keeps this close.",
    side: { lean: "home", confidence: 5, spreadLineAtOpinion: { homeLine: 2.5, awayLine: -2.5 }, rationale: "Locked fair is ATL -1.5 versus market home +2.5." },
    total: { lean: "pass", confidence: null, totalLineAtOpinion: null, rationale: undefined },
    matchupFactors: [],
    failureModes: [],
    ...overrides,
  };
}

const BASE_INPUT = {
  homeTeam: "atl",
  awayTeam: "car",
  week: 2,
  displayName: "Grokowski",
  sideSummary: "ATL +2.5",
  totalSummary: "PASS",
};

describe("buildLegacyEditorialArticle", () => {
  it("marks the result isLegacyPreview: true", () => {
    const article = buildLegacyEditorialArticle({ ...BASE_INPUT, analysisState: baseAnalysisState() });
    expect(article.isLegacyPreview).toBe(true);
  });

  it("uses the persisted thesis verbatim as the opening read, and its first sentence as the dek -- never inventing new prose", () => {
    const article = buildLegacyEditorialArticle({ ...BASE_INPUT, analysisState: baseAnalysisState() });
    expect(article.openingRead).toEqual(["Atlanta holds a modest edge but Week 2 quarterback uncertainty keeps this close."]);
    expect(article.dek).toBe("Atlanta holds a modest edge but Week 2 quarterback uncertainty keeps this close.");
  });

  it("buckets a 'personnel' matchup factor into personnelAndAvailability, and every other area into matchupKeys, with no duplication", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        matchupFactors: [
          { area: "personnel", finding: "A personnel finding.", supports: "home", importance: "moderate", jkbContextRefs: [], evidenceIds: [] },
          { area: "quarterback", finding: "A QB finding.", supports: "mixed", importance: "major", jkbContextRefs: [], evidenceIds: [] },
        ],
      }),
    });
    expect(article.personnelAndAvailability).toEqual(["A personnel finding."]);
    expect(article.matchupKeys).toEqual([{ title: "Quarterback", analysis: "A QB finding." }]);
  });

  it("maps failureModes directly onto swingFactors (scenario -> title, whyItMatters -> analysis)", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({ failureModes: [{ scenario: "A scenario.", whyItMatters: "It matters." }] }),
    });
    expect(article.swingFactors).toEqual([{ title: "A scenario.", analysis: "It matters." }]);
  });

  it("omits (null) offense-vs-defense/trenches/game-script sections -- no legacy data supports them, and none is fabricated", () => {
    const article = buildLegacyEditorialArticle({ ...BASE_INPUT, analysisState: baseAnalysisState() });
    expect(article.awayOffenseVsHomeDefense).toBeNull();
    expect(article.homeOffenseVsAwayDefense).toBeNull();
    expect(article.trenchesAndGameControl).toBeNull();
    expect(article.gameScript).toBeNull();
  });

  it("omits sideAnalysis/totalAnalysis (null) when the underlying rationale is absent, rather than fabricating one", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        side: { lean: "pass", confidence: null, spreadLineAtOpinion: null, rationale: undefined },
        total: { lean: "pass", confidence: null, totalLineAtOpinion: null, rationale: undefined },
      }),
    });
    expect(article.sideAnalysis).toBeNull();
    expect(article.totalAnalysis).toBeNull();
  });

  it("strips a leading 'FACT: ... INTERPRETATION: ...' label pair from a matchup factor finding without altering its substance", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        matchupFactors: [{ area: "passing", finding: "FACT: Atlanta led in yards per play. INTERPRETATION: Atlanta should win passing downs.", supports: "home", importance: "major", jkbContextRefs: [], evidenceIds: [] }],
      }),
    });
    expect(article.matchupKeys[0].analysis).not.toMatch(/FACT:|INTERPRETATION:/);
    expect(article.matchupKeys[0].analysis).toContain("Atlanta led in yards per play.");
    expect(article.matchupKeys[0].analysis).toContain("Atlanta should win passing downs.");
  });

  it("regression: strips MULTIPLE embedded FACT:/INTERPRETATION: label pairs within a single finding, not just a leading one", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        matchupFactors: [
          {
            area: "pass_rush",
            finding: "home def_pass_rush_win_rate is 35 vs away 29. FACT: a defensive end is doubtful. INTERPRETATION: that thins the pass rush further.",
            supports: "home",
            importance: "major",
            jkbContextRefs: [],
            evidenceIds: [],
          },
        ],
      }),
    });
    const analysis = article.matchupKeys[0].analysis;
    expect(analysis).not.toMatch(/FACT:|INTERPRETATION:/);
    expect(analysis).not.toMatch(/[a-zA-Z]_[a-zA-Z]/); // no leaked snake_case internal field name
    expect(analysis).toContain("def pass rush win rate"); // content preserved, underscores only de-formatted
    expect(analysis).toContain("a defensive end is doubtful");
    expect(analysis).toContain("that thins the pass rush further");
  });

  it("strips a raw SOURCE_UNAVAILABLE token's underscore without inventing new wording", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        matchupFactors: [{ area: "coaching", finding: "FACT: coaching ratings are SOURCE_UNAVAILABLE. INTERPRETATION: no coaching edge can be assigned.", supports: "neutral", importance: "minor", jkbContextRefs: [], evidenceIds: [] }],
      }),
    });
    expect(article.matchupKeys[0].analysis).not.toMatch(/SOURCE_UNAVAILABLE/);
    expect(article.matchupKeys[0].analysis).not.toMatch(/[a-zA-Z]_[a-zA-Z]/);
  });

  it("regression: strips a leaked snake_case internal metric name from side/total rationale, not just matchupFactors findings", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({
        side: { lean: "away", confidence: 6, spreadLineAtOpinion: { homeLine: 2.5, awayLine: -2.5 }, rationale: "Houston's 35 def_pass_rush_win_rate actually wins early downs against Cincinnati." },
        total: { lean: "under", confidence: 5, totalLineAtOpinion: 46.5, rationale: "The off_epaPerPlay gap favors the under." },
      }),
    });
    expect(article.sideAnalysis?.[0]).not.toMatch(/[a-zA-Z]_[a-zA-Z]/);
    expect(article.sideAnalysis?.[0]).toContain("def pass rush win rate");
    expect(article.totalAnalysis?.[0]).not.toMatch(/[a-zA-Z]_[a-zA-Z]/);
  });

  it("regression: strips a leaked snake_case internal metric name from the thesis (openingRead/dek)", () => {
    const article = buildLegacyEditorialArticle({
      ...BASE_INPUT,
      analysisState: baseAnalysisState({ thesis: "Atlanta's off_epaPerPlay edge is real but thin." }),
    });
    expect(article.openingRead[0]).not.toMatch(/[a-zA-Z]_[a-zA-Z]/);
    expect(article.dek).not.toMatch(/[a-zA-Z]_[a-zA-Z]/);
  });

  it("finalWord is a deterministic templated summary of the actual side/total pick and confidence, and discloses this is a layout preview", () => {
    const article = buildLegacyEditorialArticle({ ...BASE_INPUT, analysisState: baseAnalysisState() });
    expect(article.finalWord.join(" ")).toContain("ATL +2.5");
    expect(article.finalWord.join(" ")).toContain("confidence 5/10");
    expect(article.finalWord.join(" ")).toContain("passes on the total");
    expect(article.finalWord.join(" ")).toMatch(/layout preview/i);
  });
});
