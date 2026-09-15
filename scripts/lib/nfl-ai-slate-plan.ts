/**
 * WU6 -- pure, zero-cost planning for the NFL AI handicap slate orchestrator
 * (scripts/run-nfl-ai-handicap-slate.ts). Makes NO network/provider API
 * calls: every signal here comes from files already on disk (the shared
 * Game Context preflight, the evidence store, and the AnalysisSnapshot
 * store), exactly the sources scripts/list-nfl-wu46-eligible-games.ts
 * already reads for its own free eligibility scan.
 *
 * This module answers ONE question per (game, provider): what is the next
 * cheapest correct action for context / research / handicap, and does the
 * presentation artifact need to be regenerated. It does not run any of
 * those actions -- see nfl-ai-slate-executor.ts for that.
 *
 * Market-only-change policy (WU6 report, confirmed by product decision):
 * the codebase has no sanctioned way to reuse a locked Stage A projection
 * and rerun only Stage B against a moved market -- run-nfl-grok-handicap.ts
 * / run-nfl-chatgpt-handicap.ts's mode="update" always pays for a full
 * Stage A + Stage B pass. Rather than inventing an unsupported partial-reuse
 * path, a market-only change (context/evidence unchanged) is treated as a
 * handicap no-op: the game keeps its last locked prediction until real
 * football context or evidence changes, or a human explicitly forces a
 * re-run via --force-handicap.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkGameContextPreflight, type GameContextPreflightStatus } from "./nfl-game-context-preflight";
import { evidenceArtifactPath, readEvidenceArtifact } from "./nfl-evidence-store";
import { readSnapshotHistory, readLatestWu46CompatibleAnalysisSnapshot } from "./nfl-snapshot-store";
import { footballContextHash, type NflGameContextPacket } from "./nfl-full-game-context";
import type { EvidenceModel } from "./nfl-evidence-types";

export const AI_SLATE_PROVIDERS: readonly EvidenceModel[] = ["grok", "chatgpt"];

export type ContextAction = "reuse" | "rebuild" | "blocked";
export type ResearchAction = "none" | "bootstrap" | "initial" | "update";
export type HandicapAction = "none" | "initial" | "update";
export type PresentationAction = "regenerate" | "skip";

export interface ProviderPlan {
  provider: EvidenceModel;
  research: ResearchAction;
  researchReason: string;
  handicap: HandicapAction;
  handicapReason: string;
}

export interface GamePlan {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string | null;
  locked: boolean;
  context: ContextAction;
  contextReason: string;
  providers: Record<EvidenceModel, ProviderPlan>;
  presentation: PresentationAction;
}

export interface PlanSlateOptions {
  root: string;
  season: number;
  /** Omit to plan every eligible upcoming game in the schedule for `season`. */
  week?: number;
  /** Omit to plan every eligible upcoming game in the schedule for `season`. */
  gameId?: string;
  providers?: readonly EvidenceModel[];
  forceResearch?: boolean;
  forceHandicap?: boolean;
  now?: () => Date;
}

interface ScheduleGame {
  gameId: string;
  season: number;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  dateUtc: string;
  status: string;
}

interface GamesArtifactShape {
  games: ScheduleGame[];
}

function loadScheduleGames(root: string, season: number): ScheduleGame[] {
  const gamesPath = join(root, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(gamesPath)) return [];
  return (JSON.parse(readFileSync(gamesPath, "utf8")) as GamesArtifactShape).games;
}

function hasLiveResearch(root: string, season: number, week: number, gameId: string, provider: EvidenceModel): boolean {
  const canonicalPath = evidenceArtifactPath(root, season, week, gameId, provider);
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  return existsSync(liveTestPath);
}

function readLiveEvidenceRecordCount(root: string, season: number, week: number, gameId: string, provider: EvidenceModel): number {
  const canonicalPath = evidenceArtifactPath(root, season, week, gameId, provider);
  const liveTestPath = join(dirname(canonicalPath), "evidence.live-test.json");
  const artifact = readEvidenceArtifact(liveTestPath);
  return artifact ? artifact.evidence.length : 0;
}

