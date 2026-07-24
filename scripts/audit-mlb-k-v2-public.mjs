/**
 * audit-mlb-k-v2-public.mjs  --  npm run mlb:k-v2-public:audit
 *
 * Reports what the production K projection resolver actually did to today's
 * public payload, and fails on STRUCTURAL inconsistency only.
 *
 * The distinction matters: a row that legitimately fell back to legacy (low
 * V2 confidence, no V2 row for a late-added starter) is the fail-safe working
 * as designed and must not fail the build. What must fail is evidence that
 * two surfaces disagree -- a stored projectedKs that does not equal the value
 * its own recorded source implies, a slate mismatch, an ambiguous stable
 * identity, a non-finite/zero projection, or a frozen X edition plan whose
 * rows contradict the website they were scraped from.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  K_PROJECTION_SOURCE,
  buildV2RowIndex,
  findV2Row,
  isUsableV2Artifact,
} from "./lib/mlb-k-production-projection.mjs";
import { loadV2Artifact } from "./resolve-mlb-k-production-projection.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const V2_PATH = path.join(DATA_DIR, "k-props-v2-shadow.json");
// Where plan-mlb-x-editions.mjs writes frozen edition plans by default.
const PLAN_DIR = path.join(ROOT, "artifacts", "mlb-x-plans");

/** Projection deltas at or above this are called out for human review. */
const NOTABLE_DELTA_KS = 1.0;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(projectedKs, kLine) {
  if (projectedKs == null || kLine == null) return null;
  const edge = Number((projectedKs - kLine).toFixed(2));
  return edge > 0 ? "OVER" : edge < 0 ? "UNDER" : null;
}

function bump(counter, key) {
  if (!key) return;
  counter[key] = (counter[key] ?? 0) + 1;
}

/**
 * Finds the most recent frozen K edition plan, if the repo carries any. The
 * plan is optional -- absence is reported, never treated as an inconsistency,
 * because plans only exist after an edition has been evaluated for the slate.
 */
function loadLatestKPlan(slateDate, planDir = PLAN_DIR) {
  if (!existsSync(planDir)) return null;
  const candidates = readdirSync(planDir)
    .filter((name) => name.endsWith(".json") && name.includes("k"))
    .sort();
  for (const name of [...candidates].reverse()) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(planDir, name), "utf8"));
      if (parsed?.slateDate === slateDate) return { name, plan: parsed };
    } catch {
      // A malformed sibling plan file is not this audit's concern.
    }
  }
  return null;
}

function collectPlanRows(plan) {
  const rows = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node.selectedRows)) rows.push(...node.selectedRows);
    if (Array.isArray(node.rows) && node.contentType === "k") rows.push(...node.rows);
    for (const value of Object.values(node)) {
      if (value != null && typeof value === "object") visit(value);
    }
  };
  visit(plan);
  return rows;
}

