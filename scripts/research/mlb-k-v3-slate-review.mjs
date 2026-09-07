/**
 * RESEARCH / DIAGNOSTIC ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Full current-slate v2 vs v3 review against the REGENERATED detail artifact,
 * with per-row window provenance and an approximate attribution of every large
 * change into workload, BF/IP and K-rate components.
 *
 * Reads public/data/mlb/ but writes only under data/mlb/k-research/. The market
 * line is reported for comparison and is never an input to either model.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { buildKPropsShadowArtifact } from "../lib/mlb-k-props-v2-shadow-core.mjs";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "public", "data", "mlb");
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function loadTypeScript() {
  const require = createRequire(import.meta.url);
  for (const candidate of ["typescript", path.join(ROOT, "..", "remix-of-bracket-brilliance", "node_modules", "typescript")]) {
    try {
      return require(candidate);
    } catch {
      /* try next */
    }
  }
  throw new Error("typescript is required to run the real v2 model");
}

async function loadProjectStrikeoutsV2() {
  const ts = loadTypeScript();
  const source = path.join(ROOT, "src", "lib", "mlb", "kProjectionV2.ts");
  const transpiled = ts.transpileModule(readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
    fileName: source,
  });
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${encoded}`);
  return mod.projectStrikeoutsV2;
}

const r = (value, digits = 3) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

const side = (projected, line) => {
  if (!Number.isFinite(projected) || !Number.isFinite(line)) return null;
  return projected > line ? "over" : projected < line ? "under" : "neutral";
};

/**
 * Which windows actually backed this row's neutral baseline. Distinguishes a
 * genuine full-history projection from one leaning on a fallback, which is the
 * whole point of regenerating the detail artifact.
 */
function windowProvenance(detail, v3) {
  if (v3 == null || (v3.flags ?? []).some((f) => String(f).startsWith("ROLE_OUT_OF_V3_SCOPE_"))) {
    return "out-of-scope role";
  }
  if (v3.projectedKs == null) return "insufficient history";
  const tenLen = Array.isArray(detail?.pitcherLast10Starts) ? detail.pitcherLast10Starts.length : 0;
  const hasSeason = v3.seasonIPPerStart != null;
  const l10n = v3.inputs?.last10Sample ?? 0;
  if (!hasSeason) return "no season split";
  if (tenLen === 0) return "L5-only fallback";
  if (l10n >= 6) return "full season + L10 + L5";
  if (l10n >= 3) return `partial L10 (${l10n} starts)`;
  return `thin history (${l10n} starts)`;
}

/**
 * Approximate attribution of the v3-minus-v2 strikeout change into three
 * additive pieces, evaluated by walking one factor at a time from the v2 point
 * to the v3 point:
 *
 *   A workload  = dKRate_v2 x (BF at v3 innings, v2 BF/IP) - v2 Ks
 *   B BF/IP     = effect of moving BF/IP from v2's implied rate to v3's
 *   C K rate    = effect of moving the K rate from v2's to v3's, at v3 BF
 *
 * The three sum to the total by construction. It is a decomposition of a
 * product, so the split between A and B depends on the order chosen; the order
 * here is workload first because that is the change under review.
 */
function attributeChange(row) {
  const v2 = row.v2;
  const v3 = row.v3;
  if (!v3 || v3.projectedKs == null || v2.projectedStrikeouts == null) return null;
  const v2Ip = v2.projectedInnings;
  const v2Bf = v2.projectedBattersFaced;
  const v3Ip = v3.finalProjectedIP;
  const v3Bf = v3.projectedBF;
  const v2Rate = v2.projectedKRate;
  const v3Rate = v3.projectedKRate;
  if (![v2Ip, v2Bf, v3Ip, v3Bf, v2Rate, v3Rate].every(Number.isFinite)) return null;

  const v2BfPerIp = v2Ip > 0 ? v2Bf / v2Ip : null;
  if (!Number.isFinite(v2BfPerIp)) return null;

  const bfAfterIpChange = v3Ip * v2BfPerIp;
  const workload = v2Rate * (bfAfterIpChange - v2Bf);
  const bfPerIp = v2Rate * (v3Bf - bfAfterIpChange);
  const kRate = (v3Rate - v2Rate) * v3Bf;
  return {
    workloadKs: r(workload),
    bfPerIpKs: r(bfPerIp),
    kRateKs: r(kRate),
    totalKs: r(workload + bfPerIp + kRate),
    v2BfPerIp: r(v2BfPerIp),
    v3BfPerIp: r(v3.expectedBFPerIP),
  };
}

const rawPayload = readJson(path.join(DATA, "hr-props-raw.json"));
const detailsPayload = readJson(path.join(DATA, "strikeout-prop-details.json"));
const workloadPayload = readJson(path.join(DATA, "k-workload-shadow.json"));

const artifact = buildKPropsShadowArtifact({
  rawPayload,
  workloadPayload,
  detailsPayload,
  projectStrikeoutsV2: await loadProjectStrikeoutsV2(),
  generatedAt: new Date().toISOString(),
});

const detailByKey = new Map((detailsPayload.details ?? []).map((d) => [d.key, d]));
const workloadById = new Map((workloadPayload.pitchers ?? []).map((p) => [String(p.pitcherId), p]));

const rows = artifact.rows.map((row) => {
  const detail = detailByKey.get(row.key) ?? null;
  const wl = workloadById.get(String(row.pitcher.id)) ?? null;
  const v3 = row.v3 ?? null;
  const v2Ks = row.v2.projectedStrikeouts;
  const v3Ks = v3?.projectedKs ?? null;
  const line = row.market.kLine;
  const v2Side = side(v2Ks, line);
  const v3Side = side(v3Ks, line);
  return {
    pitcher: row.pitcher.name,
    team: row.pitcher.team,
    opponent: row.pitcher.opponent,
    isHome: row.game.pitcherIsHome,
    role: wl?.role ?? null,
    kLine: line,
    seasonIPPerStart: r(v3?.seasonIPPerStart),
    l10IPPerStart: r(v3?.last10IPPerStart),
    l5IPPerStart: r(v3?.last5IPPerStart),
    rawL10IP: r(v3?.rawLast10IP),
    rawL5IP: r(v3?.rawLast5IP),
    v2IP: r(row.v2.projectedInnings),
    v3NeutralIP: r(v3?.neutralIP),
    v3RegimeAdj: r(v3?.regimeAdjustment),
    v3FinalIP: r(v3?.finalProjectedIP),
    v2BF: r(row.v2.projectedBattersFaced),
    v3BF: r(v3?.projectedBF),
    v3BFPerIP: r(v3?.expectedBFPerIP),
    seasonBF: v3?.seasonBF ?? null,
    seasonBFSource: v3?.seasonBFSource ?? null,
    alpha: r(v3?.alpha, 4),
    pitcherSkillRate: r(v3?.pitcherSkillRate, 4),
    matchupAdjustment: r(v3?.matchupAdjustment, 4),
    v2KRate: r(row.v2.projectedKRate, 4),
    v3KRate: r(v3?.projectedKRate, 4),
    v2Ks: r(v2Ks),
    v3Ks: r(v3Ks),
    deltaKs: v2Ks != null && v3Ks != null ? r(v3Ks - v2Ks) : null,
    absDeltaKs: v2Ks != null && v3Ks != null ? Math.abs(r(v3Ks - v2Ks)) : null,
    v2Side,
    v3Side,
    directionFlip: v2Side != null && v3Side != null && v2Side !== v3Side,
    windowProvenance: windowProvenance(detail, v3),
    last10Available: Array.isArray(detail?.pitcherLast10Starts) ? detail.pitcherLast10Starts.length : 0,
    last5Available: Array.isArray(detail?.pitcherLastFiveStarts) ? detail.pitcherLastFiveStarts.length : 0,
    seasonGamesStarted: v3?.inputs?.seasonGamesStarted ?? null,
    attribution: attributeChange(row),
    flags: v3?.flags ?? [],
  };
});

const sorted = [...rows].sort((a, b) => (b.absDeltaKs ?? -1) - (a.absDeltaKs ?? -1) || a.pitcher.localeCompare(b.pitcher));
const withBoth = rows.filter((row) => row.deltaKs !== null);

const provenanceCounts = rows.reduce((acc, row) => {
  acc[row.windowProvenance] = (acc[row.windowProvenance] ?? 0) + 1;
  return acc;
}, {});

const payload = {
  study: "mlb-k-projection-v3-workload-model",
  section: "regenerated-current-slate-review",
  generatedAt: artifact.generatedAt,
  slateDate: artifact.slateDate,
  detailsGeneratedAt: detailsPayload.generatedAt ?? null,
  note:
    "Computed in memory against the REGENERATED detail artifact and written only under " +
    "data/mlb/k-research/. The market line is reported for comparison and is not an input.",
  totals: {
    rows: rows.length,
    v3Computed: withBoth.length,
    directionFlips: withBoth.filter((row) => row.directionFlip).length,
    changesAtLeastHalfK: withBoth.filter((row) => row.absDeltaKs >= 0.5).length,
    meanDeltaKs: withBoth.length ? r(withBoth.reduce((s, row) => s + row.deltaKs, 0) / withBoth.length) : null,
  },
  windowProvenanceCounts: provenanceCounts,
  diagnostics: artifact.diagnostics,
  rowsByAbsDelta: sorted,
  largeChanges: sorted.filter((row) => (row.absDeltaKs ?? 0) >= 0.5),
  directionFlips: withBoth.filter((row) => row.directionFlip),
  linesAtLeast6_5: rows.filter((row) => row.kLine >= 6.5),
  linesAtLeast7_5: rows.filter((row) => row.kLine >= 7.5),
  nonStarterRoles: rows.filter((row) => row.role && row.role !== "starter"),
};

writeFileSync(path.join(OUT, "regenerated-slate-review.json"), `${JSON.stringify(payload, null, 2)}\n`);

const headers = [
  "pitcher", "opponent", "role", "kLine", "seasonIPPerStart", "l10IPPerStart", "l5IPPerStart",
  "v2IP", "v3NeutralIP", "v3FinalIP", "v2BF", "v3BF", "seasonBF", "alpha",
  "v2KRate", "v3KRate", "v2Ks", "v3Ks", "deltaKs", "v2Side", "v3Side", "windowProvenance",
];
const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(
  path.join(OUT, "regenerated-slate-review.csv"),
  `${[headers.join(","), ...sorted.map((row) => headers.map((h) => cell(row[h])).join(","))].join("\n")}\n`,
);

const p = (v, n) => String(v ?? "-").padStart(n);
console.log(`SLATE ${artifact.slateDate}   details generated ${detailsPayload.generatedAt ?? "?"}`);
console.log(`rows=${rows.length}  v3Computed=${withBoth.length}  |delta|>=0.5: ${payload.totals.changesAtLeastHalfK}  flips=${payload.totals.directionFlips}`);
console.log("\nWINDOW PROVENANCE:");
for (const [key, count] of Object.entries(provenanceCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${key}`);
}
console.log(
  "\n" + "pitcher".padEnd(21) + "opp".padEnd(5) + p("line", 5) + p("seas", 6) + p("L10", 6) + p("L5", 6) +
  p("v2IP", 6) + p("v3IP", 6) + p("v2BF", 6) + p("v3BF", 6) + p("alpha", 7) + p("v2Ks", 7) + p("v3Ks", 7) + p("delta", 7) + "  side",
);
for (const row of sorted) {
  console.log(
    String(row.pitcher ?? "").slice(0, 20).padEnd(21) + String(row.opponent ?? "").padEnd(5) +
    p(row.kLine, 5) + p(row.seasonIPPerStart, 6) + p(row.l10IPPerStart, 6) + p(row.l5IPPerStart, 6) +
    p(row.v2IP, 6) + p(row.v3FinalIP, 6) + p(row.v2BF, 6) + p(row.v3BF, 6) + p(row.alpha, 7) +
    p(row.v2Ks, 7) + p(row.v3Ks, 7) + p(row.deltaKs, 7) +
    "  " + `${row.v2Side ?? "-"}/${row.v3Side ?? "-"}` + (row.directionFlip ? " FLIP" : ""),
  );
}
