/**
 * AI Picks v2 automation -- zero-cost planner for the v2 handicap slate
 * (scripts/run-nfl-ai-handicap-v2-slate.ts). Makes NO model or network call:
 * every signal is a file already on disk (games schedule, fresh football
 * context, betting-lines artifact, the provider's evidence file, the newest v2
 * record and its input fingerprint, the published presentation artifact).
 *
 * It follows the v1 planner (nfl-ai-slate-plan.ts) -- same providers, same
 * "reuse the sanctioned repricing path" rule, same schedule loader -- but reasons
 * about v2 records, which the v1 snapshot lineage does not know about.
 *
 * WHAT DRIVES EACH DECISION (per game, per provider):
 *
 *   football-context change   footballContextHash(packet) !== record.contextHash.
 *                             That hash is the market-BLIND identity (the exact
 *                             Stage A input), so it moves for injuries, weather,
 *                             new completed games, schedule facts -- never for a
 *                             sportsbook price or a JKB opinion field.
 *   evidence change           stageAEvidenceHash (ids of the evidence Stage A can
 *                             see) !== record.inputs.stageAEvidenceHash. A record
 *                             written before this automation has no fingerprint,
 *                             so evidence is treated as unchanged for it until
 *                             its next regeneration (never a paid guess).
 *   market change             detectMarketChange(): displayed spread or total
 *                             moved, or a key-number (3/7) status flipped.
 *   presentation change       the published card for the provider is missing or
 *                             its generatedAt differs from the newest record's.
 *
 * ACTIONS: none | research_initial | research_update | handicap_initial |
 * football_update | market_reprice | presentation_only | blocked.
 * "Stage A" only ever reruns for a football-context/evidence change; a market-only
 * change reruns Stage B alone against the locked Stage A on the record.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateGameContextPacket } from "./nfl-game-context-validators";
import { evidenceArtifactPath, readEvidenceArtifact } from "./nfl-evidence-store";
import type { EvidenceModel } from "./nfl-evidence-types";
import { footballContextHash, type NflGameContextPacket, type TeamsArtifact } from "./nfl-full-game-context";
import { loadFreshGameContextPacket } from "./nfl-full-game-context-loader";
import { availabilityHash, detectMarketChange, loadHandicapV2MarketContext, recordFingerprint, stageAEvidenceHash, weatherHash } from "./nfl-handicap-v2-inputs";
import type { HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import { readLatestPublishableHandicapV2Record } from "./nfl-handicap-v2-presentation";
import type { HandicapV2Record } from "./nfl-handicap-v2-types";
import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import { readSnapshotHistory } from "./nfl-snapshot-store";
import { loadScheduleGames, AI_SLATE_PROVIDERS, type ScheduleGame } from "./nfl-ai-slate-plan";
import { readAttemptLedger, type V2AttemptLedger } from "./nfl-ai-v2-attempt-ledger";
import { DEFAULT_RESEARCH_MODE, type ResearchMode } from "./nfl-ai-v2-research-mode";

export { AI_SLATE_PROVIDERS };

/* -------------------------------------------------------------------------- */
/* Lifecycle policy                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The only tunable knobs. These are NOT market thresholds (the market policy is
 * exact equality, see detectMarketChange); they only bound how often paid
 * RESEARCH may run, since a research pass has no free "did anything change" signal.
 */
export interface V2LifecyclePolicy {
  /** Inside this many hours to kickoff a game is "late week". Outside it (early week) research is initial-only. */
  lateWeekWindowHours: number;
  /**
   * Inside the late-week window, research is refreshed at most this often per game/provider even when no
   * deterministic signal moved. Needed because the internal injury artifact (matchup-injuries.json) has no
   * refresh workflow, so practice/injury news can change externally with nothing local changing.
   */
  lateWeekRefreshIntervalHours: number;
  /** Inside this many hours to kickoff, ONE final research pass runs if the last one predates the window (late inactives/QB news). Covers early kickoffs when the schedule runs then. */
  gamedayWindowHours: number;
  /** Never run two research passes for one game/provider closer together than this. Applies to every trigger below, including an availability/weather change. */
  minResearchIntervalHours: number;
  /** After a failed research pass, wait this long before trying again. */
  researchRetryCooldownHours: number;
}

