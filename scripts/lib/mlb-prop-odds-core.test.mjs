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

test("K odds reject an incoherent two-sided market (Jack Perkins audit regression)", () => {
  // +881 over / -100 under implies ~10.2% + 50% = ~60.2% combined -- a real
  // two-sided sportsbook market is never below ~100% combined (the vig).
  // This shaped exactly the Jack Perkins case: a mismatched/wrong-source
  // price attached a 2.5 K line instead of the real ~5.5 market line.
  const result = injectKOdds(raw, { date: "2026-06-28", kOdds: {
    "jose berrios": { line: 2.5, over: "+881", under: "-100", bookmaker: "underdog" },
  }});
  // The incoherent entry is filtered out of usefulEntries entirely (never
  // considered a real market to match against), same as an empty provider response.
  assert.equal(result.status.status, "no_useful_provider_records");
  assert.equal(result.data.pitchers[0].kLine, 5.5); // stale same-slate line preserved, not overwritten by the incoherent one
});

test("K odds accept a coherent two-sided market from the same book", () => {
  const result = injectKOdds(raw, { date: "2026-06-28", kOdds: {
    "jose berrios": { line: 5.5, over: "-115", under: "-115", bookmaker: "draftkings" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.pitchers[0].kLine, 5.5);
  assert.equal(result.data.pitchers[0].kOddsBook, "draftkings");
});

test("K odds allow a one-sided market through unchecked for coherence", () => {
  const result = injectKOdds(raw, { date: "2026-06-28", kOdds: {
    "jose berrios": { line: 6.5, over: "+105", under: null, bookmaker: "draftkings" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.pitchers[0].kLine, 6.5);
});

test("HR odds update matches and preserve public fields", () => {
  const result = injectHrOdds(raw, { date: "2026-06-28", fetchedAt: "2026-06-28T13:00:00Z", hrOdds: {
    "jose ramirez": { line: 0.5, yes: "+245", no: "-350", bookmaker: "draftkings" },
    "o'neil cruz": { line: 0.5, yes: "+390", no: "-600", bookmaker: "fanduel" },
  }});
  assert.equal(result.status.status, "partial_success");
  assert.equal(result.data.batters[0].hrOddsYes, "+245");
  assert.equal(result.data.batters[0].hrOddsNo, "-350");
  assert.equal(result.data.batters[0].hrOddsBook, "draftkings");
  assert.equal(result.data.batters[0].hrOddsCapturedAt, "2026-06-28T13:00:00Z");
  assert.equal(result.data.batters[0].hrOddsSlateDate, "2026-06-28");
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

// --- Stale-row preservation must not resurrect ladder markets -------------
// A stored row is only preserved when it would still pass primary-market
// integrity. Rows written by the pre-fix pipeline (one-sided K rungs, 2+/3+ HR
// ladder prices) are cleared instead of carried forward on a slate-date match.

const ladderCarryover = {
  date: "2026-08-05",
  pitchers: [
    { pitcher: "Bryan Woo", kLine: 11, kOddsOver: "+1540", kOddsUnder: null, kOddsSlateDate: "2026-08-05" },
    { pitcher: "Reid Detmers", kLine: 7.5, kOddsOver: "+109", kOddsUnder: "-139", kOddsSlateDate: "2026-08-05" },
  ],
  batters: [
    { player: "Yordan Alvarez", hrLine: 2, hrOddsYes: "+2700", hrOddsNo: null, hrOddsSlateDate: "2026-08-05" },
    { player: "Aaron Judge", hrLine: 0.5, hrOddsYes: "+260", hrOddsNo: null, hrOddsSlateDate: "2026-08-05" },
  ],
};

test("K odds clear a stale one-sided ladder rung instead of preserving it", () => {
  // Neither pitcher is in the provider response, so both take the preserve path.
  const result = injectKOdds(ladderCarryover, {
    date: "2026-08-05",
    kOdds: { "someone else": { line: 5.5, over: "-120", under: "-110" } },
  });
  const woo = result.data.pitchers.find((row) => row.pitcher === "Bryan Woo");
  const detmers = result.data.pitchers.find((row) => row.pitcher === "Reid Detmers");

  assert.equal(woo.kLine, null, "one-sided 11.0 rung must be cleared");
  assert.equal(woo.kOddsOver, null);
  assert.equal(detmers.kLine, 7.5, "a valid two-sided row is still preserved");
  assert.equal(detmers.kOddsUnder, "-139");
});

test("HR odds clear a stale ladder threshold but keep the canonical market", () => {
  const result = injectHrOdds(ladderCarryover, {
    date: "2026-08-05",
    hrOdds: {
      "mookie betts": { line: 0.5, yes: "+330" },
      "juan soto": { line: 0.5, yes: "+300" },
    },
  });
  const alvarez = result.data.batters.find((row) => row.player === "Yordan Alvarez");
  const judge = result.data.batters.find((row) => row.player === "Aaron Judge");

  assert.equal(alvarez.hrLine, null, "2+ HR ladder price must be cleared");
  assert.equal(alvarez.hrOddsYes, null);
  assert.equal(judge.hrLine, 0.5, "canonical 0.5 row is still preserved");
  assert.equal(judge.hrOddsYes, "+260");
});

test("HR preservation is unchanged when the provider gives no threshold to derive", () => {
  const result = injectHrOdds(ladderCarryover, { date: "2026-08-05", hrOdds: {} });
  const alvarez = result.data.batters.find((row) => row.player === "Yordan Alvarez");
  assert.equal(alvarez.hrLine, 2, "without provider data the canonical check is skipped");
});
