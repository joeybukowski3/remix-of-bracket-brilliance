import { describe, expect, it } from "vitest";
import { clock, ESSENTIAL, NBA_PROBE, sequentialIds, testAccount } from "./__fixtures__/accounts";
import { PROVIDER_ACCOUNTS } from "./accounts";
import { endpointLabel, QuotaManager, redactDetail, UnknownAccountError } from "./manager";
import { RegistryError } from "./registry";
import { MemoryUsageStore } from "./store";
import type { Denial, ProviderAccountConfig } from "./types";

const START = "2026-10-13T12:00:00Z";
const one = { units: 1, basis: "test" };
const statusCheck = { units: 1, basis: "test", isUsageCheck: true };
const daySnapshot = (used: number, observedAt = START) => ({ window: "day" as const, observedAt: new Date(observedAt).toISOString(), used, remaining: 100 - used, limit: 100 });

function setup(account: ProviderAccountConfig = testAccount()) {
  const time = clock(START);
  const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
  return { manager, time, id: account.accountId };
}

/** Seed provider-reported usage so nonessential consumers are past the UNKNOWN_USAGE gate. */
async function knownUsage(manager: QuotaManager, id: string, used = 0) {
  await manager.recordProviderUsage(id, [daySnapshot(used)]);
}

const code = (result: unknown) => (result as Denial).code;

describe("nonessential gates", () => {
  it("blocks accounts with a policy reason, UNKNOWN plan, or no approval", async () => {
    const blocked = setup(testAccount({ nonessentialBlockedReason: "terms" }));
    expect(code(await blocked.manager.reserve(blocked.id, NBA_PROBE, one))).toBe("BLOCKED_BY_POLICY");
    const unknownPlan = setup(testAccount({ planStatus: "unknown" }));
    expect(code(await unknownPlan.manager.reserve(unknownPlan.id, NBA_PROBE, one))).toBe("UNKNOWN_PLAN");
    const unknownLimit = setup(testAccount({ windows: [{ kind: "month", limit: null, source: "unknown" }] }));
    expect(code(await unknownLimit.manager.reserve(unknownLimit.id, NBA_PROBE, one))).toBe("UNKNOWN_PLAN");
    const unapproved = setup(testAccount({ liveApproval: null }));
    expect(code(await unapproved.manager.reserve(unapproved.id, NBA_PROBE, one))).toBe("NOT_APPROVED");
  });

  it("treats an expired approval as no approval", async () => {
    const { manager, id } = setup(testAccount({ liveApproval: { id: "a", approvedBy: "u", approvedOn: "d", scope: "s", maxUnits: 10, expiresAt: "2026-10-13T11:00:00Z" } }));
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("NOT_APPROVED");
  });

  it("requires a usage check while usage is UNKNOWN, and caps the checks", async () => {
    const { manager, id } = setup();
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("UNKNOWN_USAGE");
    expect((await manager.reserve(id, NBA_PROBE, statusCheck)).allowed).toBe(true);
    expect((await manager.reserve(id, NBA_PROBE, statusCheck)).allowed).toBe(true);
    expect(code(await manager.reserve(id, NBA_PROBE, statusCheck))).toBe("USAGE_CHECK_LIMIT");
  });

  it("enforces the approval's unit budget across the approval's lifetime", async () => {
    const { manager, id } = setup(testAccount({ liveApproval: { id: "probe", approvedBy: "u", approvedOn: "d", scope: "10-request probe", maxUnits: 3, expiresAt: null } }));
    await knownUsage(manager, id);
    for (let i = 0; i < 3; i += 1) expect((await manager.reserve(id, NBA_PROBE, one)).allowed).toBe(true);
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("APPROVAL_BUDGET_EXHAUSTED");
  });

  it("does not apply nonessential gates to essential consumers", async () => {
    const { manager, id } = setup(testAccount({ liveApproval: null, nonessentialBlockedReason: "x" }));
    expect((await manager.reserve(id, ESSENTIAL, one)).allowed).toBe(true);
  });
});

