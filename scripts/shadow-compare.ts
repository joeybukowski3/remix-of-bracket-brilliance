/**
 * shadow-compare.ts — v2 vs v3 numerology score shadow comparison
 *
 * Usage: npx tsx scripts/shadow-compare.ts [--date YYYY-MM-DD]
 *
 * Reads:
 *   public/data/mlb/hr-props-raw.json         (252 batters — complete eligible slate)
 *   public/data/mlb/player-identity-cache.json (407 players — birthDate, jerseyNumber, mlbId)
 *   public/data/mlb/numerology-daily.json      (immutable v2 baseline for players already scored)
 *
 * Writes (append-safe, never overwrites):
 *   artifacts/numerology-shadow-comparison-YYYY-MM-DD.json
 *   artifacts/numerology-shadow-comparison-YYYY-MM-DD.md
 *
 * Does NOT touch any production data files.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { calculateNumerologyScoreBreakdown } from "@/lib/numerology/mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";

const __filename = fileURLToPath(import.meta.url);
const __dirname_ts = dirname(__filename);

// ── Args ──────────────────────────────────────────────────────────────────────
const dateArg = (() => {
  const i = process.argv.indexOf("--date");
  return i >= 0 ? process.argv[i + 1] : null;
})();

// ── Load data (read-only) ─────────────────────────────────────────────────────
const ROOT = resolve(__dirname_ts, "..");

const hrRaw = JSON.parse(readFileSync(resolve(ROOT, "public/data/mlb/hr-props-raw.json"), "utf8"));
const batters: Array<Record<string, unknown>> = hrRaw.batters ?? hrRaw;
const slateDate: string = dateArg ?? (hrRaw.slateDate ?? "2026-06-30");

const identityCache = JSON.parse(readFileSync(resolve(ROOT, "public/data/mlb/player-identity-cache.json"), "utf8"));
const identityMap: Record<string, { birthDate?: string; jerseyNumber?: number }> = identityCache.players ?? identityCache;

const dailyJson = JSON.parse(readFileSync(resolve(ROOT, "public/data/mlb/numerology-daily.json"), "utf8"));

// Freeze v2 baseline — immutable; all sections the page actually displays
const v2BaselineMap = new Map<string, number>();
for (const play of [
  ...(dailyJson.exactNumberMatches ?? []),
  ...(dailyJson.rootNumberMatches ?? []),
  ...(dailyJson.featuredPlays ?? []),
  ...(dailyJson.watchlist ?? []),
  ...(dailyJson.bestAvailable ?? []),
  ...(dailyJson.countercurrents ?? []),
]) {
  if (typeof play.playerName === "string" && typeof play.numerologyScore === "number") {
    if (!v2BaselineMap.has(play.playerName)) {
      v2BaselineMap.set(play.playerName, play.numerologyScore);
    }
  }
}

// ── Build daily profile for the slate date ────────────────────────────────────
function sumDigits(n: number): number {
  return String(Math.abs(Math.round(n))).split("").reduce((a, d) => a + Number(d), 0);
}

function reduceNum(n: number): { original: number; compound: number; master: number | null; root: number } {
  const MASTER = new Set([11, 22, 33]);
  const o = Math.abs(Math.round(n));
  if (o < 10) return { original: o, compound: o, master: null, root: o };
  if (MASTER.has(o)) return { original: o, compound: o, master: o, root: sumDigits(o) };
  const c = sumDigits(o);
  if (MASTER.has(c)) return { original: o, compound: c, master: c, root: sumDigits(c) };
  let r = c;
  while (r > 9) r = sumDigits(r);
  return { original: o, compound: c, master: null, root: r };
}

function buildDailyProfile(dateStr: string): DailyProfile {
  const FAMILIES = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];
  const [y, m, d] = dateStr.split("-").map(Number);
  const rawSum = dateStr.replace(/-/g, "").split("").reduce((a, x) => a + Number(x), 0);
  const ud = reduceNum(rawSum);
  const calDay = reduceNum(d);
  const uYear = reduceNum([...String(y)].reduce((a, x) => a + Number(x), 0));
  const uMonth = reduceNum(m + uYear.root);
  const echo = reduceNum(reduceNum(m).root + calDay.root + uYear.root);
  const primaryFamily = FAMILIES.find(f => f.includes(ud.root)) ?? [];
  const secondaryFamily = FAMILIES.find(f => f.includes(calDay.root)) ?? [];
  const digits = dateStr.replace(/-/g, "").split("").map(Number).filter(n => n !== 0);
  const counts = new Map<number, number>();
  for (const n of digits) counts.set(n, (counts.get(n) ?? 0) + 1);
  const repeatedDigits = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([digit, count]) => ({
      digit, count,
      reinforces: (primaryFamily.includes(digit) ? "primary" : secondaryFamily.includes(digit) ? "secondary" : "neither") as "primary" | "secondary" | "neither",
    }));

  return {
    universalDayRawSum: rawSum,
    universalDayCompound: ud.compound,
    universalDayMaster: ud.master,
    universalDayRoot: ud.root,
    universalDayTrace: [dateStr.replace(/-/g, "").split("").join(" + ") + " = " + rawSum],
    calendarDayCompound: calDay.original,
    calendarDayRoot: calDay.root,
    universalYear: uYear.root,
    universalMonth: uMonth.root,
    structuralEcho: `${echo.original}/${echo.root}`,
    primaryFamily,
    secondaryFamily,
    balancingComplement: ud.root === 5 ? 5 : 10 - ud.root,
    countercurrent: (9 - ud.root) === 0 ? 9 : 9 - ud.root,
    repeatedDigits,
    interpretation: `Universal Day ${rawSum}/${ud.root} — ${primaryFamily.join("-")} family.`,
  };
}

const daily = buildDailyProfile(slateDate);

// ── Normalize player name for identity lookup ─────────────────────────────────
function normName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lookupIdentity(playerName: string, team: string): { birthDate?: string; jerseyNumber?: number } | null {
  const key = `${playerName}|${team}`;
  if (identityMap[key]) return identityMap[key] as { birthDate?: string; jerseyNumber?: number };
  const normTarget = normName(playerName);
  for (const [k, v] of Object.entries(identityMap)) {
    const [n] = k.split("|");
    if (normName(n) === normTarget) return v as { birthDate?: string; jerseyNumber?: number };
  }
  return null;
}

// ── Score all batters with v3 ─────────────────────────────────────────────────
type Row = {
  playerName: string;
  team: string;
  battingOrder: number | null;
  jerseyNumber: number | null;
  birthDate: string | null;
  identityCoverage: "full" | "jersey_only" | "none";
  v2Score: number | null;
  v3Score: number;
  delta: number | null;
  v3Rank: number;
  v2Rank: number | null;
  rankDelta: number | null;
  signals: string[];
  synergyBonus: number;
  countercurrentTotal: number;
  rawNumerology: number;
  normDenominator: number;
  missingData: string[];
  modelVersions: { v2: string; v3: string };
};

const rows: Omit<Row, "v3Rank" | "v2Rank" | "rankDelta">[] = [];

for (const batter of batters) {
  const playerName = String(batter.player ?? batter.playerName ?? "");
  const team = String(batter.team ?? "");
  const battingOrder = typeof batter.battingOrder === "number" ? batter.battingOrder : null;
  const jerseyFromRaw = typeof batter.jerseyNumber === "number" ? batter.jerseyNumber : null;

  const identity = lookupIdentity(playerName, team);
  const birthDate = identity?.birthDate ?? null;
  const jerseyNumber = jerseyFromRaw ?? identity?.jerseyNumber ?? null;

  const coverage: "full" | "jersey_only" | "none" =
    birthDate != null ? "full" : jerseyNumber != null ? "jersey_only" : "none";

  const result = calculateNumerologyScoreBreakdown(
    { playerName, numerologyScore: 0, jerseyNumber, battingOrder },
    birthDate ? { birthDate, jerseyNumber } : null,
    daily,
    slateDate,
  );

  const v2Score = v2BaselineMap.get(playerName) ?? null;

  rows.push({
    playerName,
    team,
    battingOrder,
    jerseyNumber,
    birthDate,
    identityCoverage: coverage,
    v2Score,
    v3Score: result.calculatedScore,
    delta: v2Score != null ? result.calculatedScore - v2Score : null,
    signals: result.signals.filter(s => s.points > 0).map(s => `${s.field}(${s.points})`),
    synergyBonus: result.synergyBonus ?? 0,
    countercurrentTotal: result.countercurrentTotal,
    rawNumerology: result.rawNumerology,
    normDenominator: result.normalizationDenominator ?? result.normCeiling,
    missingData: result.missingData ?? [],
    modelVersions: { v2: dailyJson.modelVersion ?? "2.x", v3: result.modelVersion ?? "3.0.0" },
  });
}

// Rank by v3 score descending (tie: positives then alpha)
rows.sort((a, b) => b.v3Score - a.v3Score || b.rawNumerology - a.rawNumerology || a.playerName.localeCompare(b.playerName));
const v3Ranked = rows.map((r, i) => ({ ...r, v3Rank: i + 1 }));

// v2 ranks (only for players with v2 scores)
const v2Players = v3Ranked.filter(r => r.v2Score != null).sort((a, b) => (b.v2Score ?? 0) - (a.v2Score ?? 0));
const v2RankMap = new Map(v2Players.map((r, i) => [r.playerName, i + 1]));
const full: Row[] = v3Ranked.map(r => ({
  ...r,
  v2Rank: v2RankMap.get(r.playerName) ?? null,
  rankDelta: (v2RankMap.get(r.playerName) ?? null) != null ? (v2RankMap.get(r.playerName)! - v3Ranked.indexOf(r) - 1) : null,
}));

// ── Summary metrics ───────────────────────────────────────────────────────────
const withV2 = full.filter(r => r.delta != null);
const scores = full.map(r => r.v3Score).sort((a, b) => a - b);
const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

const bands = { elite: 0, strong: 0, qualified: 0, watchlist: 0 };
for (const r of full) {
  if (r.v3Score >= 85) bands.elite++;
  else if (r.v3Score >= 75) bands.strong++;
  else if (r.v3Score >= 60) bands.qualified++;
  else bands.watchlist++;
}

const saturation = full.filter(r => r.v3Score >= 76).length;
const coverageCounts = { full: 0, jersey_only: 0, none: 0 };
for (const r of full) coverageCounts[r.identityCoverage]++;

const top5V3 = full.slice(0, 5).map(r => r.playerName);
const top10V3 = full.slice(0, 10).map(r => r.playerName);
const top5V2 = v2Players.slice(0, 5).map(r => r.playerName);
const top10V2 = v2Players.slice(0, 10).map(r => r.playerName);
const top5Turnover = top5V3.filter(n => !top5V2.includes(n)).length;
const top10Turnover = top10V3.filter(n => !top10V2.includes(n)).length;

const deltas = withV2.map(r => r.delta!);
const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
const maxIncrease = deltas.length ? Math.max(...deltas) : null;
const maxDecrease = deltas.length ? Math.min(...deltas) : null;

// Rank correlation (Spearman) for players with v2 baseline
let rankCorr: number | null = null;
if (withV2.length >= 2) {
  const n = withV2.length;
  const sumD2 = withV2.reduce((acc, r) => {
    const d = (r.v3Rank) - (r.v2Rank ?? r.v3Rank);
    return acc + d * d;
  }, 0);
  rankCorr = Math.round((1 - (6 * sumD2) / (n * (n * n - 1))) * 1000) / 1000;
}

const summary = {
  date: slateDate,
  generatedAt: new Date().toISOString(),
  totalBatters: full.length,
  v2BaselineCount: withV2.length,
  identityCoverage: coverageCounts,
  v3Score: { avg: Math.round(avg * 10) / 10, median },
  v3Bands: bands,
  saturationAtOrAbove76: saturation,
  delta: avgDelta != null ? { avg: Math.round(avgDelta * 10) / 10, maxIncrease, maxDecrease } : null,
  top5V3,
  top10V3,
  top5V2Turnover: top5Turnover,
  top10V2Turnover: top10Turnover,
  rankCorrelation: rankCorr,
  modelVersions: { v2: dailyJson.modelVersion ?? "2.x", v3: "3.0.0" },
};

// ── Write JSON ────────────────────────────────────────────────────────────────
const outBase = resolve(ROOT, `artifacts/numerology-shadow-comparison-${slateDate}`);
const jsonPath = `${outBase}.json`;
const mdPath = `${outBase}.md`;

if (existsSync(jsonPath)) {
  console.error(`[shadow-compare] BLOCKED: ${jsonPath} already exists. Delete it to re-run.`);
  process.exit(1);
}

const jsonOut = { summary, players: full };
writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), "utf8");
console.log(`[shadow-compare] wrote ${jsonPath}`);

// ── Write Markdown ────────────────────────────────────────────────────────────
const lines: string[] = [
  `# Numerology Shadow Comparison — ${slateDate}`,
  ``,
  `Generated: ${summary.generatedAt}  `,
  `Model versions: v2 baseline = \`${summary.modelVersions.v2}\` → v3 = \`${summary.modelVersions.v3}\``,
  ``,
  `## Summary`,
  ``,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Total batters scored | ${summary.totalBatters} |`,
  `| v2 baseline available | ${summary.v2BaselineCount} |`,
  `| Identity coverage: full | ${coverageCounts.full} |`,
  `| Identity coverage: jersey only | ${coverageCounts.jersey_only} |`,
  `| Identity coverage: none | ${coverageCounts.none} |`,
  `| v3 avg score | ${summary.v3Score.avg} |`,
  `| v3 median score | ${summary.v3Score.median} |`,
  `| Scores ≥ 76 (saturation) | ${saturation} |`,
  `| Elite (≥85) | ${bands.elite} |`,
  `| Strong (75–84) | ${bands.strong} |`,
  `| Qualified (60–74) | ${bands.qualified} |`,
  `| Watchlist (<60) | ${bands.watchlist} |`,
  avgDelta != null ? `| Avg score delta (v3–v2) | ${summary.delta?.avg} |` : `| Avg score delta | — (no v2 baseline) |`,
  maxIncrease != null ? `| Max score increase | +${maxIncrease} |` : "",
  maxDecrease != null ? `| Max score decrease | ${maxDecrease} |` : "",
  rankCorr != null ? `| Rank correlation (Spearman) | ${rankCorr} |` : `| Rank correlation | — (insufficient v2 data) |`,
  ``,
  `## Top 10 by v3 Score`,
  ``,
  `| Rank | Player | Team | v3 | v2 | Δ | Synergy | Signals |`,
  `|------|--------|------|----|----|---|---------|---------|`,
  ...full.slice(0, 10).map(r =>
    `| ${r.v3Rank} | ${r.playerName} | ${r.team} | ${r.v3Score} | ${r.v2Score ?? "—"} | ${r.delta != null ? (r.delta >= 0 ? `+${r.delta}` : String(r.delta)) : "—"} | ${r.synergyBonus} | ${r.signals.join(", ") || "—"} |`
  ),
  ``,
  `## All Players`,
  ``,
  `| Rank | Player | Team | v3 | v2 | Δ | Cov | Synergy | Raw | Missing |`,
  `|------|--------|------|----|----|---|-----|---------|-----|---------|`,
  ...full.map(r =>
    `| ${r.v3Rank} | ${r.playerName} | ${r.team} | ${r.v3Score} | ${r.v2Score ?? "—"} | ${r.delta != null ? (r.delta >= 0 ? `+${r.delta}` : String(r.delta)) : "—"} | ${r.identityCoverage[0]} | ${r.synergyBonus} | ${r.rawNumerology} | ${r.missingData.join(", ") || "—"} |`
  ),
];

writeFileSync(mdPath, lines.filter(l => l !== "").join("\n") + "\n", "utf8");
console.log(`[shadow-compare] wrote ${mdPath}`);

// ── Console summary ───────────────────────────────────────────────────────────
console.log(`\nShadow comparison: ${slateDate}`);
console.log(`  ${summary.totalBatters} batters scored | ${summary.v2BaselineCount} have v2 baseline`);
console.log(`  Identity: ${coverageCounts.full} full / ${coverageCounts.jersey_only} jersey-only / ${coverageCounts.none} none`);
console.log(`  v3 avg=${summary.v3Score.avg} median=${summary.v3Score.median} saturation≥76=${saturation}`);
console.log(`  Bands: elite=${bands.elite} strong=${bands.strong} qualified=${bands.qualified} watchlist=${bands.watchlist}`);
if (avgDelta != null) console.log(`  Delta: avg=${summary.delta?.avg} max=+${maxIncrease} min=${maxDecrease}`);
console.log(`\n  Top 5 v3: ${top5V3.join(", ")}`);
console.log(`\n${"Player".padEnd(28)} ${"v3".padStart(4)} ${"v2".padStart(4)} ${"Δ".padStart(5)} ${"Syn".padStart(4)}  Coverage`);
console.log("─".repeat(72));
for (const r of full.slice(0, 20)) {
  const dStr = r.delta != null ? (r.delta >= 0 ? `+${r.delta}` : String(r.delta)) : "—";
  console.log(`${r.playerName.padEnd(28)} ${String(r.v3Score).padStart(4)} ${String(r.v2Score ?? "—").padStart(4)} ${dStr.padStart(5)} ${String(r.synergyBonus).padStart(4)}  ${r.identityCoverage}`);
}
console.log("─".repeat(72));
