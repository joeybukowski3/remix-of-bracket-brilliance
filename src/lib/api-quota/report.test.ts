import { describe, expect, it } from "vitest";
import { testAccount } from "./__fixtures__/accounts";
import { PROVIDER_ACCOUNTS } from "./accounts";
import { buildAccountReport, formatReport } from "./report";
import { emptyUsageState } from "./types";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("quota report", () => {
  it("reports UNKNOWN plan, identity, limits and usage on the real registry", () => {
    const reports = PROVIDER_ACCOUNTS.map((a) => buildAccountReport(a, emptyUsageState(), NOW));
    const odds = reports.find((r) => r.accountId === "the-odds-api:unverified-pool")!;
    expect(odds.planStatus).toBe("UNKNOWN");
    expect(odds.identity).toMatch(/^UNKNOWN/);
    expect(odds.windows[0]).toMatchObject({ limit: "UNKNOWN", providerUsed: "UNKNOWN", remaining: "UNKNOWN", usageVerified: false });
    expect(odds.nonessentialStatus).toMatch(/^BLOCKED/);
    const text = formatReport(reports);
    expect(text).toContain("windows: UNKNOWN (no quota evidence)");
    expect(text).toContain("ODDS_API_KEY_BACKUP");
    expect(text).toContain("[UNVERIFIED: no provider usage report this window");
  });

  it("attributes usage by sport, workflow and endpoint, counting failures", () => {
    const base = {
      accountId: "test:requests",
      createdAt: "2026-10-13T10:00:00.000Z",
      settledAt: "2026-10-13T10:00:01.000Z",
      status: "settled" as const,
      estimatedUnits: 1,
      actualUnits: 1,
      costSource: "estimate" as const,
      priority: "nonessential" as const,
      attempt: 1,
      httpStatus: 200,
      detail: null,
      approvalId: "approval-1",
      isUsageCheck: false,
    };
    const state = {
      ...emptyUsageState(),
      entries: [
        { ...base, id: "1", outcome: "ok" as const, attribution: { sport: "nba", workflow: "probe", endpoint: "/games" } },
        { ...base, id: "2", outcome: "provider-error" as const, attribution: { sport: "nba", workflow: "probe", endpoint: "/games" } },
        { ...base, id: "3", outcome: "ok" as const, attribution: { sport: "nba", workflow: "probe", endpoint: "/status" } },
      ],
    };
    const report = buildAccountReport(testAccount(), state, NOW);
    expect(report.attribution[0]).toEqual({ sport: "nba", workflow: "probe", endpoint: "/games", requests: 2, units: 2, failures: 1 });
    expect(report.windows[0]).toMatchObject({ limit: 100, effectiveUsed: 3, remaining: 97, ratio: 0.03 });
    expect(report.nonessentialStatus).toMatch(/^APPROVED/);
  });
});