describe("limits", () => {
  it("keeps the shared-account hard reserve and ordinary nonessential cap around the scoped NBA probe", async () => {
    const base = PROVIDER_ACCOUNTS.find((account) => account.accountId === "the-odds-api:unverified-pool")!;
    const account = { ...base, liveApproval: { id: "nba-one", approvedBy: "test", approvedOn: START, scope: "NBA one-event player_points one-credit probe", maxUnits: 1, expiresAt: null } };
    const { manager, id } = setup(account);
    await manager.recordProviderUsage(id, [{ window: "month", observedAt: START, used: 250, remaining: 250, limit: 500 }]);
    const probe = { priority: "nonessential", attribution: { sport: "nba", workflow: "one-credit-probe", endpoint: "/events/{id}/odds" } } as const;
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("QUOTA_HARD_STOP");
    expect((await manager.reserve(id, probe, one)).allowed).toBe(true);
    expect((await manager.reserve(id, ESSENTIAL, one)).allowed).toBe(true);

    const nearLimit = setup(account);
    await nearLimit.manager.recordProviderUsage(id, [{ window: "month", observedAt: START, used: 450, remaining: 50, limit: 500 }]);
    expect(code(await nearLimit.manager.reserve(id, probe, one))).toBe("QUOTA_HARD_STOP");
    expect(code(await nearLimit.manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
  });

  describe("scoped zero-credit NBA discovery above the ordinary cap", () => {
    const DISCOVERY_SCOPE = "NBA events discovery one request";
    const base = PROVIDER_ACCOUNTS.find((account) => account.accountId === "the-odds-api:unverified-pool")!;
    const approval = (scope: string, maxUnits: number, expiresAt: string | null = null) => ({ id: "nba-disc", approvedBy: "test", approvedOn: START, scope, maxUnits, expiresAt });
    const discovery = { priority: "nonessential", attribution: { sport: "nba", workflow: "events-discovery", endpoint: "/events" } } as const;
    const zero = { units: 0, basis: "test" };
    /** A fresh manager with the provider counter at `used` of 500, so reservations never leak between cases. */
    async function at(used: number, liveApproval: ProviderAccountConfig["liveApproval"]) {
      const { manager, id } = setup({ ...base, liveApproval });
      await manager.recordProviderUsage(id, [{ window: "month", observedAt: START, used, remaining: 500 - used, limit: 500 }]);
      return { manager, id };
    }

    it("admits the exact discovery request at 308 used / 192 remaining while ordinary NBA requests stay blocked", async () => {
      const { manager, id } = await at(308, approval(DISCOVERY_SCOPE, 0));
      expect((await manager.reserve(id, discovery, zero)).allowed).toBe(true);
      const ordinary = await at(308, approval("NBA ordinary request test", 5));
      expect(code(await ordinary.manager.reserve(ordinary.id, NBA_PROBE, one))).toBe("QUOTA_HARD_STOP");
      expect(code(await ordinary.manager.reserve(ordinary.id, discovery, zero))).toBe("QUOTA_HARD_STOP");
    });

    it("admits nothing else under the discovery approval: another endpoint, workflow, sport or any units", async () => {
      const other = (attribution: { sport: string; workflow: string; endpoint: string }) => ({ priority: "nonessential", attribution }) as const;
      for (const consumer of [
        other({ sport: "nba", workflow: "events-discovery", endpoint: "/events/{id}/odds" }),
        other({ sport: "nba", workflow: "events-discovery", endpoint: "/events/{id}/markets" }),
        other({ sport: "nba", workflow: "pregame-capture", endpoint: "/events" }),
        other({ sport: "nba", workflow: "one-credit-probe", endpoint: "/events" }),
        other({ sport: "nfl", workflow: "events-discovery", endpoint: "/events" }),
      ]) {
        const { manager, id } = await at(308, approval(DISCOVERY_SCOPE, 0));
        expect(code(await manager.reserve(id, consumer, zero)), JSON.stringify(consumer.attribution)).toBe("QUOTA_HARD_STOP");
      }
      const { manager, id } = await at(308, approval(DISCOVERY_SCOPE, 0));
      expect(code(await manager.reserve(id, discovery, one))).toBe("APPROVAL_BUDGET_EXHAUSTED");
    });

    it("needs the exact scope with a zero-unit approval that is current", async () => {
      for (const liveApproval of [approval(DISCOVERY_SCOPE, 1), approval("NBA one-event player_points one-credit probe", 1), approval("some other scope", 0)]) {
        const { manager, id } = await at(308, liveApproval);
        expect(code(await manager.reserve(id, discovery, zero)), liveApproval.scope).toBe("QUOTA_HARD_STOP");
      }
      const expired = await at(308, approval(DISCOVERY_SCOPE, 0, "2026-10-13T11:00:00Z"));
      expect(code(await expired.manager.reserve(expired.id, discovery, zero))).toBe("NOT_APPROVED");
      const none = await at(308, null);
      expect(code(await none.manager.reserve(none.id, discovery, zero))).toBe("NOT_APPROVED");
    });

    it("is single-use in the policy itself, and tied to the shared odds account", async () => {
      const { manager, id } = await at(308, approval(DISCOVERY_SCOPE, 0));
      expect((await manager.reserve(id, discovery, zero)).allowed).toBe(true);
      // The same approval already funded an attempt: a caller that skips the NBA gate gets the ordinary cap back.
      expect(code(await manager.reserve(id, discovery, zero))).toBe("QUOTA_HARD_STOP");
      const elsewhere = setup({ ...base, accountId: "some-other-odds-pool", liveApproval: approval(DISCOVERY_SCOPE, 0) });
      await elsewhere.manager.recordProviderUsage(elsewhere.id, [{ window: "month", observedAt: START, used: 308, remaining: 192, limit: 500 }]);
      expect(code(await elsewhere.manager.reserve(elsewhere.id, discovery, zero))).toBe("QUOTA_HARD_STOP");
    });

    it("still stops at the account's own hard reserve, and leaves the one-credit probe exception as it was", async () => {
      const over = await at(460, approval(DISCOVERY_SCOPE, 0));
      expect(code(await over.manager.reserve(over.id, discovery, zero))).toBe("QUOTA_HARD_STOP");
      const probe = { priority: "nonessential", attribution: { sport: "nba", workflow: "one-credit-probe", endpoint: "/events/{id}/odds" } } as const;
      const probing = await at(308, approval("NBA one-event player_points one-credit probe", 1));
      expect((await probing.manager.reserve(probing.id, probe, one)).allowed).toBe(true);
    });
  });

  it("stops nonessential consumers at the ratio cap and essential consumers at limit minus reserve", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 100, source: "provider-docs" }] }));
    await knownUsage(manager, id, 89);
    time.advance(1000);
    expect((await manager.reserve(id, NBA_PROBE, one)).allowed).toBe(true); // 90 <= floor(100*0.9)
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("QUOTA_HARD_STOP");
    expect((await manager.reserve(id, ESSENTIAL, { units: 5, basis: "t" })).allowed).toBe(true); // 95 <= 100-5
    expect(code(await manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
  });

  it("applies the per-minute rate limit with a retry hint, then frees it after a minute", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 1000, source: "provider-docs" }, { kind: "minute", limit: 2, source: "provider-docs" }] }));
    await knownUsage(manager, id);
    await manager.reserve(id, NBA_PROBE, one);
    time.advance(10_000);
    await manager.reserve(id, NBA_PROBE, one);
    const denied = (await manager.reserve(id, NBA_PROBE, one)) as Denial;
    expect(denied.code).toBe("RATE_LIMIT");
    expect(denied.retryAfterMs).toBe(50_000);
    time.advance(51_000);
    expect((await manager.reserve(id, NBA_PROBE, one)).allowed).toBe(true);
  });

  it("rejects invalid estimates", async () => {
    const { manager, id } = setup();
    expect(code(await manager.reserve(id, ESSENTIAL, { units: -1, basis: "bad" }))).toBe("INVALID_ESTIMATE");
    expect(code(await manager.reserve(id, ESSENTIAL, { units: Number.NaN, basis: "bad" }))).toBe("INVALID_ESTIMATE");
  });

  it("counts other consumers' usage reported by the provider, not just its own ledger", async () => {
    const { manager, id } = setup(testAccount({ windows: [{ kind: "day", limit: 100, source: "provider-docs" }] }));
    await manager.recordProviderUsage(id, [daySnapshot(90)]);
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("QUOTA_HARD_STOP");
  });
});

