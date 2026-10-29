import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryCaptureSink, oddsAccount, quotaSetup } from "./__fixtures__/pipelineFixtures";
import { parseIncompleteProviderEvidence, parsePendingProviderEvidence, verifiedEvidenceSnapshot } from "./pipeline/providerEvidence";
import { ODDS_SOURCE_LICENSES } from "./pipeline/oddsSources";
import { fileProbeClaim } from "./pipeline/probeClaim";
import { createTheOddsApiNbaProvider, parseNbaUsageHeaders, parseTheOddsApiNbaEvent } from "./pipeline/theOddsApiNba";
import { discoverNbaEventsOnce, EVENTS_ENDPOINT_CONTRACT } from "./pipeline/theOddsApiNbaEvents";
import { oneCreditNbaProbe } from "./pipeline/theOddsApiNbaProbe";
import { quotaRequestGate } from "./pipeline/budget";
import type { PropsProvider } from "./pipeline/pregameJob";
import type { SourceLicense } from "./sources/types";
import { PROVIDER_ACCOUNTS } from "../../api-quota/accounts";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { appendPendingDashboardEvidence } from "../../../../scripts/lib/nba-provider-evidence-intake";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const tempClaims = () => { const dir = mkdtempSync(path.join(tmpdir(), "nba-claim-")); dirs.push(dir); return fileProbeClaim(dir); };
const execFileAsync = promisify(execFile);
const grant: SourceLicense = { status: "commercial-licensed", permittedUses: ["private-research"], basis: "test", reviewedOn: "2026-10-20" };

