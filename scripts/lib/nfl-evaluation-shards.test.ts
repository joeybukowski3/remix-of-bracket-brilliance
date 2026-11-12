import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GITHUB_FILE_LIMIT_BYTES,
  MAX_SHARD_BYTES,
  evaluationShardPath,
  hasEvaluationData,
  latestEvaluationMtimeMs,
  legacyEvaluationPath,
  listEvaluationFiles,
  migrateLegacyToShards,
  readEvaluationRows,
  writeEvaluationShards,
} from "./nfl-evaluation-shards";

type Row = { id: string; week: number; payload?: string };
const serialize = (rows: readonly Row[]) =>
  rows.length === 0 ? "" : `${[...rows].sort((a, b) => a.id.localeCompare(b.id)).map((r) => JSON.stringify(r)).join("\n")}\n`;

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "jkb-eval-shards-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("evaluation shards", () => {
  it("writes one shard per week, each sorted, and reads them back in week order", () => {
    const root = tempRoot();
    const rows: Row[] = [
      { id: "b", week: 2 }, { id: "a", week: 2 }, { id: "c", week: 1 }, { id: "z", week: 10 },
    ];
    const { written } = writeEvaluationShards(root, "receiving", 2026, rows, serialize);

    expect(written.map((p) => p.replace(root, "").replace(/\\/g, "/"))).toEqual([
      "/receiving/2026/01.jsonl", "/receiving/2026/02.jsonl", "/receiving/2026/10.jsonl",
    ]);
    expect(readFileSync(evaluationShardPath(root, "receiving", 2026, 2), "utf8")).toBe(
      '{"id":"a","week":2}\n{"id":"b","week":2}\n',
    );
    expect(readEvaluationRows<Row>(root, "receiving", 2026).map((r) => r.id)).toEqual(["c", "a", "b", "z"]);
  });

  it("preserves every row exactly (multiset equal) when splitting a legacy monolith", () => {
    const root = tempRoot();
    const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: `row-${String(i).padStart(4, "0")}`, week: (i % 9) + 1, payload: "x".repeat(i % 7) }));
    mkdirSync(join(root, "receiving"), { recursive: true });
    writeFileSync(legacyEvaluationPath(root, "receiving", 2026), serialize(rows));
    const before = readEvaluationRows<Row>(root, "receiving", 2026);

    writeEvaluationShards(root, "receiving", 2026, before, serialize);
    const after = readEvaluationRows<Row>(root, "receiving", 2026);

    expect(after).toHaveLength(before.length);
    expect(after.map((r) => JSON.stringify(r)).sort()).toEqual(before.map((r) => JSON.stringify(r)).sort());
  });

  it("removes the superseded legacy monolith so rows are never double-counted", () => {
    const root = tempRoot();
    mkdirSync(join(root, "rushing"), { recursive: true });
    writeFileSync(legacyEvaluationPath(root, "rushing", 2026), serialize([{ id: "old", week: 1 }]));

    const { removed } = writeEvaluationShards(root, "rushing", 2026, [{ id: "new", week: 1 }], serialize);

    expect(existsSync(legacyEvaluationPath(root, "rushing", 2026))).toBe(false);
    expect(removed.map((p) => p.replace(/\\/g, "/"))).toEqual([expect.stringMatching(/rushing\/2026\.jsonl$/)]);
    expect(readEvaluationRows<Row>(root, "rushing", 2026).map((r) => r.id)).toEqual(["new"]);
  });

  it("removes shards for weeks that no longer have rows (derived data mirrors its inputs)", () => {
    const root = tempRoot();
    writeEvaluationShards(root, "spread", 2026, [{ id: "a", week: 1 }, { id: "b", week: 2 }], serialize);
    writeEvaluationShards(root, "spread", 2026, [{ id: "a", week: 1 }], serialize);
    expect(readdirSync(join(root, "spread", "2026"))).toEqual(["01.jsonl"]);
  });

  it("prefers shards over a stale legacy file when both exist (mid-migration safety)", () => {
    const root = tempRoot();
    mkdirSync(join(root, "passing", "2026"), { recursive: true });
    writeFileSync(legacyEvaluationPath(root, "passing", 2026), serialize([{ id: "legacy", week: 1 }]));
    writeFileSync(evaluationShardPath(root, "passing", 2026, 1), serialize([{ id: "shard", week: 1 }]));
    expect(readEvaluationRows<Row>(root, "passing", 2026).map((r) => r.id)).toEqual(["shard"]);
    expect(listEvaluationFiles(root, "passing", 2026)).toHaveLength(1);
  });

  it("falls back to the legacy monolith when no shards exist yet", () => {
    const root = tempRoot();
    mkdirSync(join(root, "team_total"), { recursive: true });
    writeFileSync(legacyEvaluationPath(root, "team_total", 2026), serialize([{ id: "legacy", week: 3 }]));
    expect(readEvaluationRows<Row>(root, "team_total", 2026).map((r) => r.id)).toEqual(["legacy"]);
    expect(hasEvaluationData(root, "team_total", 2026)).toBe(true);
  });

  it("reports absence cleanly for a dataset/season that was never written", () => {
    const root = tempRoot();
    expect(readEvaluationRows(root, "receiving", 2030)).toEqual([]);
    expect(hasEvaluationData(root, "receiving", 2030)).toBe(false);
    expect(latestEvaluationMtimeMs(root, "receiving", 2030)).toBeNull();
  });

  it("is byte-identical on an unchanged rerun", () => {
    const root = tempRoot();
    const rows: Row[] = [{ id: "a", week: 1 }, { id: "b", week: 2 }];
    writeEvaluationShards(root, "spread", 2026, rows, serialize);
    const first = readFileSync(evaluationShardPath(root, "spread", 2026, 2), "utf8");
    writeEvaluationShards(root, "spread", 2026, [...rows].reverse(), serialize);
    expect(readFileSync(evaluationShardPath(root, "spread", 2026, 2), "utf8")).toBe(first);
  });

  it("reports the newest shard mtime", () => {
    const root = tempRoot();
    writeEvaluationShards(root, "spread", 2026, [{ id: "a", week: 1 }, { id: "b", week: 2 }], serialize);
    const newest = Math.max(...listEvaluationFiles(root, "spread", 2026).map((p) => statSync(p).mtimeMs));
    expect(latestEvaluationMtimeMs(root, "spread", 2026)).toBe(newest);
  });

  it("rejects rows without an integer week instead of silently misfiling them", () => {
    const root = tempRoot();
    expect(() => writeEvaluationShards(root, "spread", 2026, [{ id: "a", week: Number.NaN }], serialize)).toThrow(/week/);
  });

  it("refuses to write a shard over the size cap, leaving existing data untouched", () => {
    const root = tempRoot();
    writeEvaluationShards(root, "spread", 2026, [{ id: "keep", week: 1 }], serialize);
    expect(() =>
      writeEvaluationShards(root, "spread", 2026, [{ id: "a", week: 1, payload: "x".repeat(64) }], serialize, { maxShardBytes: 32 }),
    ).toThrow(/exceeds/i);
    expect(readEvaluationRows<Row>(root, "spread", 2026).map((r) => r.id)).toEqual(["keep"]);
  });

  describe("migrateLegacyToShards", () => {
    const monolith = (n: number) =>
      Array.from({ length: n }, (_, i) => JSON.stringify({ id: `r${String(i).padStart(3, "0")}`, week: (i % 5) + 1, n: 1.0, x: 1e-7 })).join("\n") + "\n";

    it("splits by week without re-serializing a single row (byte-exact lines), then removes the monolith", () => {
      const root = tempRoot();
      mkdirSync(join(root, "receiving"), { recursive: true });
      const original = monolith(50);
      writeFileSync(legacyEvaluationPath(root, "receiving", 2026), original);

      const result = migrateLegacyToShards(root, "receiving", 2026);

      expect(result).toMatchObject({ rows: 50 });
      expect(existsSync(legacyEvaluationPath(root, "receiving", 2026))).toBe(false);
      const shardLines = listEvaluationFiles(root, "receiving", 2026).flatMap((p) => readFileSync(p, "utf8").split("\n").filter(Boolean));
      expect(shardLines.sort()).toEqual(original.split("\n").filter(Boolean).sort());
      // Order inside a shard is the original relative order.
      expect(readFileSync(evaluationShardPath(root, "receiving", 2026, 1), "utf8").split("\n").filter(Boolean)[1]).toContain('"r005"');
    });

    it("returns null when there is no legacy file, and refuses when shards already exist", () => {
      const root = tempRoot();
      expect(migrateLegacyToShards(root, "spread", 2026)).toBeNull();
      mkdirSync(join(root, "spread", "2026"), { recursive: true });
      writeFileSync(legacyEvaluationPath(root, "spread", 2026), monolith(3));
      writeFileSync(evaluationShardPath(root, "spread", 2026, 1), monolith(1));
      expect(() => migrateLegacyToShards(root, "spread", 2026)).toThrow(/already/i);
      expect(existsSync(legacyEvaluationPath(root, "spread", 2026))).toBe(true);
    });

    it("keeps the monolith when a row has no usable week", () => {
      const root = tempRoot();
      mkdirSync(join(root, "spread"), { recursive: true });
      writeFileSync(legacyEvaluationPath(root, "spread", 2026), `${JSON.stringify({ id: "a" })}\n`);
      expect(() => migrateLegacyToShards(root, "spread", 2026)).toThrow(/week/);
      expect(existsSync(legacyEvaluationPath(root, "spread", 2026))).toBe(true);
    });
  });

  it("keeps the default cap safely below GitHub's hard file limit", () => {
    expect(MAX_SHARD_BYTES).toBeLessThan(GITHUB_FILE_LIMIT_BYTES);
    expect(GITHUB_FILE_LIMIT_BYTES).toBe(100 * 1024 * 1024);
  });
});
