/**
 * Phase 5C: the NBA allowance, the game-priority rule and the market-expansion rule.
 * Offline, synthetic. No provider, no secret, no network.
 */
import { describe, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { clock, sequentialIds } from "../../api-quota/__fixtures__/accounts";
import { at, captureDeps, line, makeGame, mockProps, oddsAccount, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { evidenceIsStale, monthEvidence, planCaptureBudget, quotaRequestGate, type NbaAllowance } from "./pipeline/budget";
import { daysLeftInMonth, nbaAllowance, NBA_DAILY_CREDITS, NBA_MAX_EVIDENCE_AGE_MS, NBA_MONTHLY_CREDITS, NBA_PROPOSAL_CEILING, NFL_GUARD_FLOOR, ODDS_PLAN_LIMIT, PLANNING_PEER_PER_DAY, proposeMonthly } from "./pipeline/allowance";
import { buildSnapshot, type Market, type NbaPregameSnapshot, type SnapshotInput } from "./pipeline/contracts";
import { createDayPlanner, gameNightsAfterToday } from "./pipeline/dayPlanner";
import { BASELINE_MARKETS, EXPANSION_MARKETS, expectedBaselineCredits, isUsableProjection, lineReliabilityFromHistory, planDay, projectionTier, rankCandidates, reliabilityTier, type DayBudget, type PriorityCandidate } from "./pipeline/gamePriority";
import { runPregameCapture, type ProjectionValue, type ProviderPropLine, type PropsFetchResult } from "./pipeline/pregameJob";
import { MemoryPipelineStore } from "./pipeline/store";
import { freeHeadroom, PEER_COMPONENTS, scenarioPeerMonthly, SEASON_SCENARIOS } from "./pipeline/zeroCostBudget";
import { DATA_USES } from "./sources/types";

const HOUR = 3_600_000;
const scenario = (id: string) => SEASON_SCENARIOS.find((s) => s.id === id)!;

describe("the NBA allowance", () => {
  it("matches the quota registry's NBA allocation once that allocation has landed (follow-up patch 04)", () => {
    const pool = PROVIDER_ACCOUNTS.find((a) => a.accountId === "the-odds-api:unverified-pool");
    const registry = (pool as { sportAllocations?: Array<{ sport: string; maxUnits: number; maxUnitsPerDay: number; peerReservedUnits: number; maxEvidenceAgeMs: number }> } | undefined)?.sportAllocations?.find((a) => a.sport === "nba");
    if (!registry) return; // not landed yet: nothing to compare
    expect(registry).toMatchObject({ maxUnits: NBA_MONTHLY_CREDITS, maxUnitsPerDay: NBA_DAILY_CREDITS, maxEvidenceAgeMs: NBA_MAX_EVIDENCE_AGE_MS, peerReservedUnits: Math.ceil(PLANNING_PEER_PER_DAY * 31 * 1.05) });
  });

  it("is the planning headroom: 500 - 50 NFL floor - the other sports with MLB and NCAAB paused", () => {
    expect(freeHeadroom({ planLimit: ODDS_PLAN_LIMIT, guardFloor: NFL_GUARD_FLOOR, peerMonthly: scenarioPeerMonthly(scenario("mlb-off-planning")) })).toBe(NBA_MONTHLY_CREDITS);
    expect(NBA_MONTHLY_CREDITS).toBe(206);
    expect(PLANNING_PEER_PER_DAY).toBeCloseTo(7.48, 2);
  });

  it("splits the unexplained credits into what the committed artifacts prove and what stays unattributed", () => {
    const byId = Object.fromEntries(PEER_COMPONENTS.map((c) => [c.id, c.perDay]));
    expect(byId["nfl-yardage-crosscheck"]).toBeCloseTo(10 / 12.16, 1); // 5 committed runs x 2 credits over the 12.16-day window
    expect(byId["nfl-yardage-crosscheck"] + byId["unattributed-residual"]).toBeCloseTo(2.96, 2);
    expect(PEER_COMPONENTS.reduce((sum, c) => sum + c.perDay, 0)).toBeCloseTo(12.66, 2);
  });

  it("sets a hard daily and monthly cap, the NFL floor in the reserve, and an evidence age limit", () => {
    const start = nbaAllowance(new Date("2026-10-01T00:00:00Z")); // a 31-day month
    expect(start).toMatchObject({ perDayCredits: NBA_DAILY_CREDITS, perMonthCredits: 206, maxEvidenceAgeMs: NBA_MAX_EVIDENCE_AGE_MS });
    // 31 days left at the other sports' planning rate, plus the NFL floor: 500 - 294 = 206 for NBA on day one
    expect(start.peerReserveCredits).toBe(NFL_GUARD_FLOOR + Math.ceil(7.48 * 31 * 1.05));
    expect(ODDS_PLAN_LIMIT - (start.peerReserveCredits as number)).toBe(206);
    expect(nbaAllowance(new Date("2026-11-30T12:00:00Z")).peerReserveCredits).toBe(NFL_GUARD_FLOOR + Math.ceil(7.48 * 1 * 1.05) + 0);
  });

  it("counts the days left in the provider's UTC month", () => {
    expect(daysLeftInMonth(new Date("2026-11-01T00:00:00Z"))).toBe(30);
    expect(daysLeftInMonth(new Date("2026-11-30T23:59:00Z"))).toBe(1);
    expect(daysLeftInMonth(new Date("2026-12-31T12:00:00Z"))).toBe(1);
  });

  const series = (perDay: number, days: number, endIso = "2026-11-20T00:00:00Z") =>
    Array.from({ length: days + 1 }, (_, i) => ({ at: new Date(Date.parse(endIso) - (days - i) * 24 * HOUR).toISOString(), used: Math.round(perDay * i) }));

  it("proposes nothing above the planning figure without two weeks of provider readings", () => {
    const now = new Date("2026-11-20T06:00:00Z");
    expect(proposeMonthly({ observations: [], now })).toMatchObject({ status: "initial", monthlyCredits: 206, requiresApproval: true });
    expect(proposeMonthly({ observations: series(4, 9), now })).toMatchObject({ status: "initial", monthlyCredits: 206 });
    expect(proposeMonthly({ observations: series(4, 9), now }).basis).toMatch(/14 needed/);
  });

  it("refuses a proposal built on a reading that is no longer recent", () => {
    const proposal = proposeMonthly({ observations: series(4, 20, "2026-11-10T00:00:00Z"), now: new Date("2026-11-20T00:00:00Z") });
    expect(proposal.status).toBe("initial");
    expect(proposal.basis).toMatch(/older than 3 days/);
  });

  it("proposes a larger figure from measured data, capped at the stretch case, and always asks for approval", () => {
    const now = new Date("2026-11-20T06:00:00Z");
    const modest = proposeMonthly({ observations: series(5.92, 20), now }); // NFL + cross-check + unattributed only
    expect(modest.status).toBe("proposal");
    expect(modest.monthlyCredits).toBeGreaterThan(206);
    expect(modest.monthlyCredits).toBeLessThanOrEqual(NBA_PROPOSAL_CEILING);
    expect(modest.requiresApproval).toBe(true);
    const quiet = proposeMonthly({ observations: series(1, 20), now });
    expect(quiet.monthlyCredits).toBe(NBA_PROPOSAL_CEILING);
    expect(NBA_PROPOSAL_CEILING).toBe(353);
  });

  it("proposes LESS than the planning figure when the other sports turn out to spend more", () => {
    const proposal = proposeMonthly({ observations: series(9, 20), now: new Date("2026-11-20T06:00:00Z") });
    expect(proposal.status).toBe("proposal");
    expect(proposal.monthlyCredits).toBeLessThan(206);
  });
});

describe("provider evidence", () => {
  async function pool(used = 100) {
    const time = clock("2026-11-09T22:00:00Z");
    const account = oddsAccount();
    const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
    const read = (usedNow: number) => manager.recordProviderUsage(account.accountId, [{ window: "month", observedAt: time.now().toISOString(), used: usedNow, remaining: 500 - usedNow, limit: 500 }]);
    await read(used);
    return { manager, time, id: account.accountId, read };
  }
  const allowance: NbaAllowance = { perDayCredits: 15, perMonthCredits: 206, peerReserveCredits: 100, maxEvidenceAgeMs: 24 * HOUR };

  it("reports how old the provider's reading is, and null when there is none", async () => {
    const { manager, time, id } = await pool();
    expect(await monthEvidence(manager, id, time.now())).toMatchObject({ remaining: 400, ageMs: 0 });
    time.advance(5 * HOUR);
    expect((await monthEvidence(manager, id, time.now())).ageMs).toBe(5 * HOUR);
    const empty = new QuotaManager({ accounts: [oddsAccount()], store: new MemoryUsageStore(), now: time.now });
    expect(await monthEvidence(empty, "test:odds", time.now())).toMatchObject({ observedAt: null, ageMs: null });
    expect(evidenceIsStale(allowance, { remaining: 500, observedAt: null, ageMs: null })).toBe(true);
    expect(evidenceIsStale({ perDayCredits: 1, perMonthCredits: 1 }, { remaining: 500, observedAt: null, ageMs: null })).toBe(false);
  });

  it("defers every game in the planner once the reading is older than the limit, and resumes after a new one", async () => {
    const { manager, time, id, read } = await pool();
    const plan = () => planCaptureBudget({ manager, accountId: id, gameKeys: ["g1", "g2"], marketsPerGame: 1, allowance, now: time.now() });
    expect((await plan()).affordable).toHaveLength(2);
    time.advance(24 * HOUR + 1);
    const stale = await plan();
    expect(stale.affordable).toEqual([]);
    expect(stale.deferred.map((d) => d.reason)).toEqual(["stale_evidence", "stale_evidence"]);
    await read(100);
    expect((await plan()).affordable).toHaveLength(2);
  });

  it("refuses at the request gate with NBA_STALE_EVIDENCE, and never reserves", async () => {
    const { manager, time, id, read } = await pool();
    const gate = quotaRequestGate(manager, id, "pregame-capture", allowance, time.now);
    time.advance(30 * HOUR);
    expect(await gate.reserve(1, "/events/x/odds")).toMatchObject({ ok: false, code: "NBA_STALE_EVIDENCE" });
    expect((await manager.state(id)).entries).toHaveLength(0);
    await read(100);
    expect((await gate.reserve(1, "/events/x/odds")).ok).toBe(true);
  });

  it("still enforces the peer reserve with fresh evidence", async () => {
    const { manager, time, id } = await pool(420); // 80 left, 100 must stay
    const gate = quotaRequestGate(manager, id, "pregame-capture", allowance, time.now);
    expect(await gate.reserve(1, "/events/x/odds")).toMatchObject({ ok: false, code: "NBA_PEER_RESERVE" });
  });

  it("charges the markets each game was planned with, not a flat figure", async () => {
    const { manager, time, id } = await pool();
    const marketsByGame = new Map<string, readonly Market[]>([["g1", ["pts", "reb", "ast"]], ["g2", ["pts"]]]);
    const plan = await planCaptureBudget({ manager, accountId: id, gameKeys: ["g1", "g2"], marketsPerGame: 1, marketsByGame, allowance, now: time.now() });
    expect(plan.affordable).toEqual([{ gameKey: "g1", credits: 3, markets: ["pts", "reb", "ast"] }, { gameKey: "g2", credits: 1, markets: ["pts"] }]);
    expect(plan.creditsPlanned).toBe(4);
    const tight = await planCaptureBudget({ manager, accountId: id, gameKeys: ["g1", "g2"], marketsPerGame: 1, marketsByGame, allowance: { ...allowance, perDayCredits: 3 }, now: time.now() });
    expect(tight.affordable.map((a) => a.gameKey)).toEqual(["g1"]);
    expect(tight.deferred[0]).toMatchObject({ gameKey: "g2", reason: "nba_daily_allowance" });
  });
});

describe("usable projections and line reliability", () => {
  const captured = "2026-11-09T22:00:00Z";
  const projection = (over: Partial<ProjectionValue> = {}): ProjectionValue => ({ value: 21.4, minutes: 31, modelVersion: "m1", inputCutoffUtc: "2026-11-09T20:00:00Z", ...over });

  it("accepts a projection only with real minutes and inputs no later than the capture", () => {
    expect(isUsableProjection(projection(), captured)).toBe(true);
    expect(isUsableProjection(null, captured)).toBe(false);
    expect(isUsableProjection(projection({ minutes: null }), captured)).toBe(false);
    expect(isUsableProjection(projection({ minutes: 11.9 }), captured)).toBe(false);
    expect(isUsableProjection(projection({ minutes: 12 }), captured)).toBe(true);
    expect(isUsableProjection(projection({ value: Number.NaN }), captured)).toBe(false);
    expect(isUsableProjection(projection({ value: -1 }), captured)).toBe(false);
    expect(isUsableProjection(projection({ inputCutoffUtc: "2026-11-09T22:00:01Z" }), captured)).toBe(false);
  });

  it("tiers: strong coverage, some, none; unknown reliability is neutral", () => {
    expect([0, 1, 7, 8, 14].map(projectionTier)).toEqual([0, 1, 1, 2, 2]);
    expect([null, 0.2, 0.5, 0.79, 0.8, 1].map(reliabilityTier)).toEqual([1, 0, 1, 1, 2, 2]);
  });

  const apiSnapshot = (i: number, status: "fresh" | "stale", away = "NYK", home = "BOS"): NbaPregameSnapshot => {
    const game = makeGame({ away, home });
    const input: SnapshotInput = {
      game: { canonicalGameKey: game.canonicalGameKey, sourceEventId: "evt-1", tipoffUtc: game.tipoffUtc, awayTeam: away as never, homeTeam: home as never, neutralSite: false },
      player: { canonicalPlayerId: null, sourcePlayerName: `Player ${i}`, sourcePlayerId: null, team: away as never },
      market: "pts",
      source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "bookone", sourceMarketKey: "player_points" },
      line: 20.5,
      overPrice: -110,
      underPrice: -110,
      sourceLastUpdateUtc: at(TIPOFF, 160).toISOString().replace(".000Z", "Z"),
      capturedAtUtc: at(TIPOFF, 150).toISOString().replace(".000Z", "Z"),
      maxAgeMinutes: 120,
      projection: { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: "none" },
      permissions: { permittedUses: [...DATA_USES].filter((u) => u !== "raw-redistribution") as never, licenseBasis: "synthetic", licenseReviewedOn: "2026-10-19", attestation: null },
      provenance: { runId: "run-1", importBatchId: null, creditsCharged: 1 },
    };
    const built = buildSnapshot(input);
    return { ...built, source: { ...built.source, sourceId: "the-odds-api", method: "api" }, freshness: { ...built.freshness, status } };
  };
  const now = at(TIPOFF, 100);

  it("is the share of the teams' recent API lines that were fresh, and null on thin history", () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => apiSnapshot(i, "fresh")), ...Array.from({ length: 2 }, (_, i) => apiSnapshot(10 + i, "stale"))];
    expect(lineReliabilityFromHistory(rows, ["NYK", "MIA"], now)).toBeCloseTo(0.8, 5);
    expect(lineReliabilityFromHistory(rows.slice(0, 9), ["NYK"], now)).toBeNull(); // 9 < 10 samples
    expect(lineReliabilityFromHistory(rows, ["LAL"], now)).toBeNull(); // not these teams
    expect(lineReliabilityFromHistory(rows, ["NYK"], new Date(now.getTime() + 30 * 86_400_000))).toBeNull(); // outside the window
  });

  it("ignores manual and synthetic lines: they say nothing about the provider", () => {
    const manual = Array.from({ length: 12 }, (_, i) => ({ ...apiSnapshot(i, "fresh"), source: { ...apiSnapshot(i, "fresh").source, sourceId: "manual-import" as const, method: "manual-import" as const } }));
    expect(lineReliabilityFromHistory(manual, ["NYK"], now)).toBeNull();
  });
});

