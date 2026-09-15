/**
 * WU6.5 -- explicit, dedicated CLI for replaying an already-archived,
 * already-paid-for provider research response that failed CLIENT-SIDE
 * normalization after the API call itself completed successfully.
 *
 * This is NEVER wired into the normal orchestrator (scripts/run-nfl-ai-handicap-slate.ts)
 * and normal live research runs NEVER silently reprocess an old raw
 * response -- replay only ever happens through this script, on an explicit
 * --run=<archived run id>, so a human always chooses exactly which archive
 * to recover.
 *
 * Makes ZERO provider/API calls, in --dry-run or --apply. All parsing,
 * candidate validation/quarantine, and evidence normalization are the exact
 * same functions a live run uses (scripts/lib/nfl-provider-research-replay.ts's
 * planChatGptReplay never forks that logic).
 *
 * `runReplay(args, root)` is the ONE entry point that touches the
 * filesystem/clock; it is exported specifically so tests can drive it
 * against a temp root without spawning a child process. `main()` is a thin
 * wrapper that parses `process.argv` and calls it with the real repo root.
 *
 * Usage:
 *   npx tsx scripts/replay-nfl-provider-research.ts --game=2026_02_DET_BUF --provider=chatgpt --run=initial-2026-09-15T12-47-19-295Z --dry-run
 *   npx tsx scripts/replay-nfl-provider-research.ts --game=2026_02_DET_BUF --provider=chatgpt --run=initial-2026-09-15T12-47-19-295Z --apply
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkGameContextPreflight } from "./lib/nfl-game-context-preflight";
import { loadSubjectIdentitySource } from "./lib/nfl-evidence-subject-identity-loader";
import { appendEvidence, createEvidenceStore, evidenceArtifactPath, readEvidenceArtifact, writeEvidenceArtifact } from "./lib/nfl-evidence-store";
import { readSnapshotHistory } from "./lib/nfl-snapshot-store";
import type { NflGameContextPacket } from "./lib/nfl-full-game-context";
import type { EvidenceNormalizationContext } from "./lib/nfl-evidence-types";
import { buildReplayManifest, checkReplaySafety, planChatGptReplay, type ChatGptReplayPlan, type ReplayManifest } from "./lib/nfl-provider-research-replay";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SUPPORTED_REPLAY_PROVIDERS = ["chatgpt"] as const;
type SupportedProvider = (typeof SUPPORTED_REPLAY_PROVIDERS)[number];

export interface ReplayCliArgs {
  gameId: string;
  provider: string;
  run: string;
  dryRun: boolean;
  apply: boolean;
}

export function parseReplayArgs(argv: string[]): ReplayCliArgs {
  const flags = new Map<string, string>();
  let dryRun = false;
  let apply = false;
  for (const arg of argv) {
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--apply") { apply = true; continue; }
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], match[2]);
  }
  return { gameId: flags.get("game") ?? "", provider: flags.get("provider") ?? "", run: flags.get("run") ?? "", dryRun, apply };
}

function loadKnownTeamAbbrs(root: string): ReadonlySet<string> {
  const path = join(root, "public", "data", "nfl", "teams.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { abbr: string }[] | { teams: { abbr: string }[] };
  const rows = Array.isArray(parsed) ? parsed : parsed.teams;
  return new Set(rows.map((row) => row.abbr.toLowerCase()));
}

/** initial-<iso-with-dashes> or probe-<iso-with-dashes> -- the exact runId shape run-nfl-chatgpt-research.ts mints. update-* runs are not supported by replay yet (see the module header). */
function modeFromRunId(runId: string): "initial" | "probe" | "update" | null {
  if (runId.startsWith("initial-")) return "initial";
  if (runId.startsWith("probe-")) return "probe";
  if (runId.startsWith("update-")) return "update";
  return null;
}

function replayManifestPath(researchDir: string): string {
  return join(researchDir, "replayed.manifest.json");
}

function printPlanReport(plan: ChatGptReplayPlan, log: (line: string) => void): void {
  log(`\n=== ARCHIVED RESPONSE ===`);
  log(`responseId: ${plan.responseId}`);
  log(`responseStatus: ${plan.responseStatus}`);
  log(`model: ${plan.responseModel}`);
  log(`createdAt (epoch s): ${plan.createdAtEpochSeconds}${plan.createdAtEpochSeconds != null ? ` (${new Date(plan.createdAtEpochSeconds * 1000).toISOString()})` : ""}`);
  log(`completedAt (epoch s): ${plan.completedAtEpochSeconds}${plan.completedAtEpochSeconds != null ? ` (${new Date(plan.completedAtEpochSeconds * 1000).toISOString()})` : ""}`);
  log(`usage: ${JSON.stringify(plan.usage)}`);
  if (!plan.responseUsableForReplay) {
    log(`\nRESPONSE NOT USABLE FOR REPLAY: ${plan.responseUnusableReason}`);
  } else {
    log(`\n=== CANDIDATES ===`);
    log(`candidates parsed: ${plan.candidatesParsedCount}`);
    log(`structurally rejected (parsing/grounding layer): ${plan.structurallyRejected.length}`);
    for (const r of plan.structurallyRejected) log(`  - [${r.groundingState ?? "structural"}] ${r.reason}`);
    log(`would normalize (accepted): ${plan.accepted.length}`);
    log(`policy-rejected by normalizeExternalEvidence: ${plan.policyRejected.length}`);
    for (const r of plan.policyRejected) log(`  - ${r.claim.slice(0, 80)}... -- ${r.reasons.join("; ")}`);
    log(`\naccepted count that would be persisted: ${plan.accepted.length}`);
  }
  log(`\nAPI calls made by this replay: 0`);
}

