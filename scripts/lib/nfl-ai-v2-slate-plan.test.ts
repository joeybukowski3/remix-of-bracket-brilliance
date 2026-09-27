/**
 * AI Picks v2 automation -- planner decisions. Pure: every case hands the
 * planner already-gathered facts, so no file, network or model is touched.
 */
import { describe, expect, it } from "vitest";
import { estimateCalls } from "../run-nfl-ai-handicap-v2-slate";
import { detectMarketChange } from "./nfl-handicap-v2-inputs";
import { DEFAULT_V2_LIFECYCLE_POLICY, handicapInputKey, lifecyclePhase, planGameV2, planProviderV2, resolveUpcomingWeek } from "./nfl-ai-v2-slate-plan";
import { KICKOFF, gameFacts, market, providerFacts, record } from "./nfl-ai-v2-slate.fixtures";

const at = (iso: string) => new Date(iso);
const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };

describe("no material change", () => {
  it("plans nothing and no model call when context, evidence and market are unchanged", () => {
    const plan = planProviderV2(gameFacts(), providerFacts());
    expect(plan.action).toBe("none");
    expect(plan.research).toBe("none");
    expect(plan.handicap).toBe("none");
  });

  it("does not treat a legacy record without a fingerprint as changed evidence", () => {
    const legacy = providerFacts("grok", { record: record("grok", { inputs: undefined }) });
    const plan = planProviderV2(gameFacts({ availabilityHash: "different", weatherHash: "different" }), legacy);
    expect(plan.action).toBe("none");
  });
});

describe("new game / first generation", () => {
  it("plans initial research then Stage A + B when no evidence exists", () => {
    const plan = planProviderV2(gameFacts(), providerFacts("grok", { evidence: noEvidence, record: null }));
    expect(plan).toMatchObject({ action: "research_initial", research: "initial", handicap: "initial" });
  });

  it("plans Stage A + B only when evidence exists but no v2 record does", () => {
    const plan = planProviderV2(gameFacts(), providerFacts("grok", { record: null }));
    expect(plan).toMatchObject({ action: "handicap_initial", research: "none", handicap: "initial" });
  });

  it("is blocked without a usable market or context rather than guessing", () => {
    expect(planProviderV2(gameFacts({ market: null }), providerFacts("grok", { record: null }))).toMatchObject({ action: "blocked", blockedKind: "market" });
    expect(planProviderV2(gameFacts({ contextBlockedReason: "no teams" }), providerFacts())).toMatchObject({ action: "blocked", blockedKind: "context" });
  });
});