/**
 * A provider "update research" candidate exists when live evidence already
 * exists AND a snapshot lineage exists AND meaningful time/context has
 * passed since the snapshot's own research pass -- approximated here,
 * conservatively, by "the persisted evidence count has grown since the
 * latest snapshot's recorded evidence set" (a prior run appended evidence
 * this snapshot chain has not yet absorbed). This mirrors the freshness
 * signal nfl-snapshot-context-freshness.ts documents as PROVENANCE, not
 * VALUES -- research-update is about absorbing what is already sitting in
 * the live evidence file, never about re-triggering a paid research pass
 * just because time passed with nothing new to say.
 */
function planResearch(
  root: string,
  season: number,
  week: number,
  gameId: string,
  provider: EvidenceModel,
  forceResearch: boolean
): { action: ResearchAction; reason: string } {
  const evidenceExists = hasLiveResearch(root, season, week, gameId, provider);
  if (!evidenceExists) {
    return { action: "initial", reason: "no live evidence artifact exists yet" };
  }

  const history = readSnapshotHistory(root, season, week, gameId, provider);
  if (history.length === 0) {
    return { action: "bootstrap", reason: "live evidence exists but no snapshot lineage has been seeded yet (zero-cost)" };
  }

  if (forceResearch) {
    return { action: "update", reason: "--force-research requested an update research pass" };
  }

  const latest = history[history.length - 1];
  const currentEvidenceCount = readLiveEvidenceRecordCount(root, season, week, gameId, provider);
  if (currentEvidenceCount > latest.evidence.evidenceIds.length) {
    return { action: "update", reason: `live evidence has ${currentEvidenceCount} record(s), snapshot lineage has absorbed ${latest.evidence.evidenceIds.length}` };
  }

  return { action: "none", reason: "snapshot lineage already reflects all persisted evidence" };
}

/**
 * Handicap update is warranted only when the CONTEXT or EVIDENCE the latest
 * snapshot was stamped with has moved since that snapshot was written --
 * never on a market-only change (see this module's header). Detected by
 * comparing the latest snapshot's own context.contextHash/evidence.evidenceIds
 * (re-stamped to "fresh at handicap time" by every prior handicap run, see
 * run-nfl-grok-handicap.ts / run-nfl-chatgpt-handicap.ts) against the
 * CURRENT persisted context artifact hash and live evidence record count.
 */
function planHandicap(
  root: string,
  season: number,
  week: number,
  gameId: string,
  provider: EvidenceModel,
  contextStatus: GameContextPreflightStatus,
  forceHandicap: boolean
): { action: HandicapAction; reason: string } {
  const history = readSnapshotHistory(root, season, week, gameId, provider);
  if (history.length === 0) {
    return { action: "none", reason: "no research snapshot lineage exists yet -- research must run first" };
  }

  const wu46Compatible = readLatestWu46CompatibleAnalysisSnapshot(root, season, week, gameId, provider);
  if (!wu46Compatible) {
    return { action: "initial", reason: "no WU4.6-compatible handicap analysis exists yet" };
  }

  if (forceHandicap) {
    return { action: "update", reason: "--force-handicap requested an update handicap pass" };
  }

  if (!contextStatus.artifactValid) {
    return { action: "none", reason: "context artifact is not currently valid -- cannot evaluate for update" };
  }

  const currentContextPacket = JSON.parse(readFileSync(contextStatus.contextArtifactPath, "utf8")) as NflGameContextPacket;
  const currentContextHash = footballContextHash(currentContextPacket);
  const currentEvidenceCount = readLiveEvidenceRecordCount(root, season, week, gameId, provider);

  const contextChanged = currentContextHash !== wu46Compatible.context.contextHash;
  const evidenceChanged = currentEvidenceCount > wu46Compatible.evidence.evidenceIds.length;

  if (contextChanged || evidenceChanged) {
    const parts: string[] = [];
    if (contextChanged) parts.push("context hash changed since the last handicap run");
    if (evidenceChanged) parts.push(`evidence grew (${currentEvidenceCount} vs ${wu46Compatible.evidence.evidenceIds.length} at last handicap)`);
    return { action: "update", reason: parts.join("; ") };
  }

  return { action: "none", reason: "no material football context/evidence change since the last handicap run (market-only changes never trigger an update -- see this module's header)" };
}

