import test from "node:test";
import assert from "node:assert/strict";
import { injectHrOdds, injectKOdds } from "./mlb-prop-odds-core.mjs";

const raw = {
  date: "2026-06-28",
  pitchers: [
    { pitcher: "José Berríos", kLine: 5.5, kOddsOver: "-110", kOddsUnder: "-110", kOddsBook: "old", kOddsSlateDate: "2026-06-28" },
    { pitcher: "C.J. Abrams", kLine: null, kOddsOver: null, kOddsUnder: null },
    { pitcher: "Hyun-Jin Ryu", kLine: 4.5, kOddsOver: "-105", kOddsUnder: "-115", kOddsSlateDate: "2026-06-27" },
  ],
  batters: [
    { player: "José Ramírez Jr.", hrLine: 0.5, hrOddsYes: "+300", hrOddsNo: "-450", hrOddsBook: "old", hrOddsSlateDate: "2026-06-28" },
    { player: "O'Neil Cruz", hrLine: null, hrOddsYes: null, hrOddsNo: null },
    { player: "Hyun-Jin Ryu IV", hrLine: 0.5, hrOddsYes: "+800", hrOddsNo: "-1200", hrOddsSlateDate: "2026-06-27" },
  ],
};

test("K odds update full provider data without swapping over and under", () => {
  const result = injectKOdds(raw, { date: "2026-06-28", kOdds: {
    "jose berrios": { line: 6.5, over: "+105", under: "-125", bookmaker: "draftkings" },
    "cj abrams": { line: 5.5, over: "-115", under: "-105", bookmaker: "fanduel" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.pitchers[0].kLine, 6.5);
  assert.equal(result.data.pitchers[0].kOddsOver, "+105");
  assert.equal(result.data.pitchers[0].kOddsUnder, "-125");
  assert.equal(result.data.pitchers[0].kOddsBook, "draftkings");
  assert.equal(result.data.pitchers[1].kLine, 5.5);
  assert.equal(result.data.pitchers[1].kOddsOver, "-115");
  assert.equal(result.data.pitchers[2].kLine, null);
});

test("K odds preserve same-slate rows on empty or partial responses and reject prior slate", () => {
  const empty = injectKOdds(raw, { date: "2026-06-28", kOdds: {} });
  assert.equal(empty.status.status, "no_useful_provider_records");
  assert.equal(empty.data.pitchers[0].kLine, 5.5);
  assert.equal(empty.data.pitchers[2].kLine, null);
  assert.equal(empty.status.sameSlatePreserved, 1);

  const stale = injectKOdds(raw, { date: "2026-06-27", kOdds: { "jose berrios": { line: 6.5, over: "-110", under: "-110" } } });
  assert.equal(stale.status.status, "slate_mismatch");
  assert.ok(stale.data.pitchers.every((pitcher) => pitcher.kLine == null));
});

test("K odds report zero matches", () => {
  const result = injectKOdds(raw, { date: "2026-06-28", kOdds: { "different pitcher": { line: 5.5, over: "-110", under: "-110" } } });
  assert.equal(result.status.status, "zero_matches");
  assert.equal(result.status.pitchersMatched, 0);
});

test("HR odds update matches and preserve public fields", () => {
  const result = injectHrOdds(raw, { date: "2026-06-28", hrOdds: {
    "jose ramirez": { line: 0.5, yes: "+245", no: "-350", bookmaker: "draftkings" },
    "o'neil cruz": { line: 0.5, yes: "+390", no: "-600", bookmaker: "fanduel" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.batters[0].hrOddsYes, "+245");
  assert.equal(result.data.batters[0].hrOddsNo, "-350");
  assert.equal(result.data.batters[0].hrOddsBook, "draftkings");
  assert.equal(result.data.batters[1].hrLine, 0.5);
  assert.equal(result.data.batters[2].hrOddsYes, null);
});

test("HR odds preserve same-slate rows on empty or partial responses and reject prior slate", () => {
  const empty = injectHrOdds(raw, { date: "2026-06-28", hrOdds: {} });
  assert.equal(empty.status.status, "no_useful_provider_records");
  assert.equal(empty.data.batters[0].hrOddsYes, "+300");
  assert.equal(empty.data.batters[2].hrOddsYes, null);
  assert.equal(empty.status.sameSlatePreserved, 1);

  const stale = injectHrOdds(raw, { date: "2026-06-27", hrOdds: { "jose ramirez": { yes: "+245" } } });
  assert.equal(stale.status.status, "slate_mismatch");
  assert.ok(stale.data.batters.every((batter) => batter.hrOddsYes == null));
});