export const DEFAULT_V2_LIFECYCLE_POLICY: V2LifecyclePolicy = {
  lateWeekWindowHours: 72,
  lateWeekRefreshIntervalHours: 24,
  gamedayWindowHours: 12,
  minResearchIntervalHours: 6,
  researchRetryCooldownHours: 12,
};

const MS_PER_HOUR = 3_600_000;

export type LifecyclePhase = "early_week" | "late_week" | "gameday" | "locked";

export function lifecyclePhase(kickoffUtc: string | null, now: Date, policy: V2LifecyclePolicy = DEFAULT_V2_LIFECYCLE_POLICY): LifecyclePhase {
  if (!kickoffUtc) return "early_week";
  const hours = (Date.parse(kickoffUtc) - now.getTime()) / MS_PER_HOUR;
  if (hours <= 0) return "locked";
  if (hours <= policy.gamedayWindowHours) return "gameday";
  if (hours <= policy.lateWeekWindowHours) return "late_week";
  return "early_week";
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type V2Action = "none" | "research_initial" | "research_update" | "handicap_initial" | "football_update" | "market_reprice" | "presentation_only" | "blocked";
export type V2BlockedKind = "locked" | "context" | "market" | "failed_attempt";
export type V2ResearchStep = "none" | "initial" | "update";
export type V2HandicapStep = "none" | "initial" | "update" | "repricing";

export interface V2GameFacts {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string | null;
  now: Date;
  /** null when the context is usable; otherwise why it is not. */
  contextBlockedReason: string | null;
  footballContextHash: string | null;
  availabilityHash: string | null;
  weatherHash: string | null;
  /** The market Stage B would be shown right now; null = no usable spread. */
  market: HandicapV2MarketContext | null;
}

export interface V2ProviderFacts {
  provider: EvidenceModel;
  evidence: { exists: boolean; generatedAt: string | null; stageAEvidenceHash: string | null; count: number };
  /** True when the v1 snapshot lineage the research UPDATE script requires already exists. */
  hasSnapshotLineage: boolean;
  record: HandicapV2Record | null;
  /** True when the newest record is not what the published presentation artifact shows for this provider. */
  presentationStale: boolean;
  ledger: V2AttemptLedger;
}

export interface V2PlanOptions {
  /**
   * "site-only" (default): JKB/local data only -- research is NEVER planned, provider evidence is ignored (it need not
   * exist), and a new game costs Stage A + Stage B. "live": the original lifecycle with paid provider research passes.
   */
  researchMode?: ResearchMode;
  policy?: V2LifecyclePolicy;
  forceResearch?: boolean;
  forceHandicap?: boolean;
  /** Allow a handicap attempt whose inputs are identical to a previously failed attempt. */
  retryFailed?: boolean;
  /** Set by the executor when it re-plans AFTER a research pass, so research is not scheduled twice. */
  researchAlreadyRan?: boolean;
  /** Set with researchAlreadyRan when the pass changed the Stage A-visible evidence (also covers records that predate the input fingerprint). */
  evidenceChangedByResearch?: boolean;
}

export interface V2ProviderPlan {
  provider: EvidenceModel;
  action: V2Action;
  blockedKind: V2BlockedKind | null;
  research: V2ResearchStep;
  /** research update needs the v1 snapshot lineage; when missing, a zero-cost bootstrap runs first. */
  needsBootstrap: boolean;
  handicap: V2HandicapStep;
  /** research runs first and only THEN is it known whether Stage A must rerun (see reasons). */
  handicapConditional: boolean;
  presentationStale: boolean;
  reasons: string[];
  /** Set by applyJobLimit: this provider/game job was planned but is held back this run. The fields above are then zeroed so nothing executes or is counted. */
  deferred?: { action: V2Action; research: V2ResearchStep; handicap: V2HandicapStep; handicapConditional: boolean };
}

export interface V2GamePlan {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string | null;
  phase: LifecyclePhase;
  locked: boolean;
  contextBlockedReason: string | null;
  providers: Record<EvidenceModel, V2ProviderPlan>;
  presentation: "regenerate" | "skip";
}

/* -------------------------------------------------------------------------- */
/* Pure decision                                                              */
/* -------------------------------------------------------------------------- */

/** Identifies the exact inputs of a paid handicap attempt (see nfl-ai-v2-attempt-ledger.ts). */
export function handicapInputKey(action: string, game: V2GameFacts, facts: V2ProviderFacts, researchMode: ResearchMode = DEFAULT_RESEARCH_MODE): string {
  return contentHash({
    action,
    football: game.footballContextHash,
    // site-only: provider evidence is not an input to the handicap, so it must not make two otherwise-identical attempts look different.
    evidence: researchMode === "site-only" ? null : facts.evidence.stageAEvidenceHash,
    homeLine: game.market?.spread.homeLine ?? null,
    total: game.market?.total.line ?? null,
  } as JsonValue);
}

function plan(provider: EvidenceModel, partial: Partial<V2ProviderPlan> & { action: V2Action; reasons: string[] }, facts: V2ProviderFacts): V2ProviderPlan {
  return { provider, blockedKind: null, research: "none", needsBootstrap: false, handicap: "none", handicapConditional: false, presentationStale: facts.presentationStale, ...partial };
}

function researchDueReason(game: V2GameFacts, facts: V2ProviderFacts, record: HandicapV2Record, opts: V2PlanOptions): string | null {
  if (opts.researchAlreadyRan) return null;
  if (opts.forceResearch) return "--force-research requested";
  const policy = opts.policy ?? DEFAULT_V2_LIFECYCLE_POLICY;
  const lastAt = facts.evidence.generatedAt ? Date.parse(facts.evidence.generatedAt) : Number.NaN;
  if (Number.isFinite(lastAt) && (game.now.getTime() - lastAt) / MS_PER_HOUR < policy.minResearchIntervalHours) return null;
  const failedResearch = facts.ledger.research;
  if (failedResearch && (game.now.getTime() - Date.parse(failedResearch.failedAt)) / MS_PER_HOUR < policy.researchRetryCooldownHours) return null;

  const phase = lifecyclePhase(game.kickoffUtc, game.now, policy);
  if (phase === "locked" || phase === "early_week") return null;

  // Inside the late-week window: a deterministic availability/weather change is worth researching sooner than the cadence.
  const inputs = recordFingerprint(record);
  if (inputs && game.availabilityHash && inputs.availabilityHash !== game.availabilityHash) return "availability (injury/QB/inactive) data changed since the last handicap";
  if (inputs && game.weatherHash && inputs.weatherHash !== game.weatherHash) return "weather data changed since the last handicap";

  // One final pass once inside the gameday window, if none has run since the window opened.
  if (phase === "gameday" && game.kickoffUtc) {
    const windowOpensAt = Date.parse(game.kickoffUtc) - policy.gamedayWindowHours * MS_PER_HOUR;
    if (!Number.isFinite(lastAt) || lastAt < windowOpensAt) return `gameday pass: last research (${facts.evidence.generatedAt ?? "unknown"}) predates the ${policy.gamedayWindowHours}h pre-kickoff window`;
  }

  // Time-based cadence: no free signal can tell us about external practice/injury news, so refresh on a bounded clock.
  const hoursSince = (game.now.getTime() - lastAt) / MS_PER_HOUR;
  if (!Number.isFinite(lastAt) || hoursSince >= policy.lateWeekRefreshIntervalHours) {
    return `late-week refresh: last research was ${Number.isFinite(lastAt) ? `${Math.floor(hoursSince)}h ago` : "at an unknown time"} (cadence ${policy.lateWeekRefreshIntervalHours}h, ${phase.replace("_", " ")})`;
  }
  return null;
}

/** Blocks a paid handicap attempt whose inputs are identical to the last FAILED one, unless --retry-failed. The ledger is read, never cleared. */
function failedAttemptGuard(provider: EvidenceModel, game: V2GameFacts, facts: V2ProviderFacts, opts: V2PlanOptions, action: string): V2ProviderPlan | null {
  const failed = facts.ledger.handicap;
  if (!failed || opts.retryFailed || failed.inputKey !== handicapInputKey(action, game, facts, opts.researchMode)) return null;
  return plan(provider, { action: "blocked", blockedKind: "failed_attempt", reasons: [`previous ${action} attempt failed at ${failed.failedAt} on identical inputs and is not retried automatically (${failed.error}); pass --retry-failed or wait for an input change`] }, facts);
}

/**
 * Site-only decision: what Stage A / Stage B must rerun for, with NO research and NO dependence on provider evidence.
 * new game -> Stage A + B; football-context change -> Stage A + B; market-only change -> Stage B alone (locked Stage A);
 * nothing changed -> zero calls.
 */
function planSiteOnly(game: V2GameFacts, facts: V2ProviderFacts, opts: V2PlanOptions, presentationOnly: (why: string) => V2ProviderPlan): V2ProviderPlan {
  const provider = facts.provider;
  const mode = "site-only mode: no provider research pass";
  const record = facts.record;
  if (!record) {
    return failedAttemptGuard(provider, game, facts, opts, "handicap_initial") ?? plan(provider, { action: "handicap_initial", handicap: "initial", reasons: [mode, "no v2 handicap exists for this game yet: Stage A + Stage B from JKB site data"] }, facts);
  }
  const reasons: string[] = [];
  if (game.footballContextHash != null && game.footballContextHash !== record.contextHash) reasons.push("football context changed since the stored record");
  if (opts.forceHandicap) reasons.push("--force-handicap requested");
  if (reasons.length > 0) {
    return failedAttemptGuard(provider, game, facts, opts, "football_update") ?? plan(provider, { action: "football_update", handicap: "update", reasons: [mode, ...reasons, "Stage A + Stage B rerun"] }, facts);
  }
  const marketReasons = detectMarketChange(record, game.market as HandicapV2MarketContext);
  if (marketReasons.length > 0) {
    return failedAttemptGuard(provider, game, facts, opts, "market_reprice") ?? plan(provider, { action: "market_reprice", handicap: "repricing", reasons: [mode, ...marketReasons, "football context unchanged: the locked Stage A is reused, only Stage B reruns"] }, facts);
  }
  return presentationOnly("no material football or market change since the stored record");
}

export function planProviderV2(game: V2GameFacts, facts: V2ProviderFacts, opts: V2PlanOptions = {}): V2ProviderPlan {
  const provider = facts.provider;
  const presentationOnly = (why: string): V2ProviderPlan =>
    facts.presentationStale ? plan(provider, { action: "presentation_only", reasons: [why, "published presentation is missing or older than the newest v2 record (no model call)"] }, facts) : plan(provider, { action: "none", reasons: [why] }, facts);

  const phase = lifecyclePhase(game.kickoffUtc, game.now, opts.policy);
  if (phase === "locked") {
    return facts.presentationStale
      ? plan(provider, { action: "presentation_only", reasons: ["post-kickoff: the pregame handicap is locked and is never rewritten", "published presentation lags the stored record (export only, no model call)"] }, facts)
      : plan(provider, { action: "blocked", blockedKind: "locked", reasons: ["post-kickoff: the pregame handicap is locked and is never rewritten"] }, facts);
  }
  if (game.contextBlockedReason) return plan(provider, { action: "blocked", blockedKind: "context", reasons: [`context cannot be built: ${game.contextBlockedReason}`] }, facts);
  if (!game.market) return plan(provider, { action: "blocked", blockedKind: "market", reasons: ["no usable current spread yet -- Stage B needs the exact displayed line"] }, facts);

  if ((opts.researchMode ?? DEFAULT_RESEARCH_MODE) === "site-only") return planSiteOnly(game, facts, opts, presentationOnly);

  const researchFailure = facts.ledger.research;
  const policy = opts.policy ?? DEFAULT_V2_LIFECYCLE_POLICY;
  const researchCoolingDown = researchFailure != null && (game.now.getTime() - Date.parse(researchFailure.failedAt)) / MS_PER_HOUR < policy.researchRetryCooldownHours;

  // NEW GAME / NO EVIDENCE: initial research, then Stage A + B.
  if (!facts.evidence.exists) {
    if (researchCoolingDown && !opts.retryFailed) {
      return plan(provider, { action: "blocked", blockedKind: "failed_attempt", reasons: [`initial research failed at ${researchFailure!.failedAt}; retry after the ${policy.researchRetryCooldownHours}h cooldown (${researchFailure!.error})`] }, facts);
    }
    return plan(provider, { action: "research_initial", research: "initial", handicap: "initial", reasons: ["no live research evidence exists for this game/provider yet", "then Stage A + Stage B"] }, facts);
  }

  const record = facts.record;
  const guardFailed = (action: string): V2ProviderPlan | null => failedAttemptGuard(provider, game, facts, opts, action);

  // EVIDENCE BUT NO V2 RECORD: Stage A + B only (research is already paid for).
  if (!record) {
    return guardFailed("handicap_initial") ?? plan(provider, { action: "handicap_initial", handicap: "initial", reasons: ["research evidence exists but no v2 handicap has been generated"] }, facts);
  }

  const reasons: string[] = [];
  const contextChanged = game.footballContextHash != null && game.footballContextHash !== record.contextHash;
  const priorInputs = recordFingerprint(record);
  const evidenceChanged = opts.evidenceChangedByResearch === true || (priorInputs != null && facts.evidence.stageAEvidenceHash != null && priorInputs.stageAEvidenceHash !== facts.evidence.stageAEvidenceHash);
  if (contextChanged) reasons.push("football context changed since the stored record");
  if (evidenceChanged) reasons.push("Stage A-visible evidence changed since the stored record");
  if (opts.forceHandicap) reasons.push("--force-handicap requested");
  const footballChanged = contextChanged || evidenceChanged || opts.forceHandicap === true;
  const marketReasons = detectMarketChange(record, game.market);

  const researchReason = researchDueReason(game, facts, record, opts);
  if (researchReason) {
    const research: V2ResearchStep = "update";
    const base = { research, needsBootstrap: !facts.hasSnapshotLineage };
    if (footballChanged) {
      return plan(provider, { action: "research_update", ...base, handicap: "update", reasons: [`research update due: ${researchReason}`, ...reasons, "then Stage A + Stage B"] }, facts);
    }
    return plan(provider, {
      action: "research_update",
      ...base,
      handicap: "update",
      handicapConditional: true,
      reasons: [`research update due: ${researchReason}`, "afterwards: Stage A + B only if the research adds Stage A-visible evidence", ...(marketReasons.length > 0 ? [`otherwise Stage B reprice (${marketReasons.join("; ")})`] : ["otherwise no model call"])],
    }, facts);
  }

  if (footballChanged) {
    return guardFailed("football_update") ?? plan(provider, { action: "football_update", handicap: "update", reasons: [...reasons, "Stage A + Stage B rerun"] }, facts);
  }
  if (marketReasons.length > 0) {
    return guardFailed("market_reprice") ?? plan(provider, { action: "market_reprice", handicap: "repricing", reasons: [...marketReasons, "football context and evidence unchanged: the locked Stage A is reused, only Stage B reruns"] }, facts);
  }
  return presentationOnly("no material football, evidence or market change since the stored record");
}

/** Game-level roll-up. Presentation is regenerated when any provider changed something publishable; it is per game, never per slate. */
export function planGameV2(game: V2GameFacts, providers: readonly V2ProviderFacts[], opts: V2PlanOptions = {}): V2GamePlan {
  const plans = {} as Record<EvidenceModel, V2ProviderPlan>;
  for (const facts of providers) plans[facts.provider] = planProviderV2(game, facts, opts);
  const phase = lifecyclePhase(game.kickoffUtc, game.now, opts.policy);
  const list = Object.values(plans);
  const presentation = list.some((p) => p.presentationStale || p.handicap !== "none") ? "regenerate" : "skip";
  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    kickoffUtc: game.kickoffUtc,
    phase,
    locked: phase === "locked",
    contextBlockedReason: game.contextBlockedReason,
    providers: plans,
    presentation,
  };
}

