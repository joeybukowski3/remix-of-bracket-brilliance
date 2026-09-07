// RESEARCH ONLY — no production artifact is written or mutated.
// Week-1 final refresh model: JKB v0.4 board vs Steve Makinen's post-preseason
// VSiN power ratings (2026 VSiN NFL Betting Guide 2.0, p29), plus the proposed
// adjustment set derived from the p30-45 team previews.
import fs from "node:fs";
import { join } from "node:path";

const pr = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-power-ratings-v04.json", "utf8"));
const pj = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-matchup-metrics.json", "utf8"));
const games = JSON.parse(fs.readFileSync("public/data/nfl/2026/games.json", "utf8")).games;

const K = 0.24, HFA = 2.0;

/** VSiN p29, Steve Makinen post-preseason power ratings. Benchmark only — never an input. */
const VSIN = {
  lar: 29.5, sea: 29.5, bal: 28.5, buf: 28.5, sf: 27.5, den: 27.0, ne: 27.0, phi: 27.0,
  gb: 26.5, chi: 26.0, det: 26.0, kc: 26.0, hou: 24.5, lac: 24.5, cin: 24.0, dal: 24.0,
  jax: 24.0, ind: 23.0, min: 23.0, pit: 23.0, tb: 23.0, wsh: 23.0, no: 22.5, car: 22.0,
  nyg: 22.0, atl: 21.5, cle: 20.5, ten: 20.5, lv: 19.5, mia: 18.5, nyj: 18.5, ari: 17.5,
};

/** Proposed changes: [component, oldValue, newValue, confidence, source page, reason]. */
const PROPOSED = {
  ind: [["personnelAdjustment", 0, -2.0], ["returningInjuryAdjustment", 0, +0.5]],
  atl: [["personnelAdjustment", +2.5, 0.0]],
  ne:  [["personnelAdjustment", +2.5, +1.0]],
  car: [["personnelAdjustment", 0, -1.5]],
  hou: [["personnelAdjustment", 0, -1.0]],
  wsh: [["personnelAdjustment", 0, -1.0]],
  no:  [["personnelAdjustment", 0, -0.75]],
  bal: [["personnelAdjustment", +1.5, +1.0]],
  tb:  [["returningInjuryAdjustment", 0, +0.5]],
  dal: [["personnelAdjustment", 0, +0.5]],
};

const rows = pr.teams.map((t) => {
  const delta = (PROPOSED[t.abbr] ?? []).reduce((s, [, oldV, newV]) => s + (newV - oldV), 0);
  return { abbr: t.abbr, ABBR: t.abbr.toUpperCase(), before: t.rating2026, delta, after: t.rating2026 + delta, c: t.components };
});

function rankMap(pairs) {
  const s = [...pairs].sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const m = new Map();
  s.forEach((p, i) => m.set(p.k, i + 1));
  return m;
}
const rkBefore = rankMap(rows.map((r) => ({ k: r.abbr, v: r.before })));
const rkAfter = rankMap(rows.map((r) => ({ k: r.abbr, v: r.after })));
const rkVsin = rankMap(rows.map((r) => ({ k: r.abbr, v: VSIN[r.abbr] })));
rows.forEach((r) => { r.rB = rkBefore.get(r.abbr); r.rA = rkAfter.get(r.abbr); r.rV = rkVsin.get(r.abbr); });

const spearman = (a, b) => 1 - (6 * a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)) / (32 * (32 * 32 - 1));
const mad = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

console.log("=== 3. JKB vs VSiN rank agreement ===");
console.log("Spearman  before:", spearman(rows.map((r) => r.rB), rows.map((r) => r.rV)).toFixed(3),
            "  after:", spearman(rows.map((r) => r.rA), rows.map((r) => r.rV)).toFixed(3));
console.log("Mean abs rank diff  before:", mad(rows.map((r) => r.rB), rows.map((r) => r.rV)).toFixed(2),
            "  after:", mad(rows.map((r) => r.rA), rows.map((r) => r.rV)).toFixed(2));

console.log("\n=== 4. Largest JKB-vs-VSiN rank disagreements (before) ===");
console.log("(positive diff = JKB rates the team HIGHER than VSiN does)");
[...rows].sort((a, b) => (a.rV - a.rB) - (b.rV - b.rB)).forEach((r) => {
  const d = r.rV - r.rB;
  if (Math.abs(d) >= 5) console.log(`  ${r.ABBR.padEnd(4)} JKB#${String(r.rB).padStart(2)} VSiN#${String(r.rV).padStart(2)} (${VSIN[r.abbr]})  diff ${d > 0 ? "+" : ""}${d}`);
});

console.log("\n=== 11. Proposed changes and league centering ===");
const netInj = rows.reduce((s, r) => s + r.delta, 0);
console.log(`league avg rating before = ${(rows.reduce((s, r) => s + r.before, 0) / 32).toFixed(3)}`);
console.log(`league avg rating after  = ${(rows.reduce((s, r) => s + r.after, 0) / 32).toFixed(3)}`);
console.log(`net injection = ${netInj.toFixed(2)} OVR across 32 teams = ${(netInj / 32).toFixed(3)} mean`);
console.log("NOTE: a uniform re-centering shift is EXACTLY spread-neutral (spreads use differences only).");

