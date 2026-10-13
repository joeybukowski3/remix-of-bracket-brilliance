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