describe("the day plan", () => {
  const cand = (n: number, over: Partial<PriorityCandidate> = {}): PriorityCandidate => ({ gameKey: `g${n}`, tipoffUtc: `2026-11-10T0${n}:30:00Z`, usableProjections: 0, lineReliability: null, expandable: true, ...over });
  const budget = (over: Partial<DayBudget> = {}): DayBudget => ({ dayCreditsLeft: 15, monthCreditsLeft: 206, providerCreditsAvailable: 100, futureBaselineReserve: 0, ...over });

  it("funds every game for points only when the budget allows, and does not expand by default", () => {
    const plan = planDay({ candidates: [1, 2, 3, 4, 5].map((n) => cand(n)), budget: budget() });
    expect(plan.funded).toHaveLength(5);
    expect(plan.funded.every((f) => f.markets.join() === "pts" && f.credits === 1)).toBe(true);
    expect(plan.creditsPlanned).toBe(5);
    expect(plan.expansion).toEqual({ granted: 0, blocked: "expansion is not approved" });
    expect(BASELINE_MARKETS).toEqual(["pts"]);
    expect(EXPANSION_MARKETS).toEqual(["reb", "ast"]);
  });

  it("ranks usable projections first, then line reliability, then the earliest tipoff, then the key", () => {
    const ranked = rankCandidates([
      cand(1, { usableProjections: 0, lineReliability: 0.95 }),
      cand(2, { usableProjections: 3, lineReliability: 0.2 }),
      cand(3, { usableProjections: 3, lineReliability: 0.9 }),
      cand(4, { usableProjections: 12, lineReliability: null }),
      cand(5, { usableProjections: 3, lineReliability: 0.9, tipoffUtc: "2026-11-10T02:00:00Z" }),
    ]);
    expect(ranked.map((c) => c.gameKey)).toEqual(["g4", "g5", "g3", "g2", "g1"]);
  });

  it("does not mutate its input and gives the same answer for any input order", () => {
    const input = [1, 2, 3, 4].map((n) => cand(n, { usableProjections: n % 2 }));
    const copy = JSON.stringify(input);
    const a = planDay({ candidates: input, budget: budget({ dayCreditsLeft: 2 }) });
    const b = planDay({ candidates: [...input].reverse(), budget: budget({ dayCreditsLeft: 2 }) });
    expect(JSON.stringify(input)).toBe(copy);
    expect(a.funded.map((f) => f.gameKey)).toEqual(b.funded.map((f) => f.gameKey));
  });

  it("funds the better games when credits run short, and names the ceiling that bound", () => {
    const candidates = [cand(1), cand(2, { usableProjections: 9 }), cand(3, { usableProjections: 2 }), cand(4)];
    const day = planDay({ candidates, budget: budget({ dayCreditsLeft: 2 }) });
    expect(day.funded.map((f) => f.gameKey)).toEqual(["g2", "g3"]);
    expect(day.unfunded).toEqual([{ gameKey: "g1", reason: "day_budget" }, { gameKey: "g4", reason: "day_budget" }]);
    expect(planDay({ candidates, budget: budget({ monthCreditsLeft: 1 }) }).unfunded[0].reason).toBe("month_budget");
    expect(planDay({ candidates, budget: budget({ providerCreditsAvailable: 0 }) }).unfunded[0].reason).toBe("provider_reserve");
  });

  it("spends nothing without provider evidence: an unused credit is never assumed", () => {
    const plan = planDay({ candidates: [cand(1), cand(2)], budget: budget({ providerCreditsAvailable: null }), expansion: { approved: true, maxGamesPerNight: 2 } });
    expect(plan.funded).toEqual([]);
    expect(plan.unfunded.map((u) => u.reason)).toEqual(["no_provider_evidence", "no_provider_evidence"]);
    expect(plan.expansion.blocked).toBe("no fresh provider evidence");
    expect(plan.creditsPlanned).toBe(0);
  });

  describe("expansion to rebounds and assists", () => {
    const approved = { approved: true, maxGamesPerNight: 1 };
    const three = [1, 2, 3].map((n) => cand(n, { usableProjections: 10 - n }));

    it("widens only the top-ranked game, from verified spare credits", () => {
      const plan = planDay({ candidates: three, budget: budget({ futureBaselineReserve: 100, providerCreditsAvailable: 300 }), expansion: approved });
      expect(plan.funded.map((f) => f.markets.join())).toEqual(["pts,reb,ast", "pts", "pts"]);
      expect(plan.funded.map((f) => f.credits)).toEqual([3, 1, 1]);
      expect(plan.creditsPlanned).toBe(5);
      expect(plan.expansion.granted).toBe(1);
      expect(plan.spareCredits).toBe(10); // min(15-3, 206-100-3, 300-100-3) = 12, minus the 2 spent
    });

    it("never starves a later night: the points-only cost of the rest of the month is set aside first", () => {
      const blocked = planDay({ candidates: three, budget: budget({ futureBaselineReserve: 204, providerCreditsAvailable: 400 }), expansion: approved });
      expect(blocked.funded.every((f) => f.markets.length === 1)).toBe(true);
      expect(blocked.expansion.blocked).toMatch(/verified spare is -1/);
      const providerBound = planDay({ candidates: three, budget: budget({ futureBaselineReserve: 150, providerCreditsAvailable: 150 }), expansion: approved });
      expect(providerBound.expansion.granted).toBe(0);
    });

    it("needs the owner's approval, and honors the per-night limit", () => {
      expect(planDay({ candidates: three, budget: budget(), expansion: { approved: false, maxGamesPerNight: 3 } }).expansion.granted).toBe(0);
      expect(planDay({ candidates: three, budget: budget(), expansion: { approved: true, maxGamesPerNight: 2 } }).funded.map((f) => f.markets.length)).toEqual([3, 3, 1]);
      expect(planDay({ candidates: three, budget: budget(), expansion: { approved: true, maxGamesPerNight: 0 } }).expansion.granted).toBe(0);
    });

    it("never widens a retry: only a game's first provider call may carry the larger set", () => {
      const retry = [cand(1, { usableProjections: 10, expandable: false }), cand(2, { usableProjections: 5 }), cand(3)];
      const plan = planDay({ candidates: retry, budget: budget(), expansion: approved });
      expect(plan.funded.map((f) => [f.gameKey, f.markets.length])).toEqual([["g1", 1], ["g2", 3], ["g3", 1]]);
    });
  });

  it("never plans more than the smallest ceiling, over many random budgets and slates", () => {
    let seed = 20261019;
    const next = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * n);
    };
    for (let i = 0; i < 400; i += 1) {
      const candidates = Array.from({ length: next(16) }, (_, n) => cand(n, { usableProjections: next(12), lineReliability: next(3) === 0 ? null : next(100) / 100, expandable: next(4) !== 0 }));
      const b = budget({ dayCreditsLeft: next(30) - 3, monthCreditsLeft: next(220) - 5, providerCreditsAvailable: next(5) === 0 ? null : next(300) - 5, futureBaselineReserve: next(200) });
      const plan = planDay({ candidates, budget: b, expansion: { approved: next(2) === 1, maxGamesPerNight: next(4) } });
      const ceiling = b.providerCreditsAvailable === null ? 0 : Math.max(0, Math.min(b.dayCreditsLeft, b.monthCreditsLeft, b.providerCreditsAvailable));
      expect(plan.creditsPlanned).toBeLessThanOrEqual(ceiling);
      expect(plan.funded.reduce((sum, f) => sum + f.credits, 0)).toBe(plan.creditsPlanned);
      expect(plan.funded.length + plan.unfunded.length).toBe(candidates.length);
      if (plan.expansion.granted > 0) {
        expect(Math.max(0, b.monthCreditsLeft) - plan.creditsPlanned).toBeGreaterThanOrEqual(b.futureBaselineReserve);
        expect((b.providerCreditsAvailable as number) - plan.creditsPlanned).toBeGreaterThanOrEqual(b.futureBaselineReserve);
      }
    }
  });

  it("sets aside the points-only cost of the nights still to come", () => {
    expect(expectedBaselineCredits(0)).toBe(0);
    expect(expectedBaselineCredits(18)).toBe(135);
    expect(expectedBaselineCredits(-3)).toBe(0);
    expect(gameNightsAfterToday(new Date("2026-11-09T22:00:00Z"))).toBe(18); // Nov 9 ET: 21 days left x 28/31
    expect(gameNightsAfterToday(new Date("2026-11-30T22:00:00Z"))).toBe(0);
  });
});

