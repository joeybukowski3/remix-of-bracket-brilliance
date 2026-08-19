#!/usr/bin/env -S npx tsx
/**
 * generate-mlb-k-production-candidates.ts
 *
 * Phase 7 canonical K production loader. Reads the frozen production
 * artifact (public/data/mlb/hr-props-raw.json) -- the same file the
 * canonical HR publisher already reads via --source=production/local -- and
 * writes the canonical K candidate pool: the union of the Strikeout Props
 * page's Top Over Plays and Top Under Plays, exactly as rendered there.
 *
 * Never scrapes rendered HTML and never recomputes eligibility itself --
 * buildCanonicalKCandidatePool (src/lib/mlb/kPropCanonicalCandidates.ts)
 * reuses the site's own buildPitcherStrikeoutRows + buildKPropBestBets
 * pipeline unchanged, so the website and this X-post candidate source can
 * never disagree.
 *
 * A TypeScript entrypoint run directly via `tsx` (not compiled/spawned as a
 * second process) so it can import `@/lib/mlb/*` with the project's normal
 * path alias, exactly like scripts/generate-social-card-live.ts already
 * does for HR/K daily-card generation.
 *
 * Usage:
 *   npx tsx scripts/generate-mlb-k-production-candidates.ts \
 *     [--raw=public/data/mlb/hr-props-raw.json] \
 *     [--output=artifacts/mlb-x-canonical/k-production-candidates.json] \
 *     [--slate-date=YYYY-MM-DD]
 *
 * Writes `{ slateDate, generatedAt, sourceSummary, candidatePool }` -- the
 * exact shape scripts/lib/mlb-k-production-candidates.mjs's loader expects.
 * Never calls X, never touches any receipt/lease/state, never writes a
 * successful publication of any kind.
 */
import path from "node:path";
import process from "node:process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { getEasternDate } from "./generate-mlb-hr-props.mjs";
import { buildTbdGameKeySet } from "@/lib/mlb/mlbSocialSelection";
import { buildCanonicalKCandidatePool } from "@/lib/mlb/kPropCanonicalCandidates";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

type CliArgs = { raw?: string; output?: string; "slate-date"?: string };

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    (out as Record<string, string>)[key] = rest.join("=");
  }
  return out;
}

/** Same normalized check used throughout the HR/K pipeline (generate-social-card-live.ts, useMlbPropsData). */
function isStarterPlaceholder(value: unknown): boolean {
  const normalized = (typeof value === "string" ? value.trim() : "").toUpperCase();
  return !normalized || normalized === "TBD" || normalized === "TBA" || normalized === "TO BE ANNOUNCED" || normalized === "TO BE DETERMINED";
}

/** Same TBD-game / placeholder-starter exclusion useMlbPropsData() and generate-social-card-live.ts apply before any HR/K selection runs. */
function filterActiveSlate(raw: { games?: HrDashboardGame[]; pitchers?: HrDashboardPitcher[]; batters?: HrDashboardBatter[] }) {
  const allGames = raw.games ?? [];
  const allPitchers = raw.pitchers ?? [];
  const allBatters = raw.batters ?? [];
  const tbdGameKeys = buildTbdGameKeySet(allPitchers, allBatters);

  const games = allGames.filter((game) => !tbdGameKeys.has(game.gameKey));
  const pitchers = allPitchers.filter((p) => !tbdGameKeys.has(p.gameKey) && !isStarterPlaceholder(p.pitcher));
  const batters = allBatters.filter((b) => !tbdGameKeys.has(b.gameKey) && !isStarterPlaceholder(b.opposingPitcher));

  return { games, pitchers, batters };
}

const ROOT = process.cwd();
const DEFAULT_RAW_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "artifacts", "mlb-x-canonical", "k-production-candidates.json");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawPath = args.raw ? path.resolve(args.raw) : DEFAULT_RAW_PATH;
  const outputPath = args.output ? path.resolve(args.output) : DEFAULT_OUTPUT_PATH;
  const slateDate = args["slate-date"] ?? getEasternDate();

  if (!existsSync(rawPath)) throw new Error(`Production K candidate generation requires ${rawPath}, which does not exist.`);
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const { games, pitchers, batters } = filterActiveSlate(raw);

  const candidatePool = buildCanonicalKCandidatePool(batters, games, pitchers);

  const payload = {
    slateDate,
    generatedAt: new Date().toISOString(),
    sourceSummary: [`production hr-props-raw.json (generatedAt=${raw?.generatedAt ?? "unknown"})`],
    candidatePool,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(tempPath, outputPath);

  console.log(`[generate-mlb-k-production-candidates] slateDate=${slateDate} candidates=${candidatePool.length} (overs=${candidatePool.filter((c) => c.direction === "OVER").length}, unders=${candidatePool.filter((c) => c.direction === "UNDER").length}) -> ${outputPath}`);
}

main();