export function auditKProductionProjection({ rawPath = RAW_PATH, v2Path = V2_PATH, planDir = PLAN_DIR } = {}) {
  if (!existsSync(rawPath)) throw new Error(`Missing public payload: ${rawPath}`);
  const payload = JSON.parse(readFileSync(rawPath, "utf8"));
  const pitchers = Array.isArray(payload?.pitchers) ? payload.pitchers : [];
  const slateDate = payload?.date ?? null;

  const { artifact, artifactValid, note } = loadV2Artifact(v2Path);
  const index = buildV2RowIndex(artifact);

  const problems = [];
  const notable = [];
  const fallbackReasons = {};
  const confidenceCounts = {};
  const deltas = [];

  let v2Rows = 0;
  let legacyFallbackRows = 0;
  let unavailableRows = 0;
  let unresolvedRows = 0;
  let slateMismatches = 0;
  let stableIdMismatches = 0;
  let directionFlips = 0;
  let invalidProjections = 0;

  for (const row of pitchers) {
    const label = `${row?.pitcher ?? "unknown"} (${row?.team ?? "?"} vs ${row?.opponent ?? "?"})`;
    const source = row?.projectionSource ?? null;
    const effective = toFiniteNumber(row?.effectiveProjectedKs);
    const published = toFiniteNumber(row?.projectedKs);
    const legacy = toFiniteNumber(row?.legacyProjectedKs);
    const v2 = toFiniteNumber(row?.v2ProjectedKs);

    if (source === K_PROJECTION_SOURCE.V2) v2Rows += 1;
    else if (source === K_PROJECTION_SOURCE.LEGACY_FALLBACK) legacyFallbackRows += 1;
    else if (source === K_PROJECTION_SOURCE.UNAVAILABLE) unavailableRows += 1;
    else unresolvedRows += 1;

    bump(fallbackReasons, row?.projectionFallbackReason);
    bump(confidenceCounts, row?.v2Confidence);

    // -- structural: published value must equal the resolved value --
    if (published !== effective) {
      problems.push(`${label}: projectedKs ${published} does not equal effectiveProjectedKs ${effective}.`);
    }
    if (published != null && (!Number.isFinite(published) || published <= 0)) {
      invalidProjections += 1;
      problems.push(`${label}: published projection ${published} is not a usable positive number.`);
    }

    // -- structural: the value must match the source it claims --
    if (source === K_PROJECTION_SOURCE.V2 && v2 != null && published != null && Math.abs(published - v2) > 1e-9) {
      problems.push(`${label}: source=v2 but published ${published} != v2ProjectedKs ${v2}.`);
    }
    if (source === K_PROJECTION_SOURCE.LEGACY_FALLBACK && legacy != null && published != null && Math.abs(published - legacy) > 1e-9) {
      problems.push(`${label}: source=legacy-fallback but published ${published} != legacyProjectedKs ${legacy}.`);
    }
    if (source === K_PROJECTION_SOURCE.V2 && !["high", "medium"].includes(row?.v2Confidence)) {
      problems.push(`${label}: source=v2 with non-production confidence ${row?.v2Confidence}.`);
    }

    // -- identity re-check against the artifact --
    if (isUsableV2Artifact(artifact) && artifact.slateDate !== slateDate) {
      slateMismatches += 1;
    } else if (isUsableV2Artifact(artifact)) {
      const match = findV2Row(index, row, slateDate);
      if (match.reason === "stable-id-mismatch") stableIdMismatches += 1;
      if (match.row && match.row.slateDate && match.row.slateDate !== slateDate) {
        slateMismatches += 1;
        problems.push(`${label}: matched a V2 row from slate ${match.row.slateDate}, not ${slateDate}.`);
      }
    }

    // -- V2 vs legacy comparison + direction flips --
    if (v2 != null && legacy != null) {
      const delta = Number((v2 - legacy).toFixed(2));
      deltas.push({ label, delta: Math.abs(delta) });
      const kLine = toFiniteNumber(row?.kLine);
      const legacyDirection = direction(legacy, kLine);
      const resolvedDirection = direction(published, kLine);
      if (legacyDirection && resolvedDirection && legacyDirection !== resolvedDirection) {
        directionFlips += 1;
        notable.push(`${label}: direction flip ${legacyDirection} -> ${resolvedDirection} (legacy ${legacy}, resolved ${published}, line ${kLine}).`);
      }
      if (Math.abs(delta) >= NOTABLE_DELTA_KS) {
        notable.push(`${label}: V2-vs-legacy delta ${delta > 0 ? "+" : ""}${delta} K (confidence ${row?.v2Confidence ?? "n/a"}).`);
      }
    }
  }

  for (const key of index.duplicateStableIds) problems.push(`Ambiguous V2 stable identity: ${key}.`);
  for (const key of index.duplicateMatchups) problems.push(`Ambiguous V2 matchup identity: ${key}.`);

  // -- frozen X plan consistency --
  const planEntry = loadLatestKPlan(slateDate, planDir);
  let planRowsChecked = 0;
  if (planEntry) {
    const byPitcher = new Map(
      pitchers
        .filter((row) => row?.pitcher)
        .map((row) => [String(row.pitcher).trim().toUpperCase(), row]),
    );
    for (const planRow of collectPlanRows(planEntry.plan)) {
      const website = byPitcher.get(String(planRow?.pitcher ?? "").trim().toUpperCase());
      if (!website) continue;
      planRowsChecked += 1;
      const frozen = toFiniteNumber(planRow?.projectedKs);
      const live = toFiniteNumber(website?.projectedKs);
      if (frozen != null && live != null && Math.abs(frozen - live) > 0.05) {
        problems.push(`Frozen plan ${planEntry.name}: ${planRow.pitcher} projection ${frozen} != website ${live}.`);
      }
      const frozenSide = String(planRow?.side ?? planRow?.direction ?? "").toUpperCase() || null;
      const liveSide = direction(live, toFiniteNumber(website?.kLine));
      if (frozenSide && liveSide && frozenSide !== liveSide) {
        problems.push(`Frozen plan ${planEntry.name}: ${planRow.pitcher} side ${frozenSide} != website ${liveSide}.`);
      }
    }
  }

  const absDeltas = deltas.map((entry) => entry.delta);
  const maxDelta = absDeltas.length ? Math.max(...absDeltas) : null;
  const avgDelta = absDeltas.length
    ? Number((absDeltas.reduce((sum, value) => sum + value, 0) / absDeltas.length).toFixed(3))
    : null;

  return {
    slateDate,
    artifactValid,
    artifactNote: note,
    totalRows: pitchers.length,
    v2Rows,
    legacyFallbackRows,
    unavailableRows,
    unresolvedRows,
    fallbackReasons,
    confidenceCounts,
    slateMismatches,
    stableIdMismatches,
    invalidProjections,
    directionFlips,
    avgAbsV2LegacyDelta: avgDelta,
    maxAbsV2LegacyDelta: maxDelta,
    planFile: planEntry?.name ?? null,
    planRowsChecked,
    notable,
    problems,
  };
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "none";
}

