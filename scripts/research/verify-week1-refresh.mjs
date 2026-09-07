// Post-implementation verification. Reads the SHIPPED artifacts only.
import fs from "node:fs";

const pr = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-power-ratings-v04.json", "utf8"));
const mp = JSON.parse(fs.readFileSync("public/data/nfl/matchup-projections.json", "utf8"));
const pj = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-matchup-metrics.json", "utf8"));

const VSIN = { lar: 29.5, sea: 29.5, bal: 28.5, buf: 28.5, sf: 27.5, den: 27.0, ne: 27.0, phi: 27.0,
  gb: 26.5, chi: 26.0, det: 26.0, kc: 26.0, hou: 24.5, lac: 24.5, cin: 24.0, dal: 24.0, jax: 24.0,
  ind: 23.0, min: 23.0, pit: 23.0, tb: 23.0, wsh: 23.0, no: 22.5, car: 22.0, nyg: 22.0, atl: 21.5,
  cle: 20.5, ten: 20.5, lv: 19.5, mia: 18.5, nyj: 18.5, ari: 17.5 };

const rows = pr.teams.map((t) => ({ abbr: t.abbr, ABBR: t.abbr.toUpperCase(), team: t.team, r: t.rating2026, rank: t.rank }));
const rankMap = (pairs) => { const s = [...pairs].sort((a, b) => b.v - a.v || a.k.localeCompare(b.k)); const m = new Map(); s.forEach((p, i) => m.set(p.k, i + 1)); return m; };
const rkV = rankMap(rows.map((r) => ({ k: r.abbr, v: VSIN[r.abbr] })));

const proj = new Map(pj.teams.map((t) => [t.abbr.toLowerCase(), t.metrics]));
const V = (ab, k) => proj.get(ab)[k].value;
const z = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); return v.map((x) => (x - m) / sd); };
const zo = z(rows.map((r) => V(r.abbr, "off.epaPerPlay"))), zd = z(rows.map((r) => -V(r.abbr, "def.epaPerPlayAllowed")));
const zos = z(rows.map((r) => V(r.abbr, "off.successRate"))), zds = z(rows.map((r) => -V(r.abbr, "def.successRateAllowed")));
rows.forEach((r, i) => { r.comp = (zo[i] + zd[i] + zos[i] + zds[i]) / 2; });
const rkC = rankMap(rows.map((r) => ({ k: r.abbr, v: r.comp })));
rows.forEach((r) => { r.rV = rkV.get(r.abbr); r.rC = rkC.get(r.abbr); });

const spearman = (a, b) => 1 - (6 * a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)) / (32 * 1023);
const mad = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

console.log("=== 2. FINAL ALL-32 POWER RATING BOARD ===");
console.log("rk  team                     rating  |  VSiN#  Proj#");
[...rows].sort((a, b) => a.rank - b.rank).forEach((r) => {
  console.log(String(r.rank).padStart(2), " ", r.team.padEnd(23), r.r.toFixed(2).padStart(6), " | ", String(r.rV).padStart(4), String(r.rC).padStart(5));
});

console.log("\n=== 5/6. CORRELATIONS (after implementation) ===");
console.log("PR vs 2026 Projection composite  Spearman =", spearman(rows.map((r) => r.rank), rows.map((r) => r.rC)).toFixed(3));
console.log("PR vs VSiN post-preseason        Spearman =", spearman(rows.map((r) => r.rank), rows.map((r) => r.rV)).toFixed(3));
console.log("PR vs VSiN mean abs rank diff             =", mad(rows.map((r) => r.rank), rows.map((r) => r.rV)).toFixed(2));