describe("settlement", () => {
  it("charges the estimate on a 2xx response without a cost header", async () => {
    const { manager, id } = setup();
    const r = await manager.reserve(id, ESSENTIAL, { units: 3, basis: "t" });
    if (!r.allowed) throw new Error("expected reservation");
    expect((await manager.settle(id, r.reservationId, { httpStatus: 200, outcome: "ok" })).actualUnits).toBe(3);
  });

  it("charges the provider-reported cost when present, and charges failed requests", async () => {
    const { manager, id } = setup();
    const a = await manager.reserve(id, ESSENTIAL, { units: 3, basis: "t" });
    const b = await manager.reserve(id, ESSENTIAL, { units: 3, basis: "t" });
    if (!a.allowed || !b.allowed) throw new Error("expected reservations");
    expect((await manager.settle(id, a.reservationId, { httpStatus: 200, outcome: "ok", providerReportedUnits: 6 })).actualUnits).toBe(6);
    expect((await manager.settle(id, b.reservationId, { httpStatus: 500, outcome: "http-error" })).actualUnits).toBe(3);
  });

  it("refuses double settlement and only releases open reservations", async () => {
    const { manager, id } = setup();
    const r = await manager.reserve(id, ESSENTIAL, one);
    if (!r.allowed) throw new Error("expected reservation");
    await manager.settle(id, r.reservationId, { httpStatus: 200, outcome: "ok" });
    await expect(manager.settle(id, r.reservationId, { httpStatus: 200, outcome: "ok" })).rejects.toThrow(/already settled/);
    await expect(manager.release(id, r.reservationId, "not sent")).rejects.toThrow(/not an open reservation/);
  });

  it("returns units on release when a request was provably not sent", async () => {
    const { manager, id } = setup(testAccount({ windows: [{ kind: "day", limit: 10, source: "provider-docs" }], safetyReserve: 0 }));
    const r = await manager.reserve(id, ESSENTIAL, { units: 10, basis: "t" });
    if (!r.allowed) throw new Error("expected reservation");
    expect(code(await manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
    await manager.release(id, r.reservationId, "aborted before send");
    expect((await manager.reserve(id, ESSENTIAL, one)).allowed).toBe(true);
  });
});

describe("alerts", () => {
  it("fires each threshold once per window and again in the next window", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 100, source: "provider-docs" }] }));
    expect((await manager.recordProviderUsage(id, [daySnapshot(55)])).map((a) => a.threshold)).toEqual([0.5]);
    expect(await manager.recordProviderUsage(id, [daySnapshot(60)])).toEqual([]);
    expect((await manager.recordProviderUsage(id, [daySnapshot(92)])).map((a) => a.threshold)).toEqual([0.75, 0.9]);
    time.set("2026-10-14T01:00:00Z");
    expect((await manager.recordProviderUsage(id, [daySnapshot(51, "2026-10-14T01:00:00Z")])).map((a) => a.windowKey)).toEqual(["day:2026-10-14T00:00:00.000Z"]);
  });
});

