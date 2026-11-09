/**
 * Does the JKB projection do better for steady-minutes players? Error by research tier and stat, on the private hoopR import.
 *
 *   npx tsx scripts/nba-v1-tier-evaluation.ts [--input=data/nba/props-v1/player-games.json] [--out=data/nba/props-v1/tier-evaluation]
 *                                             [--captures=<directory of nba-odds-line-capture-v1 files>]
 *
 * Offline: no network, no provider, no credential, no Odds API credit. Reads the strict player-game import written by
 * scripts/nba-hoopr-import.ts and, optionally, odds captures already on disk (it never captures any). Writes
 * tier-evaluation-report.json under data/nba/ (gitignored). The data is ESPN-derived and private to the owner
 * (docs/nba-props-v1.md): the report is never committed or published. The console prints aggregate figures only, never a
 * player or a team.
 *
 * Every tier is the one the board would have shown before the game (same code, cutoff = the game's date), every projection is
 * walk-forward, and a sportsbook line counts only if it was captured before tip-off. No projection, tier or board is changed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePlayerName } from "../src/lib/nba/props/pipeline/contracts";
import { inside, writeAtomically } from "../src/lib/nba/props/pipeline/boardBuildRun";
import { EVAL_GROUPS, directionalAccuracy, evaluateGroup, evaluateTiers, tierRows, type GroupEvaluation, type LineObservation, type TieredRow } from "../src/lib/nba/props/v1/backtest/tierEvaluation";
import { parsePlayerGameImport } from "../src/lib/nba/props/v1/playerGameImport";
import { walkForward, type WalkRow } from "../src/lib/nba/props/v1/backtest/walkForward";
import { ROTATION_MIN_MPG } from "../src/lib/nba/props/researchTier";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join("data", "nba");
const arg = (name: string): string | undefined => process.argv.slice(2).find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const fmt = (value: number | null, digits = 2): string => (value === null ? "n/a" : value.toFixed(digits));
const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

const CAVEATS = [
  "Every row is a player who appeared: the import has no did-not-play rows, so error is conditional on playing, exactly like a projection on the board.",
  "Tiers use this season's completed games before each game, so early-season games are mostly Variable (fewer than five earlier games). Last season is never used to rate a player.",
  "The thresholds (20 and 25 MPG, 4 of the last 5 games within +/-20% of the median) are the preliminary ones from the board, not tuned on this sample.",
  "MAE intervals are 95% and clustered by player and by week. Groups under 100 rows are marked thin: shown, but not a finding.",
  "Directional accuracy says which way the projection leaned, not whether a price was beatable. No expected-value claim is made without timestamped prices and a backtest at those prices.",
];

function printGroup(label: string, group: GroupEvaluation): void {
  console.log(`  ${label.padEnd(12)} ${String(group.rows).padStart(6)} rows ${String(group.players).padStart(4)} players${group.thin ? " THIN" : ""}`);
  for (const m of ["minutes", "pts", "reb", "ast"] as const) {
    const x = group.measures[m];
    const ci = x.maeCi95 ? ` [${fmt(x.maeCi95[0])}, ${fmt(x.maeCi95[1])}]` : "";
    const paired = x.vsNaiveL10;
    const pairedCi = paired.ci95 ? ` [${fmt(paired.ci95[0])}, ${fmt(paired.ci95[1])}]` : "";
    console.log(`      ${m.padEnd(8)} MAE ${fmt(x.mae)}${ci}  = ${pct(x.maeRelative)} of mean ${fmt(x.meanActual, 1)}; bias ${fmt(x.bias)}; JKB minus naive L10 ${fmt(paired.meanDiff)}${pairedCi}`);
  }
}

/** Lines already captured on disk: one observation per player and game, the median line across the books that posted one. */
function loadLines(dir: string, rows: readonly WalkRow[], scoredIds: ReadonlySet<string>): LineObservation[] {
  const byName = new Map<string, { gameId: string; playerId: string }>();
  for (const r of rows) byName.set(`${r.gameDate}|${normalizePlayerName(r.playerName)}`, { gameId: r.gameId, playerId: r.playerId });
  const observations: LineObservation[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const capture = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
      schemaVersion?: string;
      capturedAtUtc?: string;
      event?: { commenceTimeUtc?: string; canonicalGameKey?: string };
      lines?: Array<{ playerName: string; market: string; line: number }>;
    };
    if (capture.schemaVersion !== "nba-odds-line-capture-v1" || !capture.capturedAtUtc || !capture.event?.commenceTimeUtc || !capture.event.canonicalGameKey) continue;
    const date = capture.event.canonicalGameKey.slice(0, 10);
    const perPlayer = new Map<string, number[]>();
    for (const l of capture.lines ?? []) {
      if ((l.market !== "pts" && l.market !== "reb" && l.market !== "ast") || !Number.isFinite(l.line)) continue;
      const key = `${l.market}|${normalizePlayerName(l.playerName)}`;
      perPlayer.set(key, [...(perPlayer.get(key) ?? []), l.line]);
    }
    for (const [key, values] of perPlayer) {
      const [market, name] = key.split("|") as ["pts" | "reb" | "ast", string];
      const matched = byName.get(`${date}|${name}`);
      if (!matched || !scoredIds.has(`${matched.gameId}|${matched.playerId}`)) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      observations.push({ gameId: matched.gameId, playerId: matched.playerId, stat: market, line: median, capturedAtUtc: capture.capturedAtUtc, tipoffUtc: capture.event.commenceTimeUtc });
    }
  }
  return observations;
}

