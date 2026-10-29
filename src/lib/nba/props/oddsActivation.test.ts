import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { accountWithOddsApproval, assertInPregameWindow, DISCOVERY_SCOPE, ODDS_ACCOUNT_ID, PROBE_SCOPE, readOddsApproval, recordCurrentOddsUsage } from "./pipeline/oddsActivation";
import { nbaAllowance } from "./pipeline/allowance";
import { quotaRequestGate } from "./pipeline/budget";

const dir = mkdtempSync(path.join(tmpdir(), "nba-odds-activation-"));
afterEach(() => { for (const name of ["approval.json", "usage.json"]) { try { rmSync(path.join(dir, name)); } catch { /* absent */ } } });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const now = new Date("2026-10-21T12:00:00Z");
const approval = { id: "nba-odds-20261021-a", approvedBy: "owner", approvedOn: "2026-10-21T11:00:00Z", expiresAt: "2026-10-21T23:00:00Z", scope: PROBE_SCOPE, maxUnits: 1 };
const usage = { plan: "Starter", limit: 500, used: 234, remaining: 266, observedAtUtc: "2026-10-21T11:30:00Z", resetDateUtc: "2026-11-01T00:00:00Z" };

it("requires a scoped local approval and a fresh provider balance before one credit", async () => {
  const approvalFile = path.join(dir, "approval.json");
  const usageFile = path.join(dir, "usage.json");
  writeFileSync(approvalFile, JSON.stringify(approval));
  writeFileSync(usageFile, JSON.stringify(usage));
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, readOddsApproval(approvalFile, PROBE_SCOPE, now));
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
  const manager = new QuotaManager({ accounts, store: new MemoryUsageStore(), now: () => now });
  const gate = quotaRequestGate(manager, ODDS_ACCOUNT_ID, "one-credit-probe", nbaAllowance(now), () => now);
  expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_STALE_EVIDENCE" });
  await recordCurrentOddsUsage(manager, account, usageFile, now);
  expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: true });
  expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_USED" });
  writeFileSync(usageFile, JSON.stringify({ ...usage, observedAtUtc: "2026-10-20T10:00:00Z" }));
  await expect(recordCurrentOddsUsage(manager, account, usageFile, now)).rejects.toThrow(/stale/);
  expect(readFileSync(approvalFile, "utf8")).not.toContain("apiKey");
});

it("reserves the first NBA credit with 250 used and 250 remaining on the shared account", async () => {
  const file = path.join(dir, "usage.json");
  writeFileSync(file, JSON.stringify({ ...usage, used: 250, remaining: 250 }));
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, approval);
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
  const manager = new QuotaManager({ accounts, store: new MemoryUsageStore(), now: () => now });
  await recordCurrentOddsUsage(manager, account, file, now);
  const gate = quotaRequestGate(manager, ODDS_ACCOUNT_ID, "one-credit-probe", nbaAllowance(now), () => now);
  const first = await gate.reserve(1, "/events/{id}/odds");
  expect(first).toMatchObject({ ok: true });
  expect((await manager.state(ODDS_ACCOUNT_ID)).entries).toMatchObject([{ approvalId: approval.id, estimatedUnits: 1, status: "reserved" }]);
  expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_USED" });
});