export function main() {
  const report = auditKProductionProjection();

  console.log("=== MLB K Projection V2 production audit ===");
  console.log(`slate                 ${report.slateDate ?? "unknown"}`);
  console.log(`V2 artifact usable    ${report.artifactValid}${report.artifactNote ? ` (${report.artifactNote})` : ""}`);
  console.log(`total rows            ${report.totalRows}`);
  console.log(`  V2                  ${report.v2Rows}`);
  console.log(`  legacy fallback     ${report.legacyFallbackRows}`);
  console.log(`  unavailable         ${report.unavailableRows}`);
  console.log(`  unresolved          ${report.unresolvedRows}`);
  console.log(`fallback reasons      ${formatCounts(report.fallbackReasons)}`);
  console.log(`confidence            ${formatCounts(report.confidenceCounts)}`);
  console.log(`slate mismatches      ${report.slateMismatches}`);
  console.log(`stable-ID mismatches  ${report.stableIdMismatches}`);
  console.log(`invalid projections   ${report.invalidProjections}`);
  console.log(`direction flips       ${report.directionFlips}`);
  console.log(`V2-vs-legacy delta    avg ${report.avgAbsV2LegacyDelta ?? "n/a"} / max ${report.maxAbsV2LegacyDelta ?? "n/a"}`);
  console.log(`frozen plan           ${report.planFile ?? "none for this slate"} (${report.planRowsChecked} rows cross-checked)`);

  if (report.notable.length) {
    console.log("\n-- review (not failures) --");
    for (const line of report.notable) console.log(`  * ${line}`);
  }

  if (report.problems.length) {
    console.error("\n-- structural inconsistencies --");
    for (const line of report.problems) console.error(`  ! ${line}`);
    process.exitCode = 1;
    return report;
  }

  console.log("\nNo structural inconsistencies. Legacy fallback rows are the fail-safe working as designed.");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[k-v2-audit] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
