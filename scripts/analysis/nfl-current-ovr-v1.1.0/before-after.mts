/**
 * ANALYSIS-ONLY (read-only). Before/after report for the nfl-current-ovr-v1.1.0 change.
 *
 * OLD side  = the committed pre-change artifacts (nfl-current-ovr-v1.0.0), passed as file paths
 *             (extract with `git show <commit>:public/data/nfl/...`).
 * NEW side  = the current working-tree artifacts.
 * Both Current OVR boards are built by the SAME production function (buildCurrentRatingBoard) from the
 * same v0.3.1/v0.4 anchors; only the performance artifact differs. The old performance artifact is read
 * as plain JSON on purpose: the validator rejects pre-v1.1.0 artifacts, which is exactly the stale-data guard.
 *
 * Run: npx tsx scripts/analysis/nfl-current-ovr-v1.1.0/before-after.mts \
 *        --old-analytics=<old team-performance-analytics.json> --old-projections=<old matchup-projections.json> \
 *        [--week=3] [--json-out=<path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCurrentRatingBoard, type CurrentRatingRow } from "../../../src/lib/nfl/currentRating2026.ts";
import { validateNflV03ReviewArtifact } from "../../../src/lib/nfl/v03Review.ts";
import { validateNflV04ProjectionArtifact } from "../../../src/lib/nfl/v04Projection.ts";
import { buildPublicProjectionBoard } from "../../../src/lib/nfl/publicProjection2026.ts";
import { validateTeamPerformanceAnalyticsArtifact } from "../../../src/lib/nfl/teamPerformanceAnalytics.ts";
import { PERFORMANCE_OVERALL_WEIGHTS, PERFORMANCE_SCALE_DIVISORS } from "../../../src/lib/nfl/performanceComposite2026.ts";
import { OVR_TO_POINTS_COEFFICIENT, HOME_FIELD_ADVANTAGE_POINTS } from "../../../src/lib/nfl/jkbPowerNumber2026.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const oldAnalyticsPath = arg("old-analytics");
const oldProjectionsPath = arg("old-projections");
if (!oldAnalyticsPath || !oldProjectionsPath) throw new Error("--old-analytics and --old-projections are required");
const week = Number(arg("week") ?? 3);

const json = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const data = (rel: string) => json(join(ROOT, "public", "data", "nfl", rel));

const preseason = validateNflV03ReviewArtifact("preseason", 2026, data("2026/preseason-power-ratings.json"), "preseason");
const v04Board = buildPublicProjectionBoard(validateNflV04ProjectionArtifact(data("2026/projected-power-ratings-v04.json"), "v04"));
const oldAnalytics = json(oldAnalyticsPath); // deliberately NOT validated (stale-model guard would reject it)
const newAnalytics = validateTeamPerformanceAnalyticsArtifact(data("2026/team-performance-analytics.json"));

const oldBoard = buildCurrentRatingBoard({ season: 2026, v04Board, preseasonV03: preseason, performanceAnalytics: oldAnalytics });
const newBoard = buildCurrentRatingBoard({ season: 2026, v04Board, preseasonV03: preseason, performanceAnalytics: newAnalytics });
const oldBy = new Map(oldBoard.teams.map((t) => [t.abbr, t]));
const newBy = new Map(newBoard.teams.map((t) => [t.abbr, t]));

// --- live component decomposition of the NEW performance rating (z units recovered from the published ratings) ---
const perfBy = new Map(newAnalytics.teams.map((t) => [t.team, t]));
const pdAdjusted = newAnalytics.teams.map((t) => t.windows.fullSeason.adjusted.pointDifferentialPerGame.adjusted as number);
const pdMean = pdAdjusted.reduce((s, v) => s + v, 0) / pdAdjusted.length;
const pdSd = Math.sqrt(pdAdjusted.reduce((s, v) => s + (v - pdMean) ** 2, 0) / pdAdjusted.length);
const K = 15 / PERFORMANCE_SCALE_DIVISORS.overall; // performance-rating points per unit of overall composite z
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
const sgn = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

type TeamRow = {
  abbr: string; oldOvr: number; newOvr: number; delta: number; oldRank: number; newRank: number; rankDelta: number; anchor: number;
  gamesPlayed: number; liveOff: number; liveDef: number; pdAdjPerGame: number; pdZ: number;
  contribOff: number; contribDef: number; contribPd: number; performanceRating: number; flag: string;
};
const teams: TeamRow[] = [...newBy.values()].map((n: CurrentRatingRow) => {
  const o = oldBy.get(n.abbr)!;
  const p = perfBy.get(n.abbr)!;
  const offZ = ((p.performance.offenseRating as number) - 50) * PERFORMANCE_SCALE_DIVISORS.offense / 15;
  const defZ = ((p.performance.defenseRating as number) - 50) * PERFORMANCE_SCALE_DIVISORS.defense / 15;
  const pdAdj = p.windows.fullSeason.adjusted.pointDifferentialPerGame.adjusted as number;
  const pdZ = (pdAdj - pdMean) / pdSd;
  const delta = n.rating - o.rating;
  const rankDelta = o.rank - n.rank; // positive = moved UP the board
  const flag = Math.abs(delta) >= 4 || Math.abs(rankDelta) >= 6 ? "REVIEW" : "";
  return {
    abbr: n.abbr, oldOvr: o.rating, newOvr: n.rating, delta, oldRank: o.rank, newRank: n.rank, rankDelta, anchor: n.preseasonV04Rating,
    gamesPlayed: n.gamesPlayed, liveOff: p.performance.offenseRating as number, liveDef: p.performance.defenseRating as number, pdAdjPerGame: pdAdj, pdZ,
    contribOff: K * PERFORMANCE_OVERALL_WEIGHTS.offense * offZ, contribDef: K * PERFORMANCE_OVERALL_WEIGHTS.defense * defZ, contribPd: K * PERFORMANCE_OVERALL_WEIGHTS.pointDifferential * pdZ,
    performanceRating: n.performanceRating as number, flag,
  };
}).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

const lines: string[] = [];
lines.push("## 32-team Current OVR: old (v1.0.0) vs new (v1.1.0), sorted by |ΔOVR|", "");
lines.push("| Team | Old OVR | New OVR | Δ OVR | Old rk | New rk | Δ rk | Anchor | Live OFF | Live DEF | PD adj/g (z) | pts from OFF / DEF / PD | Flag |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|");
for (const t of teams) {
  lines.push(`| ${t.abbr.toUpperCase()} | ${fmt(t.oldOvr)} | ${fmt(t.newOvr)} | ${sgn(t.delta)} | ${t.oldRank} | ${t.newRank} | ${t.rankDelta === 0 ? "0" : sgn(t.rankDelta, 0)} | ${fmt(t.anchor)} | ${fmt(t.liveOff)} | ${fmt(t.liveDef)} | ${sgn(t.pdAdjPerGame)} (${sgn(t.pdZ, 2)}) | ${sgn(t.contribOff)} / ${sgn(t.contribDef)} / ${sgn(t.contribPd)} | ${t.flag} |`);
}

// --- current-week board ---
const oldProj = json(oldProjectionsPath).projections as Record<string, any>;
const newProj = data("matchup-projections.json").projections as Record<string, any>;
const market = data("matchup-market.json").currentMarket as Record<string, any>;
const games = Object.values(newProj).filter((g: any) => g.week === week) as any[];
const label = (abbr: string, homeMargin: number, home: string, away: string) => (Math.round(homeMargin * 10) === 0 ? "PK" : `${(homeMargin > 0 ? home : away).toUpperCase()} −${Math.abs(Math.round(homeMargin * 10) / 10).toFixed(1)}`);
type GameRow = { gameId: string; matchup: string; neutral: boolean; marketHome: number | null; marketLabel: string; oldMargin: number; newMargin: number; change: number; oldGap: number | null; newGap: number | null; oldSpread: string; newSpread: string; oldOvrs: [number, number]; newOvrs: [number, number] };
const gameRows: GameRow[] = games.map((g) => {
  const o = oldProj[g.gameId];
  const m = market[g.gameId];
  const marketHome = m?.spread?.home != null ? -m.spread.home : null; // home margin implied by the market (home favourite => positive)
  const marketLabel = m?.spread ? (m.spread.home === 0 ? "PK" : `${(m.spread.home < 0 ? g.homeTeam : g.awayTeam).toUpperCase()} −${Math.abs(m.spread.home).toFixed(1)}`) : "N/A";
  return {
    gameId: g.gameId, matchup: `${g.awayTeam.toUpperCase()} @ ${g.homeTeam.toUpperCase()}${g.neutralSite ? " (N)" : ""}`, neutral: g.neutralSite, marketHome, marketLabel,
    oldMargin: o.projectedHomeMargin, newMargin: g.projectedHomeMargin, change: g.projectedHomeMargin - o.projectedHomeMargin,
    oldGap: marketHome == null ? null : o.projectedHomeMargin - marketHome, newGap: marketHome == null ? null : g.projectedHomeMargin - marketHome,
    oldSpread: o.formattedJkbSpread, newSpread: g.formattedJkbSpread, oldOvrs: [o.homeCurrentOVR, o.awayCurrentOVR] as [number, number], newOvrs: [g.homeCurrentOVR, g.awayCurrentOVR] as [number, number],
  };
}).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
void label;
lines.push("", `## Week ${week} board: old vs new JKB spread (gap = JKB home margin − market home margin; positive = JKB higher on the home team)`, "");
lines.push("| Matchup | Market | Old JKB | New JKB | Δ home margin | Old gap | New gap |", "|---|---|---|---|---:|---:|---:|");
for (const g of gameRows) {
  lines.push(`| ${g.matchup} | ${g.marketLabel} | ${g.oldSpread} | ${g.newSpread} | ${sgn(g.change, 2)} | ${g.oldGap == null ? "n/a" : sgn(g.oldGap)} | ${g.newGap == null ? "n/a" : sgn(g.newGap)} |`);
}
const gapsOld = gameRows.filter((g) => g.oldGap != null).map((g) => Math.abs(g.oldGap as number));
const gapsNew = gameRows.filter((g) => g.newGap != null).map((g) => Math.abs(g.newGap as number));
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
lines.push("", `Mean |JKB − market|: old ${fmt(avg(gapsOld), 2)} -> new ${fmt(avg(gapsNew), 2)} over ${gapsNew.length} games with a market line.`);

// --- manual reconciliation: 0.24 x dOVR + HFA -> displayed spread (neutral game handled separately) ---
lines.push("", `## Reconciliation: 0.24 × (home OVR − away OVR) + HFA -> displayed spread (Week ${week})`, "");
const pick = [...gameRows.filter((g) => g.neutral), ...gameRows.filter((g) => !g.neutral).slice(0, 5)];
for (const g of pick) {
  const [h, a] = g.newOvrs;
  const hfa = g.neutral ? 0 : HOME_FIELD_ADVANTAGE_POINTS;
  const margin = OVR_TO_POINTS_COEFFICIENT * (h - a) + hfa;
  lines.push(`- ${g.matchup}: 0.24 × (${h.toFixed(3)} − ${a.toFixed(3)}) + ${hfa.toFixed(1)} = ${margin.toFixed(4)} -> ${g.newSpread} (artifact ${g.newMargin.toFixed(4)}, |diff| ${Math.abs(margin - g.newMargin).toExponential(1)})${g.neutral ? "  [NEUTRAL SITE: HFA = 0]" : ""}`);
}

const out = { week, teams, games: gameRows };
const jsonOut = arg("json-out");
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(out, null, 2)}\n`, "utf-8");
console.log(lines.join("\n"));
