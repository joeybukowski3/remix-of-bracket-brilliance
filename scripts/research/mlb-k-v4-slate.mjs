/**
 * mlb-k-v4-slate.mjs -- RESEARCH / COMPARISON ONLY.
 *
 * Runs V4 over a slate's already-generated production artifacts and prints the
 * V2 / V3 / V4 comparison. Writes no public artifact and mutates nothing.
 *
 * Sportsbook lines are read ONLY after every projection is computed, purely to
 * report edge. No line reaches the model.
 *
 * Usage:
 *   node scripts/research/mlb-k-v4-slate.mjs --live-dir=.v4-live [--json=out.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildV4Projection } from "../lib/mlb-k-v4-production-adapter.mjs";

const ROOT = process.cwd();
const arg = (prefix, fallback = null) =>
  process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;

const liveDir = path.resolve(ROOT, arg("--live-dir=", ".v4-live"));
const read = (file) => JSON.parse(readFileSync(path.join(liveDir, file), "utf8"));

const details = read("strikeout-prop-details.json");
const shadow = read("k-props-v2-shadow.json");
const workload = read("k-workload-shadow.json");
const raw = read("hr-props-raw.json");
const wrcTable = read("team-wrc-plus.json");
const startLog = JSON.parse(
  readFileSync(path.join(ROOT, "data/mlb/k-research/v3-workload-model/start-log.json"), "utf8"),
);

const slateDate = shadow.slateDate;
const detailByKey = new Map((details.details ?? []).map((row) => [row.key, row]));
const workloadRows = Array.isArray(workload?.rows) ? workload.rows : (workload?.pitchers ?? []);
const workloadById = new Map(workloadRows.map((row) => [String(row?.pitcherId ?? ""), row]));
const rawById = new Map((raw.pitchers ?? []).map((row) => [String(row?.pitcherId ?? ""), row]));

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const fx = (value, digits = 2) => (value === null || value === undefined ? "-" : Number(value).toFixed(digits));

const results = [];
for (const row of shadow.rows ?? []) {
  const detail = detailByKey.get(row.key) ?? null;
  const pitcherId = String(row?.pitcher?.id ?? "");
  const workloadRow = workloadById.get(pitcherId) ?? null;
  const rawRow = rawById.get(pitcherId) ?? null;

  const v4 = buildV4Projection({ detail, v2Row: row, workloadRow, startLog, wrcTable, slateDate });

  results.push({
    pitcher: row.pitcher.name,
    team: row.pitcher.team,
    opponent: row.pitcher.opponent,
    role: workloadRow?.role ?? null,
    // market is attached AFTER projection, for reporting only
    line: num(row?.market?.kLine),
    v2Ks: num(row?.v2?.projectedStrikeouts),
    v3Ks: num(row?.v3?.projectedKs),
    v4Ks: num(v4.projectedKs),
    publishedKs: num(rawRow?.projectedKs),
    publishedSource: rawRow?.projectionSource ?? null,
    v2IP: num(row?.v2?.projectedInnings),
    v3IP: num(row?.v3?.finalProjectedIP),
    v4IP: num(v4.finalProjectedIP),
    v4KPerIP: num(v4.finalProjectedKPerIP),
    v4SeasonIP: num(v4.seasonIPPerStart),
    v4SeasonKPerIP: num(v4.seasonKPerIP),
    v4NeutralIP: num(v4.neutralPitcherIP),
    v4NeutralKPerIP: num(v4.neutralPitcherKPerIP),
    oppIPFactorRaw: num(v4.rawOpponentIPFactor),
    oppIPFactor: num(v4.shrunkOpponentIPFactor),
    oppKFactorRaw: num(v4.rawOpponentKFactor),
    oppKFactor: num(v4.shrunkOpponentKFactor),
    oppKEnv: num(v4.opponentKEnvironment),
    oppConfidence: num(v4.opponentConfidence),
    oppUsableGames: num(v4.opponentUsableGames),
    v4Confidence: v4.confidence,
    warnings: v4.warnings ?? [],
    v4Block: v4,
  });
}

const withLine = results.filter((r) => r.line !== null);
const stat = (rows, key) => {
  const values = rows.map((r) => r[key]).filter((v) => v !== null);
  if (!values.length) return { n: 0 };
  const edges = rows.filter((r) => r[key] !== null && r.line !== null).map((r) => r[key] - r.line);
  const mean = edges.reduce((s, v) => s + v, 0) / edges.length;
  const sorted = [...edges].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    n: edges.length,
    over: edges.filter((e) => e > 0).length,
    under: edges.filter((e) => e < 0).length,
    pctOver: (100 * edges.filter((e) => e > 0).length) / edges.length,
    mean,
    median,
  };
};

console.log(`\nSlate ${slateDate} -- V2 / V3 / V4 (${results.length} rows)\n`);
const table = results
  .slice()
  .sort((a, b) => (b.v4Ks ?? -99) - (b.line ?? 0) - ((a.v4Ks ?? -99) - (a.line ?? 0)))
  .map((r) => ({
    Pitcher: r.pitcher,
    Opp: r.opponent,
    Line: r.line,
    V2: fx(r.v2Ks),
    V3: fx(r.v3Ks),
    V4: fx(r.v4Ks),
    "V2 IP": fx(r.v2IP),
    "V3 IP": fx(r.v3IP),
    "V4 IP": fx(r.v4IP),
    "V4 K/IP": fx(r.v4KPerIP, 3),
    "oppIP": fx(r.oppIPFactor, 3),
    "oppK": fx(r.oppKFactor, 3),
    "V4 edge": r.v4Ks !== null && r.line !== null ? fx(r.v4Ks - r.line) : "-",
  }));
console.table(table);

for (const [label, key] of [["V2", "v2Ks"], ["V3", "v3Ks"], ["V4", "v4Ks"]]) {
  const s = stat(withLine, key);
  console.log(
    `${label}: n=${s.n} over=${s.over} under=${s.under} %over=${s.pctOver?.toFixed(1)} meanEdge=${s.mean?.toFixed(3)} medianEdge=${s.median?.toFixed(3)}`,
  );
}

const jsonOut = arg("--json=");
if (jsonOut) {
  writeFileSync(path.resolve(ROOT, jsonOut), `${JSON.stringify({ slateDate, results }, null, 2)}\n`);
  console.log(`\nWrote ${jsonOut}`);
}
