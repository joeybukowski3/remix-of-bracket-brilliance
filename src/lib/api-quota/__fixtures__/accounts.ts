import type { ProviderAccountConfig } from "../types";

/** A synthetic request-billed account with an approval, for tests only. */
export function testAccount(overrides: Partial<ProviderAccountConfig> = {}): ProviderAccountConfig {
  return {
    accountId: "test:requests",
    provider: "api-sports",
    description: "synthetic",
    credentialEnvVars: ["TEST_KEY"],
    identity: "single-key",
    billingUnit: "requests",
    planStatus: "documented",
    planBasis: "synthetic",
    windows: [
      { kind: "day", limit: 100, source: "provider-docs", resetHourUtc: 0 },
      { kind: "minute", limit: 10, source: "provider-docs" },
    ],
    safetyReserve: 5,
    nonessentialMaxRatio: 0.9,
    alertThresholds: [0.5, 0.75, 0.9],
    reservationTtlMs: 600_000,
    maxUsageChecksPerWindow: 2,
    nonessentialBlockedReason: null,
    liveApproval: { id: "approval-1", approvedBy: "test", approvedOn: "2026-10-13", scope: "test", maxUnits: 1000, expiresAt: null },
    unmanagedConsumers: [],
    ...overrides,
  };
}

export const NBA_PROBE = { priority: "nonessential", attribution: { sport: "nba", workflow: "probe", endpoint: "/games" } } as const;
export const ESSENTIAL = { priority: "essential", attribution: { sport: "nfl", workflow: "lines", endpoint: "/odds" } } as const;

/** Fixed clock that can be advanced. */
export function clock(startIso: string) {
  let t = Date.parse(startIso);
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms), set: (iso: string) => void (t = Date.parse(iso)) };
}

export function sequentialIds() {
  let n = 0;
  return () => `r${++n}`;
}