console.log("\n=== 10/11. Current vs proposed ratings and ranks ===");
console.log("ABBR  before  rank |  delta |  after  rank | rankMove | VSiN#");
[...rows].sort((a, b) => a.rB - b.rB).forEach((r) => {
  const mv = r.rB - r.rA;
  console.log(
    r.ABBR.padEnd(5), r.before.toFixed(2).padStart(6), String(r.rB).padStart(5), "|",
    (r.delta === 0 ? "  --  " : (r.delta > 0 ? "+" : "") + r.delta.toFixed(2)).padStart(6), "|",
    r.after.toFixed(2).padStart(6), String(r.rA).padStart(5), "|",
    (mv === 0 ? "     -" : (mv > 0 ? `  +${mv}` : `  ${mv}`)).padStart(6), "|",
    String(r.rV).padStart(5)
  );
});

// ---- Week 1 spreads ----
function board(key) {
  const vals = new Map(rows.map((r) => [r.abbr, r[key]]));
  const avg = [...vals.values()].reduce((a, b) => a + b, 0) / 32;
  return new Map([...vals].map(([a, v]) => [a, (v - avg) * K]));
}
const bB = board("before"), bA = board("after");
const w1 = games.filter((g) => g.week === 1 && g.seasonType === "REG");
console.log(`\n=== 12. Week 1 projected spreads (${w1.length} games), formula unchanged ===`);
console.log("(positive = home favored by N points)");
console.log("matchup         current  proposed   change  flag");
const moves = [];
for (const g of w1) {
  const m = (b) => b.get(g.homeAbbr) - b.get(g.awayAbbr) + (g.neutralSite ? 0 : HFA);
  const a = m(bB), b = m(bA), d = b - a;
  moves.push({ g: `${g.awayAbbr.toUpperCase()}@${g.homeAbbr.toUpperCase()}`, d });
  const flag = Math.abs(d) > 2 ? ">2 PT" : Math.abs(d) > 1 ? ">1 pt" : Math.abs(d) > 0.5 ? ">0.5" : "";
  console.log(`${(g.awayAbbr.toUpperCase() + " @ " + g.homeAbbr.toUpperCase()).padEnd(14)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(9)} ${((d >= 0 ? "+" : "") + d.toFixed(2)).padStart(8)}  ${flag}`);
}
console.log(`\n>2.0 pt moves: ${moves.filter((x) => Math.abs(x.d) > 2).map((x) => x.g).join(", ") || "none"}`);
console.log(`>1.0 pt moves: ${moves.filter((x) => Math.abs(x.d) > 1).map((x) => `${x.g} ${x.d.toFixed(2)}`).join(", ") || "none"}`);
console.log(`>0.5 pt moves: ${moves.filter((x) => Math.abs(x.d) > 0.5).map((x) => `${x.g} ${x.d.toFixed(2)}`).join(", ") || "none"}`);

// ---- projection consistency ----
const proj = new Map(pj.teams.map((t) => [t.abbr.toLowerCase(), t.metrics]));
const V = (ab, k) => proj.get(ab)[k].value;
const z = (vals) => { const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length); return vals.map((v) => (v - m) / sd); };
const zo = z(rows.map((r) => V(r.abbr, "off.epaPerPlay"))), zd = z(rows.map((r) => -V(r.abbr, "def.epaPerPlayAllowed")));
const zos = z(rows.map((r) => V(r.abbr, "off.successRate"))), zds = z(rows.map((r) => -V(r.abbr, "def.successRateAllowed")));
rows.forEach((r, i) => { r.comp = (zo[i] + zd[i] + zos[i] + zds[i]) / 2; });
const rkComp = rankMap(rows.map((r) => ({ k: r.abbr, v: r.comp })));
rows.forEach((r) => { r.rC = rkComp.get(r.abbr); });

console.log("\n=== 13. PR vs 2026 Projection composite consistency ===");
console.log("Spearman  before:", spearman(rows.map((r) => r.rB), rows.map((r) => r.rC)).toFixed(3),
            "  after:", spearman(rows.map((r) => r.rA), rows.map((r) => r.rC)).toFixed(3));
const d5B = rows.filter((r) => Math.abs(r.rC - r.rB) > 5), d5A = rows.filter((r) => Math.abs(r.rC - r.rA) > 5);
const d10B = rows.filter((r) => Math.abs(r.rC - r.rB) > 10), d10A = rows.filter((r) => Math.abs(r.rC - r.rA) > 10);
console.log(`>5-rank disagreements  before ${d5B.length}: ${d5B.map((r) => `${r.ABBR}(${r.rC - r.rB > 0 ? "+" : ""}${r.rC - r.rB})`).join(" ")}`);
console.log(`>5-rank disagreements  after  ${d5A.length}: ${d5A.map((r) => `${r.ABBR}(${r.rC - r.rA > 0 ? "+" : ""}${r.rC - r.rA})`).join(" ")}`);
console.log(`>10-rank disagreements before ${d10B.length}: ${d10B.map((r) => r.ABBR).join(" ") || "none"}`);
console.log(`>10-rank disagreements after  ${d10A.length}: ${d10A.map((r) => r.ABBR).join(" ") || "none"}`);

console.log("\n=== Three-lens view for changed teams ===");
console.log("ABBR  JKBbefore JKBafter  VSiN  ProjComposite");
Object.keys(PROPOSED).forEach((ab) => {
  const r = rows.find((x) => x.abbr === ab);
  console.log(`  ${r.ABBR.padEnd(4)} #${String(r.rB).padStart(2)}      #${String(r.rA).padStart(2)}     #${String(r.rV).padStart(2)}    #${String(r.rC).padStart(2)}`);
});
