// RESEARCH ONLY. Part 2 of the Week-1 readiness audit.
//   (a) 2025-only vs 2024-only decomposition of the 2026 Projection lens.
//   (b) league-sum sanity of the hand-entered offseason adjustments.
//   (c) Week-1 projected spreads: shipped board vs proposed variants.
// Reads only committed artifacts. Deliberately re-implements the two-season
// rate reader instead of importing the generator module, because importing
// that module runs its main and rewrites the production projection artifact.
import fs from "node:fs";
import { join } from "node:path";

const pr = JSON.parse(fs.readFileSync("public/data/nfl/2026/projected-power-ratings-v04.json", "utf8"));
const games = JSON.parse(fs.readFileSync("public/data/nfl/2026/games.json", "utf8")).games;

const K = 0.24;
const HFA = 2.0;
const EPA_DIR = join("data", "nfl", "nflverse", "epa-team-game");

function readCsv(path) {
  const lines = fs.readFileSync(path, "utf-8").replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(header.map((h, i) => [h, l.split(",")[i]])));
}

/** Net EPA/play (offense minus defense-allowed) per team for one season. */
function netEpaBySeason(season) {
  const rows = readCsv(join(EPA_DIR, `epa_team_game_${season}.csv`));
  const teams = [...new Set(rows.map((r) => r.team))].sort();
  const out = new Map();
  for (const t of teams) {
    const off = rows.filter((r) => r.team === t);
    const def = rows.filter((r) => r.opponent === t);
    const rate = (sel) => sel.reduce((s, r) => s + Number(r.off_epa), 0) / sel.reduce((s, r) => s + Number(r.off_plays), 0);
    out.set(t, rate(off) - rate(def));
  }
  return out;
}
function rankOf(map) {
  const s = [...map].sort((a, b) => b[1] - a[1]);
  const m = new Map();
  s.forEach(([t], i) => m.set(t, i + 1));
  return m;
}

const prByAbbr = new Map(pr.teams.map((t) => [t.abbr.toLowerCase(), t]));
const rk25 = rankOf(netEpaBySeason(2025));
const rk24 = rankOf(netEpaBySeason(2024));

console.log("=== (a) 2026 Projection lens season split: net EPA/play rank ===");
console.log("The lens is 0.6*2025 + 0.4*2024 regressed to the 2025 mean, with NO roster input.");
console.log("A large 2024-vs-2025 swing means the lens is being driven by a season two years");
console.log("before the one being projected, which the 2025-based Power Rating deliberately ignores.");
console.log("abbr 2025rk 2024rk  swing   PRrank  divergenceSource");
const split = [...rk25.keys()].map((t) => ({ t, a: rk25.get(t), b: rk24.get(t), swing: rk25.get(t) - rk24.get(t), pr: prByAbbr.get(t)?.rank ?? null }));
split.sort((x, y) => y.swing - x.swing);
for (const s of split) {
  const flag = s.swing >= 10 ? "lens lifted by 2024" : s.swing <= -10 ? "lens dragged by 2024" : "";
  console.log(s.t.toUpperCase().padEnd(5), String(s.a).padStart(5), String(s.b).padStart(6), String(s.swing > 0 ? "+" + s.swing : s.swing).padStart(6), String(s.pr).padStart(7), "  " + flag);
}

console.log("\n=== (b) League-sum sanity of hand-entered adjustments ===");
for (const k of ["guideCalibrationAdjustment", "luckAdjustment", "personnelAdjustment", "coachAdjustment", "returningInjuryAdjustment"]) {
  const s = pr.teams.reduce((a, t) => a + t.components[k], 0);
  console.log(`${k.padEnd(28)} league sum = ${s.toFixed(3).padStart(8)}   mean = ${(s / 32).toFixed(3).padStart(7)}`);
}
const lc = new Set(pr._meta.luckCoverageTeams);
const covered = pr.teams.filter((t) => lc.has(t.abbr.toUpperCase()));
const coveredMean = covered.reduce((s, t) => s + t.components.luckAdjustment, 0) / covered.length;
console.log(`luck: ${covered.length} covered teams mean = ${coveredMean.toFixed(3)}; 24 uncovered teams mean = 0.000 by construction ("not reviewed")`);
console.log(`      => the reviewed divisions carry a net +${coveredMean.toFixed(3)} OVR (${(coveredMean * K).toFixed(3)} spread pts) the other 24 never had a chance to earn`);

