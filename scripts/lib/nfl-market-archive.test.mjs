import { describe, expect, it } from "vitest";
import { loadLastObservations, parseArchiveJsonl, selectNewArchiveObservations, toArchiveJsonlLines } from "./nfl-market-archive.mjs";

function obs(overrides = {}) {
  return {
    observedAt: "2026-08-26T10:00:00Z",
    canonicalMarket: "passingYards",
    playerId: "gsis:00-0036945",
    bookmaker: "draftkings",
    point: 259.5,
    overPrice: -110,
    underPrice: -110,
    ...overrides,
  };
}

describe("selectNewArchiveObservations", () => {
  it("appends a new (market, player, book) line never seen before", () => {
    const toAppend = selectNewArchiveObservations([obs()], new Map());
    expect(toAppend).toHaveLength(1);
  });

  it("does not re-append an unchanged line", () => {
    const lastByKey = loadLastObservations([obs()]);
    const toAppend = selectNewArchiveObservations([obs()], lastByKey);
    expect(toAppend).toHaveLength(0);
  });

  it("appends when only the point moves", () => {
    const lastByKey = loadLastObservations([obs({ point: 259.5 })]);
    const toAppend = selectNewArchiveObservations([obs({ point: 257.5 })], lastByKey);
    expect(toAppend).toHaveLength(1);
  });

  it("appends when only the price moves at the same point -- never collapses movement", () => {
    const lastByKey = loadLastObservations([obs({ point: 257.5, overPrice: -110 })]);
    const toAppend = selectNewArchiveObservations([obs({ point: 257.5, overPrice: -115 })], lastByKey);
    expect(toAppend).toHaveLength(1);
  });

  it("preserves a full 3-step movement sequence as 3 distinct records when replayed sequentially", () => {
    const steps = [obs({ point: 259.5, overPrice: -110 }), obs({ point: 257.5, overPrice: -115 }), obs({ point: 255.5, overPrice: -110 })];
    let lastByKey = new Map();
    const archived = [];
    for (const step of steps) {
      const toAppend = selectNewArchiveObservations([step], lastByKey);
      archived.push(...toAppend);
      lastByKey = loadLastObservations(archived);
    }
    expect(archived).toHaveLength(3);
  });

  it("tracks each (market, player, book) key independently", () => {
    const lastByKey = loadLastObservations([obs({ bookmaker: "draftkings" })]);
    const toAppend = selectNewArchiveObservations([obs({ bookmaker: "fanduel" })], lastByKey);
    expect(toAppend).toHaveLength(1);
  });
});

describe("JSONL round-trip", () => {
  it("writes and parses records losslessly", () => {
    const records = [obs({ point: 259.5 }), obs({ point: 257.5, bookmaker: "fanduel" })];
    const parsed = parseArchiveJsonl(toArchiveJsonlLines(records));
    expect(parsed).toEqual(records);
  });

  it("ignores blank lines", () => {
    expect(parseArchiveJsonl(`${JSON.stringify(obs())}\n\n`)).toHaveLength(1);
  });
});
