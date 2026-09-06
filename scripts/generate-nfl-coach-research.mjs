/**
 * Coaching Ratings v1 -- persistence / forward-predictive research.
 *
 * Writes data/nfl/coaching/coaching-ratings-research.json and prints a
 * findings summary + the current-coach context table. NO rating, NO weights.
 *
 * Usage:
 *   node scripts/generate-nfl-coach-research.mjs --input=path/to/games.csv
 *   node scripts/generate-nfl-coach-research.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NFL_GAMES_SOURCE_URL, parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  atsShrinkageSweep,
  buildCoachResearch,
  sampleSizeBands,
  splitHalfPersistence,
  summarizeSignal,
} from "./lib/nfl-coach-research.mjs";
import { buildCoachGameContext } from "./lib/nfl-coach-context-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COACHING_DIR = join(ROOT, "data", "nfl", "coaching");
const SOURCE_LABEL = "nflverse (nfldata games.csv)";

const SIGNAL_PATHS = [
  "entering.career_ats_pct",
  "entering.tenure_ats_pct",
  "entering.last2_seasons_ats_pct",
  "entering.last3_seasons_ats_pct",
  "entering.last17_ats_pct",
  "entering.favorite_ats_pct",
  "entering.underdog_ats_pct",
  "entering.after_bye_ats_pct",
  "entering.after_bye_win_pct",
  "entering.division_ats_pct",
  "entering.one_score_win_pct",
  "entering.win_over_expectation_per_game",
  "entering.career_win_pct",
  "entering.tenure_year",
  "entering.playoff_games",
];

async function loadCsv(input) {
  if (input) return readFileSync(input, "utf-8");
  const res = await fetch(NFL_GAMES_SOURCE_URL);
  if (!res.ok) throw new Error(`fetch games.csv HTTP ${res.status}`);
  return res.text();
}

/**
 * Classification is driven by FORWARD predictive value, not the year-to-year r
 * of the cumulative career metric (that r is inflated by window overlap -- a
 * career rate in year S and S+1 share nearly all their games). The honest
 * persistence signal is split-half (added separately) + the forward columns.
 */
function classify(summary) {
  const fwd = Math.abs(summary.forward_win_over_expectation_same_season.r ?? 0);
  const fwdNext = Math.abs(summary.forward_win_over_expectation_next_season.r ?? 0);
  const fwdAts = Math.abs(summary.forward_ats_pct_same_season.r ?? 0);
  const best = Math.max(fwd, fwdNext);
  const n = summary.coach_seasons;
  if (n < 60) return "INSUFFICIENT-DATA";
  if (best >= 0.15 && (fwd >= 0.09 || fwdNext >= 0.12)) return "KEEP";
  if (best >= 0.10) return "KEEP-BUT-SHRINK";
  if (best >= 0.06 || fwdAts >= 0.06) return "CONTEXT-ONLY";
  return "DROP";
}

