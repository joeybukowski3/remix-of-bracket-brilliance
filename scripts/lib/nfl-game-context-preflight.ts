/**
 * WU4.6.3 -- single shared preflight for the persisted, deterministic Game
 * Context Packet (`data/nfl/game-context/<season>/<week>/<gameId>.json`).
 *
 * Root cause this module fixes: every WU4.6 consumer (Grok research, ChatGPT
 * research, Grok handicap, ChatGPT handicap, the AI presentation generator,
 * the two snapshot bootstrap scripts, and the eligibility scanner) had its
 * own ad-hoc notion of "is context ready," and those notions disagreed:
 *   - Grok's --mode=initial research, the presentation generator, and both
 *     bootstrap scripts require the PERSISTED file to already exist on disk
 *     and throw/exit if it does not.
 *   - ChatGPT's --mode=initial research, both handicap runners, and
 *     --mode=update research require only that a FRESH packet can be BUILT
 *     from upstream artifacts right now (loadFreshGameContextPacket) -- they
 *     never look at the persisted file.
 *   - The eligibility scanner (list-nfl-wu46-eligible-games.ts) reported
 *     `contextReady: true` using the fresh-build check alone, so it called a
 *     game "ready" even when the persisted file Grok's initial research
 *     actually needs was missing. That's exactly what happened for
 *     2026_01_DEN_KC: ChatGPT's fresh-build path succeeded, Grok's
 *     persisted-file path failed, and the scanner had no way to see the
 *     difference because it never checked the persisted file at all.
 *
 * This module distinguishes the three states the work order calls for:
 *   - context_can_be_built: loadFreshGameContextPacket succeeds AND the
 *     packet passes validateGameContextPacket with zero errors.
 *   - context_artifact_exists: data/nfl/game-context/<season>/<week>/<gameId>.json
 *     is present on disk.
 *   - context_artifact_valid: that persisted file parses as JSON and passes
 *     validateGameContextPacket with zero errors.
 *
 * It also exposes ONE rebuild/persist path (`rebuildAndPersistGameContext`)
 * that every "I need the persisted file to exist" caller should use instead
 * of re-deriving the write logic -- this is the same
 * build -> validate -> write sequence
 * scripts/generate-nfl-full-game-context-fixture.ts used to hardcode for
 * 2026_01_BAL_IND only; that script now delegates here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadFreshGameContextPacket } from "./nfl-full-game-context-loader";
import { validateGameContextPacket, type ValidationIssue } from "./nfl-game-context-validators";
import { isPregameStreamLocked } from "./nfl-snapshot-lock";
import type { NflGameContextPacket, TeamsArtifact } from "./nfl-full-game-context";

export interface GameContextPreflightInput {
  root: string;
  gameId: string;
  season: number;
  week: number;
  now?: () => Date;
}

export interface GameContextPreflightStatus {
  contextArtifactPath: string;
  /** Can a fresh packet be built from current upstream artifacts and does it validate clean? */
  canBeBuilt: boolean;
  buildOrValidationIssues: string[];
  /** Does the persisted file exist on disk? */
  artifactExists: boolean;
  /** If it exists, does it parse and validate clean? */
  artifactValid: boolean;
  artifactValidationIssues: string[];
  artifactGeneratedAt: string | null;
  /** Only meaningful when a packet could be built (fresh or persisted) -- has kickoff already passed? */
  kickoffUtc: string | null;
  isPregameLocked: boolean | null;
}

export function gameContextArtifactPath(root: string, season: number, week: number, gameId: string): string {
  return join(root, "data", "nfl", "game-context", String(season), String(week), `${gameId}.json`);
}

/**
 * Read-only status check. Makes zero writes. Safe to call from the
 * eligibility scanner, a runner's preflight step, or ad hoc diagnostics.
 */
