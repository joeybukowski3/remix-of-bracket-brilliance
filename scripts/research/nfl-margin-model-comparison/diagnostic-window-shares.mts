import { buildScoringSupportIndex } from "../../../src/lib/nfl/props/totals/totalsFeatures.ts";
import { loadScoringSupport } from "./reconstructB.mts";
const rows = loadScoringSupport([2021, 2022, 2023, 2024, 2025]);
const idx = buildScoringSupportIndex(rows);
function shares(list: any[], hl: number) {
  const mr = [...list].sort((a, b) => a.season - b.season || a.week - b.week).reverse();
  const raw = mr.map((_, i) => 0.5 ** (i / hl));
  const tot = raw.reduce((s, v) => s + v, 0);
  const bySeason: Record<number, number> = {};
  mr.forEach((r, i) => { bySeason[r.season] = (bySeason[r.season] || 0) + raw[i] / tot; });
  return { n: mr.length, ess: +(1 / raw.map((w) => (w / tot) ** 2).reduce((s, v) => s + v, 0)).toFixed(2), pctBySeason: Object.fromEntries(Object.entries(bySeason).map(([k, v]) => [k, +(v * 100).toFixed(1)])) };
}
for (const t of ["bal", "ind"]) {
  console.log(t.toUpperCase(), "OFFENSE hl=6", JSON.stringify(shares(idx.byTeam.get(t)!, 6)));
  console.log(t.toUpperCase(), "DEF-ALLOWED hl=4", JSON.stringify(shares(idx.byOpponent.get(t)!, 4)));
}
