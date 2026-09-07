/**
 * RESEARCH / DIAGNOSTIC ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Builds the current-slate v2 vs v3 comparison IN MEMORY and writes it only
 * under data/mlb/k-research/. It does NOT write, touch or regenerate any file in
 * public/data/mlb/, so the production artifacts and the public projection are
 * untouched by running this.
 *
 * v2 is computed by loading the real src/lib/mlb/kProjectionV2.ts through the
 * same TypeScript transpile the production generator uses, so the v2 numbers
 * here are the production numbers rather than a re-implementation.
 *
 * The market K line appears in the output for comparison only. It is not an
 * input to either model.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { buildKPropsShadowArtifact } from "../lib/mlb-k-props-v2-shadow-core.mjs";

/**
 * This worktree has no node_modules of its own, so `typescript` is resolved
 * from a sibling checkout when one is present. That is only needed to transpile
 * src/lib/mlb/kProjectionV2.ts in order to run the REAL v2 model; when it is
 * unavailable the script falls back to the v2 block already recorded in
 * public/data/mlb/k-props-v2-shadow.json, which the production generator wrote.
 * Either path yields genuine production v2 numbers -- never a re-implementation.
 */
function loadTypeScript() {
  const require = createRequire(import.meta.url);
  const candidates = [
    "typescript",
    path.join(ROOT, "..", "remix-of-bracket-brilliance", "node_modules", "typescript"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const ROOT = process.cwd();
const DATA = path.join(ROOT, "public", "data", "mlb");
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

async function loadProjectStrikeoutsV2() {
  const ts = loadTypeScript();
  if (!ts) return null;
  const source = path.join(ROOT, "src", "lib", "mlb", "kProjectionV2.ts");
  const transpiled = ts.transpileModule(readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
    fileName: source,
  });
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${encoded}`);
  if (typeof mod.projectStrikeoutsV2 !== "function") throw new Error("projectStrikeoutsV2 not found");
  return mod.projectStrikeoutsV2;
}

/**
 * Replays the v2 block the production generator already wrote for this slate,
 * keyed by the artifact's own row key. Used only when the TypeScript compiler
 * is unavailable; the values are the shipped v2 values verbatim.
 */
function buildArchivedV2Replay() {
  const file = path.join(DATA, "k-props-v2-shadow.json");
  if (!existsSync(file)) return null;
  const doc = readJson(file);
  const byKey = new Map((doc.rows ?? []).map((row) => [row.key, row.v2]));
  return { slateDate: doc.slateDate, byKey };
}

const round = (value, digits = 3) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

const side = (projected, line) => {
  if (!Number.isFinite(projected) || !Number.isFinite(line)) return null;
  if (projected > line) return "over";
  if (projected < line) return "under";
  return "neutral";
};

const liveV2 = await loadProjectStrikeoutsV2();
const archivedV2 = liveV2 ? null : buildArchivedV2Replay();
if (!liveV2 && !archivedV2) {
  throw new Error("Cannot obtain v2 projections: no TypeScript compiler and no archived shadow artifact.");
}

const rawPayload = readJson(path.join(DATA, "hr-props-raw.json"));
const detailsPayload = readJson(path.join(DATA, "strikeout-prop-details.json"));
const workloadPayload = readJson(path.join(DATA, "k-workload-shadow.json"));

if (archivedV2 && archivedV2.slateDate !== (rawPayload?.date ?? null)) {
  throw new Error(
    `Archived v2 slate ${archivedV2.slateDate} does not match the raw slate ${rawPayload?.date}; refusing to mix slates.`,
  );
}

/**
 * When replaying, the archived v2 result is looked up by the SAME detail key the
 * artifact builder computes, so a row can never be matched to another pitcher's
 * projection. A key with no archived v2 yields a null projection rather than a
 * guess.
 */
const v2Source = liveV2
  ?? ((input, context) => archivedV2.byKey.get(context?.key) ?? { modelVersion: null, projectedStrikeouts: null, projectedKRate: null, projectedBattersFaced: null, projectedInnings: null, pitcherSkillRate: null, opponentEnvironmentRate: null, matchupAdjustment: null, confidence: "insufficient", components: [], fallbacks: [], warnings: ["archived-replay-miss"] });

const artifact = buildKPropsShadowArtifact({
  rawPayload,
  workloadPayload,
  detailsPayload,
  projectStrikeoutsV2: v2Source,
  generatedAt: new Date().toISOString(),
});

const rows = artifact.rows.map((row) => {
  const v2Ks = row.v2.projectedStrikeouts;
  const v3Ks = row.v3?.projectedKs ?? null;
  const line = row.market.kLine;
  const v2Side = side(v2Ks, line);
  const v3Side = side(v3Ks, line);
  return {
    pitcher: row.pitcher.name,
    team: row.pitcher.team,
    opponent: row.pitcher.opponent,
    isHome: row.game.pitcherIsHome,
    kLine: line,
    v2Ks: round(v2Ks),
    v3Ks: round(v3Ks),
    deltaKs: v2Ks != null && v3Ks != null ? round(v3Ks - v2Ks) : null,
    v2IP: round(row.v2.projectedInnings),
    v3IP: round(row.v3?.finalProjectedIP),
    v2BF: round(row.v2.projectedBattersFaced),
    v3BF: round(row.v3?.projectedBF),
    seasonIPPerStart: round(row.v3?.seasonIPPerStart),
    l10IPPerStart: round(row.v3?.last10IPPerStart),
    l5IPPerStart: round(row.v3?.last5IPPerStart),
    seasonBF: row.v3?.seasonBF ?? null,
    alpha: round(row.v3?.alpha, 4),
    alphaSource: row.v3?.alphaSource ?? null,
    v2KRate: round(row.v2.projectedKRate, 4),
    v3KRate: round(row.v3?.projectedKRate, 4),
    v2Side,
    v3Side,
    directionFlip: v2Side != null && v3Side != null && v2Side !== v3Side,
    flags: row.v3?.flags ?? [],
  };
});

const withBoth = rows.filter((r) => r.deltaKs !== null);
const byDelta = [...withBoth].sort((a, b) => b.deltaKs - a.deltaKs || a.pitcher.localeCompare(b.pitcher));

const payload = {
  study: "mlb-k-projection-v3-workload-model",
  section: "current-slate-diagnostic",
  generatedAt: artifact.generatedAt,
  slateDate: artifact.slateDate,
  note:
    "DIAGNOSTIC ONLY. Computed in memory and written only under data/mlb/k-research/; nothing under " +
    "public/data/mlb/ was modified. The market line is shown for comparison and is not an input to either model.",
  v2Source: liveV2 ? "live src/lib/mlb/kProjectionV2.ts" : "archived public/data/mlb/k-props-v2-shadow.json",
  totals: {
    rows: rows.length,
    v3Computed: withBoth.length,
    directionFlips: withBoth.filter((r) => r.directionFlip).length,
    meanDeltaKs: withBoth.length ? round(withBoth.reduce((s, r) => s + r.deltaKs, 0) / withBoth.length) : null,
    meanV2Ks: withBoth.length ? round(withBoth.reduce((s, r) => s + r.v2Ks, 0) / withBoth.length) : null,
    meanV3Ks: withBoth.length ? round(withBoth.reduce((s, r) => s + r.v3Ks, 0) / withBoth.length) : null,
  },
  diagnostics: artifact.diagnostics,
  rows,
  largestPositiveDeltas: byDelta.slice(0, 5),
  largestNegativeDeltas: byDelta.slice(-5).reverse(),
  linesAtLeast6_5: withBoth.filter((r) => r.kLine >= 6.5),
  linesAtLeast7_5: withBoth.filter((r) => r.kLine >= 7.5),
  directionFlips: withBoth.filter((r) => r.directionFlip),
};

writeFileSync(path.join(OUT, "current-slate-diagnostic.json"), `${JSON.stringify(payload, null, 2)}\n`);

const headers = [
  "pitcher", "opponent", "kLine", "v2Ks", "v3Ks", "deltaKs", "v2IP", "v3IP",
  "seasonIPPerStart", "l10IPPerStart", "l5IPPerStart", "alpha", "v2Side", "v3Side", "directionFlip",
];
const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(
  path.join(OUT, "current-slate-diagnostic.csv"),
  `${[headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n")}\n`,
);

const pad = (v, n) => String(v ?? "-").padStart(n);
console.log(`SLATE ${artifact.slateDate}  rows=${rows.length}  v3Computed=${withBoth.length}  flips=${payload.totals.directionFlips}`);
console.log(
  "pitcher".padEnd(22) + "opp".padEnd(5) + pad("line", 5) + pad("v2Ks", 7) + pad("v3Ks", 7) + pad("delta", 7) +
  pad("v2IP", 6) + pad("v3IP", 6) + pad("seas", 6) + pad("L10", 6) + pad("L5", 6) + pad("alpha", 7) + "  v2/v3",
);
for (const r of rows) {
  console.log(
    String(r.pitcher ?? "").slice(0, 21).padEnd(22) + String(r.opponent ?? "").padEnd(5) +
    pad(r.kLine, 5) + pad(r.v2Ks, 7) + pad(r.v3Ks, 7) + pad(r.deltaKs, 7) +
    pad(r.v2IP, 6) + pad(r.v3IP, 6) + pad(r.seasonIPPerStart, 6) + pad(r.l10IPPerStart, 6) + pad(r.l5IPPerStart, 6) +
    pad(r.alpha, 7) + "  " + `${r.v2Side ?? "-"}/${r.v3Side ?? "-"}` + (r.directionFlip ? "  <-- FLIP" : ""),
  );
}