/* -------------------------------------------------------------------------- */
/* Rollout limit                                                              */
/* -------------------------------------------------------------------------- */

/** A "job" is one provider on one game with paid work planned (research and/or Stage A/B). Free exports and no-ops are not jobs. */
export const isPaidJob = (plan: V2ProviderPlan): boolean => plan.research !== "none" || plan.handicap !== "none";

export interface JobLimitSummary {
  /** Paid jobs planned before any limit. */
  totalJobs: number;
  /** Jobs that will execute under the limit. */
  executing: number;
  /** Jobs held back by the limit, in plan order. */
  deferred: number;
  maxJobs: number | null;
}

/**
 * Keeps only the first `maxJobs` paid jobs, in plan order (soonest kickoff first, then provider order), and
 * marks the rest deferred. Pure, and applied to PLANS -- so it takes effect before the executor can start any
 * paid call. `null` means no limit. A deferred job keeps its planned action in `deferred` for the report and is
 * re-planned on the next run, so nothing is lost.
 */
export function applyJobLimit(plans: readonly V2GamePlan[], maxJobs: number | null): { plans: V2GamePlan[]; summary: JobLimitSummary } {
  const totalJobs = plans.reduce((n, g) => n + Object.values(g.providers).filter(isPaidJob).length, 0);
  if (maxJobs == null) return { plans: [...plans], summary: { totalJobs, executing: totalJobs, deferred: 0, maxJobs: null } };
  let remaining = maxJobs;
  const limited = plans.map((game): V2GamePlan => {
    const providers = {} as Record<EvidenceModel, V2ProviderPlan>;
    for (const [name, p] of Object.entries(game.providers) as Array<[EvidenceModel, V2ProviderPlan]>) {
      if (!isPaidJob(p)) providers[name] = p;
      else if (remaining > 0) { remaining -= 1; providers[name] = p; }
      else providers[name] = { ...p, action: "none", research: "none", needsBootstrap: false, handicap: "none", handicapConditional: false, reasons: [`deferred by --max-jobs=${maxJobs} (would be ${p.action}); it is re-planned next run`, ...p.reasons], deferred: { action: p.action, research: p.research, handicap: p.handicap, handicapConditional: p.handicapConditional } };
    }
    const presentation = Object.values(providers).some((p) => p.presentationStale || p.handicap !== "none") ? "regenerate" : "skip";
    return { ...game, providers, presentation };
  });
  const executing = Math.min(totalJobs, maxJobs);
  return { plans: limited, summary: { totalJobs, executing, deferred: totalJobs - executing, maxJobs } };
}

