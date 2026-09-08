import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDfsHistoryDelivery } from "./nfl-dfs-history-delivery.mjs";

test("delivery selects V1 preferred markets without recalculating rows or changing cohorts", () => {
  const player = { position: "RB", actualMinusOpponentAllowance: 12 };
  const a = { actualMinusPlayerAverage: 10 }, b = { actualMinusPlayerAverage: null };
  const context = { schemaVersion: "nfl-individual-yardage-history-v1", season: 2026, week: 1, asOf: "2026-09-01T00:00:00Z",
    players: { "gsis:a:rushing": [player], "gsis:a:receiving": [player], "gsis:missing:rushing": [] },
    defenseMatchups: { "det:rushing:RB": [a, b], "det:receiving:RB": [a] } };
  const files = buildDfsHistoryDelivery(context);
  assert.deepEqual(Object.keys(files), ["QB.json", "RB.json", "WR.json", "TE.json", "index.json"]);
  assert.equal(files["RB.json"].players["gsis:a:rushing"][0], player);
  assert.equal(files["RB.json"].defenseMatchups["det:rushing:RB"][1], b);
  assert.deepEqual(files["index.json"].defenseDeltas, { "det:rushing:RB": [10, null] });
  assert.deepEqual(files["index.json"].playerKeys, ["gsis:a:rushing"]);
  assert.equal(files["index.json"].players, undefined);
  assert.equal(files["index.json"].defenseMatchups, undefined);
  assert.equal(context.players["gsis:a:receiving"][0], player);
});
