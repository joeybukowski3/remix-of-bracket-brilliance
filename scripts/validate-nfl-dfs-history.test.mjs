import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dfsHistoryDirectory, validateDfsHistory } from "./validate-nfl-dfs-history.mjs";

function fixture(build) {
  const root = mkdtempSync(join(tmpdir(), "dfs-history-"));
  try { build(root); return root; } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
}
const write = (root, name, data) => {
  const directory = dfsHistoryDirectory(2026, 3, root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.json`), JSON.stringify(data));
};
const complete = (root) => {
  write(root, "index", { season: 2026, week: 3, playerKeys: ["gsis:a:passing"] });
  for (const position of ["QB", "RB", "WR", "TE"]) write(root, position, { season: 2026, week: 3, players: { k: [{}] } });
};

test("accepts a complete current-week folder", () => {
  const root = fixture(complete);
  assert.deepEqual(validateDfsHistory(2026, 3, root), []);
  rmSync(root, { recursive: true, force: true });
});
test("fails when the week folder is missing", () => {
  const root = fixture(() => {});
  assert.match(validateDfsHistory(2026, 3, root)[0], /missing folder/);
  rmSync(root, { recursive: true, force: true });
});
test("fails on a missing file, wrong week, or empty history", () => {
  const root = fixture((r) => {
    complete(r);
    write(r, "index", { season: 2026, week: 1, playerKeys: [] });
    write(r, "WR", { season: 2026, week: 3, players: {} });
    rmSync(join(dfsHistoryDirectory(2026, 3, r), "TE.json"));
  });
  const problems = validateDfsHistory(2026, 3, root).join("|");
  assert.match(problems, /expected 2026\/3/);
  assert.match(problems, /no playerKeys/);
  assert.match(problems, /WR\.json has no player history rows/);
  assert.match(problems, /missing TE\.json/);
  rmSync(root, { recursive: true, force: true });
});