const VARIANTS = {
  shipped: (t) => t.rating2026,
  noGuide: (t) => t.rating2026 - t.components.guideCalibrationAdjustment,
  noPartialLuck: (t) => t.rating2026 - t.components.luckAdjustment,
  centeredLuck: (t) => t.rating2026 - (lc.has(t.abbr.toUpperCase()) ? coveredMean : 0),
  noGuideNoLuck: (t) => t.rating2026 - t.components.guideCalibrationAdjustment - t.components.luckAdjustment,
};
function board(fn) {
  const vals = new Map(pr.teams.map((t) => [t.abbr.toLowerCase(), fn(t)]));
  const avg = [...vals.values()].reduce((a, b) => a + b, 0) / 32;
  return new Map([...vals].map(([a, v]) => [a, (v - avg) * K]));
}
const boards = Object.fromEntries(Object.entries(VARIANTS).map(([k, fn]) => [k, board(fn)]));
const names = ["noGuide", "noPartialLuck", "centeredLuck", "noGuideNoLuck"];

const w1 = games.filter((g) => g.week === 1 && g.seasonType === "REG");
console.log(`\n=== (c) Week 1 projected spreads (${w1.length} games); margin = 0.24*(OVRh - OVRa) + 2.0 HFA ===`);
console.log("(positive = home favored by that many points)");
console.log("matchup        shipped |  noGuide  d   | noLuck   d   | centLuck  d  | noGuide+noLuck d");
const moves = Object.fromEntries(names.map((n) => [n, []]));
for (const g of w1) {
  const m = (b) => b.get(g.homeAbbr) - b.get(g.awayAbbr) + (g.neutralSite ? 0 : HFA);
  const base = m(boards.shipped);
  const cells = names.map((v) => {
    const val = m(boards[v]);
    const d = val - base;
    moves[v].push({ g: `${g.awayAbbr.toUpperCase()}@${g.homeAbbr.toUpperCase()}`, d });
    return `${val.toFixed(2).padStart(6)} ${((d >= 0 ? "+" : "") + d.toFixed(2)).padStart(6)}`;
  });
  console.log(`${(g.awayAbbr.toUpperCase() + " @ " + g.homeAbbr.toUpperCase()).padEnd(13)} ${base.toFixed(2).padStart(6)} | ${cells.join(" | ")}`);
}
console.log("\nlargest spread move by variant (flagging any game moving > 1.0 pt):");
for (const v of names) {
  const list = moves[v];
  const worst = list.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
  const over1 = list.filter((x) => Math.abs(x.d) > 1.0);
  console.log(`  ${v.padEnd(15)} max |move| ${Math.abs(worst.d).toFixed(2)} (${worst.g});  games moving >1.0: ${over1.length ? over1.map((x) => `${x.g} ${x.d.toFixed(2)}`).join(", ") : "NONE"}`);
}

console.log("\n=== Power Ratings before/after, teams that move (rank in parens) ===");
function rankBoard(fn) {
  const s = pr.teams.map((t) => ({ a: t.abbr.toUpperCase(), v: fn(t) })).sort((x, y) => y.v - x.v);
  const m = new Map();
  s.forEach((x, i) => m.set(x.a, i + 1));
  return m;
}
const ranks = Object.fromEntries(Object.entries(VARIANTS).map(([k, fn]) => [k, rankBoard(fn)]));
console.log("abbr  shipped        noGuide         noLuck         noGuide+noLuck");
for (const t of pr.teams) {
  const ab = t.abbr.toUpperCase();
  const cells = ["shipped", "noGuide", "noPartialLuck", "noGuideNoLuck"].map((v) => `${VARIANTS[v](t).toFixed(2).padStart(6)} (#${String(ranks[v].get(ab)).padStart(2)})`);
  if (Math.abs(t.components.guideCalibrationAdjustment) > 0.001 || Math.abs(t.components.luckAdjustment) > 0.001) {
    console.log(ab.padEnd(5), cells.join("  "));
  }
}
