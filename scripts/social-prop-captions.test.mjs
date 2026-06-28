import test from "node:test";
import assert from "node:assert/strict";
import { buildCaption as buildHrCaption } from "./post-mlb-hr-props-to-x.mjs";
import { buildCaption as buildKCaption } from "./post-mlb-strikeout-props-to-x.mjs";

test("HR shortened caption stays under 280 characters and retains odds", () => {
  const names = ["A Very Long Baseball Player Name One", "Another Extremely Long Baseball Player Name Two", "Third Unusually Long Baseball Player Name Three"];
  const raw = { date: "2026-06-28", batters: names.map((player, index) => ({ player, team: ["NYY", "LAD", "BOS"][index], opponent: "NYM", opposingPitcher: "Valid Pitcher", hrScore: 90 - index, hrScoreRank: index + 1, hrOddsYes: ["+245", "+340", "-105"][index] })) };
  const result = buildHrCaption(raw, { date: raw.date, bestBets: raw.batters });
  assert.equal(result.skipped, false);
  assert.ok(result.caption.length <= 280);
  for (const odds of ["+245", "+340", "-105"]) assert.ok(result.caption.includes(odds));
});

test("K caption preserves over side, half-point line, and correct price", () => {
  const rows = [
    { pitcher: "Pitcher One", team: "NYY", opponent: "BOS", strikeoutScore: 82.4, line: 5.5, oddsOver: "-115", oddsUnder: "-105" },
    { pitcher: "Pitcher Two", team: "LAD", opponent: "SF", strikeoutScore: 79.1, line: 6.5, oddsOver: "+105", oddsUnder: "-125" },
    { pitcher: "Pitcher Three", team: "ATL", opponent: "NYM", strikeoutScore: 77.2, line: 5, oddsOver: "-110", oddsUnder: "-110" },
  ];
  const result = buildKCaption({ date: "2026-06-28", rows });
  assert.equal(result.skipped, false);
  assert.ok(result.caption.includes("Over 5.5 Ks (-115)") || result.caption.includes("O 5.5 (-115)"));
  assert.ok(result.caption.includes("+105"));
  assert.equal(result.caption.includes("5.5 Ks (-105)"), false);
});

test("K caption rejects a missing line or over price", () => {
  const result = buildKCaption({ date: "2026-06-28", rows: [
    { pitcher: "One", team: "NYY", strikeoutScore: 80, line: null, oddsOver: "-110" },
    { pitcher: "Two", team: "LAD", strikeoutScore: 79, line: 5.5, oddsOver: "-110" },
    { pitcher: "Three", team: "ATL", strikeoutScore: 78, line: 5.5, oddsOver: "-110" },
  ] });
  assert.equal(result.skipped, true);
});
