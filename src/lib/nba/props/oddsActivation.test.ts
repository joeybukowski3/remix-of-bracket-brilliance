import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it } from "vitest";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { accountWithOddsApproval, ODDS_ACCOUNT_ID, PROBE_SCOPE, readOddsApproval, recordCurrentOddsUsage } from "./pipeline/oddsActivation";
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
