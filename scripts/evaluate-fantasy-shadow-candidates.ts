/**
 * Prospective evaluation of archived shadow projections vs realised outcomes.
 *
 *   tsx scripts/evaluate-fantasy-shadow-candidates.ts --season=2026 [--through-week=N] [--out=<file.json>]
 *
 * Uses ONLY the final pre-kickoff prediction per player/game (frozen) and the latest outcome revision. Never declares a candidate superior on a small
 * sample: each position carries verdict.status INSUFFICIENT_SAMPLE until MIN_COMPLETED_WEEKS / MIN_ROWS_PER_POSITION are met.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertArchiveIntact, currentOutcomes, readJsonl, selectFinalPreKickoff, shadowArchivePaths, type OutcomeEvent } from "./lib/fantasy-shadow-archive";
import { evaluatePosition, MIN_COMPLETED_WEEKS, MIN_ROWS_PER_POSITION, type EvalPosition, type EvalRow } from "./lib/fantasy-shadow-evaluation";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Payload = { position: EvalPosition; team: string; production: { projection: number; positionRank: number }; candidateA: { projection: number }; candidateB: { projection: number } };

export function collectEvalRows(season: number, root = ROOT, throughWeek = 18): EvalRow[] {
  const dir = join(root, "data", "fantasy", "shadow-archive", String(season));
  if (!existsSync(dir)) return [];
  const rows: EvalRow[] = [];
  for (const file of readdirSync(dir).filter((name) => /^week-\d\d\.predictions\.jsonl$/.test(name))) {
    const week = Number(file.slice(5, 7)); if (week > throughWeek) continue;
    const paths = shadowArchivePaths(root, season, week);
    const preds = selectFinalPreKickoff(assertArchiveIntact(paths.predictions));
    const outcomes = currentOutcomes(readJsonl<OutcomeEvent>(paths.outcomes).rows);
    for (const p of preds) {
      const o = outcomes.get(`${season}|${week}|${p.playerId}`); if (!o) continue;      // unresolved outcome: not scored, never zero-filled
      const pl = p.payload as unknown as Payload;
      const bCandidate = ["WR", "TE"].includes(pl.position) ? pl.candidateB.projection : pl.candidateA.projection;
      rows.push({ position: pl.position, season, week, playerId: p.playerId, team: pl.team, actual: o.actualFantasyPoints, played: o.statLine,
        production: pl.production.projection, productionRank: pl.production.positionRank, candidateA: pl.candidateA.projection, candidateB: bCandidate });
    }
  }
  return rows;
}

export function evaluateSeason(season: number, root = ROOT, throughWeek = 18) {
  const rows = collectEvalRows(season, root, throughWeek);
  return { season, thresholds: { MIN_COMPLETED_WEEKS, MIN_ROWS_PER_POSITION }, scoredPlayerGames: rows.length,
    note: "Candidate B equals Candidate A for QB/RB by construction; paired intervals are candidate minus production (negative = candidate better).",
    positions: (["QB", "RB", "WR", "TE"] as const).map((pos) => evaluatePosition(rows, pos)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o: { season: number; through: number; out: string | null } = { season: NaN, through: 18, out: null };
    for (const raw of process.argv.slice(2)) { if (raw.startsWith("--season=")) o.season = Number(raw.slice(9)); else if (raw.startsWith("--through-week=")) o.through = Number(raw.slice(15)); else if (raw.startsWith("--out=")) o.out = resolve(raw.slice(6)); else throw new Error(`Unknown argument: ${raw}`); }
    if (!Number.isInteger(o.season)) throw new Error("Required: --season=YYYY");
    const result = evaluateSeason(o.season, ROOT, o.through);
    const text = JSON.stringify(result, null, 2);
    if (o.out) { mkdirSync(dirname(o.out), { recursive: true }); writeFileSync(o.out, `${text}\n`, "utf8"); }
    console.log(text);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
