import { describe, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { API_NBA_PROBE_ACCOUNT_ID, runApiNbaProbe } from "./sources/apiNbaProbe";
import { accountsWithProbeApproval, API_NBA_PROBE_APPROVAL_PATH, buildProbeApproval, parseProbeApproval } from "./sources/apiNbaProbeApproval";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const valid = () => buildProbeApproval({ approvedBy: "Reviewer", days: 7, now: new Date(NOW - 60_000), suffix: "a1b2c3d4" });
const text = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...valid(), ...overrides });
const errorOf = (t: string | null, now = NOW) => {
  const result = parseProbeApproval(t, now);
  return "error" in result ? result.error : null;
};

describe("probe approval file: fail closed", () => {
  it("accepts a freshly built approval and maps it to a LiveApproval", () => {
    const result = parseProbeApproval(text(), NOW);
    expect(result).toEqual({
      approval: { id: "nba-probe-2026-10-20-a1b2c3d4", approvedBy: "Reviewer", approvedOn: "2026-10-20T11:59:00.000Z", scope: "API-NBA 10-request evaluation probe", maxUnits: 10, expiresAt: "2026-10-27T11:59:00.000Z" },
    });
  });

  it.each([
    ["missing file", null, /no approval file/],
    ["empty file", "", /not valid JSON/],
    ["malformed JSON", "{ approvalId: ", /not valid JSON/],
    ["a JSON array", "[]", /invalid/],
    ["another provider account", text({ accountId: "api-sports:basketball" }), /accountId/],
    ["another consumer", text({ consumer: "nba-backfill" }), /consumer/],
    ["another scope", text({ scope: "NBA historical ingest" }), /scope/],
    ["a budget over 10", text({ maxUnits: 11 }), /maxUnits/],
    ["a zero budget", text({ maxUnits: 0 }), /maxUnits/],
    ["a fractional budget", text({ maxUnits: 9.5 }), /maxUnits/],
    ["a string budget", text({ maxUnits: "10" }), /maxUnits/],
    ["a malformed id", text({ approvalId: "../../escape" }), /approvalId/],
    ["an unknown field", text({ autoRenew: true }), /Unrecognized key/],
    ["a missing field", JSON.stringify({ ...valid(), expiresAt: undefined }), /expiresAt/],
    ["a wrong schema version", text({ schemaVersion: "v0" }), /schemaVersion/],
    ["a non-UTC timestamp", text({ expiresAt: "2026-10-27" }), /expiresAt/],
  ])("rejects %s", (_label, input, message) => {
    expect(errorOf(input)).toMatch(message);
  });

  it("rejects expired, future-dated, inverted and over-long windows", () => {
    expect(errorOf(text(), Date.parse("2026-10-27T11:59:00.000Z"))).toMatch(/expired/);
    expect(errorOf(text({ approvedAt: "2026-10-21T00:00:00.000Z", expiresAt: "2026-10-22T00:00:00.000Z" }))).toMatch(/future/);
    expect(errorOf(text({ expiresAt: "2026-10-19T00:00:00.000Z" }))).toMatch(/after approvedAt/);
  });

  it("refuses an extension made by editing expiresAt", () => {
    // 14-day bound is measured from approvedAt, so pushing the expiry out never renews an approval.
    expect(errorOf(text({ expiresAt: "2026-11-04T00:00:00.000Z" }))).toMatch(/exceeds 14 days/);
  });
});

describe("probe approval creation", () => {
  it("always grants exactly 10 requests for the probe and bounds the window", () => {
    expect(valid()).toMatchObject({ maxUnits: 10, accountId: "api-sports:nba", consumer: "api-nba-coverage-probe" });
    expect(() => buildProbeApproval({ approvedBy: "R", days: 15, now: new Date(NOW), suffix: "abcd" })).toThrow(/1 to 14/);
    expect(() => buildProbeApproval({ approvedBy: "R", days: 0, now: new Date(NOW), suffix: "abcd" })).toThrow();
    expect(() => buildProbeApproval({ approvedBy: "  ", days: 7, now: new Date(NOW), suffix: "abcd" })).toThrow();
  });

  it("lives under the gitignored, vercelignored data/nba directory", () => {
    expect(API_NBA_PROBE_APPROVAL_PATH.startsWith("data/nba/")).toBe(true);
  });
});

describe("probe approval injection", () => {
  const parsed = parseProbeApproval(text(), NOW);
  const approval = "approval" in parsed ? parsed.approval : null;

  it("keeps every committed account without an approval", () => {
    expect(PROVIDER_ACCOUNTS.every((a) => a.liveApproval === null)).toBe(true);
  });

  it("binds the approval to api-sports:nba only and leaves the registry unchanged", () => {
    const before = JSON.stringify(PROVIDER_ACCOUNTS);
    const accounts = accountsWithProbeApproval(PROVIDER_ACCOUNTS, approval!);
    expect(JSON.stringify(PROVIDER_ACCOUNTS)).toBe(before);
    for (const account of accounts) {
      if (account.accountId === API_NBA_PROBE_ACCOUNT_ID) expect(account.liveApproval).toEqual(approval);
      else expect(account).toEqual(PROVIDER_ACCOUNTS.find((a) => a.accountId === account.accountId));
    }
  });

  it("refuses a registry that already carries a committed approval", () => {
    const committed = PROVIDER_ACCOUNTS.map((a) => (a.accountId === API_NBA_PROBE_ACCOUNT_ID ? { ...a, liveApproval: approval } : a));
    expect(() => accountsWithProbeApproval(committed, approval!)).toThrow(/committed liveApproval/);
  });

  it("gives other api-sports consumers nothing: API-Basketball stays closed", async () => {
    const manager = new QuotaManager({ accounts: accountsWithProbeApproval(PROVIDER_ACCOUNTS, approval!), store: new MemoryUsageStore(), now: () => new Date(NOW) });
    const denied = await manager.reserve("api-sports:basketball", { priority: "nonessential", attribution: { sport: "nba", workflow: "api-nba-coverage-probe", endpoint: "/status" } }, { units: 1, basis: "s", isUsageCheck: true });
    expect(denied).toMatchObject({ allowed: false, code: "UNKNOWN_PLAN" });
  });

  it("an approval file grants one run only, however it is edited afterwards", async () => {
    const claims = new Set<string>();
    const store = new MemoryUsageStore();
    const run = async (fileText: string) => {
      const p = parseProbeApproval(fileText, NOW);
      if (!("approval" in p)) throw new Error(p.error);
      const manager = new QuotaManager({ accounts: accountsWithProbeApproval(PROVIDER_ACCOUNTS, p.approval), store, now: () => new Date(NOW) });
      let fetches = 0;
      const result = await runApiNbaProbe({
        manager,
        apiKey: "SYNTHETICKEY0123456789abcdefABCD",
        fetchImpl: async () => {
          fetches += 1;
          return new Response("{}", { status: 500 });
        },
        writer: async () => undefined,
        log: () => undefined,
        claimApproval: async (id) => {
          if (claims.has(id)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
          claims.add(id);
        },
        sleep: async () => undefined,
        now: () => new Date(NOW),
        runId: "r",
      });
      return { result, fetches };
    };
    const first = await run(text());
    expect(first).toMatchObject({ fetches: 1, result: { status: "aborted" } });
    // Same id with a later approvedAt/expiry: still the same, already-used approval.
    const edited = await run(text({ approvedAt: "2026-10-20T11:59:30.000Z", expiresAt: "2026-10-30T00:00:00.000Z" }));
    expect(edited).toMatchObject({ fetches: 0, result: { status: "refused" } });
  });
});
