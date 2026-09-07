// RESEARCH ONLY. Diagnostic comparison of the JKB 2026 Power Ratings (the v0.4
// preseason board, which IS Current OVR while every team has 0 completed games)
// against the 2026 Projection lens (projected-matchup-metrics.json).
// Produces no production artifact and mutates nothing.
import fs from "node:fs";

const pr = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-power-ratings-v04.json", "utf8"));
const pj = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-matchup-metrics.json", "utf8"));

const proj = new Map(pj.teams.map((t) => [t.abbr.toLowerCase(), t.metrics]));
const M = (m, k) => m[k]?.value ?? null;

const OFF_KEYS = ["off.epaPerPlay", "off.epaPerPass", "off.epaPerRush", "off.successRate", "off.passSuccessRate", "off.rushSuccessRate"];
const DEF_KEYS = ["def.epaPerPlayAllowed", "def.epaPerPassAllowed", "def.epaPerRushAllowed", "def.successRateAllowed", "def.passSuccessRateAllowed", "def.rushSuccessRateAllowed"];

function z(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.map((v) => (sd === 0 ? 0 : (v - mean) / sd));
}

const rows = pr.teams.map((t) => {
  const m = proj.get(t.abbr.toLowerCase());
  if (!m) throw new Error(`no projection row for ${t.abbr}`);
  return { abbr: t.abbr.toUpperCase(), rating: t.rating2026, prRank: t.rank, c: t.components, conf: t.confidence, notes: t.notes, m };
});

const zOffEpa = z(rows.map((r) => M(r.m, "off.epaPerPlay")));
const zDefEpa = z(rows.map((r) => -M(r.m, "def.epaPerPlayAllowed")));
const zOffSr = z(rows.map((r) => M(r.m, "off.successRate")));
const zDefSr = z(rows.map((r) => -M(r.m, "def.successRateAllowed")));
rows.forEach((r, i) => {
  r.netEpa = M(r.m, "off.epaPerPlay") - M(r.m, "def.epaPerPlayAllowed");
  r.netSr = M(r.m, "off.successRate") - M(r.m, "def.successRateAllowed");
  r.zEpa = zOffEpa[i] + zDefEpa[i];
  r.zSr = zOffSr[i] + zDefSr[i];
  r.composite = (r.zEpa + r.zSr) / 2;
});

function rankMapDesc(pairs) {
  const sorted = [...pairs].sort((a, b) => b.v - a.v);
  const map = new Map();
  sorted.forEach((p, i) => map.set(p.abbr, i + 1));
  return map;
}
const rankBy = (key) => rankMapDesc(rows.map((r) => ({ abbr: r.abbr, v: r[key] })));
const netEpaRank = rankBy("netEpa");
const netSrRank = rankBy("netSr");
const compRank = rankBy("composite");
rows.forEach((r) => {
  r.netEpaRank = netEpaRank.get(r.abbr);
  r.netSrRank = netSrRank.get(r.abbr);
  r.compRank = compRank.get(r.abbr);
  r.divEpa = r.netEpaRank - r.prRank;
  r.divSr = r.netSrRank - r.prRank;
  r.divComp = r.compRank - r.prRank;
});

