import { loadScoringSupport } from "./reconstructB.mts";
const rows = loadScoringSupport([2025]);
type Agg = { plays: number; epa: number; sn: number; sd: number };
const off = new Map<string, Agg>(), def = new Map<string, Agg>();
for (const r of rows) {
  for (const [m, k] of [[off, r.team], [def, r.opponent]] as const) {
    const a = m.get(k) ?? { plays: 0, epa: 0, sn: 0, sd: 0 };
    a.plays += r.eligiblePlays; a.epa += r.offEpaSum; a.sn += r.successNum; a.sd += r.successDen;
    m.set(k, a);
  }
}
const offRank = [...off].map(([t, a]) => ({ t, epa: a.epa / a.plays, sr: a.sn / a.sd })).sort((x, y) => y.epa - x.epa);
const defRank = [...def].map(([t, a]) => ({ t, epa: a.epa / a.plays, sr: a.sn / a.sd })).sort((x, y) => x.epa - y.epa);
for (const t of ["bal", "ind"]) {
  const o = offRank.findIndex((r) => r.t === t), d = defRank.findIndex((r) => r.t === t);
  console.log(t.toUpperCase(),
    `2025 OFF EPA/play ${offRank[o].epa.toFixed(4)} (rank ${o + 1}), SR ${(offRank[o].sr * 100).toFixed(1)}%`,
    `| 2025 DEF EPA allowed ${defRank[d].epa.toFixed(4)} (rank ${d + 1}), SR allowed ${(defRank[d].sr * 100).toFixed(1)}%`,
    `| net ${(offRank[o].epa - defRank[d].epa).toFixed(4)}`);
}
const net = [...off.keys()].map((t) => ({ t, net: off.get(t)!.epa / off.get(t)!.plays - def.get(t)!.epa / def.get(t)!.plays })).sort((x, y) => y.net - x.net);
console.log("2025 NET EPA rank:", net.map((r, i) => `${i + 1}.${r.t}`).join(" "));