describe("preflight", () => {
  it("evaluates a batch without spending anything", async () => {
    const { manager, id } = setup(testAccount({ liveApproval: { id: "p", approvedBy: "u", approvedOn: "d", scope: "s", maxUnits: 10, expiresAt: null } }));
    await knownUsage(manager, id);
    const plan = Array.from({ length: 10 }, () => one);
    expect((await manager.preflight(id, NBA_PROBE, plan)).decision.allowed).toBe(true);
    expect((await manager.preflight(id, NBA_PROBE, [...plan, one])).decision).toMatchObject({ code: "APPROVAL_BUDGET_EXHAUSTED" });
    expect((await manager.state(id)).entries).toHaveLength(0);
  });
});

describe("concurrency", () => {
  it("never over-admits under concurrent reservations", async () => {
    const { manager, id } = setup(testAccount({ windows: [{ kind: "day", limit: 20, source: "provider-docs" }], safetyReserve: 0 }));
    const results = await Promise.all(Array.from({ length: 50 }, () => manager.reserve(id, ESSENTIAL, one)));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
  });
});

describe("registry", () => {
  it("throws for unknown accounts", async () => {
    const { manager } = setup();
    await expect(manager.reserve("nope", ESSENTIAL, one)).rejects.toBeInstanceOf(UnknownAccountError);
  });

  it("blocks every new NBA consumer on the real registry until approval exists", async () => {
    const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new MemoryUsageStore() });
    const codes = await Promise.all(PROVIDER_ACCOUNTS.map(async (a) => code(await manager.reserve(a.accountId, NBA_PROBE, statusCheck))));
    expect(Object.fromEntries(PROVIDER_ACCOUNTS.map((a, i) => [a.accountId, codes[i]]))).toEqual({
      "api-sports:nba": "NOT_APPROVED",
      "api-sports:basketball": "UNKNOWN_PLAN",
      "balldontlie:free": "NOT_APPROVED",
      "the-odds-api:unverified-pool": "NOT_APPROVED",
      "parlayapi:primary": "BLOCKED_BY_POLICY",
      "therundown:primary": "BLOCKED_BY_POLICY",
    });
  });

  it("has unique account ids, no approvals, and no credential values", () => {
    const ids = PROVIDER_ACCOUNTS.map((a) => a.accountId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROVIDER_ACCOUNTS.every((a) => a.liveApproval === null)).toBe(true);
    for (const account of PROVIDER_ACCOUNTS) for (const name of account.credentialEnvVars) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});