it("denies the one-credit probe when evidence, peer reserve, or NBA allowance fails", async () => {
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, approval);
  const makeManager = () => new QuotaManager({ accounts, store: new MemoryUsageStore(), now: () => now });
  const reserve = (manager: QuotaManager, overrides: Parameters<typeof nbaAllowance>[1] = {}) =>
    quotaRequestGate(manager, ODDS_ACCOUNT_ID, "one-credit-probe", nbaAllowance(now, overrides), () => now).reserve(1, "/events/{id}/odds");

  const missing = makeManager();
  expect(await reserve(missing)).toMatchObject({ ok: false, code: "NBA_STALE_EVIDENCE" });

  const stale = makeManager();
  await stale.recordProviderUsage(ODDS_ACCOUNT_ID, [{ window: "month", observedAt: "2026-10-20T11:00:00Z", used: 250, remaining: 250, limit: 500 }]);
  expect(await reserve(stale)).toMatchObject({ ok: false, code: "NBA_STALE_EVIDENCE" });

  const peers = makeManager();
  await peers.recordProviderUsage(ODDS_ACCOUNT_ID, [{ window: "month", observedAt: usage.observedAtUtc, used: 365, remaining: 135, limit: 500 }]);
  expect(await reserve(peers)).toMatchObject({ ok: false, code: "NBA_PEER_RESERVE" });

  const daily = makeManager();
  await daily.recordProviderUsage(ODDS_ACCOUNT_ID, [{ window: "month", observedAt: usage.observedAtUtc, used: 250, remaining: 250, limit: 500 }]);
  expect(await reserve(daily, { perDayCredits: 0 })).toMatchObject({ ok: false, code: "NBA_DAILY_ALLOWANCE" });
  expect(await reserve(daily, { perMonthCredits: 0 })).toMatchObject({ ok: false, code: "NBA_MONTHLY_ALLOWANCE" });
  expect((await daily.state(ODDS_ACCOUNT_ID)).entries).toHaveLength(0);

  const unapproved = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new MemoryUsageStore(), now: () => now });
  await unapproved.recordProviderUsage(ODDS_ACCOUNT_ID, [{ window: "month", observedAt: usage.observedAtUtc, used: 250, remaining: 250, limit: 500 }]);
  expect(await reserve(unapproved)).toMatchObject({ ok: false, code: "NOT_APPROVED" });

  const expiredAccounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, { ...approval, expiresAt: "2026-10-21T11:30:00Z" });
  const expired = new QuotaManager({ accounts: expiredAccounts, store: new MemoryUsageStore(), now: () => now });
  await expired.recordProviderUsage(ODDS_ACCOUNT_ID, [{ window: "month", observedAt: usage.observedAtUtc, used: 250, remaining: 250, limit: 500 }]);
  expect(await reserve(expired)).toMatchObject({ ok: false, code: "NOT_APPROVED" });
});

it("rejects mismatched and expired approvals", () => {
  const file = path.join(dir, "approval.json");
  writeFileSync(file, JSON.stringify({ ...approval, maxUnits: 0 }));
  expect(() => readOddsApproval(file, PROBE_SCOPE, now)).toThrow(/scope or cost/);
  writeFileSync(file, JSON.stringify({ ...approval, expiresAt: "2026-10-21T11:30:00Z" }));
  expect(() => readOddsApproval(file, PROBE_SCOPE, now)).toThrow(/expired/);
});

it("keeps the NFL and other-sport reserve ahead of a fresh one-credit request", async () => {
  const file = path.join(dir, "usage.json");
  writeFileSync(file, JSON.stringify({ ...usage, used: 440, remaining: 60 }));
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, approval);
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
  const manager = new QuotaManager({ accounts, store: new MemoryUsageStore(), now: () => now });
  await recordCurrentOddsUsage(manager, account, file, now);
  expect(await quotaRequestGate(manager, ODDS_ACCOUNT_ID, "one-credit-probe", nbaAllowance(now), () => now).reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_PEER_RESERVE" });
});

it("refuses a request outside the 45-240 minute pregame window before any credit is spent", () => {
  const tipoff = "2026-10-29T00:00:00Z";
  const at = (minutesBefore: number) => new Date(Date.parse(tipoff) - minutesBefore * 60_000);
  expect(assertInPregameWindow(tipoff, at(180))).toBe(180);
  expect(assertInPregameWindow(tipoff, at(240))).toBe(240);
  // The line is stamped when the response arrives, a little after the check: stop short of the 45-minute floor.
  expect(assertInPregameWindow(tipoff, at(47))).toBe(47);
  expect(() => assertInPregameWindow(tipoff, at(46))).toThrow(/too late/);
  expect(() => assertInPregameWindow(tipoff, at(241))).toThrow(/from 2026-10-28T20:00:00.000Z to 2026-10-28T23:13:00.000Z/);
  expect(() => assertInPregameWindow(tipoff, at(44))).toThrow(/too late/);
  expect(() => assertInPregameWindow(tipoff, at(-5))).toThrow(/too late/);
  expect(() => assertInPregameWindow("2026-10-29", at(180))).toThrow(/full ISO instant/);
  expect(() => assertInPregameWindow("not a time", at(180))).toThrow(/full ISO instant/);
});

