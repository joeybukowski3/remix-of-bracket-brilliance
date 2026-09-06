/**
 * WU4 -- generate public/data/nfl/performance/overview.json, a thin
 * cross-family rollup for the future /nfl/performance dashboard.
 *
 * Reads ONLY already-canonical derived artifacts already committed to the
 * repo -- public/data/nfl/performance/totals.json,
 * public/data/nfl/performance/props.json, and the WU3 spread evaluation
 * summary (data/nfl/prediction-evaluations/jkb-football-evaluation-v1/
 * summary/<season>.json) -- and never recomputes a metric itself. See
 * scripts/lib/nfl-performance-overview.ts (pure, unit-tested) for the
 * section-building logic.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  buildOverviewPropsSection,
  buildOverviewSidesSection,
  buildOverviewTotalsSection,
  type PropsOverviewInput,
  type SpreadEvaluationSummaryInput,
  type TotalsOverviewInput,
} from "./lib/nfl-performance-overview";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOTALS_FILE = join(ROOT, "public", "data", "nfl", "performance", "totals.json");
const PROPS_FILE = join(ROOT, "public", "data", "nfl", "performance", "props.json");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "performance", "overview.json");
export const OVERVIEW_SCHEMA_VERSION = "nfl-performance-overview-v1";

/** Matches the default season used elsewhere in this pipeline (e.g. resolve-nfl-current-week.mjs) when no artifact yet reports a season. */
const FALLBACK_SEASON = 2026;

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function mtimeIsoOrNull(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return statSync(filePath).mtime.toISOString();
}

function spreadSummaryPath(season: number): string {
  return join(ROOT, "data", "nfl", "prediction-evaluations", "jkb-football-evaluation-v1", "summary", `${season}.json`);
}

/**
 * Pure(-ish) artifact build: reads the same on-disk sources `main()` does,
 * but performs no writes. Exported so tests can call it twice and assert
 * determinism, and can point it at a different totalsFile/propsFile/root
 * without touching the real public/data/nfl/performance/overview.json.
 */
export function buildPerformanceOverviewArtifact(
  generatedAt: string,
  totalsFile: string = TOTALS_FILE,
  propsFile: string = PROPS_FILE,
  evaluationRoot: string = join(ROOT, "data", "nfl", "prediction-evaluations", "jkb-football-evaluation-v1", "summary"),
) {
  const totals = loadJsonIfExists<TotalsOverviewInput & { performanceMeta: { latestOutcomeTimestamp: string | null } }>(totalsFile);
  const props = loadJsonIfExists<PropsOverviewInput>(propsFile);

  const totalsSeasons = totals?.performanceMeta.seasons ?? [];
  const propsSeasons = props?.performanceMeta.seasons ?? [];
  const allSeasons = [...new Set([...totalsSeasons, ...propsSeasons])].sort();
  const season = allSeasons.length ? allSeasons[allSeasons.length - 1] : FALLBACK_SEASON;

  const spreadSummaryFile = join(evaluationRoot, `${season}.json`);
  const spread = loadJsonIfExists<SpreadEvaluationSummaryInput>(spreadSummaryFile);

  const artifact = {
    _meta: buildNflMeta({
      source: "generated (public/data/nfl/performance/totals.json + props.json + data/nfl/prediction-evaluations/jkb-football-evaluation-v1/summary)",
      season,
      notes: [
        "Thin cross-family rollup for the future /nfl/performance dashboard. Every metric here is read verbatim from an already-canonical derived artifact -- no independent grading or aggregation logic exists here.",
        "sides is a thin summary of the canonical WU3 spread evaluation dataset (jkb-power-number-v1.0.0); full Sides performance support is not yet materialized into a dedicated sides.json.",
      ],
      generatedAt,
    }),
    schemaVersion: OVERVIEW_SCHEMA_VERSION,
    performanceMeta: {
      schemaVersion: OVERVIEW_SCHEMA_VERSION,
      generatedAt,
      season,
    },
    totals: buildOverviewTotalsSection(totals, totals?.performanceMeta.latestOutcomeTimestamp ?? null),
    props: buildOverviewPropsSection(props, mtimeIsoOrNull(propsFile)),
    sides: buildOverviewSidesSection(spread, mtimeIsoOrNull(spreadSummaryFile)),
  };

  return { artifact };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const generatedAt = args.find((a) => a.startsWith("--generated-at="))?.slice(15) ?? new Date().toISOString();

  const { artifact } = buildPerformanceOverviewArtifact(generatedAt);

  console.log(
    `[nfl:performance-overview] season=${artifact.performanceMeta.season} totals=${artifact.totals.status} props=${artifact.props.status} sides=${artifact.sides.status}`,
  );

  if (dryRun) {
    console.log(`[nfl:performance-overview] dry-run -- not writing ${OUT_FILE}`);
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
  console.log(`[nfl:performance-overview] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:performance-overview] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
