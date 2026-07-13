/**
 * mlb-hr-bridge-shadow-report.ts — Phase 1 shadow comparison report
 *
 * Usage: npx tsx scripts/mlb-hr-bridge-shadow-report.ts
 *
 * Reads (checked-in fixtures only — never calls live providers):
 *   public/data/mlb/hr-props-raw.json
 *   public/data/mlb/model-reference-ranges/hr-bridge-v1.json
 *
 * Writes (artifacts/ is gitignored; nothing transient is committed):
 *   artifacts/hr-bridge-shadow-comparison-<slateDate>.json
 *   artifacts/hr-bridge-shadow-comparison-<slateDate>.md
 *
 * Compares the production slate-relative `hrScore`/`hrScoreRank` with the
 * shadow bridge Absolute Score / shadow slate rank. Does NOT touch any
 * production data file. Neither number is a probability.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parseReferenceRangeArtifact } from "@/lib/mlb/analytics/referenceRanges";
import { computeHrShadowRows, type HrShadowBatterInput } from "@/lib/mlb/analytics/shadow";
import { HR_BRIDGE_MODEL } from "@/lib/mlb/analytics/hrBridgeModel";

const root = process.cwd();
const payloadPath = resolve(root, "public/data/mlb/hr-props-raw.json");
const artifactPath = resolve(root, "public/data/mlb/model-reference-ranges/hr-bridge-v1.json");

const rawPayload = JSON.parse(readFileSync(payloadPath, "utf8")) as {
  date: string;
  generatedAt: string;
  games: Array<{ gameKey: string; roofType: string }>;
  batters: Array<Record<string, unknown>>;
};
const rangeArtifact = parseReferenceRangeArtifact(
  JSON.parse(readFileSync(artifactPath, "utf8")),
);

// Minimal raw-row parsing (the page normalizer lives in a React module the
// plain tsx runtime cannot import; the generator field names match the
// registry's dailyRowField names directly).
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

type ReportRow = HrShadowBatterInput & {
  playerId: number | null;
  player: string;
  team: string;
  hrScore: number;
  hrScoreRank: number;
};

const batters: ReportRow[] = rawPayload.batters
  .map((b) => ({
    gameKey: String(b.gameKey ?? ""),
    playerId: num(b.playerId),
    player: String(b.player ?? ""),
    team: String(b.team ?? ""),
    hrScore: num(b.hrScore) ?? NaN,
    hrScoreRank: num(b.hrScoreRank) ?? NaN,
    barrelRate: num(b.barrelRate),
    hardHitRate: num(b.hardHitRate),
    xba: num(b.xba),
    whiffRate: num(b.whiffRate),
    last7HR: num(b.last7HR),
    last30HR: num(b.last30HR),
    opposingPitcherHrVs: num(b.opposingPitcherHrVs),
    parkFactor: num(b.parkFactor),
    weatherBoost: num(b.weatherBoost),
  }))
  .filter((b) => b.player && Number.isFinite(b.hrScore) && Number.isFinite(b.hrScoreRank));

if (batters.length === 0) {
  throw new Error("Fixture payload produced zero comparable batter rows.");
}

const payload = { date: rawPayload.date, generatedAt: rawPayload.generatedAt };
const roofByGameKey = new Map(
  (rawPayload.games ?? []).map((g) => [g.gameKey, g.roofType] as const),
);
const shadowRows = computeHrShadowRows(batters, rangeArtifact, roofByGameKey);

const comparison = shadowRows
  .map((row) => ({
    playerId: row.playerId,
    player: row.player,
    team: row.team,
    oldHrScore: row.hrScore,
    oldHrScoreRank: row.hrScoreRank,
    shadowAbsoluteScore: row.shadowAbsoluteScore,
    shadowSlateRank: row.shadowSlateRank,
    scoreDelta:
      row.shadowAbsoluteScore == null
        ? null
        : Number((row.shadowAbsoluteScore - row.hrScore).toFixed(1)),
    rankDelta: row.shadowSlateRank == null ? null : row.hrScoreRank - row.shadowSlateRank,
    completenessPercent: row.shadowCompleteness,
    status: row.shadowScoreStatus,
    missingMetrics: row.shadowMissingMetrics,
  }))
  .sort((a, b) => (a.oldHrScoreRank ?? 0) - (b.oldHrScoreRank ?? 0));

const scored = comparison.filter((r) => r.shadowAbsoluteScore != null);
const deltas = scored.map((r) => r.scoreDelta as number);
const rankDeltas = scored.map((r) => Math.abs(r.rankDelta as number));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const summary = {
  slateDate: payload.date,
  generatedAt: payload.generatedAt,
  model: {
    modelId: HR_BRIDGE_MODEL.modelId,
    modelVersion: HR_BRIDGE_MODEL.modelVersion,
    scoreVersion: HR_BRIDGE_MODEL.scoreVersion,
    rangeArtifactVersion: rangeArtifact.artifactVersion,
  },
  rows: comparison.length,
  scoredRows: scored.length,
  suppressedRows: comparison.length - scored.length,
  meanScoreDelta: Number(mean(deltas).toFixed(2)),
  maxAbsScoreDelta: deltas.length ? Number(Math.max(...deltas.map(Math.abs)).toFixed(1)) : null,
  meanAbsRankDelta: Number(mean(rankDeltas).toFixed(2)),
  note: "Deltas are expected for three reasons: (1) the shadow score replaces same-slate percentile blending and same-slate min-max with versioned fixed ranges; (2) it substitutes neutral values for missing metrics instead of renormalizing remaining weights; (3) production hrScore additionally applies a pitcher xERA multiplier and regression adjustment AFTER its weighted blend, which the bridge intentionally does not replicate. Neither score is a probability.",
};

const outDir = resolve(root, "artifacts");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const base = resolve(outDir, `hr-bridge-shadow-comparison-${payload.date}`);

writeFileSync(`${base}.json`, JSON.stringify({ summary, comparison }, null, 2));

const top = comparison.slice(0, 25);
const md = [
  `# HR bridge shadow comparison — ${payload.date}`,
  "",
  `Model: \`${summary.model.modelId}@${summary.model.modelVersion}\` (${summary.model.scoreVersion}, ranges \`${summary.model.rangeArtifactVersion}\`)`,
  "",
  `Rows: ${summary.rows} · scored: ${summary.scoredRows} · suppressed: ${summary.suppressedRows}`,
  `Mean score delta: ${summary.meanScoreDelta} · max |delta|: ${summary.maxAbsScoreDelta} · mean |rank delta|: ${summary.meanAbsRankDelta}`,
  "",
  "| Old rank | Player | Old hrScore | Shadow score | Shadow rank | Δ score | Δ rank | Completeness | Missing |",
  "|---|---|---|---|---|---|---|---|---|",
  ...top.map(
    (r) =>
      `| ${r.oldHrScoreRank} | ${r.player} | ${r.oldHrScore} | ${r.shadowAbsoluteScore ?? "—"} | ${r.shadowSlateRank ?? "—"} | ${r.scoreDelta ?? "—"} | ${r.rankDelta ?? "—"} | ${r.completenessPercent}% | ${r.missingMetrics.join(", ") || "—"} |`,
  ),
  "",
  `> ${summary.note}`,
  "",
].join("\n");

writeFileSync(`${base}.md`, md);

console.log(`Shadow comparison written to ${base}.{json,md}`);
console.log(JSON.stringify(summary, null, 2));
