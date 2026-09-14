/**
 * WU4.6.2/WU4.6.3 -- no-cost CLI that lists upcoming NFL games and shows,
 * per game and per provider, exactly which WU4.6 orchestration step is next
 * -- never just "eligible: true/false".
 *
 * WU4.6.3 root cause this rewrite fixes: this scanner used to call
 * `contextReady` "true" whenever a FRESH Game Context Packet could be BUILT
 * in memory from upstream artifacts (loadFreshGameContextPacket), without
 * ever checking whether the PERSISTED artifact
 * (data/nfl/game-context/<season>/<week>/<gameId>.json) that Grok's initial
 * research, the presentation generator, and both bootstrap scripts actually
 * read from disk existed. For 2026_01_DEN_KC that meant the scanner said
 * "ready" while Grok's initial research immediately failed with "No Game
 * Context Packet found ... run the WU1 fixture builder for this game
 * first." This scanner now uses the same shared preflight
 * (scripts/lib/nfl-game-context-preflight.ts) every runner uses, and reports
 * the three states distinctly: can a packet be built, does the persisted
 * artifact exist, is that persisted artifact valid.
 *
 * Makes ZERO network/API calls. Only reads:
 *   - public/data/nfl/<season>/games.json for the schedule
 *   - the shared Game Context preflight (build-check + persisted-artifact
 *     check, scripts/lib/nfl-game-context-preflight.ts)
 *   - data/nfl/analysis/<season>/<week>/<gameId>/{grok,chatgpt}/evidence.live-test.json
 *     to check whether real research already exists for that game/model
 *   - the AnalysisSnapshot store (scripts/lib/nfl-snapshot-store.ts) to check
 *     whether an initial snapshot and a WU4.6-compatible handicap analysis
 *     already exist for that game/model
 *
 * Run by hand:
 *   `npx tsx scripts/list-nfl-wu46-eligible-games.ts [--season=2026] [--limit=10]`
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkGameContextPreflight } from "./lib/nfl-game-context-preflight";
import { evidenceArtifactPath } from "./lib/nfl-evidence-store";
import { readSnapshotHistory, readLatestWu46CompatibleAnalysisSnapshot } from "./lib/nfl-snapshot-store";
import type { GamesArtifact } from "./lib/nfl-full-game-context";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  const args: { season: number; limit: number } = { season: 2026, limit: 15 };
  for (const raw of argv) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice("--season=".length));
    else if (raw.startsWith("--limit=")) args.limit = Number(raw.slice("--limit=".length));
  }
  return args;
}

function hasLiveResearch(season: number, week: number, gameId: string, model: "grok" | "chatgpt"): boolean {
  const canonicalPath = evidenceArtifactPath(ROOT, season, week, gameId, model);
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  return existsSync(liveTestPath);
}

interface ProviderStatus {
  evidenceExists: boolean;
  initialSnapshotExists: boolean;
  wu46AnalysisExists: boolean;
  nextCommand: string;
}

type OverallStatus = "ready_for_research" | "ready_for_bootstrap" | "ready_for_handicap" | "ready_for_presentation" | "blocked";

function providerStatus(season: number, week: number, gameId: string, model: "grok" | "chatgpt"): ProviderStatus {
  const evidenceExists = hasLiveResearch(season, week, gameId, model);
  const snapshots = readSnapshotHistory(ROOT, season, week, gameId, model);
  const initialSnapshotExists = snapshots.length > 0;
  const wu46AnalysisExists = readLatestWu46CompatibleAnalysisSnapshot(ROOT, season, week, gameId, model) !== null;

  const runResearchCmd = `npx tsx scripts/run-nfl-${model}-research.ts --live --game=${gameId} --mode=initial`;
  const bootstrapCmd = `npx tsx scripts/bootstrap-nfl-${model}-initial-snapshot.ts --game=${gameId}`;
  const handicapCmd = `npx tsx scripts/run-nfl-${model}-handicap.ts --live --game=${gameId} --mode=initial`;

  let nextCommand: string;
  if (!evidenceExists) nextCommand = runResearchCmd;
  else if (!initialSnapshotExists) nextCommand = bootstrapCmd;
  else if (!wu46AnalysisExists) nextCommand = handicapCmd;
  else nextCommand = "(done)";

  return { evidenceExists, initialSnapshotExists, wu46AnalysisExists, nextCommand };
}

function overallStatus(contextArtifactValid: boolean, contextCanBeBuilt: boolean, grok: ProviderStatus, chatgpt: ProviderStatus): OverallStatus {
  if (!contextArtifactValid && !contextCanBeBuilt) return "blocked";
  const anyEvidence = grok.evidenceExists || chatgpt.evidenceExists;
  const anyWu46 = grok.wu46AnalysisExists || chatgpt.wu46AnalysisExists;
  if (anyWu46) return "ready_for_presentation";
  const anyInitialSnapshot = grok.initialSnapshotExists || chatgpt.initialSnapshotExists;
  const anyEvidenceWithoutSnapshot = (grok.evidenceExists && !grok.initialSnapshotExists) || (chatgpt.evidenceExists && !chatgpt.initialSnapshotExists);
  if (anyInitialSnapshot) return "ready_for_handicap";
  if (anyEvidenceWithoutSnapshot) return "ready_for_bootstrap";
  if (!anyEvidence) return "ready_for_research";
  return "blocked";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const gamesPath = join(ROOT, "public", "data", "nfl", String(args.season), "games.json");
  if (!existsSync(gamesPath)) {
    console.error(`No schedule found at ${gamesPath}`);
    process.exit(1);
  }
  const games = (JSON.parse(readFileSync(gamesPath, "utf8")) as GamesArtifact).games;

  const now = new Date();
  const upcoming = games
    .filter((g) => Date.parse(g.dateUtc) > now.getTime())
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc))
    .slice(0, args.limit);

  if (upcoming.length === 0) {
    console.log("No upcoming games found (all kickoffs in the past for this season file).");
    return;
  }

  console.log(`Upcoming WU4.6-eligible games (kickoff after ${now.toISOString()}), earliest first:\n`);

  let firstReadyForResearchOrFurther: string | null = null;

  for (const g of upcoming) {
    const preflight = checkGameContextPreflight({ root: ROOT, gameId: g.gameId, season: g.season, week: g.week, now: () => now });
    const grok = providerStatus(g.season, g.week, g.gameId, "grok");
    const chatgpt = providerStatus(g.season, g.week, g.gameId, "chatgpt");
    const status = overallStatus(preflight.artifactValid, preflight.canBeBuilt, grok, chatgpt);

    console.log(`${g.gameId}  season=${g.season} week=${g.week}  ${g.awayTeam} @ ${g.homeTeam}  kickoffUtc=${g.dateUtc}`);
    console.log(`  contextArtifact: exists=${preflight.artifactExists} valid=${preflight.artifactValid} canBeBuilt=${preflight.canBeBuilt} generatedAt=${preflight.artifactGeneratedAt ?? "null"}`);
    if (!preflight.artifactValid && preflight.artifactValidationIssues.length > 0) {
      for (const issue of preflight.artifactValidationIssues) console.log(`    - artifact issue: ${issue}`);
    }
    if (!preflight.canBeBuilt && preflight.buildOrValidationIssues.length > 0) {
      for (const issue of preflight.buildOrValidationIssues) console.log(`    - build issue: ${issue}`);
    }
    if (!preflight.artifactValid && preflight.canBeBuilt) {
      console.log(`    -> persisted artifact missing/invalid but CAN be built: npx tsx scripts/generate-nfl-full-game-context-fixture.ts --game=${g.gameId}`);
    }
    console.log(`  grok:    evidenceExists=${grok.evidenceExists}  initialSnapshotExists=${grok.initialSnapshotExists}  wu46AnalysisExists=${grok.wu46AnalysisExists}  next=${grok.nextCommand}`);
    console.log(`  chatgpt: evidenceExists=${chatgpt.evidenceExists}  initialSnapshotExists=${chatgpt.initialSnapshotExists}  wu46AnalysisExists=${chatgpt.wu46AnalysisExists}  next=${chatgpt.nextCommand}`);
    console.log(`  overallStatus=${status}`);
    console.log("");

    if (!firstReadyForResearchOrFurther && status !== "blocked") {
      firstReadyForResearchOrFurther = g.gameId;
    }
  }

  if (firstReadyForResearchOrFurther) {
    console.log(`Earliest future game with a usable next step: ${firstReadyForResearchOrFurther}`);
  } else {
    console.log("No upcoming game currently has sufficient deterministic context to take any next WU4.6 step.");
  }
}

main();