/* -------------------------------------------------------------------------- */
/* Fact gathering (free local reads)                                          */
/* -------------------------------------------------------------------------- */

const PRESENTATION_KEY: Record<EvidenceModel, "grokowski" | "chattyIce"> = { grok: "grokowski", chatgpt: "chattyIce" };

function publishedV2GeneratedAt(root: string, season: number, gameId: string, provider: EvidenceModel): string | null {
  const path = join(root, "public", "data", "nfl", String(season), "ai-handicaps", `${gameId}.json`);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { handicapV2?: Record<string, { generatedAt?: string } | null> };
    return parsed.handicapV2?.[PRESENTATION_KEY[provider]]?.generatedAt ?? null;
  } catch {
    return null;
  }
}

/** True when a v2 record exists for the provider but the published presentation does not show that exact record. */
export function isPresentationStale(root: string, season: number, week: number, gameId: string, provider: EvidenceModel): boolean {
  const record = readLatestPublishableHandicapV2Record(root, season, week, gameId, provider);
  return record != null && publishedV2GeneratedAt(root, season, gameId, provider) !== record.generatedAt;
}

export function gatherProviderFacts(root: string, game: Pick<V2GameFacts, "gameId" | "season" | "week">, provider: EvidenceModel): V2ProviderFacts {
  const canonical = evidenceArtifactPath(root, game.season, game.week, game.gameId, provider);
  const artifact = readEvidenceArtifact(join(dirname(canonical), "evidence.live-test.json"));
  const real = artifact && !artifact.fixture ? artifact : null;
  return {
    provider,
    evidence: { exists: real != null, generatedAt: real?.generatedAt ?? null, stageAEvidenceHash: real ? stageAEvidenceHash(real.evidence) : null, count: real?.evidence.length ?? 0 },
    hasSnapshotLineage: readSnapshotHistory(root, game.season, game.week, game.gameId, provider).length > 0,
    record: readLatestPublishableHandicapV2Record(root, game.season, game.week, game.gameId, provider),
    presentationStale: isPresentationStale(root, game.season, game.week, game.gameId, provider),
    ledger: readAttemptLedger(root, game.season, game.week, game.gameId, provider),
  };
}