describe("quota report time-window labelling", () => {
  const settled = (id: string, createdAt: string, endpoint: string) => ({
    id,
    accountId: "test:requests",
    createdAt,
    settledAt: createdAt,
    status: "settled" as const,
    estimatedUnits: 1,
    actualUnits: 1,
    costSource: "estimate" as const,
    priority: "nonessential" as const,
    attempt: 1,
    httpStatus: 200,
    detail: null,
    approvalId: "approval-1",
    isUsageCheck: false,
    outcome: "ok" as const,
    attribution: { sport: "nba", workflow: "probe", endpoint },
  });

  it("scopes attribution to the current day window and reports earlier usage as all-time only", () => {
    const state = {
      ...emptyUsageState(),
      entries: [settled("old", "2026-10-12T20:00:00.000Z", "/status"), settled("a", "2026-10-13T10:00:00.000Z", "/status"), settled("b", "2026-10-13T10:00:05.000Z", "/games")],
    };
    const report = buildAccountReport(testAccount(), state, NOW);
    expect(report.attributionWindow).toBe("day:2026-10-13T00:00:00.000Z");
    expect(report.attribution.reduce((n, r) => n + r.requests, 0)).toBe(2);
    expect(report.attributionAllEntries.reduce((n, r) => n + r.requests, 0)).toBe(3);
    const text = formatReport([report]);
    expect(text).toContain("attribution, current day window day:2026-10-13T00:00:00.000Z");
    expect(text).toContain("attribution, all retained ledger entries (includes earlier windows)");
  });

  it("labels each window with start, reset and whether the reset boundary is only assumed", () => {
    const report = buildAccountReport(testAccount(), emptyUsageState(), NOW);
    const day = report.windows.find((w) => w.window === "day")!;
    expect(day).toMatchObject({ startsAt: "2026-10-13T00:00:00.000Z", resetsAt: "2026-10-14T00:00:00.000Z", resetBoundary: "assumed (provider-docs)" });
    expect(formatReport([report])).toContain("window 2026-10-13T00:00:00.000Z to 2026-10-14T00:00:00.000Z UTC, reset boundary assumed (provider-docs)");
  });

  it("warns when a provider-reported counter decreased inside a window", () => {
    const state = {
      ...emptyUsageState(),
      snapshots: [
        { window: "day" as const, observedAt: "2026-10-13T10:00:00.000Z", used: null, remaining: 94, limit: 100 },
        { window: "day" as const, observedAt: "2026-10-13T10:00:08.000Z", used: null, remaining: 99, limit: 100 },
      ],
    };
    const report = buildAccountReport(testAccount(), state, NOW);
    expect(report.windows.find((w) => w.window === "day")!.counterDecreases).toHaveLength(1);
    const text = formatReport([report]);
    expect(text).toContain("WARNING day: provider counter decreased 6 -> 1 (-5)");
    expect(text).toContain("effective usage keeps the highest reading");
  });

  it("collapses repeated decreases into one warning line naming the largest", () => {
    const snap = (observedAt: string, remaining: number) => ({ window: "day" as const, observedAt, used: null, remaining, limit: 100 });
    const state = {
      ...emptyUsageState(),
      snapshots: [snap("2026-10-13T10:00:00.000Z", 90), snap("2026-10-13T10:00:05.000Z", 95), snap("2026-10-13T10:00:10.000Z", 80), snap("2026-10-13T10:00:15.000Z", 99)],
    };
    const text = formatReport([buildAccountReport(testAccount(), state, NOW)]);
    expect(text.match(/WARNING day:/g)).toHaveLength(1);
    expect(text).toContain("decreased 20 -> 1 (-19) (largest of 2 decreases)");
  });

  it("uses all retained entries and no window start for a minute-only account", () => {
    const account = testAccount({ windows: [{ kind: "minute", limit: 5, source: "provider-docs" }] });
    const report = buildAccountReport(account, emptyUsageState(), NOW);
    expect(report.attributionWindow).toBeNull();
    expect(report.windows[0]).toMatchObject({ startsAt: null, resetsAt: null, resetBoundary: "rolling", counterDecreases: [] });
  });

  it("scopes attribution to the month window when there is no day window", () => {
    const account = testAccount({ windows: [{ kind: "month", limit: 500, source: "unknown", resetDayOfMonth: 1 }] });
    expect(buildAccountReport(account, emptyUsageState(), NOW).attributionWindow).toBe("month:2026-10-01T00:00:00.000Z");
  });

  it("never mutates the usage state it reports on", () => {
    const state = {
      ...emptyUsageState(),
      entries: [settled("a", "2026-10-13T10:00:00.000Z", "/status")],
      snapshots: [
        { window: "day" as const, observedAt: "2026-10-13T10:00:08.000Z", used: null, remaining: 99, limit: 100 },
        { window: "day" as const, observedAt: "2026-10-13T10:00:00.000Z", used: null, remaining: 94, limit: 100 },
      ],
    };
    const before = structuredClone(state);
    formatReport([buildAccountReport(testAccount(), state, NOW)]);
    expect(state).toEqual(before);
  });
});
