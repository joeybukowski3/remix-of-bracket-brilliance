import { loadScoringSupport } from "./reconstructB.mts";
const rows = loadScoringSupport([2025]);
function lastN(team: string, n: number, side: "off" | "def") {
  const rs = rows.filter((r) => (side === "off" ? r.team : r.opponent) === team).sort((a, b) => a.week - b.week).slice(-n);
  const plays = rs.reduce((s, r) => s + r.eligiblePlays, 0);
  const epa = rs.reduce((s, r) => s + r.offEpaSum, 0);
  return { games: rs.length, epaPerPlay: epa / plays };
}
for (const n of [4, 6, 8, 17]) {
  const parts = ["bal", "ind"].flatMap((t) => [
    `${t.toUpperCase()} off ${lastN(t, n, "off").epaPerPlay.toFixed(4)}`,
    `${t.toUpperCase()} defAllowed ${lastN(t, n, "def").epaPerPlay.toFixed(4)}`,
  ]);
  console.log(`last ${String(n).padStart(2)} games (2025): ` + parts.join("  |  "));
}
// Weight mass of the EWMA windows actually used.
const hl6 = (k: number) => { const tot = Array.from({ length: 85 }, (_, i) => 0.5 ** (i / 6)).reduce((s, v) => s + v, 0); return Array.from({ length: k }, (_, i) => 0.5 ** (i / 6)).reduce((s, v) => s + v, 0) / tot; };
const hl4 = (k: number) => { const tot = Array.from({ length: 85 }, (_, i) => 0.5 ** (i / 4)).reduce((s, v) => s + v, 0); return Array.from({ length: k }, (_, i) => 0.5 ** (i / 4)).reduce((s, v) => s + v, 0) / tot; };
console.log(`offense window (hl=6): last 4 games = ${(hl6(4) * 100).toFixed(1)}% of weight, last 6 = ${(hl6(6) * 100).toFixed(1)}%, last 12 = ${(hl6(12) * 100).toFixed(1)}%, last 17 = ${(hl6(17) * 100).toFixed(1)}%`);
console.log(`defense window (hl=4): last 4 games = ${(hl4(4) * 100).toFixed(1)}% of weight, last 6 = ${(hl4(6) * 100).toFixed(1)}%, last 12 = ${(hl4(12) * 100).toFixed(1)}%, last 17 = ${(hl4(17) * 100).toFixed(1)}%`);