describe("review regressions", () => {
  it("keeps approval spend after old entries are pruned into rollups", async () => {
    const { manager, id, time } = setup(testAccount({ liveApproval: { id: "p", approvedBy: "u", approvedOn: "d", scope: "s", maxUnits: 2, expiresAt: null } }));
    await knownUsage(manager, id);
    for (let i = 0; i < 2; i += 1) {
      const r = await manager.reserve(id, NBA_PROBE, one);
      if (!r.allowed) throw new Error("expected reservation");
      await manager.settle(id, r.reservationId, { httpStatus: 200, outcome: "ok" });
    }
    time.advance(45 * 86_400_000);
    await manager.recordProviderUsage(id, [daySnapshot(0, new Date(time.now()).toISOString())]);
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("APPROVAL_BUDGET_EXHAUSTED");
  });

  it("does not let a header-reported limit upgrade an UNKNOWN configured limit", async () => {
    const { manager, id } = setup(testAccount({ windows: [{ kind: "month", limit: null, source: "unknown" }] }));
    await manager.recordProviderUsage(id, [{ window: "month", observedAt: new Date(START).toISOString(), used: 1, remaining: 499, limit: 500 }]);
    expect(code(await manager.reserve(id, NBA_PROBE, one))).toBe("UNKNOWN_PLAN");
  });

  it("treats an unparseable approval expiry as expired", async () => {
    const { manager, id } = setup(testAccount({ liveApproval: { id: "a", approvedBy: "u", approvedOn: "d", scope: "s", maxUnits: 5, expiresAt: "not a date" } }));
    expect(code(await manager.reserve(id, NBA_PROBE, statusCheck))).toBe("NOT_APPROVED");
  });

  it("counts reservations in flight when a provider snapshot was taken", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 100, source: "provider-docs" }], safetyReserve: 0 }));
    const inFlight = await manager.reserve(id, ESSENTIAL, { units: 10, basis: "t" });
    if (!inFlight.allowed) throw new Error("expected reservation");
    time.advance(1000);
    await manager.recordProviderUsage(id, [daySnapshot(85, new Date(time.now()).toISOString())]);
    expect(code(await manager.reserve(id, ESSENTIAL, { units: 6, basis: "t" }))).toBe("QUOTA_HARD_STOP");
    expect((await manager.reserve(id, ESSENTIAL, { units: 5, basis: "t" })).allowed).toBe(true);
  });

  it("stores only a path label for endpoints", async () => {
    expect(endpointLabel("https://api.example.com/v4/odds?apiKey=SECRET&x=1")).toBe("/v4/odds");
    expect(endpointLabel("/games?season=2023")).toBe("/games");
    const { manager, id } = setup();
    await manager.reserve(id, { priority: "essential", attribution: { sport: "nfl", workflow: "w", endpoint: "https://h/x?key=SECRET" } }, one);
    expect(JSON.stringify(await manager.state(id))).not.toContain("SECRET");
  });
});

