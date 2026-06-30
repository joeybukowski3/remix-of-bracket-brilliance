/**
 * shadow-compare.ts — v2 vs v3 numerology score comparison
 * Run from project root: npx tsx scripts/shadow-compare.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { calculateNumerologyScoreBreakdown } from "@/lib/numerology/mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";

const dataPath = resolve("public/data/mlb/numerology-daily.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const daily: DailyProfile = data.dailyProfile;
const slateDate: string = data.date;

type Play = {
  playerName: string;
  numerologyScore: number;
  jerseyNumber?: number | null;
  battingOrder?: number | null;
  scoreBreakdown?: { profile?: Record<string, string | null> };
  missingData?: string[];
};

const allPlays: Play[] = [
  ...(data.featuredPlays ?? []),
  ...(data.watchlist ?? []),
  ...(data.bestAvailable ?? []),
  ...(data.countercurrents ?? []),
];
const seen = new Set<string>();
const unique = allPlays.filter(p => { const k = p.playerName; if (seen.has(k)) return false; seen.add(k); return true; });

const rows: Array<{ name: string; v2: number; v3: number; delta: number; synergyBonus: number; topSignal: string }> = [];

for (const p of unique) {
  const result = calculateNumerologyScoreBreakdown(
    { playerName: p.playerName, numerologyScore: p.numerologyScore, jerseyNumber: p.jerseyNumber, battingOrder: p.battingOrder },
    null,
    daily,
    slateDate,
  );

  const topSignal = result.signals.filter(s => s.points > 0).sort((a, b) => b.points - a.points)[0];
  rows.push({
    name: p.playerName,
    v2: p.numerologyScore,
    v3: result.calculatedScore,
    delta: result.calculatedScore - p.numerologyScore,
    synergyBonus: result.synergyBonus ?? 0,
    topSignal: topSignal ? `${topSignal.field}(${topSignal.points})` : "—",
  });
}

rows.sort((a, b) => b.v3 - a.v3);

console.log(`\nShadow comparison: ${slateDate} (${unique.length} players, identity=null — jersey+order only)\n`);
console.log(`${"Player".padEnd(28)} ${"v2".padStart(4)} ${"v3".padStart(4)} ${"Δ".padStart(5)} ${"Syn".padStart(4)}  Top signal`);
console.log("─".repeat(80));
for (const r of rows) {
  const delta = r.delta >= 0 ? `+${r.delta}` : String(r.delta);
  console.log(`${r.name.padEnd(28)} ${String(r.v2).padStart(4)} ${String(r.v3).padStart(4)} ${delta.padStart(5)} ${String(r.synergyBonus).padStart(4)}  ${r.topSignal}`);
}
console.log("─".repeat(80));
const changers = rows.filter(r => r.delta !== 0);
console.log(`\n${changers.length}/${rows.length} players changed score`);
console.log(`Avg delta: ${(rows.reduce((a, r) => a + r.delta, 0) / rows.length).toFixed(1)}`);
console.log(`Max increase: +${Math.max(...rows.map(r => r.delta))}`);
console.log(`Max decrease: ${Math.min(...rows.map(r => r.delta))}`);