function parseGameIdSeasonWeek(gameId: string): { season: number; week: number } {
  const [seasonStr, weekStr] = gameId.split("_");
  return { season: Number(seasonStr), week: Number(weekStr) };
}

export function planGame(
  root: string,
  gameId: string,
  season: number,
  week: number,
  homeTeam: string,
  awayTeam: string,
  providers: readonly EvidenceModel[],
  forceResearch: boolean,
  forceHandicap: boolean,
  now?: () => Date
): GamePlan {
  const contextStatus = checkGameContextPreflight({ root, gameId, season, week, now });

  let context: ContextAction;
  let contextReason: string;
  if (contextStatus.artifactExists && contextStatus.artifactValid) {
    context = "reuse";
    contextReason = "persisted context artifact exists and validates clean";
  } else if (contextStatus.canBeBuilt) {
    context = "rebuild";
    contextReason = "persisted artifact missing/invalid but a fresh packet can be built now";
  } else {
    context = "blocked";
    contextReason = contextStatus.buildOrValidationIssues.join("; ") || "context cannot be built from current upstream artifacts";
  }

  const locked = contextStatus.isPregameLocked === true;

  const providerPlans: Partial<Record<EvidenceModel, ProviderPlan>> = {};
  for (const provider of providers) {
    if (locked || context === "blocked") {
      providerPlans[provider] = {
        provider,
        research: "none",
        researchReason: locked ? "pregame stream is locked -- kickoff has passed" : "context is blocked",
        handicap: "none",
        handicapReason: locked ? "pregame stream is locked -- kickoff has passed" : "context is blocked",
      };
      continue;
    }
    const research = planResearch(root, season, week, gameId, provider, forceResearch);
    const handicap = planHandicap(root, season, week, gameId, provider, contextStatus, forceHandicap);
    providerPlans[provider] = {
      provider,
      research: research.action,
      researchReason: research.reason,
      handicap: handicap.action,
      handicapReason: handicap.reason,
    };
  }

  const anyWu46Analysis = providers.some((p) => readLatestWu46CompatibleAnalysisSnapshot(root, season, week, gameId, p) !== null);
  const presentation: PresentationAction = anyWu46Analysis || providers.some((p) => providerPlans[p]!.handicap !== "none") ? "regenerate" : "skip";

  return {
    gameId,
    season,
    week,
    homeTeam,
    awayTeam,
    kickoffUtc: contextStatus.kickoffUtc,
    locked,
    context,
    contextReason,
    providers: providerPlans as Record<EvidenceModel, ProviderPlan>,
    presentation,
  };
}

export function planSlate(options: PlanSlateOptions): GamePlan[] {
  const providers = options.providers ?? AI_SLATE_PROVIDERS;

  if (options.gameId) {
    const { season, week } = parseGameIdSeasonWeek(options.gameId);
    const games = loadScheduleGames(options.root, season);
    const found = games.find((g) => g.gameId === options.gameId);
    const homeTeam = found?.homeAbbr ?? "";
    const awayTeam = found?.awayAbbr ?? "";
    return [planGame(options.root, options.gameId, season, week, homeTeam, awayTeam, providers, options.forceResearch ?? false, options.forceHandicap ?? false, options.now)];
  }

  const now = options.now ?? (() => new Date());
  const games = loadScheduleGames(options.root, options.season);
  const eligible = games
    .filter((g) => options.week == null || g.week === options.week)
    .filter((g) => Date.parse(g.dateUtc) > now().getTime())
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));

  return eligible.map((g) =>
    planGame(options.root, g.gameId, g.season, g.week, g.homeAbbr, g.awayAbbr, providers, options.forceResearch ?? false, options.forceHandicap ?? false, options.now)
  );
}
