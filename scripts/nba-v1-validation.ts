/**
 * Independent historical validation of the two frozen V1 projection candidates (src/lib/nba/props/v1/validation/frozenPlan.ts).
 *
 *   python -I scripts/nba-hoopr-fetch-prior-season.py --confirm-owner-decision     # once: 2024-25 at the pinned commit
 *   npx tsx scripts/nba-v1-validation.ts [--raw-dir=data/nba/props-v1/raw/hoopr] [--out=data/nba/props-v1/validation]
 *
 * 2024-25 supplies the previous-season context; 2025-26 is the evaluation season; 2026-27 gets an early-season sanity check.
 * Offline: no network, no provider, no credential. Reads the private hoopR files under data/nba/ and writes a report there
 * (gitignored). The data is ESPN-derived and private to the owner: the report is never committed or published, and the
 * console prints aggregate figures only. The public projection and the board are not touched.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { inside, writeAtomically } from "../src/lib/nba/props/pipeline/boardBuildRun";
import type { HooprPlayerBoxRow } from "../src/lib/nba/props/v1/hooprAdapter";
import { walkForward } from "../src/lib/nba/props/v1/backtest/walkForward";
import { CHALLENGERS, reportChallenger, type Measure } from "../src/lib/nba/props/v1/validation/candidateMetrics";
import { CANDIDATE_IDS, PLAN_FROZEN_ON, projectCandidate, type CandidateId } from "../src/lib/nba/props/v1/validation/frozenPlan";
import { normalizeResearchPlayerBox } from "../src/lib/nba/props/v1/validation/researchGames";
import { earlySeasonCheck, verdictFor } from "../src/lib/nba/props/v1/validation/verdict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join("data", "nba");
const arg = (name: string): string | undefined => process.argv.slice(2).find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const fmt = (v: number | null | undefined, d = 3): string => (v === null || v === undefined ? "n/a" : v.toFixed(d));

const manifestSchema = z.object({ commit: z.string().regex(/^[0-9a-f]{40}$/), files: z.array(z.object({ name: z.string(), sha256: z.string(), json: z.string(), rows: z.number().int() })) });
const FILES = [{ name: "player_box_2025", manifest: "manifest-prior-season.json", hooprSeason: 2025 }, { name: "player_box_2026", manifest: "manifest.json", hooprSeason: 2026 }, { name: "player_box_2027", manifest: "manifest.json", hooprSeason: 2027 }] as const;

function main(): void {
  const rawDir = arg("raw-dir") ?? path.join(DATA, "props-v1", "raw", "hoopr");
  const outDir = arg("out") ?? path.join(DATA, "props-v1", "validation");
  const read = (rel: string): unknown => JSON.parse(readFileSync(inside(root, path.join(rawDir, rel), [DATA], rel), "utf8"));
  const manifests = new Map(["manifest.json", "manifest-prior-season.json"].map((f) => [f, manifestSchema.parse(read(f))]));
  const commits = new Set([...manifests.values()].map((m) => m.commit));
  if (commits.size !== 1) throw new Error("the two manifests describe different hoopR commits: the three seasons must be one snapshot");

  const files = FILES.map((f) => {
    const entry = manifests.get(f.manifest)?.files.find((e) => e.name === f.name);
    if (!entry) throw new Error(`${f.manifest} has no ${f.name}`);
    // The files read must be the ones the manifest describes: the Parquet hash and the converted row count both have to match.
    const parquet = readFileSync(inside(root, path.join(rawDir, `${f.name}.parquet`), [DATA], `${f.name}.parquet`));
    if (createHash("sha256").update(parquet).digest("hex") !== entry.sha256) throw new Error(`${f.name}.parquet does not match the manifest's sha256`);
    const rows = (read(entry.json) as { rows: HooprPlayerBoxRow[] }).rows;
    if (rows.length !== entry.rows) throw new Error(`${f.name}.json has ${rows.length} rows but the manifest says ${entry.rows}: refetch`);
    return { hooprSeason: f.hooprSeason, rows };
  });
  const { rows: games, report: importReport } = normalizeResearchPlayerBox(files);

  const projectors = Object.fromEntries(CANDIDATE_IDS.map((id) => [id, (features: Parameters<typeof projectCandidate>[1], priors: Parameters<typeof projectCandidate>[2]) => projectCandidate(id as CandidateId, features, priors)]));
  const evaluation = walkForward(games, { targetSeasons: ["2025-26"], projectors });
  const forward = walkForward(games, { targetSeasons: ["2026-27"], projectors });
  const challengerReports = Object.fromEntries(CHALLENGERS.map((c) => [c, reportChallenger(evaluation.rows, c)]));
  const verdicts = Object.fromEntries(CHALLENGERS.map((c) => [c, verdictFor(c, challengerReports[c])]));

  const report = {
    schemaVersion: "jkb-v1-validation-report-v1",
    private: "hoopR/ESPN-derived; private research only; never commit or publish",
    planFrozenOn: PLAN_FROZEN_ON,
    source: { commit: [...commits][0], seasons: { "2024-25": "previous-season context", "2025-26": "evaluation", "2026-27": "early-season sanity check" } },
    import: importReport,
    evaluation: { targets: evaluation.targets, withoutHistory: evaluation.withoutHistory, scored: evaluation.rows.length },
    challengers: challengerReports,
    verdicts,
    earlySeason2026: { targets: forward.targets, withoutHistory: forward.withoutHistory, ...earlySeasonCheck(forward.rows) },
  };
  mkdirSync(inside(root, outDir, [DATA], "the validation output directory"), { recursive: true });
  writeAtomically(inside(root, path.join(outDir, "validation-report.json"), [DATA], "the validation report"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Import: ${JSON.stringify(importReport.rowsKept)} rows, ${JSON.stringify(importReport.gamesKept)} games (excluded ${JSON.stringify(importReport.excluded)})`);
  console.log(`2025-26 evaluation: ${evaluation.targets} regular-season targets, ${evaluation.withoutHistory} without an earlier game, ${evaluation.rows.length} scored`);
  for (const c of CHALLENGERS) {
    const r = challengerReports[c];
    console.log(`  ${c}: ${(["minutes", "pts", "reb", "ast"] as Measure[]).map((m) => `${m} ${fmt(r.overall[m].difference.meanDiff)} [${fmt(r.overall[m].difference.ci95?.[0])}, ${fmt(r.overall[m].difference.ci95?.[1])}] later half ${fmt(r.laterHalf[m].difference.meanDiff)}`).join(" | ")}; material worsening ${r.materialWorsening.length}; justifies a targeted change: ${verdicts[c].justifiesTargetedChange}`);
  }
  console.log(`2026-27 early season: ${forward.rows.length} scored of ${forward.targets}; outside plausible ranges ${JSON.stringify(Object.fromEntries(Object.entries(report.earlySeason2026.ranges).map(([k, v]) => [k, v.outsidePlausible])))}`);
  console.log(`Report -> ${path.join(outDir, "validation-report.json")}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof SyntaxError ? "a data file is not valid JSON" : error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