export interface ReplayRunResult {
  exitCode: number;
  noOpAlreadyReplayed: boolean;
  safetyViolations: string[];
  plan: ChatGptReplayPlan | null;
  applied: boolean;
}

/**
 * The one function that touches the filesystem/clock. Never imports or
 * calls runChatGptResearch (or fetch) -- see this file's tests for an
 * explicit assertion of that. `log` defaults to console.log/console.error
 * but is injectable so tests can capture output without polluting stdout.
 */
export async function runReplay(
  args: ReplayCliArgs,
  root: string,
  log: (line: string) => void = console.log,
  logError: (line: string) => void = console.error,
  now?: () => Date
): Promise<ReplayRunResult> {
  if (!args.gameId || !args.provider || !args.run) {
    logError("Usage: npx tsx scripts/replay-nfl-provider-research.ts --game=<gameId> --provider=chatgpt --run=<archived run id> [--dry-run|--apply]");
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: [], plan: null, applied: false };
  }
  if (args.dryRun === args.apply) {
    logError("Exactly one of --dry-run or --apply is required (never both, never neither) -- this script never guesses whether you want a mutation.");
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: [], plan: null, applied: false };
  }
  if (!SUPPORTED_REPLAY_PROVIDERS.includes(args.provider as SupportedProvider)) {
    logError(
      `--provider="${args.provider}" is not supported by replay yet. Only chatgpt is implemented: Grok's "initial" research mode currently persists no raw-response/diagnostics artifact on any path (see run-nfl-grok-research.ts), so there is nothing to replay FROM for Grok today. This is a real gap, not a placeholder -- see the WU6.5 report.`
    );
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: [], plan: null, applied: false };
  }
  const provider: SupportedProvider = args.provider as SupportedProvider;

  const [seasonStr, weekStr] = args.gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    logError(`--game="${args.gameId}" does not look like <season>_<week>_<AWAY>_<HOME>.`);
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: [], plan: null, applied: false };
  }

  const canonicalPath = evidenceArtifactPath(root, season, week, args.gameId, provider);
  const researchDir = join(dirname(canonicalPath), "research", args.run);
  const rawResponsePath = join(researchDir, "provider-response.raw.json");
  const manifestPath = replayManifestPath(researchDir);

  const archivedResponseExists = existsSync(rawResponsePath);
  const archiveMode = modeFromRunId(args.run);
  const alreadyReplayed = existsSync(manifestPath);

  const preflight = checkGameContextPreflight({ root, gameId: args.gameId, season, week, now });
  const contextArtifactValid = preflight.artifactExists && preflight.artifactValid;
  const snapshotLineageAlreadyExists = readSnapshotHistory(root, season, week, args.gameId, provider).length > 0;
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  const existingLiveArtifact = readEvidenceArtifact(liveTestPath);
  const liveEvidenceAlreadyExists = (existingLiveArtifact?.evidence.length ?? 0) > 0;

  const safety = checkReplaySafety({
    isPregameLocked: preflight.isPregameLocked,
    archivedResponseExists,
    // The run PATH itself encodes provider (evidenceArtifactPath's <model> segment) and gameId
    // (<gameId> segment) -- both are already baked into researchDir by construction above, so
    // "does the archive match what was requested" is really "did we resolve a path that exists
    // under the requested provider/game's own directory," which archivedResponseExists already
    // proves. These are kept as separate, explicit checks (both trivially true once the path
    // resolved) so a future caller that resolves runDir differently can't silently skip them.
    archiveProviderMatchesRequested: true,
    archiveGameIdMatchesRequested: true,
    archiveModeIsReplaySupported: archiveMode === "initial" || archiveMode === "probe",
    contextArtifactValid,
    snapshotLineageAlreadyExists,
    liveEvidenceAlreadyExists,
    alreadyReplayed,
  });

  log(`=== REPLAY: game=${args.gameId} provider=${provider} run=${args.run} mode=${args.dryRun ? "dry-run" : "apply"} ===`);
  log(`archive selected: ${rawResponsePath}`);

  if (safety.noOpAlreadyReplayed) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReplayManifest;
    log(`\nALREADY REPLAYED -- no-op. This exact archived run was replayed at ${manifest.replayedAt} (accepted=${manifest.acceptedCount}, structurallyRejected=${manifest.structurallyRejectedCount}, policyRejected=${manifest.policyRejectedCount}). No mutation performed.`);
    log(`\nAPI calls made by this replay: 0`);
    return { exitCode: 0, noOpAlreadyReplayed: true, safetyViolations: [], plan: null, applied: false };
  }

  if (!safety.ok) {
    logError(`\nREFUSING TO REPLAY -- safety check(s) failed:`);
    for (const v of safety.violations) logError(`  - ${v}`);
    logError(`\nNo mutations performed. API calls made by this replay: 0`);
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: safety.violations, plan: null, applied: false };
  }

  const rawResponseBody: unknown = JSON.parse(readFileSync(rawResponsePath, "utf8"));

  const packet = JSON.parse(readFileSync(preflight.contextArtifactPath, "utf8")) as NflGameContextPacket;
  const subjectIdentity = loadSubjectIdentitySource(root, {
    gameId: args.gameId,
    season,
    week,
    homeTeam: packet.identity.homeTeam,
    awayTeam: packet.identity.awayTeam,
  });
  const context: EvidenceNormalizationContext = {
    gameId: args.gameId,
    season,
    week,
    homeTeam: packet.identity.homeTeam,
    awayTeam: packet.identity.awayTeam,
    kickoffUtc: packet.schedule.kickoffUtc,
    contextVersion: packet.provenance.contextVersion,
    knownTeamAbbrs: loadKnownTeamAbbrs(root),
    subjectIdentity,
  };

  const plan = planChatGptReplay({ rawResponseBody, gameId: args.gameId, context });

  printPlanReport(plan, log);

  if (args.dryRun) {
    log(`\n(dry-run: no files were written)`);
    return { exitCode: 0, noOpAlreadyReplayed: false, safetyViolations: [], plan, applied: false };
  }

  // --apply from here. Every safety check already passed above (including
  // !liveEvidenceAlreadyExists), so this mirrors run-nfl-chatgpt-research.ts's
  // "initial" mode exactly: a FRESH store, never merged with anything else.
  if (!plan.responseUsableForReplay) {
    logError(`\nREFUSING TO APPLY -- archived response is not usable for replay: ${plan.responseUnusableReason}`);
    logError(`No mutations performed. API calls made by this replay: 0`);
    return { exitCode: 1, noOpAlreadyReplayed: false, safetyViolations: [], plan, applied: false };
  }

  let store = createEvidenceStore(provider, args.gameId);
  const appendOutcomes: Record<string, number> = {};
  for (const evidence of plan.accepted) {
    const appended = appendEvidence(store, evidence);
    store = appended.store;
    appendOutcomes[appended.outcome] = (appendOutcomes[appended.outcome] ?? 0) + 1;
  }

  const replayedAt = (now ?? (() => new Date()))().toISOString();
  writeEvidenceArtifact(liveTestPath, store, {
    fixture: false,
    fixtureNote: `WU6.5 replay of archived response from ${researchDir} (mode="${args.run}"). Not a new provider API call -- see ${manifestPath}.`,
  });
  log(`\nWrote replayed evidence artifact to ${liveTestPath} (${store.records.length} record(s), append outcomes: ${JSON.stringify(appendOutcomes)})`);

  const manifest = buildReplayManifest({ replayedAt, replaySourcePath: researchDir, replaySourceRunId: args.run, gameId: args.gameId, mode: archiveMode ?? "initial", plan });
  mkdirSync(researchDir, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(researchDir, "replay-run.json"),
    `${JSON.stringify(
      {
        replayedFromArchivedResponse: true,
        replayedAt,
        replaySourcePath: researchDir,
        replaySourceRunId: args.run,
        originalResponseId: plan.responseId,
        originalResponseModel: plan.responseModel,
        originalCreatedAtEpochSeconds: plan.createdAtEpochSeconds,
        originalCompletedAtEpochSeconds: plan.completedAtEpochSeconds,
        usage: plan.usage,
        candidatesParsedCount: plan.candidatesParsedCount,
        structurallyRejected: plan.structurallyRejected,
        policyRejected: plan.policyRejected,
        acceptedCount: plan.accepted.length,
        coverage: plan.coverage,
      },
      null,
      2
    )}\n`
  );
  log(`Wrote replay diagnostics to ${researchDir} (replayed.manifest.json, replay-run.json)`);
  log(`\nAPI calls made by this replay: 0`);

  return { exitCode: 0, noOpAlreadyReplayed: false, safetyViolations: [], plan, applied: true };
}

async function main(): Promise<void> {
  const args = parseReplayArgs(process.argv.slice(2));
  const result = await runReplay(args, ROOT);
  process.exitCode = result.exitCode;
}

// Guards against running main() as a side effect of a test importing this module's exported
// functions (runReplay, parseReplayArgs) -- only actually invoked when tsx runs this file
// directly. pathToFileURL (not manual string-building) is required for a correct comparison on
// Windows, where a file:// URL for an absolute path needs a THIRD leading slash before the drive
// letter (file:///C:/...), which naive string concatenation gets wrong.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