export function checkGameContextPreflight(input: GameContextPreflightInput): GameContextPreflightStatus {
  const { root, gameId, season, week } = input;
  const contextArtifactPath = gameContextArtifactPath(root, season, week, gameId);

  const teams = JSON.parse(readFileSync(join(root, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;

  let canBeBuilt = false;
  let buildOrValidationIssues: string[] = [];
  let builtPacket: NflGameContextPacket | null = null;
  try {
    const { result } = loadFreshGameContextPacket({ root, gameId, season, week, now: input.now });
    if (result.status === "ok") {
      const errors = validateGameContextPacket(result.packet, teams).filter((i: ValidationIssue) => i.severity === "error");
      canBeBuilt = errors.length === 0;
      buildOrValidationIssues = errors.map((i) => `${i.code}: ${i.message}`);
      builtPacket = result.packet;
    } else {
      buildOrValidationIssues = [`buildFullGameContext: ${result.reason}`];
    }
  } catch (err) {
    buildOrValidationIssues = [`loader threw: ${err instanceof Error ? err.message : String(err)}`];
  }

  const artifactExists = existsSync(contextArtifactPath);
  let artifactValid = false;
  let artifactValidationIssues: string[] = [];
  let artifactGeneratedAt: string | null = null;
  let persistedPacket: NflGameContextPacket | null = null;

  if (artifactExists) {
    try {
      const raw = readFileSync(contextArtifactPath, "utf8");
      const parsed = JSON.parse(raw) as NflGameContextPacket;
      const errors = validateGameContextPacket(parsed, teams).filter((i: ValidationIssue) => i.severity === "error");
      artifactValid = errors.length === 0;
      artifactValidationIssues = errors.map((i) => `${i.code}: ${i.message}`);
      artifactGeneratedAt = parsed.generatedAt ?? parsed.provenance?.builtAt ?? null;
      persistedPacket = parsed;
    } catch (err) {
      artifactValidationIssues = [`parse/validate threw: ${err instanceof Error ? err.message : String(err)}`];
    }
  }

  const kickoffPacket = persistedPacket ?? builtPacket;
  const kickoffUtc = kickoffPacket?.schedule?.kickoffUtc ?? null;
  const isPregameLocked = kickoffUtc ? isPregameStreamLocked(kickoffUtc, input.now) : null;

  return {
    contextArtifactPath,
    canBeBuilt,
    buildOrValidationIssues,
    artifactExists,
    artifactValid,
    artifactValidationIssues,
    artifactGeneratedAt,
    kickoffUtc,
    isPregameLocked,
  };
}

export type RebuildGameContextResult =
  | { ok: true; contextArtifactPath: string; packet: NflGameContextPacket }
  | { ok: false; reason: string; issues: string[] };

/**
 * Builds a fresh packet from current upstream artifacts, validates it, and
 * persists it to the canonical path -- fails closed (refuses to write) if
 * kickoff has already passed, so this can never be used to fabricate a
 * pregame context artifact for a game that has already started.
 *
 * This is the ONE place that writes data/nfl/game-context/... . Every
 * caller that needs the persisted artifact to exist (Grok initial research,
 * the presentation generator, the bootstrap scripts) should call this
 * instead of re-implementing build+validate+write.
 */
export function rebuildAndPersistGameContext(input: GameContextPreflightInput): RebuildGameContextResult {
  const { root, gameId, season, week } = input;
  const nowFn = input.now ?? (() => new Date());

  const { result } = loadFreshGameContextPacket({ root, gameId, season, week, now: nowFn });
  if (result.status !== "ok") {
    return { ok: false, reason: `buildFullGameContext failed: ${result.reason}`, issues: [] };
  }

  const teams = JSON.parse(readFileSync(join(root, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;
  const issues = validateGameContextPacket(result.packet, teams);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    return { ok: false, reason: `Context packet failed validation (${errors.length} error(s))`, issues: errors.map((i) => `${i.code}: ${i.message}`) };
  }

  const kickoffUtc = result.packet.schedule?.kickoffUtc;
  if (kickoffUtc && isPregameStreamLocked(kickoffUtc, nowFn)) {
    return { ok: false, reason: `Refusing to persist: kickoff (${kickoffUtc}) has already passed for ${gameId}.`, issues: [] };
  }

  const contextArtifactPath = gameContextArtifactPath(root, season, week, gameId);
  mkdirSync(dirname(contextArtifactPath), { recursive: true });
  writeFileSync(contextArtifactPath, JSON.stringify(result.packet, null, 2) + "\n", "utf8");

  return { ok: true, contextArtifactPath, packet: result.packet };
}

export type EnsureGameContextResult =
  | { ok: true; source: "persisted" | "rebuilt"; contextArtifactPath: string; packet: NflGameContextPacket }
  | { ok: false; reason: string; issues: string[] };

/**
 * The single preflight entry point every WU4.6 runner should call before it
 * needs the persisted Game Context Packet:
 *   1. locate an existing persisted artifact and validate it
 *   2. if it exists and validates clean, use it as-is (never silently
 *      overwrite a valid artifact just because a caller ran again)
 *   3. otherwise, rebuild a fresh packet from current upstream artifacts and
 *      persist it -- failing closed (via rebuildAndPersistGameContext) if
 *      kickoff has already passed, so a stale or missing artifact can never
 *      be regenerated for a game that has already started
 *
 * This is what fixed the DEN_KC inconsistency: Grok's initial research used
 * to require step 1 to already have succeeded from a prior manual run of the
 * fixture script; ChatGPT's initial research used to skip persistence
 * entirely (step 3's build, no write) so nothing downstream (bootstrap,
 * presentation) ever saw a persisted DEN_KC artifact even though ChatGPT's
 * research itself succeeded. Both providers now go through this same
 * locate -> validate -> rebuild-and-persist-if-needed sequence.
 */
export function ensureGameContextArtifact(input: GameContextPreflightInput): EnsureGameContextResult {
  const status = checkGameContextPreflight(input);
  if (status.artifactExists && status.artifactValid) {
    const raw = readFileSync(status.contextArtifactPath, "utf8");
    return { ok: true, source: "persisted", contextArtifactPath: status.contextArtifactPath, packet: JSON.parse(raw) as NflGameContextPacket };
  }

  const rebuilt = rebuildAndPersistGameContext(input);
  if (!rebuilt.ok) return rebuilt;
  return { ok: true, source: "rebuilt", contextArtifactPath: rebuilt.contextArtifactPath, packet: rebuilt.packet };
}
