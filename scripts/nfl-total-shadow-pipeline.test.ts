/**
 * End-to-end: the real production generator run with and without the shadow hook produces byte-identical production
 * output, and the shadow rows written alongside carry exactly raw production totals + the frozen k=0.8 transform.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const CWD = join(__dirname, "..");
const GENERATED_AT = "2026-09-24T21:30:00.000Z"; // before every Week 3 kickoff, independent of today's date
const tmp = mkdtempSync(join(tmpdir(), "nfl-shadow-e2e-"));
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

function runGenerator(args: string[]): string {
  return execFileSync("npx", ["tsx", "scripts/generate-nfl-totals.ts", "--season=2026", "--week=3", `--generated-at=${GENERATED_AT}`, ...args], { cwd: CWD, stdio: "pipe", shell: true, maxBuffer: 64 * 1024 * 1024 }).toString();
}
/** Path + content hash of every file under a directory (empty when it does not exist). */
function snapshotDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(`${p}:${createHash("sha256").update(readFileSync(p)).digest("hex")}`); } };
  walk(dir);
  return out.sort();
}
function jsonlRows(dir: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".jsonl")) out.push(...readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { const r = JSON.parse(l) as Record<string, unknown>; delete r.created_at; return r; })); } };
  walk(dir);
  return out;
}

describe("production generator with vs without the shadow hook", () => {
  it("dry-run: identical production inspection output; shadow preview only when enabled; nothing written to the real shadow root", () => {
    const realRoot = join(CWD, "data", "nfl", "shadow-predictions");
    const rootBefore = snapshotDir(realRoot);
    const withShadow = join(tmp, "dry-with.json"); const without = join(tmp, "dry-without.json");
    const outA = runGenerator(["--dry-run", `--output=${withShadow}`]);
    const outB = runGenerator(["--dry-run", "--no-shadow", `--output=${without}`]);
    expect(readFileSync(withShadow, "utf8")).toBe(readFileSync(without, "utf8"));
    expect(outA).toContain("[nfl:totals:shadow] preview (dry-run, nothing written)");
    expect(outA).toContain("k=0.8");
    expect(outB).not.toContain("[nfl:totals:shadow]");
    const prodLines = (s: string) => s.split("\n").filter((l) => l.startsWith("[nfl:totals]") && !l.includes("wrote inspection artifact"));
    expect(prodLines(outA)).toEqual(prodLines(outB));
    expect(snapshotDir(realRoot)).toEqual(rootBefore);
  }, 240_000);

  it("archive run (temp roots): production archive rows are identical with and without shadow; shadow rows equal raw total + frozen transform", () => {
    const prodA = join(tmp, "prod-a"); const prodB = join(tmp, "prod-b"); const shadow = join(tmp, "shadow");
    runGenerator([`--archive-root=${prodA}`, "--no-shadow"]);
    const out = runGenerator([`--archive-root=${prodB}`, `--shadow-archive-root=${shadow}`]);
    expect(out).toContain("[nfl:totals:shadow] archived");
    expect(jsonlRows(prodB)).toEqual(jsonlRows(prodA)); // production output unchanged by the shadow hook
    expect(existsSync(join(prodB, "2026", "03"))).toBe(true);
    for (const f of readdirSync(join(prodB, "2026", "03"))) expect(f.toLowerCase()).not.toContain("shadow");

    const rows = jsonlRows(shadow).filter((r) => r.schema_version === "jkb-nfl-total-shadow-v1");
    expect(rows).toHaveLength(16);
    const mean = 12519 / 272;
    const production = jsonlRows(prodA) as unknown as { game_id: string; home_away: string; projection: { projected_team_points: number } }[];
    for (const r of rows as unknown as { game_id: string; cohort: string; k: number; raw_jkb_total: number; shadow_total: number; prior_season_league_mean: number; model_version: string; base_model_version: string }[]) {
      const home = production.find((p) => p.game_id === r.game_id && p.home_away === "home")!; const away = production.find((p) => p.game_id === r.game_id && p.home_away === "away")!;
      expect(r.raw_jkb_total).toBe(home.projection.projected_team_points + away.projection.projected_team_points);
      expect(r.k).toBe(0.8); expect(r.cohort).toBe("prospective");
      expect(r.prior_season_league_mean).toBeCloseTo(mean, 12);
      expect(r.shadow_total).toBe(r.prior_season_league_mean + 0.8 * (r.raw_jkb_total - r.prior_season_league_mean));
      expect(r.model_version).toBe("jkb-nfl-total-calibration-shadow-k08-2026"); expect(r.base_model_version).toBe("jkb-nfl-total-ridge-v1.0.0");
    }
    expect(existsSync(join(shadow, "manifest.json"))).toBe(true);
    // idempotent: a second identical run appends nothing
    const again = runGenerator([`--archive-root=${prodB}`, `--shadow-archive-root=${shadow}`]);
    expect(again).toMatch(/appended=0 duplicates=16/);
  }, 480_000);
});
