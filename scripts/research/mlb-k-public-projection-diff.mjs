/**
 * RESEARCH / DIAGNOSTIC ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Compares the PUBLIC resolved strikeout projection before and after a change
 * to the production authority, from two snapshots of hr-props-raw.json.
 *
 * Usage:
 *   node scripts/research/mlb-k-public-projection-diff.mjs <before.json> <after.json>
 *
 * Reports every pitcher whose public `projectedKs` moved at all, highlights the
 * ones that moved by >= 0.5 K, and lists every Over/Under direction flip against
 * the market line. The line is used only to classify the side; it is never an
 * input to any projection.
 *
 * Writes only under data/mlb/k-research/.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const MATERIAL_CHANGE_KS = 0.5;

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error("usage: mlb-k-public-projection-diff.mjs <before.json> <after.json>");
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const r = (value, digits = 3) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

const side = (projected, line) => {
  if (!Number.isFinite(projected) || !Number.isFinite(line)) return null;
  return projected > line ? "over" : projected < line ? "under" : "neutral";
};

const before = readJson(beforePath);
const after = readJson(afterPath);

if (before?.date !== after?.date) {
  throw new Error(`slate mismatch: before=${before?.date} after=${after?.date}; refusing to compare different slates`);
}

/** Keyed on the identity the resolver itself matches on, never on array order. */
const keyOf = (row) => `${row?.gameId ?? row?.gamePk ?? "?"}|${row?.pitcherId ?? "?"}`;
const beforeByKey = new Map((before.pitchers ?? []).map((row) => [keyOf(row), row]));

const rows = (after.pitchers ?? []).map((afterRow) => {
  const beforeRow = beforeByKey.get(keyOf(afterRow)) ?? null;
  const beforeKs = finite(beforeRow?.projectedKs);
  const afterKs = finite(afterRow?.projectedKs);
  const line = finite(afterRow?.kLine);
  const beforeSide = side(beforeKs, line);
  const afterSide = side(afterKs, line);
  return {
    pitcher: afterRow?.pitcher ?? null,
    team: afterRow?.team ?? null,
    opponent: afterRow?.opponent ?? null,
    kLine: line,
    beforeKs: r(beforeKs),
    afterKs: r(afterKs),
    deltaKs: beforeKs === null || afterKs === null ? null : r(afterKs - beforeKs),
    absDeltaKs: beforeKs === null || afterKs === null ? null : Math.abs(r(afterKs - beforeKs)),
    beforeSource: beforeRow?.projectionSource ?? null,
    afterSource: afterRow?.projectionSource ?? null,
    beforeModelVersion: beforeRow?.v2ModelVersion ?? null,
    afterModelVersion: afterRow?.v2ModelVersion ?? afterRow?.projectionModelVersion ?? null,
    fallbackReason: afterRow?.projectionFallbackReason ?? null,
    beforeSide,
    afterSide,
    directionFlip: beforeSide != null && afterSide != null && beforeSide !== afterSide,
    beforeKAdjustment: finite(beforeRow?.kAdjustment),
    afterKAdjustment: finite(afterRow?.kAdjustment),
    missingBefore: beforeRow === null,
  };
});

const changed = rows.filter((row) => row.deltaKs !== null && row.deltaKs !== 0);
const material = rows.filter((row) => (row.absDeltaKs ?? 0) >= MATERIAL_CHANGE_KS);
const flips = rows.filter((row) => row.directionFlip);

const sourceCounts = rows.reduce((acc, row) => {
  const key = `${row.beforeSource ?? "none"} -> ${row.afterSource ?? "none"}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const payload = {
  study: "mlb-k-projection-v3-workload-model",
  section: "public-projection-before-after",
  generatedAt: new Date().toISOString(),
  slateDate: after?.date ?? null,
  beforePath,
  afterPath,
  materialChangeThresholdKs: MATERIAL_CHANGE_KS,
  totals: {
    rows: rows.length,
    changed: changed.length,
    unchanged: rows.length - changed.length,
    materialChanges: material.length,
    directionFlips: flips.length,
    missingBefore: rows.filter((row) => row.missingBefore).length,
  },
  sourceTransitions: sourceCounts,
  materialChanges: [...material].sort((a, b) => (b.absDeltaKs ?? 0) - (a.absDeltaKs ?? 0)),
  directionFlips: flips,
  allChanges: [...changed].sort((a, b) => (b.absDeltaKs ?? 0) - (a.absDeltaKs ?? 0)),
};

writeFileSync(path.join(OUT, "public-projection-diff.json"), `${JSON.stringify(payload, null, 2)}\n`);

const p = (v, n) => String(v ?? "-").padStart(n);
console.log(`SLATE ${payload.slateDate}  rows=${rows.length}  changed=${changed.length}  >=${MATERIAL_CHANGE_KS}K=${material.length}  flips=${flips.length}`);
console.log("\nSOURCE TRANSITIONS:");
for (const [key, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${key}`);
}
if (material.length) {
  console.log(`\nCHANGES >= ${MATERIAL_CHANGE_KS} K:`);
  console.log("  " + "pitcher".padEnd(22) + p("line", 5) + p("before", 8) + p("after", 8) + p("delta", 8) + "  side");
  for (const row of payload.materialChanges) {
    console.log(
      "  " + String(row.pitcher ?? "").slice(0, 21).padEnd(22) + p(row.kLine, 5) +
      p(row.beforeKs, 8) + p(row.afterKs, 8) + p(row.deltaKs, 8) +
      `  ${row.beforeSide ?? "-"}/${row.afterSide ?? "-"}` + (row.directionFlip ? " FLIP" : ""),
    );
  }
}
if (flips.length) {
  console.log("\nDIRECTION FLIPS:");
  for (const row of flips) {
    console.log(
      `  ${String(row.pitcher ?? "").padEnd(22)} line ${p(row.kLine, 4)}  ${row.beforeKs} (${row.beforeSide}) -> ${row.afterKs} (${row.afterSide})`,
    );
  }
} else {
  console.log("\nDIRECTION FLIPS: none");
}
