import { describe, expect, it } from "vitest";
import { emptyUsageState, type LedgerEntry } from "./types";
import { windowBounds, windowUsage } from "./windows";

const iso = (s: string) => new Date(s).toISOString();

function entry(createdAt: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: createdAt,
    accountId: "a",
    createdAt: iso(createdAt),
    settledAt: null,
    status: "settled",
    estimatedUnits: 1,
    actualUnits: 1,
    costSource: "estimate",
    attribution: { sport: "nba", workflow: "w", endpoint: "/e" },
    priority: "nonessential",
    attempt: 1,
    httpStatus: 200,
    outcome: "ok",
    detail: null,
    approvalId: null,
    isUsageCheck: false,
    ...overrides,
  };
}

describe("windowBounds", () => {
  it("starts a daily window at the provider reset hour, rolling back before it", () => {
    const before = windowBounds({ kind: "day", limit: 1, source: "provider-docs", resetHourUtc: 4 }, Date.parse("2026-10-13T03:59:00Z"));
    expect(before.key).toBe("day:2026-10-12T04:00:00.000Z");
    const after = windowBounds({ kind: "day", limit: 1, source: "provider-docs", resetHourUtc: 4 }, Date.parse("2026-10-13T04:00:00Z"));
    expect(after.key).toBe("day:2026-10-13T04:00:00.000Z");
    expect(after.endMs - after.startMs).toBe(86_400_000);
  });

  it("handles a monthly reset day, across a year boundary and in short months", () => {
    const jan = windowBounds({ kind: "month", limit: 1, source: "unknown", resetDayOfMonth: 15 }, Date.parse("2027-01-10T00:00:00Z"));
    expect(jan.key).toBe("month:2026-12-15T00:00:00.000Z");
    expect(new Date(jan.endMs).toISOString()).toBe("2027-01-15T00:00:00.000Z");
    const feb = windowBounds({ kind: "month", limit: 1, source: "unknown", resetDayOfMonth: 31 }, Date.parse("2027-03-01T00:00:00Z"));
    expect(feb.key).toBe("month:2027-02-28T00:00:00.000Z");
  });
});

describe("windowUsage", () => {
  const day = { kind: "day", limit: 100, source: "provider-docs", resetHourUtc: 0 } as const;
  const now = Date.parse("2026-10-13T12:00:00Z");

  it("counts settled, pending and expired reservations but not released ones or prior windows", () => {
    const state = {
      ...emptyUsageState(),
      entries: [
        entry("2026-10-12T23:00:00Z"),
        entry("2026-10-13T01:00:00Z", { actualUnits: 3 }),
        entry("2026-10-13T02:00:00Z", { status: "reserved", actualUnits: null, estimatedUnits: 2 }),
        entry("2026-10-13T03:00:00Z", { status: "released", actualUnits: 0 }),
      ],
    };
    expect(windowUsage(day, state, now).effectiveUsed).toBe(5);
  });

  it("uses provider-reported usage when it exceeds the ledger and reports the gap as unattributed", () => {
    const state = {
      ...emptyUsageState(),
      entries: [entry("2026-10-13T01:00:00Z"), entry("2026-10-13T11:00:00Z")],
      snapshots: [{ window: "day" as const, observedAt: iso("2026-10-13T10:00:00Z"), used: 40, remaining: 60, limit: 100 }],
    };
    const usage = windowUsage(day, state, now);
    expect(usage.providerUsed).toBe(40);
    expect(usage.unattributedUnits).toBe(39);
    expect(usage.effectiveUsed).toBe(41);
  });

  it("derives used from remaining and ignores snapshots from an earlier window", () => {
    const state = {
      ...emptyUsageState(),
      snapshots: [
        { window: "day" as const, observedAt: iso("2026-10-12T22:00:00Z"), used: 99, remaining: 1, limit: 100 },
        { window: "day" as const, observedAt: iso("2026-10-13T06:00:00Z"), used: null, remaining: 70, limit: null },
      ],
    };
    expect(windowUsage(day, state, now).providerUsed).toBe(30);
  });

  it("never lowers usage when a later snapshot reports less within the same window", () => {
    const state = {
      ...emptyUsageState(),
      snapshots: [
        { window: "day" as const, observedAt: iso("2026-10-13T08:00:00Z"), used: 70, remaining: 30, limit: 100 },
        { window: "day" as const, observedAt: iso("2026-10-13T09:00:00Z"), used: 20, remaining: 80, limit: 100 },
      ],
    };
    const usage = windowUsage(day, state, now);
    expect(usage.providerUsed).toBe(70);
    expect(usage.effectiveUsed).toBe(70);
  });

  it("lets a provider-reported limit tighten but never raise the configured limit", () => {
    const snap = (limit: number) => ({ ...emptyUsageState(), snapshots: [{ window: "day" as const, observedAt: iso("2026-10-13T08:00:00Z"), used: 1, remaining: limit - 1, limit }] });
    expect(windowUsage(day, snap(500), now).limit).toBe(100);
    expect(windowUsage(day, snap(80), now).limit).toBe(80);
    expect(windowUsage({ kind: "day", limit: null, source: "unknown" }, snap(500), now).limit).toBe(500);
  });

  it("starts from zero after a reset into the next window", () => {
    const state = { ...emptyUsageState(), entries: [entry("2026-10-13T11:00:00Z", { actualUnits: 99 })] };
    expect(windowUsage(day, state, Date.parse("2026-10-14T00:00:01Z")).effectiveUsed).toBe(0);
  });
});