describe("zero-credit discovery at 308 used / 192 remaining", () => {
  const at = new Date("2026-10-28T13:45:00Z");
  const reading = { plan: "Starter", limit: 500, used: 308, remaining: 192, observedAtUtc: "2026-10-28T13:21:00Z", resetDateUtc: "2026-11-01T00:00:00Z" };
  const discoveryApproval = { id: "nba-odds-discovery-test0001", approvedBy: "owner", approvedOn: "2026-10-28T13:40:00Z", expiresAt: "2026-10-28T15:40:00Z", scope: DISCOVERY_SCOPE as string, maxUnits: 0 };
  async function ready(approvalOver: Partial<typeof discoveryApproval> = {}, readingOver: Partial<typeof reading> = {}, store = new MemoryUsageStore()) {
    const file = path.join(dir, "usage.json");
    writeFileSync(file, JSON.stringify({ ...reading, ...readingOver }));
    const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, { ...discoveryApproval, ...approvalOver });
    const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
    const manager = new QuotaManager({ accounts, store, now: () => at });
    await recordCurrentOddsUsage(manager, account, file, at);
    const gate = (workflow: string) => quotaRequestGate(manager, ODDS_ACCOUNT_ID, workflow, nbaAllowance(at), () => at);
    return { manager, gate };
  }

  it("admits one discovery, refuses its reuse, and keeps the ordinary NBA limit for everything else", async () => {
    const { manager, gate } = await ready();
    expect(await gate("events-discovery").reserve(0, "/events")).toMatchObject({ ok: true });
    expect(await gate("events-discovery").reserve(0, "/events")).toMatchObject({ ok: false, code: "NBA_APPROVAL_USED" });
    expect((await manager.state(ODDS_ACCOUNT_ID)).entries).toMatchObject([{ approvalId: discoveryApproval.id, estimatedUnits: 0 }]);
    // The approval cannot fund another workflow, a priced endpoint or any credit.
    const fresh = await ready();
    expect(await fresh.gate("one-credit-probe").reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_SCOPE" });
    expect(await fresh.gate("pregame-capture").reserve(0, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_SCOPE" });
    expect(await fresh.gate("events-discovery").reserve(0, "/events/{id}/odds")).toMatchObject({ ok: false, code: "QUOTA_HARD_STOP" });
    expect(await fresh.gate("events-discovery").reserve(1, "/events")).toMatchObject({ ok: false, code: "APPROVAL_BUDGET_EXHAUSTED" });
    // A different approval scope at the same counter is an ordinary NBA request and stays blocked at 308 > 250.
    const ordinary = await ready({ scope: "NBA ordinary request test", maxUnits: 5 });
    expect(await ordinary.gate("pregame-capture").reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "QUOTA_HARD_STOP" });
  });

  it("settles a charged discovery as a breach that blocks every later NBA request, even under a fresh approval", async () => {
    const store = new MemoryUsageStore();
    const first = await ready({}, {}, store);
    const reservation = await first.gate("events-discovery").reserve(0, "/events");
    if (reservation.ok === false) throw new Error("expected admission");
    await reservation.settle(1, "ok", null, []);
    expect((await first.manager.state(ODDS_ACCOUNT_ID)).entries.some((entry) => entry.detail?.startsWith("NBA_BREACH:"))).toBe(true);
    // A different, unused approval on the same ledger gets past the single-use check and meets the breach block.
    const next = await ready({ id: "nba-odds-discovery-test0002" }, {}, store);
    expect(await next.gate("events-discovery").reserve(0, "/events")).toMatchObject({ ok: false, code: "NBA_ACCOUNTING_VIOLATION" });
  });

  it("refuses an observation that is future-dated, stale, or does not add up, so none can be invented", async () => {
    for (const [over, message] of [
      [{ observedAtUtc: "2026-10-28T14:30:00Z" }, /stale or from the future/],
      [{ observedAtUtc: "2026-10-27T13:00:00Z" }, /stale or from the future/],
      [{ used: 300 }, /contradict the limit/],
      [{ limit: 1000, used: 308, remaining: 692 }, /500-credit/],
    ] as const) await expect(ready({}, over), JSON.stringify(over)).rejects.toThrow(message);
  });
});