function main(): void {
  const input = arg("input") ?? path.join(DATA, "props-v1", "player-games.json");
  const outDir = arg("out") ?? path.join(DATA, "props-v1", "tier-evaluation");
  const capturesArg = arg("captures");
  const imported = parsePlayerGameImport(JSON.parse(readFileSync(inside(root, input, [DATA], "the player-game import"), "utf8")));

  const seasons: Record<string, unknown> = {};
  const allTiered: TieredRow[] = [];
  for (const season of ["2025-26", "2026-27"]) {
    const result = walkForward(imported.rows, { targetSeasons: [season] });
    const tiered = tierRows(imported.rows, result.rows);
    allTiered.push(...tiered);
    const evaluation = evaluateTiers(tiered);
    // Among players who clear the primary-board bar with a stability reading: steady minutes against unsteady ones.
    const steady = tiered.filter((t) => t.mpg !== null && t.mpg >= ROTATION_MIN_MPG && t.stable === true);
    const unsteady = tiered.filter((t) => t.mpg !== null && t.mpg >= ROTATION_MIN_MPG && t.stable === false);
    const stability = { steady: evaluateGroup(steady), unsteady: evaluateGroup(unsteady) };
    seasons[season] = { targets: result.targets, scored: result.rows.length, ...evaluation, stability };
    console.log(`${season}: ${result.targets} regular-season targets, ${result.rows.length} scored`);
    printGroup("all", evaluation.overall);
    for (const group of EVAL_GROUPS) printGroup(group, evaluation.groups[group]);
    printGroup("steady20+", stability.steady);
    printGroup("unsteady20+", stability.unsteady);
  }

  let directional: ReturnType<typeof directionalAccuracy> | null = null;
  if (capturesArg) {
    const dir = inside(root, capturesArg, [DATA, path.join("..", "jkb-nba-vegas-line", DATA)], "the odds capture directory");
    if (!existsSync(dir)) throw new Error("the capture directory does not exist");
    const scored = new Set(allTiered.map((t) => `${t.row.gameId}|${t.row.playerId}`));
    const lines = loadLines(dir, imported.rows, scored);
    directional = directionalAccuracy(allTiered, lines);
    console.log(`Directional accuracy vs captured lines: ${directional.linesSupplied} lines, ${directional.linesUsed} matched to a scored game before tip-off, ${directional.excludedNotPregame} not pregame, ${directional.unmatchedLines} with no scored game`);
    for (const group of EVAL_GROUPS) {
      const c = directional.groups[group].pts;
      console.log(`  ${group.padEnd(10)} PTS called ${c.called}, hits ${c.hits}, accuracy ${pct(c.accuracy)}${c.accuracyCi95 ? ` [${pct(c.accuracyCi95[0])}, ${pct(c.accuracyCi95[1])}]` : ""}, over-rate ${pct(c.overRate)}`);
    }
  } else {
    console.log("Directional accuracy vs lines: no captures supplied (--captures=...), so none is claimed.");
  }

  const report = {
    schemaVersion: "jkb-v1-tier-evaluation-report-v1",
    private: "hoopR/ESPN-derived; private research only; never commit or publish",
    source: { sourceId: imported.sourceId, retrievedAtUtc: imported.retrievedAtUtc },
    method: "baseline v0 (frozen public defaults), walk-forward; tier from the board's own seasonStatsFor + researchProfile with the game's date as cutoff",
    caveats: CAVEATS,
    seasons,
    directional,
  };
  mkdirSync(inside(root, outDir, [DATA], "the evaluation output directory"), { recursive: true });
  writeAtomically(inside(root, path.join(outDir, "tier-evaluation-report.json"), [DATA], "the evaluation report"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report -> ${path.join(outDir, "tier-evaluation-report.json")}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof SyntaxError ? "a data file is not valid JSON" : error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