describe("NBA probe hardening", () => {
  it("atomically consumes an approval across concurrency and a simulated crash", async () => {
    const claims = tempClaims();
    expect((await Promise.all(Array.from({ length: 8 }, () => claims.claim("approval-1", "scope", "event-1")))).filter(Boolean)).toHaveLength(1);
    const restarted = fileProbeClaim(dirs[0]);
    expect(await restarted.claim("approval-1", "scope", "event-1")).toBe(false);
    expect(await restarted.claim("approval-2", "scope", "event-1")).toBe(true);
  });

  it("lets only one of two separate processes claim the same approval", async () => {
    tempClaims();
    const moduleUrl = pathToFileURL(path.join(process.cwd(), "src/lib/nba/props/pipeline/probeClaim.ts")).href;
    const code = `const { fileProbeClaim } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(String(await fileProbeClaim(${JSON.stringify(dirs[0])}).claim("process-approval", "scope", "event-1")));`;
    const results = await Promise.all([1, 2].map(() => execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { cwd: process.cwd() })));
    expect(results.map((result) => result.stdout.trim()).sort()).toEqual(["false", "true"]);
  });

  it("does not replay a zero-credit or failed outbound attempt in a new probe instance", async () => {
    const claim = tempClaims();
    const fetchEventProps = vi.fn(async () => ({ status: "ok" as const, lines: [], creditsCharged: 0, requestRef: "event-1" }));
    const provider: PropsProvider = { sourceId: "the-odds-api", fetchEventProps };
    const reserve = vi.fn(async () => ({ ok: true as const, settle: async () => undefined }));
    const gate = { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve };
    const deps = { eventId: "event-1", approvalId: "approval-1", provider, claim, gate, license: grant, captureSink: memoryCaptureSink().sink };
    expect((await oneCreditNbaProbe(deps)()).status).toBe("ok");
    expect((await oneCreditNbaProbe(deps)()).status).toBe("error");
    expect(fetchEventProps).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP failures and uncertain network outcomes consumed", async () => {
    const claim = tempClaims();
    const settle = vi.fn(async () => undefined);
    const gate = { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve: async () => ({ ok: true as const, settle }) };
    for (const [approvalId, fetchEventProps] of [
      ["http-failure", async () => ({ status: "error" as const, message: "HTTP 503", failureKind: "http-error" as const, creditsCharged: 0 })],
      ["network-uncertain", async () => { throw new Error("request may have reached provider"); }],
    ] as const) {
      const deps = { eventId: "event-1", approvalId, provider: { sourceId: "the-odds-api" as const, fetchEventProps }, claim, gate, license: grant, captureSink: memoryCaptureSink().sink };
      expect((await oneCreditNbaProbe(deps)()).status).toBe("error");
      const replay = await oneCreditNbaProbe(deps)();
      expect(replay.status === "error" ? replay.message : "").toContain("already claimed");
    }
    expect(settle).toHaveBeenCalledWith(0, "http-error", undefined, undefined);
    expect(settle).toHaveBeenCalledWith(null, "network-error", undefined, undefined);
  });

  it("records an overcharge and denies later NBA reservations", async () => {
    const { manager, gate, accountId } = await quotaSetup();
    const first = await gate.reserve(1, "/events/{id}/odds");
    expect(first.ok).toBe(true);
    if (first.ok === false) return;
    await first.settle(2, "ok", "NBA_BREACH: charge 2", [{ window: "month", observedAt: "2026-11-09T20:00:01Z", used: 2, remaining: 498, limit: 500 }]);
    expect((await manager.state(accountId)).entries[0]).toMatchObject({ actualUnits: 2, costSource: "provider-header", detail: expect.stringContaining("NBA_BREACH") });
    expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_ACCOUNTING_VIOLATION" });
  });

  it("quota gate cannot reuse a zero-charge approval or spend it in another workflow", async () => {
    const approval = { id: "one-credit-approval", approvedBy: "test", approvedOn: "2026-11-09", scope: "NBA one-event player_points one-credit probe", maxUnits: 1, expiresAt: null };
    const { manager, accountId, allowance, time } = await quotaSetup({ liveApproval: approval });
    const gate = quotaRequestGate(manager, accountId, "one-credit-probe", allowance, time.now);
    const reservation = await gate.reserve(1, "/events/{id}/odds");
    if (reservation.ok === false) throw new Error("test reservation denied");
    await reservation.settle(0, "ok");
    expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_USED" });
    expect(await quotaRequestGate(manager, accountId, "pregame-capture", allowance, time.now).reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_APPROVAL_SCOPE" });
  });

  it("reconciles an anomalous provider response through the probe into the ledger", async () => {
    const { manager, gate, accountId } = await quotaSetup({ accountId: "the-odds-api:unverified-pool" });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "event-1", sport_key: "basketball_nba", commence_time: "2026-11-10T00:00:00Z", home_team: "A", away_team: "B", bookmakers: [] }), { headers: { "x-requests-used": "2", "x-requests-remaining": "498", "x-requests-last": "2" } }));
    const provider = createTheOddsApiNbaProvider({ apiKey: "PRIVATE_TEST_TOKEN", fetchImpl, now: () => new Date("2026-11-09T20:00:01Z") });
    const result = await oneCreditNbaProbe({ eventId: "event-1", approvalId: "overcharge-integration", provider, gate, claim: tempClaims(), license: grant, captureSink: memoryCaptureSink().sink })();
    expect(result).toMatchObject({ status: "ok", creditsCharged: 2, usageIssue: expect.stringContaining("NBA_BREACH") });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await manager.state(accountId)).entries[0]).toMatchObject({ actualUnits: 2, costSource: "provider-header" });
    expect((await manager.state(accountId)).snapshots.at(-1)).toMatchObject({ used: 2, remaining: 498 });
    expect(await gate.reserve(1, "/events/{id}/odds")).toMatchObject({ ok: false, code: "NBA_ACCOUNTING_VIOLATION" });
  });

  it("charges the estimate on missing cost evidence, never zero", async () => {
    const { manager, gate, accountId } = await quotaSetup();
    const reservation = await gate.reserve(1, "/events/{id}/odds");
    if (reservation.ok === false) throw new Error("test reservation denied");
    await reservation.settle(null, "network-error", "NBA_BREACH: missing quota headers");
    expect((await manager.state(accountId)).entries[0]).toMatchObject({ actualUnits: 1, costSource: "estimate" });
  });

  it("parses all usage headers and preserves anomalies", () => {
    expect(parseNbaUsageHeaders(new Headers({ "x-requests-used": "234", "x-requests-remaining": "266", "x-requests-last": "1" }), "2026-10-20T12:00:00Z", 1)).toMatchObject({ used: 234, remaining: 266, last: 1, issue: null, snapshots: [{ limit: 500 }] });
    expect(parseNbaUsageHeaders(new Headers({ "x-requests-used": "234", "x-requests-remaining": "266", "x-requests-last": "2" }), "2026-10-20T12:00:00Z", 1)).toMatchObject({ last: 2, issue: expect.stringContaining("exceeds one-credit") });
    expect(parseNbaUsageHeaders(new Headers(), "2026-10-20T12:00:00Z", 1)).toMatchObject({ last: null, issue: expect.stringContaining("incomplete"), snapshots: [] });
  });

  it("quarantines a malformed book and outcome while retaining a valid pair", () => {
    const parsed = parseTheOddsApiNbaEvent({ id: "event-1", sport_key: "basketball_nba", commence_time: "2026-10-21T00:00:00Z", home_team: "A", away_team: "B", bookmakers: [null, { key: "dk", markets: [{ key: "player_points", last_update: "2026-10-20T20:00:00Z", outcomes: [{ name: "Over", description: "Same Name", point: 20.5, price: -110 }, { name: "Under", description: "Same Name", point: 20.5, price: -120 }, { name: "Over", description: "Bad", point: 10.5, price: "-110" }] }] }] }, ["pts"], "event-1");
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]).toMatchObject({ identityAmbiguous: true, sportsbook: "dk", lastUpdateUtc: "2026-10-20T20:00:00.000Z" });
    expect(parsed.unmatched.join(" ")).toMatch(/malformed entry.*malformed outcome/);
  });

  it("validates dashboard metadata without credential fields or stale balances", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const input = { plan: "Starter", limit: 500, used: 234, remaining: 266, observedAtUtc: "2026-10-20T11:00:00Z", resetDateUtc: "2026-11-01T00:00:00Z" };
    expect(parsePendingProviderEvidence(input, now).remaining).toBe(266);
    expect(() => parsePendingProviderEvidence({ ...input, apiKey: "secret" }, now)).toThrow();
    expect(() => parsePendingProviderEvidence({ ...input, plan: "apiKey=secret" }, now)).toThrow();
    expect(() => parsePendingProviderEvidence({ ...input, remaining: 265 }, now)).toThrow();
    expect(() => parsePendingProviderEvidence({ ...input, observedAtUtc: "2026-10-18T11:00:00Z" }, now)).toThrow();
    const evidence = parsePendingProviderEvidence(input, now);
    expect(() => verifiedEvidenceSnapshot(oddsAccount({ identity: "unverified-may-share" }), evidence)).toThrow();
    expect(verifiedEvidenceSnapshot(oddsAccount({ identity: "single-key" }), evidence)).toMatchObject({ used: 234, remaining: 266 });
  });

  it("keeps a date-only dashboard reading pending and excludes raw redistribution", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const input = { plan: "Starter", limit: 500, used: 234, remaining: 266, observedDate: "2026-10-20", resetDayOfMonth: 1, resetHourUtc: 0 };
    expect(parseIncompleteProviderEvidence(input, now)).toMatchObject({ observedAtUtc: null, resetDateUtc: null, resetDayOfMonth: 1, resetHourUtc: 0 });
    expect(() => parsePendingProviderEvidence(input, now)).toThrow();
    expect(() => parseIncompleteProviderEvidence({ ...input, apiKey: "secret" }, now)).toThrow();
    expect(() => parseIncompleteProviderEvidence({ ...input, remaining: 265 }, now)).toThrow();
    expect(() => parseIncompleteProviderEvidence({ ...input, resetHourUtc: undefined }, now)).toThrow();
    expect(() => parseIncompleteProviderEvidence({ ...input, observedDate: "2026-10-17" }, now)).toThrow();
    expect(ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses).toEqual(["private-research", "private-hosted", "model-development", "public-display"]);
  });

  it("appends only validated pending dashboard metadata through the normal intake path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nba-evidence-"));
    dirs.push(dir);
    const file = path.join(dir, "pending-dashboard-evidence.jsonl");
    const now = new Date("2026-10-20T12:00:00Z");
    const input = { plan: "Starter", limit: 500, used: 234, remaining: 266, observedDate: "2026-10-20", resetDayOfMonth: 1, resetHourUtc: 0 };
    appendPendingDashboardEvidence(file, input, now);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved).toMatchObject({ provider: "the-odds-api", provenance: "user-reported authenticated dashboard", status: "pending", evidence: { ...input, observedAtUtc: null, resetDateUtc: null } });
    expect(() => appendPendingDashboardEvidence(file, { ...input, apiKey: "never-store" }, now)).toThrow();
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("dashboard usage alone cannot authorize the shared account", async () => {
    const account = PROVIDER_ACCOUNTS.find((item) => item.accountId === "the-odds-api:unverified-pool");
    if (!account) throw new Error("shared account missing");
    const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: () => new Date("2026-10-20T12:00:00Z") });
    await manager.recordProviderUsage(account.accountId, [{ window: "month", observedAt: "2026-10-20T11:00:00Z", used: 234, remaining: 266, limit: 500 }]);
    expect(await manager.reserve(account.accountId, { priority: "nonessential", attribution: { sport: "nba", workflow: "probe", endpoint: "/events/{id}/odds" } }, { units: 1, basis: "test" })).toMatchObject({ allowed: false, code: "NOT_APPROVED" });
    expect(account.liveApproval).toBeNull();
  });

  it("records the provider's zero-cost contract for exactly the route discovery calls", async () => {
    expect(EVENTS_ENDPOINT_CONTRACT).toMatchObject({ method: "GET", path: "/v4/sports/{sport}/events", quotaCost: 0, quote: "This endpoint does not count against the usage quota.", source: "https://the-odds-api.com/liveapi/guides/v4/", reviewedOn: "2026-10-28" });
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0]) => new Response("[]", { headers: { "x-requests-used": "308", "x-requests-remaining": "192", "x-requests-last": "0" } }));
    await discoverNbaEventsOnce({ apiKey: "PRIVATE_TEST_TOKEN", approvalId: "discovery-contract", gate: { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve: async () => ({ ok: true as const, settle: async () => undefined }) }, claim: tempClaims(), fetchImpl });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe(EVENTS_ENDPOINT_CONTRACT.path.replace("{sport}", "basketball_nba"));
    // The priced parameters of the odds endpoints are not part of this route's contract and are never sent.
    for (const priced of ["markets", "regions", "bookmakers", "eventIds"]) expect(url.searchParams.has(priced)).toBe(false);
  });

  it("discovery requests only the zero-market NBA events route", async () => {
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0]) => new Response(JSON.stringify([{ id: "event-1", sport_key: "basketball_nba", commence_time: "2026-10-21T00:00:00Z", home_team: "A", away_team: "B" }]), { headers: { "x-requests-used": "0", "x-requests-remaining": "500", "x-requests-last": "0" } }));
    const settle = vi.fn(async () => undefined);
    const reserve = vi.fn(async () => ({ ok: true as const, settle }));
    const result = await discoverNbaEventsOnce({ apiKey: "PRIVATE_TEST_TOKEN", approvalId: "discovery-1", gate: { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve }, claim: tempClaims(), fetchImpl });
    expect(result.events).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://api.the-odds-api.com/v4/sports/basketball_nba/events");
    expect([...url.searchParams.keys()]).toEqual(["apiKey"]);
    expect(reserve).toHaveBeenCalledWith(0, "/events");
    expect(settle).toHaveBeenCalledWith(0, "ok", null, expect.any(Array));
  });
});