console.log("\n=== 7. REMAINING >5-RANK DISAGREEMENTS ===");
const d5p = rows.filter((r) => Math.abs(r.rC - r.rank) > 5).sort((a, b) => (b.rC - b.rank) - (a.rC - a.rank));
const d5v = rows.filter((r) => Math.abs(r.rV - r.rank) > 5).sort((a, b) => (b.rV - b.rank) - (a.rV - a.rank));
console.log(`vs 2026 Projection (${d5p.length}): ` + d5p.map((r) => `${r.ABBR}(PR#${r.rank} vs #${r.rC}, ${r.rC - r.rank > 0 ? "+" : ""}${r.rC - r.rank})`).join("  "));
console.log(`vs VSiN            (${d5v.length}): ` + d5v.map((r) => `${r.ABBR}(PR#${r.rank} vs #${r.rV}, ${r.rV - r.rank > 0 ? "+" : ""}${r.rV - r.rank})`).join("  "));
console.log(`>10 vs Projection: ${rows.filter((r) => Math.abs(r.rC - r.rank) > 10).map((r) => r.ABBR).join(" ") || "none"}`);
console.log(`>10 vs VSiN      : ${rows.filter((r) => Math.abs(r.rV - r.rank) > 10).map((r) => r.ABBR).join(" ") || "none"}`);

console.log("\n=== 3. WEEK-1 PROJECTED SPREADS (from shipped matchup-projections.json) ===");
console.log(`artifact model: ${mp.modelVersion}  beta=${mp.model.ovrToPointsCoefficient}  HFA=${mp.model.homeFieldAdvantage}  marketInputUsed=${mp.model.marketInputUsed}`);
const w1 = Object.values(mp.projections).filter((g) => g.week === 1);
console.log("matchup         homeOVR  awayOVR   margin   spread");
w1.sort((a, b) => String(a.gameId).localeCompare(String(b.gameId))).forEach((g) => {
  console.log(
    `${(String(g.awayTeam).toUpperCase() + " @ " + String(g.homeTeam).toUpperCase()).padEnd(14)}`,
    g.homeCurrentOVR.toFixed(2).padStart(7), g.awayCurrentOVR.toFixed(2).padStart(8),
    g.projectedHomeMargin.toFixed(2).padStart(8), " ", g.formattedJkbSpread
  );
});

console.log("\n=== 4. BAL @ IND ===");
const bi = w1.find((g) => g.homeTeam === "ind" && g.awayTeam === "bal");
console.log(JSON.stringify({ gameId: bi.gameId, homeTeam: bi.homeTeam, awayTeam: bi.awayTeam,
  homeCurrentOVR: bi.homeCurrentOVR, awayCurrentOVR: bi.awayCurrentOVR,
  neutralProjectedMargin: bi.neutralProjectedMargin, homeFieldAdvantage: bi.homeFieldAdvantage, projectedHomeMargin: bi.projectedHomeMargin, formattedJkbSpread: bi.formattedJkbSpread }, null, 2));

console.log("\n=== 8. FLAGS ===");
console.log("_meta.offseasonSnapshotVerifiedThrough:", pr._meta.offseasonSnapshotVerifiedThrough);
console.log("_meta.status:", pr._meta.status);
console.log("reviewFlags.bal present:", Boolean(pr._meta.reviewFlags?.bal));
console.log("reviewFlags.jax present:", Boolean(pr._meta.reviewFlags?.jax));
console.log("BAL notes flag:", pr.teams.find((t) => t.abbr === "bal").notes.includes("STRUCTURAL REVIEW FLAG"));
console.log("JAX notes flag:", pr.teams.find((t) => t.abbr === "jax").notes.includes("UNRESOLVED BENCHMARK OUTLIER"));
console.log("JAX rating unchanged at 66.7:", pr.teams.find((t) => t.abbr === "jax").rating2026 === 66.7);
console.log("DAL rating unchanged at 38.5:", pr.teams.find((t) => t.abbr === "dal").rating2026 === 38.5);
console.log("luckAdjustment untouched (sum 5.53):", pr.teams.reduce((s, t) => s + t.components.luckAdjustment, 0).toFixed(2));
console.log("league average rating:", (rows.reduce((s, r) => s + r.r, 0) / 32).toFixed(3), "(no centering applied)");
