/**
 * mlb-x-caption-budget.test.mjs
 * Run via: node --test scripts/lib/mlb-x-caption-budget.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  candidateSplits,
  compactPlayerName,
  EditionSentence,
  editionSentenceFor,
  weightedLength,
  X_CHARACTER_LIMIT,
} from "./mlb-x-caption-budget.mjs";
import { buildKEditionCaption, K_CANONICAL_LINK, K_HASHTAGS } from "./mlb-k-caption-core.mjs";
import { buildHrEditionCaption, classifyHrRows, hrCategoryOf, HR_CANONICAL_LINK } from "./mlb-x-artifact-caption.mjs";
import { assertSlateDateAgreement } from "./mlb-x-edition-publication.mjs";

const SLATE = "2026-07-22";

const kRow = (pitcher, direction, kLine, odds, team = "NYY") => ({
  pitcher, team, opponent: "BOS", strikeoutScore: 70, kLine, direction,
  projectedKs: kLine + 1.2, projectionEdge: 1.2,
  oddsOver: direction === "over" ? odds : "-110",
  oddsUnder: direction === "under" ? odds : "-110",
});
const hrRow = (player, odds, team = "NYY", category = undefined) => ({ player, team, hrOddsYes: odds, hrScore: 70, category });

const OVERS = [kRow("Sandy Alcantara", "over", 4.5, "+120"), kRow("David Peterson", "over", 5.5, "-110"), kRow("Zack Wheeler", "over", 6.5, "-105")];
const UNDERS = [kRow("Charlie Morton", "under", 4.5, "-125"), kRow("Bryce Miller", "under", 5.5, "+105"), kRow("Kyle Hendricks", "under", 3.5, "-115")];

describe("weighted character counting", () => {
  it("bills a URL at 23 regardless of real length", () => {
    // The canonical link is longer than 23 characters as plain text.
    assert.ok(K_CANONICAL_LINK.length > 23);
    assert.equal(weightedLength(K_CANONICAL_LINK), 23);
    assert.equal(weightedLength(`x ${K_CANONICAL_LINK}`), 2 + 23);
  });

  it("counts ordinary text one per character", () => {
    assert.equal(weightedLength("abcde"), 5);
    assert.equal(weightedLength(""), 0);
  });

  it("bills wide characters at two", () => {
    assert.equal(weightedLength("日本"), 4);
  });
});

describe("split preference ladder", () => {
  it("prefers 3+3, then 3+2, then 2+2", () => {
    const order = candidateSplits(3, 3).map((s) => `${s.a}+${s.b}`);
    assert.equal(order[0], "3+3");
    assert.ok(["3+2", "2+3"].includes(order[1]));
    assert.equal(order.find((s) => ["2+2"].includes(s)), "2+2");
    assert.ok(order.indexOf("2+2") > order.indexOf(order[1]));
  });

  it("keeps both categories represented ahead of a lopsided split", () => {
    const order = candidateSplits(3, 3).map((s) => `${s.a}+${s.b}`);
    // At total 3, a balanced 2+1/1+2 must precede the single-category 3+0.
    assert.ok(order.indexOf("2+1") < order.indexOf("3+0"));
    assert.ok(order.indexOf("1+2") < order.indexOf("0+3"));
  });

  it("handles an empty category without proposing it", () => {
    const order = candidateSplits(3, 0).map((s) => `${s.a}+${s.b}`);
    assert.equal(order[0], "3+0");
    assert.ok(order.every((s) => s.endsWith("+0")));
  });
});

describe("edition sentences", () => {
  it("uses the approved wording", () => {
    assert.equal(EditionSentence.morning, "Morning model card — check confirmed lineups before betting.");
    assert.equal(EditionSentence.confirmed, "Updated with confirmed lineups.");
    assert.equal(EditionSentence.pregame_fallback, "Pregame update using the latest available lineups.");
  });

  it("refuses an unknown language mode rather than inventing wording", () => {
    assert.throws(() => editionSentenceFor("evening"), /Unknown languageMode/);
  });
});

describe("K edition caption", () => {
  const build = (rows, languageMode = "morning") => buildKEditionCaption({ rows, languageMode, slateDate: SLATE });

  it("fits 3+3 when it can and stays within the weighted budget", () => {
    const result = build([...OVERS, ...UNDERS]);
    assert.equal(result.skipped, false);
    assert.ok(weightedLength(result.caption) <= X_CHARACTER_LIMIT);
    assert.equal(result.diagnostics.includedA + result.diagnostics.includedB, result.captionRows.length);
  });

  it("never skips the post merely because six rows do not fit", () => {
    // Deliberately long names force reduction rather than failure.
    const longOvers = ["Bartolomeo Constantinopolous", "Maximilian Vandersteenhoven", "Aleksandr Chernyshevsky"].map((n) => kRow(n, "over", 4.5, "+120"));
    const longUnders = ["Konstantinos Papadopoulos", "Wolfgang Schreiberhausen", "Rutherford Fetteringham"].map((n) => kRow(n, "under", 5.5, "-125"));
    const result = build([...longOvers, ...longUnders]);
    assert.equal(result.skipped, false, "must reduce, not skip");
    assert.ok(result.captionRows.length >= 1);
    assert.ok(result.omittedRows.length > 0, "some rows were omitted for space");
    assert.ok(weightedLength(result.caption) <= X_CHARACTER_LIMIT);
  });

  it("reduces gracefully and keeps both categories where possible", () => {
    const longOvers = ["Bartolomeo Constantinopolous", "Maximilian Vandersteenhoven", "Aleksandr Chernyshevsky"].map((n) => kRow(n, "over", 4.5, "+120"));
    const longUnders = ["Konstantinos Papadopoulos", "Wolfgang Schreiberhausen", "Rutherford Fetteringham"].map((n) => kRow(n, "under", 5.5, "-125"));
    const result = build([...longOvers, ...longUnders]);
    assert.ok(result.diagnostics.includedA >= 1 && result.diagnostics.includedB >= 1, "one pick from each category");
  });

  it("always retains the edition sentence, link and hashtags", () => {
    for (const mode of ["morning", "confirmed", "pregame_fallback"]) {
      const result = build([...OVERS, ...UNDERS], mode);
      assert.equal(result.skipped, false);
      assert.ok(result.caption.includes(EditionSentence[mode]), `${mode} sentence retained`);
      assert.ok(result.caption.includes(K_CANONICAL_LINK), "canonical link retained");
      assert.ok(result.caption.includes(K_HASHTAGS), "hashtags retained");
    }
  });

  it("keeps the edition sentence even under maximum reduction", () => {
    const huge = Array.from({ length: 6 }, (_, i) => kRow(`Verylongfirstname${"x".repeat(20)} Lastname${i}`, i % 2 ? "under" : "over", 4.5, "+120"));
    const result = build(huge, "morning");
    assert.equal(result.skipped, false);
    assert.ok(result.caption.includes(EditionSentence.morning));
    assert.ok(result.caption.includes(K_CANONICAL_LINK));
  });

  it("prints real sides, lines and prices with no fabrication or truncation", () => {
    const result = build([OVERS[0], UNDERS[0]]);
    assert.match(result.caption, /Sandy Alcantara.*O4\.5 Ks \+120/);
    assert.match(result.caption, /Charlie Morton.*U4\.5 Ks -125/);
    // Nothing ambiguous: every printed line carries side, number and price.
    for (const line of result.caption.split("\n").filter((l) => l.startsWith("•"))) {
      assert.match(line, /[OU]\d+(\.\d+)? Ks [+-]\d+$/, `ambiguous pick line: ${line}`);
    }
  });

  it("drops the team tag before it drops a pick", () => {
    const result = build([...OVERS, ...UNDERS]);
    // With 6 short-name rows the fitted variant may omit teams; whichever
    // variant won, the pick count must not have been sacrificed for a tag.
    if (!result.caption.includes("(NYY)")) {
      assert.ok(result.captionRows.length >= 4, "teams dropped only to keep picks");
    }
  });

  it("records included and omitted counts in diagnostics", () => {
    const result = build([...OVERS, ...UNDERS]);
    const d = result.diagnostics;
    assert.equal(d.availableA, 3);
    assert.equal(d.availableB, 3);
    assert.equal(d.includedA + d.omittedA, 3);
    assert.equal(d.includedB + d.omittedB, 3);
    assert.equal(result.omittedRows.length, d.omittedA + d.omittedB);
  });

  it("excludes a row missing a price rather than inventing one", () => {
    const broken = { ...kRow("No Price", "over", 4.5, "+120"), oddsOver: "" };
    const result = build([broken, ...UNDERS]);
    assert.ok(!result.caption.includes("No Price"));
    assert.ok(!result.captionRows.some((r) => r.pitcher === "No Price"));
  });

  it("posts a single-category card when only one side qualifies", () => {
    const result = build(OVERS);
    assert.equal(result.skipped, false);
    assert.ok(result.caption.includes("Overs"));
    assert.ok(!result.caption.includes("Unders"));
  });
});

describe("HR edition caption", () => {
  const build = (rows, languageMode = "morning") => buildHrEditionCaption({ rows, languageMode, slateDate: SLATE });

  it("groups model plays and longshots and fits the budget", () => {
    const rows = [
      hrRow("Aaron Judge", "+210"), hrRow("Kyle Schwarber", "+240"), hrRow("Pete Alonso", "+260"),
      hrRow("Joey Bart", "+450"), hrRow("Brent Rooker", "+500"), hrRow("Spencer Torkelson", "+520"),
    ];
    const result = build(rows);
    assert.equal(result.skipped, false);
    assert.ok(weightedLength(result.caption) <= X_CHARACTER_LIMIT);
    assert.ok(result.caption.includes("Top model plays"));
    assert.ok(result.caption.includes("Longshots"));
  });

  it("retains edition language and link across all modes", () => {
    const rows = [hrRow("Aaron Judge", "+210"), hrRow("Joey Bart", "+450")];
    for (const mode of ["morning", "confirmed", "pregame_fallback"]) {
      const result = build(rows, mode);
      assert.ok(result.caption.includes(EditionSentence[mode]));
      assert.ok(result.caption.includes(HR_CANONICAL_LINK));
    }
  });

  it("does not skip when six long-named rows exceed the budget", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      hrRow(`Maximiliano Featherstonehaugh${i}`, i < 3 ? "+210" : "+450"));
    const result = build(rows);
    assert.equal(result.skipped, false);
    assert.ok(result.omittedRows.length > 0);
    assert.ok(weightedLength(result.caption) <= X_CHARACTER_LIMIT);
  });

  it("excludes a row with no usable price", () => {
    const result = build([hrRow("Aaron Judge", "+210"), hrRow("No Odds", "")]);
    assert.ok(!result.caption.includes("No Odds"));
  });

  it("respects an explicit category over the price heuristic", () => {
    const result = build([hrRow("Cheap Longshot", "+120", "NYY", "longshot"), hrRow("Model Guy", "+400", "NYY", "model")]);
    assert.ok(result.caption.includes("Longshots"));
    assert.ok(result.caption.includes("Top model plays"));
  });
});

describe("name compaction", () => {
  it("uses an initial plus surname, never bare initials", () => {
    assert.equal(compactPlayerName("Sandy Alcantara"), "S. Alcantara");
    assert.equal(compactPlayerName("Bryce Miller"), "B. Miller");
  });

  it("leaves a single-token name intact", () => {
    assert.equal(compactPlayerName("Ichiro"), "Ichiro");
  });
});

describe("HR category fallback is surfaced, never silent", () => {
  it("reports zero heuristic use when the plan carries explicit categories", () => {
    const rows = [
      { player: "Aaron Judge", team: "NYY", hrOddsYes: "+210", category: "model" },
      { player: "Joey Bart", team: "NYY", hrOddsYes: "+450", category: "longshot" },
    ];
    const result = buildHrEditionCaption({ rows, languageMode: "morning", slateDate: SLATE });
    assert.equal(result.diagnostics.usedCategoryHeuristic, false);
    assert.equal(result.diagnostics.categoryHeuristicCount, 0);
    assert.deepEqual(result.diagnostics.categoryHeuristicPlayers, []);
  });

  it("flags every row that needed the legacy +350 price fallback", () => {
    const rows = [
      { player: "Aaron Judge", team: "NYY", hrOddsYes: "+210" },            // no category
      { player: "Joey Bart", team: "NYY", hrOddsYes: "+450" },              // no category
      { player: "Pete Alonso", team: "NYM", hrOddsYes: "+260", category: "model" },
    ];
    const result = buildHrEditionCaption({ rows, languageMode: "morning", slateDate: SLATE });
    assert.equal(result.diagnostics.usedCategoryHeuristic, true);
    assert.equal(result.diagnostics.categoryHeuristicCount, 2);
    assert.deepEqual(result.diagnostics.categoryHeuristicPlayers.sort(), ["Aaron Judge", "Joey Bart"]);
  });

  it("classifies by the model's own category rather than price when both disagree", () => {
    const { classified, heuristicCount } = classifyHrRows([
      { player: "Cheap Longshot", hrOddsYes: "+120", category: "longshot" },
      { player: "Pricey Model", hrOddsYes: "+900", category: "model" },
    ]);
    assert.equal(heuristicCount, 0);
    assert.equal(classified[0].category, "longshot", "explicit category wins over a short price");
    assert.equal(classified[1].category, "model", "explicit category wins over a long price");
  });

  it("hrCategoryOf reports the heuristic flag per row", () => {
    assert.deepEqual(hrCategoryOf({ hrOddsYes: "+450", category: "model" }), { category: "model", heuristic: false });
    assert.deepEqual(hrCategoryOf({ hrOddsYes: "+450" }), { category: "longshot", heuristic: true });
    assert.deepEqual(hrCategoryOf({ hrOddsYes: "+200" }), { category: "model", heuristic: true });
  });
});

describe("four-way slate-date agreement", () => {
  const base = {
    plannerSlateDate: "2026-07-22",
    cliSlateDate: "2026-07-22",
    planSlateDate: "2026-07-22",
    receiptKey: "mlb-k-2026-07-22-morning",
    imageSlateDate: "2026-07-22",
  };

  it("agrees when all four carriers match the planner", () => {
    const result = assertSlateDateAgreement(base);
    assert.equal(result.agreed, true);
    assert.equal(result.detail.slateDate, "2026-07-22");
  });

  it("rejects a disagreeing CLI, plan, receipt key or image", () => {
    const cases = [
      ["cli", { cliSlateDate: "2026-07-21" }],
      ["plan", { planSlateDate: "2026-07-21" }],
      ["receiptKey", { receiptKey: "mlb-k-2026-07-21-morning" }],
      ["image", { imageSlateDate: "2026-07-21" }],
    ];
    for (const [source, override] of cases) {
      const result = assertSlateDateAgreement({ ...base, ...override });
      assert.equal(result.agreed, false, `${source} mismatch must be rejected`);
      assert.equal(result.reason, "SLATE_DATE_MISMATCH");
      assert.ok(result.detail.disagreements.some((d) => d.source === source));
    }
  });

  it("reports every disagreeing source at once", () => {
    const result = assertSlateDateAgreement({ ...base, cliSlateDate: "2026-07-21", imageSlateDate: "2026-07-20" });
    assert.equal(result.agreed, false);
    assert.equal(result.detail.disagreements.length, 2);
  });

  it("rejects a malformed planner date or unparsable receipt key", () => {
    assert.equal(assertSlateDateAgreement({ ...base, plannerSlateDate: "7/22/26" }).reason, "PLANNER_SLATE_DATE_INVALID");
    assert.equal(assertSlateDateAgreement({ ...base, receiptKey: "mlb-k-props-2026-07-22" }).reason, "RECEIPT_KEY_UNPARSABLE");
  });

  it("tolerates an image slate date that is not known yet", () => {
    // Before a bundle is validated there is nothing to compare; the check runs
    // again with the real value once the image exists.
    assert.equal(assertSlateDateAgreement({ ...base, imageSlateDate: null }).agreed, true);
  });
});