export function gatherGameFacts(root: string, game: ScheduleGame, now: Date): V2GameFacts {
  const base = { gameId: game.gameId, season: game.season, week: game.week, homeTeam: game.homeAbbr, awayTeam: game.awayAbbr, now, kickoffUtc: game.dateUtc ?? null };
  const blocked = (reason: string): V2GameFacts => ({ ...base, contextBlockedReason: reason, footballContextHash: null, availabilityHash: null, weatherHash: null, market: null });
  try {
    const { result } = loadFreshGameContextPacket({ root, gameId: game.gameId, season: game.season, week: game.week, now: () => now });
    if (result.status !== "ok") return blocked(result.reason);
    const packet: NflGameContextPacket = result.packet;
    const teams = JSON.parse(readFileSync(join(root, "public", "data", "nfl", "teams.json"), "utf8")) as TeamsArtifact;
    const errors = validateGameContextPacket(packet, teams).filter((issue) => issue.severity === "error");
    if (errors.length > 0) return blocked(errors.map((i) => `${i.code}: ${i.message}`).join("; "));
    return {
      ...base,
      kickoffUtc: packet.schedule.kickoffUtc ?? base.kickoffUtc,
      contextBlockedReason: null,
      footballContextHash: footballContextHash(packet),
      availabilityHash: availabilityHash(packet),
      weatherHash: weatherHash(packet),
      market: loadHandicapV2MarketContext(root, packet, game.gameId),
    };
  } catch (err) {
    return blocked(`loader threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface PlanSlateV2Options extends V2PlanOptions {
  root: string;
  season: number;
  /** Omit to plan the week of the nearest upcoming game. */
  week?: number;
  gameId?: string;
  providers?: readonly EvidenceModel[];
  now?: () => Date;
}

/** The week of the earliest game that has not kicked off, or null in the offseason. */
export function resolveUpcomingWeek(games: readonly ScheduleGame[], now: Date): number | null {
  const upcoming = games.filter((g) => Date.parse(g.dateUtc) > now.getTime()).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
  return upcoming.length > 0 ? upcoming[0].week : null;
}

/** A planned game together with the facts it was planned from, so the executor can re-plan after research without re-reading the schedule. */
export interface SlateEntryV2 {
  facts: V2GameFacts;
  providers: V2ProviderFacts[];
  plan: V2GamePlan;
}

export function planSlateEntriesV2(options: PlanSlateV2Options): SlateEntryV2[] {
  const now = (options.now ?? (() => new Date()))();
  const providers = options.providers ?? AI_SLATE_PROVIDERS;
  const games = loadScheduleGames(options.root, options.season);
  const week = options.week ?? resolveUpcomingWeek(games, now);
  // The whole week is planned, INCLUDING games that already kicked off, so post-kickoff locks are visible in the report.
  const selected = games
    .filter((g) => (options.gameId ? g.gameId === options.gameId : week != null && g.week === week))
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
  return selected.map((g) => {
    const facts = gatherGameFacts(options.root, g, now);
    const providerFacts = providers.map((p) => gatherProviderFacts(options.root, facts, p));
    return { facts, providers: providerFacts, plan: planGameV2(facts, providerFacts, options) };
  });
}

export function planSlateV2(options: PlanSlateV2Options): V2GamePlan[] {
  return planSlateEntriesV2(options).map((entry) => entry.plan);
}
