import test from "node:test";
import assert from "node:assert/strict";
import { injectKOdds } from "./inject-k-odds-core.mjs";

const base = {
  date: "2026-06-28",
  pitchers: [
    { pitcher: "José Berríos", kLine: 5.5, kOddsOver: "-110", kOddsUnder: "-110", kOddsBook: "old", kOddsSlateDate: "2026-06-28" },
    { pitcher: "C.J. Abrams", kLine: null, kOddsOver: null, kOddsUnder: null },
    { pitcher: "Hyun-Jin Ryu", kLine: 4.5, kOddsOver: "-105", kOddsUnder: "-115", kOddsSlateDate: "2026-06-27" },
  ],
};

test("updates matches and retains line, both prices, and bookmaker", () => {
  const result = injectKOdds(base, { date: "2026-06-28", kOdds: {
    "jose berrios": { line: 6.5, over: "+105", under: "-125", bookmaker: "draftkings" },
    "cj abrams": { line: 5.5, over: "-115", under: "-105", bookmaker: "fanduel" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.pitchers[0].kLine, 6.5);
  assert.equal(result.data.pitchers[0].kOddsOver, "+105");
  assert.equal(result.data.pitchers[0].kOddsUnder, "-125");
  assert.equal(result.data.pitchers[0].kOddsBook, "draftkings");
  assert.equal(result.data.pitchers[1].kLine, 5.5);
  assert.equal(result.data.pitchers[2].kLine, null);
});

test("zero records preserve only explicitly same-slate odds", () => {
  const result = injectKOdds(base, { date: "2026-06-28", kOdds: {} });
  assert.equal(result.status.status, "no_useful_provider_records");
  assert.equal(result.data.pitchers[0].kLine, 5.5);
  assert.equal(result.data.pitchers[2].kLine, null);
  assert.equal(result.status.sameSlatePreserved, 1);
});

test("slate mismatch clears stale odds", () => {
  const result = injectKOdds(base, { date: "2026-06-27", kOdds: { "jose berrios": { line: 6.5, over: "-110", under: "-110" } } });
  assert.equal(result.status.status, "slate_mismatch");
  assert.ok(result.data.pitchers.every((pitcher) => pitcher.kLine == null));
});

test("zero matches are reported", () => {
  const result = injectKOdds(base, { date: "2026-06-28", kOdds: { "different pitcher": { line: 5.5, over: "-110", under: "-110" } } });
  assert.equal(result.status.status, "zero_matches");
  assert.equal(result.status.pitchersMatched, 0);
});