describe("football change reruns Stage A + B", () => {
  it("reruns on a football-context hash change", () => {
    const plan = planProviderV2(gameFacts({ footballContextHash: "ctx2" }), providerFacts());
    expect(plan).toMatchObject({ action: "football_update", handicap: "update", research: "none" });
  });

  it("reruns when the Stage A-visible evidence set changed", () => {
    const plan = planProviderV2(gameFacts(), providerFacts("grok", { evidence: { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev2", count: 6 } }));
    expect(plan).toMatchObject({ action: "football_update", handicap: "update" });
  });

  it("prefers the full rerun over a repricing when football and market both moved", () => {
    const plan = planProviderV2(gameFacts({ footballContextHash: "ctx2", market: market(-6.5) }), providerFacts());
    expect(plan.handicap).toBe("update");
  });
});

describe("market-only change reprices Stage B and reuses Stage A", () => {
  it("reprices on a spread move with football context and evidence unchanged", () => {
    const plan = planProviderV2(gameFacts({ market: market(-6.5) }), providerFacts());
    expect(plan).toMatchObject({ action: "market_reprice", handicap: "repricing", research: "none" });
    expect(plan.reasons.join(" ")).toMatch(/spread moved/);
  });

  it("reprices on a total move", () => {
    const plan = planProviderV2(gameFacts({ market: market(-7, 47) }), providerFacts());
    expect(plan.action).toBe("market_reprice");
    expect(plan.reasons.join(" ")).toMatch(/total moved/);
  });

  it("reprices when the line moves off a key number", () => {
    const plan = planProviderV2(gameFacts({ market: market(-7.5) }), providerFacts());
    expect(plan.action).toBe("market_reprice");
    expect(plan.reasons.join(" ")).toMatch(/key number/);
  });

  it("reprices when the book range starts straddling a key number even though the displayed line held", () => {
    const straddling = { ...market(), keyNumbers: { ...market().keyNumbers, bookRangeCrossesKeyNumber: true } };
    expect(detectMarketChange(record(), straddling).join(" ")).toMatch(/straddling/);
  });

  it("does NOT reprice for price-only movement or a change in other books that leaves key numbers alone", () => {
    const m = market();
    const priceMoved = { ...m, spread: { ...m.spread, homePrice: -115, awayPrice: -105 } };
    const rangeMoved = { ...m, bookRange: { bookCount: 9, spreadByHomeLine: [], homeLineMin: -7.5, homeLineMax: -6.5, totalMin: 45, totalMax: 46 } };
    expect(detectMarketChange(record(), priceMoved)).toEqual([]);
    expect(detectMarketChange(record(), rangeMoved)).toEqual([]);
    expect(planProviderV2(gameFacts({ market: priceMoved }), providerFacts()).action).toBe("none");
  });
});

describe("research refresh policy", () => {
  const gameday = at("2026-09-27T09:00:00.000Z"); // 8h before kickoff
  const staleEvidence = { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 5 };

  it("runs one gameday research pass when the last pass predates the 12h window", () => {
    const plan = planProviderV2(gameFacts({ now: gameday }), providerFacts("grok", { evidence: staleEvidence }));
    expect(plan).toMatchObject({ action: "research_update", research: "update", handicapConditional: true });
    expect(plan.reasons.join(" ")).toMatch(/gameday pass/);
  });

  it("does not repeat the gameday pass once one has run inside the window", () => {
    const done = { ...staleEvidence, generatedAt: "2026-09-27T06:00:00.000Z" };
    expect(planProviderV2(gameFacts({ now: gameday }), providerFacts("grok", { evidence: done })).research).toBe("none");
  });

  it("never runs research earlier in the week just because time passed", () => {
    const early = gameFacts({ now: at("2026-09-22T12:00:00.000Z") });
    expect(planProviderV2(early, providerFacts("grok", { evidence: { ...staleEvidence, generatedAt: "2026-09-20T00:00:00.000Z" } })).research).toBe("none");
  });

  it("updates research late in the week when the availability or weather data changed", () => {
    const stale = { ...staleEvidence, generatedAt: "2026-09-24T00:00:00.000Z" };
    expect(planProviderV2(gameFacts({ availabilityHash: "av2" }), providerFacts("grok", { evidence: stale })).reasons.join(" ")).toMatch(/availability/);
    expect(planProviderV2(gameFacts({ weatherHash: "w2" }), providerFacts("grok", { evidence: stale })).reasons.join(" ")).toMatch(/weather/);
  });

  it("respects the minimum interval between research passes", () => {
    const justRan = { ...staleEvidence, generatedAt: "2026-09-25T11:00:00.000Z" };
    expect(planProviderV2(gameFacts({ availabilityHash: "av2" }), providerFacts("grok", { evidence: justRan })).research).toBe("none");
  });

  it("bootstraps the snapshot lineage first when a research update needs it", () => {
    const plan = planProviderV2(gameFacts({ now: gameday }), providerFacts("grok", { evidence: staleEvidence, hasSnapshotLineage: false }));
    expect(plan.needsBootstrap).toBe(true);
  });

  it("with football already changed, the research update is followed by a definite Stage A + B", () => {
    const plan = planProviderV2(gameFacts({ now: gameday, footballContextHash: "ctx2" }), providerFacts("grok", { evidence: staleEvidence }));
    expect(plan).toMatchObject({ action: "research_update", handicap: "update", handicapConditional: false });
  });

  it("after research the re-plan is not asked to research again", () => {
    const plan = planProviderV2(gameFacts({ now: gameday }), providerFacts("grok", { evidence: staleEvidence }), { researchAlreadyRan: true, evidenceChangedByResearch: true });
    expect(plan).toMatchObject({ action: "football_update", research: "none" });
  });

  it("forces research on request", () => {
    expect(planProviderV2(gameFacts(), providerFacts(), { forceResearch: true }).research).toBe("update");
  });
});

describe("lifecycle", () => {
  it("classifies early week, late week, gameday and locked", () => {
    expect(lifecyclePhase(KICKOFF, at("2026-09-23T00:00:00.000Z"))).toBe("early_week");
    expect(lifecyclePhase(KICKOFF, at("2026-09-25T12:00:00.000Z"))).toBe("late_week");
    expect(lifecyclePhase(KICKOFF, at("2026-09-27T08:00:00.000Z"))).toBe("gameday");
    expect(lifecyclePhase(KICKOFF, at("2026-09-27T17:00:00.000Z"))).toBe("locked");
    expect(DEFAULT_V2_LIFECYCLE_POLICY.gamedayWindowHours).toBeLessThan(DEFAULT_V2_LIFECYCLE_POLICY.lateWeekWindowHours);
  });

  it("locks a post-kickoff game: no research, no handicap, whatever changed", () => {
    const late = gameFacts({ now: at("2026-09-27T18:00:00.000Z"), footballContextHash: "ctx2", market: market(-3) });
    const plan = planProviderV2(late, providerFacts("grok", { record: null, evidence: noEvidence }));
    expect(plan).toMatchObject({ action: "blocked", blockedKind: "locked", research: "none", handicap: "none" });
  });

  it("still allows a free export of an existing record after kickoff, never a rewrite", () => {
    const plan = planProviderV2(gameFacts({ now: at("2026-09-27T18:00:00.000Z") }), providerFacts("grok", { presentationStale: true }));
    expect(plan).toMatchObject({ action: "presentation_only", research: "none", handicap: "none" });
  });

  it("resolves the upcoming week as the week of the next kickoff", () => {
    const games = [
      { gameId: "a", season: 2026, week: 2, homeAbbr: "a", awayAbbr: "b", dateUtc: "2026-09-20T17:00:00.000Z", status: "final" },
      { gameId: "b", season: 2026, week: 3, homeAbbr: "a", awayAbbr: "b", dateUtc: "2026-09-27T17:00:00.000Z", status: "scheduled" },
    ];
    expect(resolveUpcomingWeek(games, at("2026-09-25T00:00:00.000Z"))).toBe(3);
    expect(resolveUpcomingWeek(games, at("2027-03-01T00:00:00.000Z"))).toBeNull();
  });
});

describe("presentation", () => {
  it("plans a presentation-only export when the published card lags the newest record", () => {
    expect(planProviderV2(gameFacts(), providerFacts("grok", { presentationStale: true }))).toMatchObject({ action: "presentation_only", handicap: "none" });
  });

  it("regenerates the game once when any provider changes and skips it when none does", () => {
    const changed = planGameV2(gameFacts({ market: market(-6.5) }), [providerFacts("grok"), providerFacts("chatgpt")]);
    expect(changed.presentation).toBe("regenerate");
    const quiet = planGameV2(gameFacts(), [providerFacts("grok"), providerFacts("chatgpt")]);
    expect(quiet.presentation).toBe("skip");
  });

  it("plans providers independently: one updates while the other has nothing to do", () => {
    const plan = planGameV2(gameFacts(), [providerFacts("grok", { evidence: { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev2", count: 6 } }), providerFacts("chatgpt")]);
    expect(plan.providers.grok.action).toBe("football_update");
    expect(plan.providers.chatgpt.action).toBe("none");
  });
});

describe("failed attempts are not retried into the same failure", () => {
  const failedFor = (action: string) => ({ handicap: { failedAt: "2026-09-25T11:00:00.000Z", action, error: "Stage B failed validation", inputKey: handicapInputKey(action, gameFacts({ market: market(-6.5) }), providerFacts()) } });

  it("blocks a repeat of a failed handicap on identical inputs", () => {
    const plan = planProviderV2(gameFacts({ market: market(-6.5) }), providerFacts("grok", { ledger: failedFor("market_reprice") }));
    expect(plan).toMatchObject({ action: "blocked", blockedKind: "failed_attempt" });
  });

  it("allows a new attempt once the inputs changed, or when explicitly retried", () => {
    const ledger = failedFor("market_reprice");
    expect(planProviderV2(gameFacts({ market: market(-6) }), providerFacts("grok", { ledger })).action).toBe("market_reprice");
    expect(planProviderV2(gameFacts({ market: market(-6.5) }), providerFacts("grok", { ledger }), { retryFailed: true }).action).toBe("market_reprice");
  });

  it("holds off repeating a failed research pass during the cooldown", () => {
    const ledger = { research: { failedAt: "2026-09-25T09:00:00.000Z", mode: "initial", error: "provider 500" } };
    expect(planProviderV2(gameFacts(), providerFacts("grok", { evidence: noEvidence, record: null, ledger })).blockedKind).toBe("failed_attempt");
    expect(planProviderV2(gameFacts({ now: at("2026-09-26T12:00:00.000Z") }), providerFacts("grok", { evidence: noEvidence, record: null, ledger })).action).toBe("research_initial");
  });
});

describe("cost estimate", () => {
  it("counts only what the plans will spend, with research-conditional calls kept separate", () => {
    const now = at("2026-09-27T09:00:00.000Z");
    const plans = [
      planGameV2(gameFacts({ market: market(-6.5) }), [providerFacts("grok"), providerFacts("chatgpt")]), // 2 reprices
      planGameV2(gameFacts({ now }), [providerFacts("grok"), providerFacts("chatgpt")]), // 2 gameday research passes, conditional A+B
      planGameV2(gameFacts(), [providerFacts("grok", { record: null, evidence: noEvidence }), providerFacts("chatgpt")]), // 1 new game
    ];
    expect(estimateCalls(plans)).toEqual({ research: 3, stageA: 1, stageB: 3, conditionalStageA: 2, conditionalStageB: 2, presentations: 3 });
  });

  it("estimates zero for a quiet slate", () => {
    expect(estimateCalls([planGameV2(gameFacts(), [providerFacts("grok"), providerFacts("chatgpt")])])).toEqual({ research: 0, stageA: 0, stageB: 0, conditionalStageA: 0, conditionalStageB: 0, presentations: 0 });
  });
});
