/**
 * Operator CLI for the shadow total calibration candidate (jkb-nfl-total-calibration-shadow-k08-2026).
 * Shadow-only: never touches production predictions, the team-totals view, or any public artifact.
 *
 *   npx tsx scripts/nfl-total-shadow.ts retrospective [--season=2026] [--weeks=1,2] [--dry-run]
 *       Reference-only backfill of Weeks 1-2 from the archived production snapshots (cohort "retrospective").
 *   npx tsx scripts/nfl-total-shadow.ts grade [--season=2026] [--dry-run]
 *       Appends final-total outcome events for shadow rows whose games are final (never rewrites a prediction row).
 *   npx tsx scripts/nfl-total-shadow.ts report [--season=2026] [--no-grade] [--no-write]
 *       Grades, then builds the prospective-validation comparison report (JSON + markdown under <root>/report/).
 *
 * Every command accepts --shadow-archive-root=<dir> (used by tests / dry inspection). There is intentionally no k option.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNflTeamAbbr } from "../src/lib/nfl/identity/identity";
import type { PredictionSnapshotV1 } from "./lib/nfl-production-prediction-archive";
import {
  DEFAULT_SHADOW_ROOT,
  NFL_TOTAL_SHADOW_SEASON,
  archiveShadowRows,
  buildShadowRows,
  ensureShadowManifest,
  gradeShadowOutcomes,
  loadMarketTotalAt,
  loadPriorSeasonLeagueMean,
  readShadowOutcomes,
  readShadowRows,
  type ShadowRow,
  type ShadowSlateGame,
} from "./lib/nfl-total-shadow-calibration";
import { buildShadowReport, renderShadowReportMarkdown } from "./lib/nfl-total-shadow-report";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parse(argv: string[]) {
  const a = { cmd: argv[2] ?? "", season: NFL_TOTAL_SHADOW_SEASON as number, weeks: [1, 2], dryRun: false, noGrade: false, noWrite: false, root: DEFAULT_SHADOW_ROOT };
  for (const raw of argv.slice(3)) {
    if (raw.startsWith("--season=")) a.season = Number(raw.slice(9));
    else if (raw.startsWith("--weeks=")) a.weeks = raw.slice(8).split(",").map(Number);
    else if (raw === "--dry-run") a.dryRun = true;
    else if (raw === "--no-grade") a.noGrade = true;
    else if (raw === "--no-write") a.noWrite = true;
    else if (raw.startsWith("--shadow-archive-root=")) a.root = resolve(ROOT, raw.slice(22));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return a;
}

function loadSlate(season: number): ShadowSlateGame[] {
  const raw = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", String(season), "games.json"), "utf8")) as { games: { gameId: string; season: number; week: number; seasonType: string; dateUtc: string; homeAbbr: string; awayAbbr: string; neutralSite?: boolean }[] };
  return raw.games.filter((g) => g.seasonType === "REG").map((g) => ({ gameId: g.gameId, season: g.season, week: g.week, kickoffUtc: g.dateUtc, neutralSite: g.neutralSite === true, homeAbbr: normalizeNflTeamAbbr(g.homeAbbr)!, awayAbbr: normalizeNflTeamAbbr(g.awayAbbr)! }));
}

function retrospective(a: ReturnType<typeof parse>): void {
  const slate = loadSlate(a.season);
  const leagueMean = loadPriorSeasonLeagueMean(a.season);
  const now = new Date().toISOString();
  const rows: ShadowRow[] = [];
  for (const week of a.weeks) {
    const path = join(ROOT, "data", "nfl", "predictions", String(a.season), String(week).padStart(2, "0"), "nfl-total-ridge.jsonl");
    if (!existsSync(path)) { console.log(`[shadow] no production archive for week ${week}`); continue; }
    const prod = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as PredictionSnapshotV1).filter((r) => Date.parse(r.prediction_timestamp) < Date.parse(r.kickoff_utc));
    const latest = new Map<string, string>(); // game -> latest timestamp having both sides
    const byGameTs = new Map<string, Set<string>>();
    for (const r of prod) { const k = `${r.game_id}|${r.prediction_timestamp}`; const s = byGameTs.get(k) ?? new Set(); s.add(r.home_away); byGameTs.set(k, s); }
    for (const [k, sides] of byGameTs) { if (sides.size !== 2) continue; const [g, ts] = k.split("|"); if (!latest.has(g) || ts > latest.get(g)!) latest.set(g, ts); }
    const byTs = new Map<string, string[]>();
    for (const [g, ts] of latest) byTs.set(ts, [...(byTs.get(ts) ?? []), g]);
    for (const [ts, games] of byTs) {
      const records = prod.filter((r) => games.includes(r.game_id) && r.prediction_timestamp === ts);
      rows.push(...buildShadowRows({ season: a.season, generatedAt: ts, createdAt: now, runId: `retrospective:${now}`, codeRevision: null, productionRecords: records, slate: slate.filter((g) => games.includes(g.gameId)), leagueMean, retrospectiveReason: "backfill_of_archived_production_snapshot_weeks_before_first_prospective_week" }));
    }
  }
  console.log(`[shadow] retrospective rows built: ${rows.length} (prior-season league mean ${leagueMean.mean_total_points})`);
  if (a.dryRun) { for (const r of rows) console.log(`[shadow]   ${r.game_id} raw ${r.raw_jkb_total.toFixed(3)} shadow ${r.shadow_total.toFixed(3)}`); return; }
  ensureShadowManifest(a.root, now, null);
  const w = archiveShadowRows(a.root, rows);
  console.log(`[shadow] archived retrospective rows appended=${w.appended} duplicates=${w.duplicates}`);
  const g = gradeShadowOutcomes({ root: a.root, season: a.season, now });
  console.log(`[shadow] outcomes appended=${g.appended} duplicates=${g.duplicates}`);
}

function report(a: ReturnType<typeof parse>): void {
  const now = new Date().toISOString();
  if (!a.noGrade) { const g = gradeShadowOutcomes({ root: a.root, season: a.season, now }); console.log(`[shadow] graded: appended=${g.appended} duplicates=${g.duplicates}`); }
  const rows = readShadowRows(a.root, a.season);
  const outcomes = readShadowOutcomes(a.root, a.season);
  const rep = buildShadowReport({ rows, outcomes, closingMarket: (row) => loadMarketTotalAt(row.season, row.game_id, row.kickoff_utc, row.kickoff_utc).total });
  const md = renderShadowReportMarkdown(rep);
  if (!a.noWrite) {
    const dir = join(a.root, "report"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "latest.json"), `${JSON.stringify(rep, null, 2)}\n`); writeFileSync(join(dir, "latest.md"), md);
    console.log(`[shadow] wrote ${join(dir, "latest.json")}`);
  }
  console.log(md);
}

function main(): void {
  const a = parse(process.argv);
  if (a.cmd === "retrospective") retrospective(a);
  else if (a.cmd === "grade") { const g = gradeShadowOutcomes({ root: a.root, season: a.season, now: new Date().toISOString(), dryRun: a.dryRun }); console.log(`[shadow] graded=${g.graded} appended=${g.appended} duplicates=${g.duplicates}`); }
  else if (a.cmd === "report") report(a);
  else throw new Error("Usage: nfl-total-shadow.ts <retrospective|grade|report> [options]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