describe("final audit", () => {
  const TTL = 600_000;

  it("keeps charging a reservation whose process crashed after sending, and reconciles it without refund", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 10, source: "provider-docs" }], safetyReserve: 0 }));
    const r = await manager.reserve(id, ESSENTIAL, { units: 10, basis: "t" });
    if (!r.allowed) throw new Error("expected reservation");
    time.advance(TTL + 1);
    expect(code(await manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
    await expect(manager.release(id, r.reservationId, "too late")).rejects.toThrow(/older than the reservation TTL/);
    expect(await manager.reconcileOrphans(id)).toEqual({ orphaned: 1, unitsCharged: 10 });
    expect((await manager.state(id)).entries[0]).toMatchObject({ status: "settled", outcome: "orphaned", actualUnits: 10 });
    expect(code(await manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
    expect(await manager.reconcileOrphans(id)).toEqual({ orphaned: 0, unitsCharged: 0 });
  });

  it("does not reconcile reservations still inside their TTL", async () => {
    const { manager, id } = setup();
    await manager.reserve(id, ESSENTIAL, one);
    expect(await manager.reconcileOrphans(id)).toEqual({ orphaned: 0, unitsCharged: 0 });
  });

  it("refuses a registry where one credential funds independent budgets without verification", () => {
    const a = testAccount({ accountId: "x:1", credentialEnvVars: ["SHARED"] });
    const b = testAccount({ accountId: "x:2", credentialEnvVars: ["SHARED"] });
    expect(() => new QuotaManager({ accounts: [a, b], store: new MemoryUsageStore() })).toThrow(RegistryError);
    expect(() => new QuotaManager({ accounts: [a, { ...b, planStatus: "unknown" }], store: new MemoryUsageStore() })).not.toThrow();
    expect(() => new QuotaManager({ accounts: [{ ...a, separateQuotaVerified: true }, { ...b, separateQuotaVerified: true }], store: new MemoryUsageStore() })).not.toThrow();
    expect(() => new QuotaManager({ accounts: [a, a], store: new MemoryUsageStore() })).toThrow(/Duplicate account id/);
    expect(() => new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new MemoryUsageStore() })).not.toThrow();
  });

  it("redacts credential-like text from stored details", async () => {
    expect(redactDetail("HTTP 401 apiKey=abc123 token: zzz")).toBe("HTTP 401 apiKey=[redacted] token: [redacted]");
    expect(redactDetail("bad key 0123456789abcdef0123456789abcdef")).toBe("bad key [redacted]");
    const { manager, id } = setup();
    const r = await manager.reserve(id, ESSENTIAL, one);
    if (!r.allowed) throw new Error("expected reservation");
    await manager.settle(id, r.reservationId, { httpStatus: 403, outcome: "http-error", detail: "x-apisports-key: 0123456789abcdef0123456789abcdef invalid" });
    expect(JSON.stringify(await manager.state(id))).not.toContain("0123456789abcdef");
  });

  it("allows reservations again after the provider's daily reset", async () => {
    const { manager, id, time } = setup(testAccount({ windows: [{ kind: "day", limit: 10, source: "provider-docs" }], safetyReserve: 0 }));
    await manager.reserve(id, ESSENTIAL, { units: 10, basis: "t" });
    expect(code(await manager.reserve(id, ESSENTIAL, one))).toBe("QUOTA_HARD_STOP");
    time.set("2026-10-14T00:00:00Z");
    expect((await manager.reserve(id, ESSENTIAL, one)).allowed).toBe(true);
  });
});