function spearman(a, b) {
  const n = a.length;
  const d2 = a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
const prRanks = rows.map((r) => r.prRank);

console.log("=== 1. RANK CORRELATION (Spearman: Power Rating rank vs projection-metric rank) ===");
console.log("net EPA/play      :", spearman(prRanks, rows.map((r) => r.netEpaRank)).toFixed(3));
console.log("net success rate  :", spearman(prRanks, rows.map((r) => r.netSrRank)).toFixed(3));
console.log("diagnostic composite:", spearman(prRanks, rows.map((r) => r.compRank)).toFixed(3));
console.log("-- per metric --");
const metricRank = {};
for (const k of OFF_KEYS) {
  metricRank[k] = rankMapDesc(rows.map((r) => ({ abbr: r.abbr, v: M(r.m, k) })));
  console.log(("  " + k).padEnd(32), spearman(prRanks, rows.map((r) => metricRank[k].get(r.abbr))).toFixed(3));
}
for (const k of DEF_KEYS) {
  metricRank[k] = rankMapDesc(rows.map((r) => ({ abbr: r.abbr, v: -M(r.m, k) })));
  console.log(("  " + k).padEnd(32), spearman(prRanks, rows.map((r) => metricRank[k].get(r.abbr))).toFixed(3));
}

console.log("\n=== 2. PER-TEAM TABLE (lower rank = stronger; d = projRank - PRrank, positive = PR optimistic) ===");
console.log("ABBR PRrk rating | netEPA  d | netSR  d | comp  d | oEPA oSR dEPA dSR oPass oRush dPass dRush");
[...rows].sort((a, b) => a.prRank - b.prRank).forEach((r) => {
  const R = (k) => String(metricRank[k].get(r.abbr)).padStart(4);
  console.log(
    r.abbr.padEnd(4),
    String(r.prRank).padStart(4),
    r.rating.toFixed(1).padStart(6), "|",
    String(r.netEpaRank).padStart(6), String(r.divEpa).padStart(3), "|",
    String(r.netSrRank).padStart(5), String(r.divSr).padStart(3), "|",
    String(r.compRank).padStart(4), String(r.divComp).padStart(3), "|",
    R("off.epaPerPlay"), R("off.successRate"), R("def.epaPerPlayAllowed"), R("def.successRateAllowed"),
    R("off.epaPerPass"), R("off.epaPerRush"), R("def.epaPerPassAllowed"), R("def.epaPerRushAllowed")
  );
});

console.log("\n=== 3. DIVERGENCES (composite rank - PR rank) ===");
const sorted = [...rows].sort((a, b) => b.divComp - a.divComp);
console.log("PR SAYS STRONGER than projection profile:");
sorted.filter((r) => r.divComp >= 5).forEach((r) => console.log(`  ${r.abbr.padEnd(4)} PR#${String(r.prRank).padStart(2)} comp#${String(r.compRank).padStart(2)} diff +${r.divComp}  | ${r.notes.slice(0, 80)}`));
console.log("PR SAYS WEAKER than projection profile:");
sorted.filter((r) => r.divComp <= -5).reverse().forEach((r) => console.log(`  ${r.abbr.padEnd(4)} PR#${String(r.prRank).padStart(2)} comp#${String(r.compRank).padStart(2)} diff ${r.divComp}  | ${r.notes.slice(0, 80)}`));
console.log(">10-rank disagreements:", rows.filter((r) => Math.abs(r.divComp) > 10).map((r) => `${r.abbr}(${r.divComp > 0 ? "+" : ""}${r.divComp})`).join(", ") || "none");
console.log(">5-rank disagreements :", rows.filter((r) => Math.abs(r.divComp) > 5).map((r) => `${r.abbr}(${r.divComp > 0 ? "+" : ""}${r.divComp})`).join(", "));

console.log("\n=== 4. BAL vs IND DECOMPOSITION ===");
for (const ab of ["BAL", "IND"]) {
  const r = rows.find((x) => x.abbr === ab);
  const c = r.c;
  console.log(`${ab}: rating2026=${r.rating}  PRrank=${r.prRank}`);
  console.log(`   2025 base jkbV03Rating   = ${c.jkbV03Rating}`);
  console.log(`   guideRating=${c.guideRating}  guideCalibrationAdjustment = ${c.guideCalibrationAdjustment}`);
  console.log(`   luckAverageRank=${c.luckAverageRank}  luckAdjustment = ${c.luckAdjustment}`);
  console.log(`   personnel=${c.personnelAdjustment} coach=${c.coachAdjustment} returningInjury=${c.returningInjuryAdjustment}`);
  console.log(`   rating2025Adjusted=${(c.jkbV03Rating + c.guideCalibrationAdjustment + c.luckAdjustment).toFixed(3)}  projectionAdjustment2026=${(c.personnelAdjustment + c.coachAdjustment + c.returningInjuryAdjustment).toFixed(1)}`);
  console.log(`   notes: ${r.notes}`);
  console.log("   projection metrics:");
  for (const k of [...OFF_KEYS, ...DEF_KEYS]) {
    console.log(`     ${k.padEnd(30)} ${M(r.m, k).toFixed(4).padStart(9)}  rank#${String(r.m[k].rank).padStart(2)}`);
  }
  console.log(`   netEPA=${r.netEpa.toFixed(4)}(#${r.netEpaRank}) netSR=${r.netSr.toFixed(2)}(#${r.netSrRank}) composite=${r.composite.toFixed(3)}(#${r.compRank})`);
}
const bal = rows.find((r) => r.abbr === "BAL");
const ind = rows.find((r) => r.abbr === "IND");
console.log(`\nBAL-IND rating gap = ${(bal.rating - ind.rating).toFixed(2)} OVR = ${((bal.rating - ind.rating) * 0.24).toFixed(2)} spread points`);
console.log(`  of which 2025 base gap        = ${(bal.c.jkbV03Rating - ind.c.jkbV03Rating).toFixed(3)}`);
console.log(`  guide adj gap                 = ${(bal.c.guideCalibrationAdjustment - ind.c.guideCalibrationAdjustment).toFixed(3)}`);
console.log(`  luck adj gap                  = ${(bal.c.luckAdjustment - ind.c.luckAdjustment).toFixed(3)}`);
console.log(`  projection adj gap            = ${(bal.c.personnelAdjustment + bal.c.coachAdjustment + bal.c.returningInjuryAdjustment - (ind.c.personnelAdjustment + ind.c.coachAdjustment + ind.c.returningInjuryAdjustment)).toFixed(3)}`);

console.log("\n=== 5. OFFSEASON ADJUSTMENT COVERAGE ===");
for (const k of ["guideCalibrationAdjustment", "luckAdjustment", "personnelAdjustment", "coachAdjustment", "returningInjuryAdjustment"]) {
  const n = rows.filter((r) => r.c[k] !== 0);
  console.log(`${k.padEnd(28)} nonzero ${String(n.length).padStart(2)}/32  ${n.map((r) => `${r.abbr}${r.c[k] > 0 ? "+" : ""}${r.c[k]}`).join(" ") || "NONE"}`);
}
console.log("\nluckCoverageTeams (only teams whose luck panel was transcribed):", pr._meta.luckCoverageTeams.join(","));
console.log("offseasonSnapshotVerifiedThrough:", pr._meta.offseasonSnapshotVerifiedThrough);
console.log("status:", pr._meta.status);
console.log("\nteams with EMPTY notes / no forward-looking narrative:");
rows.filter((r) => r.c.personnelAdjustment === 0 && r.c.coachAdjustment === 0 && r.c.returningInjuryAdjustment === 0)
  .forEach((r) => console.log(`  ${r.abbr.padEnd(4)} PR#${String(r.prRank).padStart(2)} conf=${r.conf.padEnd(11)} | ${r.notes.slice(0, 90)}`));

console.log("\n=== 6. guideRating EFFECT ===");
console.log(`guideCalibrationWeight=${pr._meta.guideCalibrationWeight} cap=${pr._meta.guideCalibrationCap}`);
console.log("ABBR guide   v03    gap    adj  ratingPts spreadPts(0.24)");
[...rows].sort((a, b) => b.c.guideCalibrationAdjustment - a.c.guideCalibrationAdjustment).forEach((r) => {
  const g = r.c.guideCalibrationAdjustment;
  console.log(`  ${r.abbr.padEnd(4)} ${String(r.c.guideRating).padStart(5)} ${r.c.jkbV03Rating.toFixed(2).padStart(6)} ${(r.c.guideRating - r.c.jkbV03Rating).toFixed(2).padStart(7)} ${g.toFixed(2).padStart(6)} ${(g * 0.24).toFixed(3).padStart(9)}`);
});
// Verify the stated weight actually reproduces the adjustment
const errs = rows.map((r) => Math.abs(r.c.guideCalibrationAdjustment - Math.max(-3, Math.min(3, pr._meta.guideCalibrationWeight * (r.c.guideRating - r.c.jkbV03Rating)))));
console.log(`\nguideCalibrationAdjustment == clamp(0.15*(guideRating-jkbV03Rating), ±3)?  max abs error = ${Math.max(...errs).toFixed(4)}`);

console.log("\n=== 7. RANK RE-ORDER IF guideRating REMOVED ===");
const withoutGuide = rows.map((r) => ({ abbr: r.abbr, prRank: r.prRank, v: r.rating - r.c.guideCalibrationAdjustment }));
const wgRank = rankMapDesc(withoutGuide.map((x) => ({ abbr: x.abbr, v: x.v })));
withoutGuide.sort((a, b) => a.prRank - b.prRank).forEach((x) => {
  const nr = wgRank.get(x.abbr);
  if (nr !== x.prRank) console.log(`  ${x.abbr.padEnd(4)} #${x.prRank} -> #${nr}`);
});

fs.writeFileSync("scripts/research/.out-power-audit.json", JSON.stringify(rows.map((r) => ({ abbr: r.abbr, prRank: r.prRank, rating: r.rating, compRank: r.compRank, divComp: r.divComp, c: r.c, conf: r.conf, notes: r.notes })), null, 2));
console.log("\n(diagnostic rows written to scripts/research/.out-power-audit.json)");