async function main() {
  const args = { input: null, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--input=")) args.input = a.slice(8);
    else throw new Error(`Unknown arg ${a}`);
  }

  const overrides = JSON.parse(readFileSync(join(COACHING_DIR, "coach-name-overrides.json"), "utf-8"));
  const aliases = overrides.aliases ?? {};
  const interim = overrides.interim ?? [];
  const offseason = readOffseason2026();

  const csvText = await loadCsv(args.input);
  const allRows = parseCsv(csvText);
  const histRows = allRows.filter((r) => {
    const s = Number(r.season);
    return Number.isInteger(s) && s >= 1999 && s <= 2025;
  });

  const { researchRows, perGame } = buildCoachResearch(histRows, { aliases });
  const splitHalf = splitHalfPersistence(perGame, { minGames: 30 });
  const splitHalf50 = splitHalfPersistence(perGame, { minGames: 50 });

  const minGamesForSignals = 17;
  const signalSummaries = SIGNAL_PATHS.map((path) => {
    const full = summarizeSignal(researchRows, path, { minCareerGames: 0 });
    const seasoned = summarizeSignal(researchRows, path, { minCareerGames: minGamesForSignals });
    return { path, all: full, seasoned, classification: classify(seasoned) };
  });

  const shrink = atsShrinkageSweep(researchRows, [0, 10, 25, 50, 75, 100, 150, 200], { minCareerGames: 0 });
  const bands = sampleSizeBands(researchRows, "entering.career_ats_pct");
  const woeBands = sampleSizeBands(researchRows, "entering.win_over_expectation_per_game");

  // ---- current-coach context (through end of 2025) ----
  const { coachAccumulators } = buildCoachGameContext(histRows, {
    aliases, interim, seasons: [], source: SOURCE_LABEL, sourceTimestamp: "n/a",
  });
  const currentContext = buildCurrentCoachTable(offseason, coachAccumulators);

  const payload = {
    _meta: buildNflMeta({
      source: SOURCE_LABEL,
      notes: [
        "Leakage-safe coaching-signal research, coach-season unit, seasons 1999-2025.",
        "Entering-signal(S) = coach state through end of S-1. Outcomes measured during S and S+1.",
        "Persistence = year-to-year Pearson r of the same entering signal. Forward = entering signal vs actual win-over-expectation / ATS%.",
        "NO rating, NO component weights, NO coaching-advantage designation are produced.",
        "win_over_expectation_per_game: actual result (W=1/T=0.5/L=0) minus spread-implied win prob (Phi of expected margin / 13.86).",
      ],
    }),
    schemaVersion: "nfl-coaching-research-v1",
    researchRowCount: researchRows.length,
    distinctCoaches: new Set(researchRows.map((r) => r.coach_id)).size,
    seasonSpan: [Math.min(...researchRows.map((r) => r.season)), Math.max(...researchRows.map((r) => r.season))],
    signalSummaries,
    splitHalfPersistence: { minGames30: splitHalf, minGames50: splitHalf50 },
    atsCareerShrinkageSweep: shrink,
    careerAtsSampleSizeBands: bands,
    winOverExpectationSampleSizeBands: woeBands,
    currentCoachContext: currentContext,
    researchRows,
  };

  if (args.dryRun) {
    printFindings(payload);
    console.log("[nfl:coach-research] dry-run: not written");
    return;
  }
  mkdirSync(COACHING_DIR, { recursive: true });
  writeFileSync(join(COACHING_DIR, "coaching-ratings-research.json"), toNflJsonFileString(payload));
  printFindings(payload);
  console.log(`[nfl:coach-research] wrote coaching-ratings-research.json (${researchRows.length} coach-seasons)`);
}

function readOffseason2026() {
  const src = readFileSync(join(ROOT, "src", "data", "nflOffseason2026.ts"), "utf-8");
  const map = {};
  const re = /(\w{2,3}):\s*\{\s*headCoach2025:\s*"([^"]+)",\s*headCoach2026:\s*"([^"]+)",\s*status:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    map[m[1]] = { hc2025: m[2], hc2026: m[3], status: m[4] };
  }
  return map;
}