describe("the planner inside a capture run", () => {
  const NOW = at(TIPOFF, 150); // 17:00 ET Nov 9
  const TEAMS = { strong: "BOS", some: "DEN", none: "MIA", other: "LAL" };

  /** A provider that answers only for the markets it is asked for and charges one credit per market returned. */
  function marketAware(lines: ProviderPropLine[]) {
    const calls: Array<{ sourceEventId: string; markets: readonly string[] }> = [];
    return {
      sourceId: "synthetic-odds" as const,
      calls,
      async fetchEventProps(event: { sourceEventId: string; markets: readonly Market[] }): Promise<PropsFetchResult> {
        calls.push({ sourceEventId: event.sourceEventId, markets: event.markets });
        const returned = lines.filter((l) => event.markets.includes(l.market));
        return { status: "ok", lines: returned, creditsCharged: new Set(returned.map((l) => l.market)).size, requestRef: "req" };
      },
    };
  }
  const slate = (home: string, away: string, lastUpdateUtc: string): ProviderPropLine[] => [
    line({ playerName: `${home} Guard`, team: home, market: "pts", line: 22.5, lastUpdateUtc }),
    line({ playerName: `${home} Guard`, team: home, market: "reb", line: 5.5, lastUpdateUtc }),
    line({ playerName: `${home} Guard`, team: home, market: "ast", line: 6.5, lastUpdateUtc }),
    line({ playerName: `${away} Wing`, team: away, market: "pts", line: 17.5, lastUpdateUtc }),
  ];
  const allLines = (...games: Array<[string, string]>) => games.flatMap(([home, away]) => slate(home, away, "2026-11-09T21:30:00Z"));
  const freshLines = (...games: Array<[string, string]>) => games.flatMap(([home, away]) => slate(home, away, "2026-11-09T23:15:00Z"));

  async function world(options: { used?: number; allowance?: Partial<NbaAllowance>; expansion?: { approved: boolean; maxGamesPerNight: number }; games: Array<ReturnType<typeof makeGame>> }) {
    const time = clock(NOW.toISOString());
    const account = oddsAccount();
    const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
    const used = options.used ?? 0;
    await manager.recordProviderUsage(account.accountId, [{ window: "month", observedAt: time.now().toISOString(), used, remaining: 500 - used, limit: 500 }]);
    const allowance: NbaAllowance = { perDayCredits: 15, perMonthCredits: 206, peerReserveCredits: 100, maxEvidenceAgeMs: 24 * HOUR, ...options.allowance };
    const store = new MemoryPipelineStore();
    for (const g of options.games) await store.upsertGame(g);
    const usable = (g: { homeTeam: string | null }) => (g.homeTeam === TEAMS.strong ? 10 : g.homeTeam === TEAMS.some ? 4 : 0);
    const plan = createDayPlanner({ manager, accountId: account.accountId, store, allowance, now: time.now, usableProjections: usable, expansion: options.expansion });
    const gate = quotaRequestGate(manager, account.accountId, "pregame-capture", allowance, time.now);
    const run = (provider: ReturnType<typeof marketAware>, runId = "run-1") =>
      runPregameCapture(captureDeps(store, provider as never, time.now, { plan, gate: { ...gate, accountId: "test:odds", enforcesNbaAllowance: true, reserve: gate.reserve }, runId }));
    return { store, run, time, manager, id: account.accountId };
  }
  const at150 = (home: string, away: string, extra = 0) => makeGame({ tipoffUtc: new Date(NOW.getTime() + (150 + extra) * 60_000).toISOString().replace(".000Z", "Z"), away, home });

  it("funds the best games for points only when the day's credits cannot cover all of them", async () => {
    const games = [at150(TEAMS.none, "CHI"), at150(TEAMS.strong, "NYK"), at150(TEAMS.some, "PHX"), at150(TEAMS.other, "SAC")];
    const w = await world({ games, allowance: { perDayCredits: 2 } });
    const provider = marketAware(allLines([TEAMS.none, "CHI"], [TEAMS.strong, "NYK"], [TEAMS.some, "PHX"], [TEAMS.other, "SAC"]));
    const report = await w.run(provider);
    expect(provider.calls.map((c) => c.sourceEventId).sort()).toEqual([games[1].sourceEventId, games[2].sourceEventId].sort());
    expect(provider.calls.every((c) => c.markets.join() === "pts")).toBe(true);
    expect(report).toMatchObject({ captured: 2, budgetDeferred: 2, creditsCharged: 2 });
    const deferred = (await w.store.listAttempts()).filter((a) => a.outcome === "budget_exhausted");
    expect(deferred).toHaveLength(2);
    expect(deferred[0].reason).toMatch(/day_budget/);
    expect((await w.store.listSnapshots()).every((s) => s.market === "pts")).toBe(true);
  });

  it("holds the day's credit for a better game that tips off later", async () => {
    const early = at150(TEAMS.none, "CHI"); // due now, low priority
    const later = at150(TEAMS.strong, "NYK", 80); // 230 minutes out: waiting, high priority
    const w = await world({ games: [early, later], allowance: { perDayCredits: 1 } });
    const provider = marketAware(freshLines([TEAMS.none, "CHI"], [TEAMS.strong, "NYK"]));
    const first = await w.run(provider, "run-1");
    expect(first).toMatchObject({ captured: 0, budgetDeferred: 1, waiting: 1 });
    expect(provider.calls).toHaveLength(0);
    w.time.advance(80 * 60_000); // the later game is now 150 minutes out; the early game is 70
    const second = await w.run(provider, "run-2");
    expect(provider.calls.map((c) => c.sourceEventId)).toEqual([later.sourceEventId]);
    expect(second.captured).toBe(1);
  });

  it("gives the one credit the provider's counter can spare, after the other sports' reserve, to the best game rather than the earliest", async () => {
    const early = at150(TEAMS.none, "CHI"); // tips off first, lowest rank
    const best = at150(TEAMS.strong, "NYK", 5);
    const w = await world({ games: [early, best], used: 399 }); // 101 left, 100 held for the other sports: 1 spendable
    const provider = marketAware(freshLines([TEAMS.none, "CHI"], [TEAMS.strong, "NYK"]));
    await w.run(provider);
    expect(provider.calls.map((c) => c.sourceEventId)).toEqual([best.sourceEventId]);
  });

  it("adds rebounds and assists to the single best game only when expansion is approved and the spare is verified", async () => {
    const games = [at150(TEAMS.strong, "NYK"), at150(TEAMS.some, "PHX"), at150(TEAMS.none, "CHI")];
    const w = await world({ games, expansion: { approved: true, maxGamesPerNight: 1 } });
    const provider = marketAware(allLines([TEAMS.strong, "NYK"], [TEAMS.some, "PHX"], [TEAMS.none, "CHI"]));
    const report = await w.run(provider);
    const byEvent = new Map(provider.calls.map((c) => [c.sourceEventId, c.markets.join()]));
    expect(byEvent.get(games[0].sourceEventId!)).toBe("pts,reb,ast");
    expect(byEvent.get(games[1].sourceEventId!)).toBe("pts");
    expect(byEvent.get(games[2].sourceEventId!)).toBe("pts");
    expect(report.creditsCharged).toBe(3 + 1 + 1);
    const snapshots = await w.store.listSnapshots();
    const marketsOf = (g: ReturnType<typeof makeGame>) => [...new Set(snapshots.filter((s) => s.game.canonicalGameKey === g.canonicalGameKey).map((s) => s.market))].sort();
    expect(marketsOf(games[0])).toEqual(["ast", "pts", "reb"]);
    expect(marketsOf(games[1])).toEqual(["pts"]);
    // one immutable snapshot per game, player, market and book: a repeat run adds nothing and calls nothing
    expect(new Set(snapshots.map((s) => s.marketKey)).size).toBe(snapshots.length);
    const before = JSON.stringify([snapshots, await w.store.listAttempts()]);
    await w.run(provider, "run-2");
    expect(provider.calls).toHaveLength(3);
    expect(JSON.stringify([await w.store.listSnapshots(), await w.store.listAttempts()])).toBe(before);
  });

  it("buys points only when the provider's own counter does not show spare credits", async () => {
    const games = [at150(TEAMS.strong, "NYK"), at150(TEAMS.some, "PHX")];
    const w = await world({ games, used: 390, expansion: { approved: true, maxGamesPerNight: 2 } }); // 110 left, 100 held for others: 10 usable, 135 needed set aside
    const provider = marketAware(allLines([TEAMS.strong, "NYK"], [TEAMS.some, "PHX"]));
    await w.run(provider);
    expect(provider.calls.map((c) => c.markets.join())).toEqual(["pts", "pts"]);
  });

  it("spends nothing when the provider's reading is too old", async () => {
    const w = await world({ games: [at150(TEAMS.strong, "NYK")], allowance: { maxEvidenceAgeMs: 60_000 } });
    w.time.advance(5 * 60_000);
    const provider = marketAware(allLines([TEAMS.strong, "NYK"]));
    const report = await w.run(provider);
    expect(provider.calls).toHaveLength(0);
    expect(report).toMatchObject({ captured: 0, budgetDeferred: 1 });
    expect(report.outcome).toBe("blocked");
    expect((await w.manager.state(w.id)).entries).toHaveLength(0);
  });

  it("does not widen a retry: a game that returned nothing is asked again for points only", async () => {
    const game = at150(TEAMS.strong, "NYK");
    const w = await world({ games: [game], expansion: { approved: true, maxGamesPerNight: 1 } });
    const provider = marketAware([]); // posted nothing yet
    await w.run(provider, "run-1");
    w.time.advance(30 * 60_000);
    await w.run(provider, "run-2");
    expect(provider.calls.map((c) => c.markets.join())).toEqual(["pts,reb,ast", "pts"]);
  });
});