function coachId(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildCurrentCoachTable(offseason, accumulators) {
  const rows = [];
  for (const [team, info] of Object.entries(offseason)) {
    const id = coachId(info.hc2026);
    const acc = accumulators.get(id);
    // snapshot AS IF the coach's next game is a 2026 game for THIS franchise --
    // a returning coach keeps his tenure counters, a coach who moved teams gets
    // fresh (0-0, year 1) tenure automatically.
    const snap = acc ? acc.snapshot({ season: 2026, team }) : null;
    const newTeam = snap ? snap.tenure_games === 0 : true;
    rows.push({
      team,
      coach: info.hc2026,
      coach_id: id,
      offseason_status: info.status,
      returning: info.hc2025 === info.hc2026,
      has_hc_history: Boolean(snap && snap.career_games > 0),
      career_wl: snap ? `${snap.career_wins}-${snap.career_losses}${snap.career_ties ? "-" + snap.career_ties : ""}` : "0-0",
      career_win_pct: snap ? snap.career_win_pct : null,
      career_games: snap ? snap.career_games : 0,
      career_ats: snap ? `${snap.career_ats_wins}-${snap.career_ats_losses}${snap.career_ats_pushes ? "-" + snap.career_ats_pushes : ""}` : "0-0",
      career_ats_pct: snap ? snap.career_ats_pct : null,
      last17_ats: snap ? tupStr(snap.last17_ats) : null,
      tenure_wl: snap && !newTeam ? `${snap.tenure_wins}-${snap.tenure_losses}` : "0-0 (new)",
      tenure_year_2026: snap && !newTeam ? snap.tenure_year : 1,
      first_year_with_team_2026: newTeam,
      interim: false,
    });
  }
  rows.sort((a, b) => a.team.localeCompare(b.team));
  return rows;
}

function tupStr(t) { return Array.isArray(t) ? t.join("-") : null; }

function printFindings(p) {
  const line = (s) => console.log(s);
  line("");
  line(`=== COACHING SIGNAL RESEARCH (${p.researchRowCount} coach-seasons, ${p.distinctCoaches} coaches, ${p.seasonSpan[0]}-${p.seasonSpan[1]}) ===`);
  line("");
  line("signal (>=17 career g)                          n   yoy_r  fwd_woe_S  fwd_woe_S+1  fwd_ats_S   class");
  for (const s of p.signalSummaries) {
    const q = s.seasoned;
    line(
      s.path.replace("entering.", "").padEnd(44) +
      String(q.coach_seasons).padStart(4) + "  " +
      fmt(q.year_to_year.r) + "  " +
      fmt(q.forward_win_over_expectation_same_season.r) + "     " +
      fmt(q.forward_win_over_expectation_next_season.r) + "       " +
      fmt(q.forward_ats_pct_same_season.r) + "   " +
      s.classification
    );
  }
  line("");
  line("split-half persistence (odd/even career games, autocorrelation-free):");
  for (const [tag, sh] of [["min30", p.splitHalfPersistence.minGames30], ["min50", p.splitHalfPersistence.minGames50]]) {
    line(`   ${tag}: ats_pct r=${fmt(sh.ats_pct.r)} (SB ${fmt(sh.ats_pct.spearman_brown)}) n=${sh.ats_pct.n}   woe r=${fmt(sh.win_over_expectation.r)} (SB ${fmt(sh.win_over_expectation.spearman_brown)})   win_pct r=${fmt(sh.win_pct.r)} (SB ${fmt(sh.win_pct.spearman_brown)})`);
  }
  line("");
  line("career-ATS shrinkage sweep (toward .500):");
  line("   k     n   yoy_r   fwd_ats_S  fwd_ats_S+1");
  for (const row of p.atsCareerShrinkageSweep) {
    line(
      String(row.k).padStart(4) + "  " + String(row.coach_seasons).padStart(4) + "  " +
      fmt(row.year_to_year.r) + "  " + fmt(row.forward_ats_same_season.r) + "     " +
      fmt(row.forward_ats_next_season.r)
    );
  }
  line("");
  line("career-games bands -- career_ats_pct persistence & forward:");
  for (const b of p.careerAtsSampleSizeBands) {
    line(`   ${b.band.padEnd(18)} n=${String(b.coach_seasons).padStart(4)}  yoy_r=${fmt(b.year_to_year.r)}  fwd_woe_S=${fmt(b.forward_woe_same_season.r)}`);
  }
  line("");
  line("career-games bands -- win_over_expectation persistence & forward:");
  for (const b of p.winOverExpectationSampleSizeBands) {
    line(`   ${b.band.padEnd(18)} n=${String(b.coach_seasons).padStart(4)}  yoy_r=${fmt(b.year_to_year.r)}  fwd_woe_S=${fmt(b.forward_woe_same_season.r)}`);
  }
  line("");
  line("=== CURRENT (2026) COACH CONTEXT -- NO RATING ===");
  line("team  coach                  status     careerW-L  win%   g   careerATS   L17ATS  tenure'26");
  for (const r of p.currentCoachContext) {
    line(
      r.team.padEnd(5) + " " +
      r.coach.padEnd(22) + " " +
      r.offseason_status.padEnd(10) + " " +
      r.career_wl.padStart(9) + "  " +
      (r.career_win_pct == null ? "  -  " : r.career_win_pct.toFixed(3)) + " " +
      String(r.career_games).padStart(3) + "  " +
      r.career_ats.padStart(10) + "  " +
      String(r.last17_ats ?? "-").padStart(6) + "  " +
      (r.first_year_with_team_2026 ? "Y1(new team)" : "Y" + r.tenure_year_2026)
    );
  }
}
function fmt(r) { return r == null ? "  n/a " : (r >= 0 ? " " : "") + r.toFixed(3); }

main().catch((e) => { console.error(`[nfl:coach-research] FAILED: ${e.stack || e.message}`); process.exit(1); });
