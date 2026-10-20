import { describe, expect, it, vi } from "vitest";
import { createTheOddsApiNbaProvider, parseTheOddsApiNbaEvent } from "./pipeline/theOddsApiNba";
import { oneCreditNbaProbe } from "./pipeline/theOddsApiNbaProbe";
import type { RequestGate } from "./pipeline/budget";
import type { SourceLicense } from "./sources/types";
import type { ProbeClaim } from "./pipeline/probeClaim";

const event = (books: unknown[] = []) => ({ id: "nba-event-1", sport_key: "basketball_nba", commence_time: "2026-10-20T23:00:00Z", home_team: "Boston Celtics", away_team: "New York Knicks", bookmakers: books });
const book = (key: string, outcomes: unknown[], updated = "2026-10-20T19:00:00Z") => ({ key, last_update: updated, markets: [{ key: "player_points", outcomes }] });
const pair = (player = "Sample Player", point = 24.5) => [{ name: "Over", description: player, point, price: -110 }, { name: "Under", description: player, point, price: -120 }];
const grant: SourceLicense = { status: "commercial-licensed", permittedUses: ["private-research"], basis: "test only", reviewedOn: "2026-10-19" };
const request = { sourceEventId: "nba-event-1", markets: ["pts"] as const };
const claim: ProbeClaim = { claim: async () => true };

describe("NBA Odds API v4 event adapter", () => {
  it("pairs by player, line and sportsbook and preserves raw references", () => {
    const parsed = parseTheOddsApiNbaEvent(event([book("draftkings", pair()), book("fanduel", pair("Other Player", 20.5))]), ["pts"], request.sourceEventId);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({ playerName: "Sample Player", sportsbook: "draftkings", line: 24.5, overPrice: -110, underPrice: -120, lastUpdateUtc: "2026-10-20T19:00:00.000Z", rawProviderRef: { eventId: "nba-event-1", bookmakerKey: "draftkings", marketKey: "player_points", overOutcomeIndex: 0, underOutcomeIndex: 1 } });
    expect(parsed.event.homeTeam).toBe("Boston Celtics");
  });

  it("reports missing markets, players, sides and malformed prices without fabricating pairs", () => {
    const parsed = parseTheOddsApiNbaEvent(event([{ key: "empty", markets: [] }, book("bad", [{ name: "Over", point: 20.5, price: -110 }, { name: "Under", description: "A", point: 20.5, price: -50 }, { name: "Over", description: "B", point: 21.5, price: -110 }])]), ["pts"], request.sourceEventId);
    expect(parsed.lines).toHaveLength(0);
    expect(parsed.unmatched.join(" ")).toMatch(/missing market/);
    expect(parsed.unmatched.join(" ")).toMatch(/malformed or unidentified/);
    expect(parsed.unmatched.join(" ")).toMatch(/missing or duplicate side/);
  });

  it("keeps rebounds and assists parsing available for later use", () => {
    const b = { key: "draftkings", markets: [{ key: "player_rebounds", outcomes: pair("A", 8.5) }, { key: "player_assists", outcomes: pair("A", 5.5) }] };
    expect(parseTheOddsApiNbaEvent(event([b]), ["reb", "ast"], request.sourceEventId).lines.map((x) => x.market)).toEqual(["reb", "ast"]);
  });

  it("requires one-use authorization and never leaks credentials or provider bodies", async () => {
    const fetchImpl = vi.fn(async (_url: Parameters<typeof fetch>[0]) => new Response(JSON.stringify(event([book("dk", pair())])), { status: 200, headers: { "x-requests-last": "1" } }));
    const provider = createTheOddsApiNbaProvider({ apiKey: "PRIVATE_TEST_TOKEN_123456", fetchImpl });
    expect((await provider.fetchEventProps(request)).status).toBe("error");
    provider.authorizeRequest?.(request);
    const result = await provider.fetchEventProps(request);
    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("regions=us");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("markets=player_points");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TEST_TOKEN");
    expect((await provider.fetchEventProps(request)).status).toBe("error");
  });

  it("handles missing credentials and provider errors without sending secrets", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret body", { status: 503 }));
    const missing = createTheOddsApiNbaProvider({ apiKey: undefined, fetchImpl });
    missing.authorizeRequest?.(request);
    expect(await missing.fetchEventProps(request)).toMatchObject({ status: "error", creditsCharged: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    const provider = createTheOddsApiNbaProvider({ apiKey: "PRIVATE_TEST_TOKEN_123456", fetchImpl });
    provider.authorizeRequest?.(request);
    const result = await provider.fetchEventProps(request);
    expect(result).toMatchObject({ status: "error", message: "NBA Odds API HTTP 503" });
    expect(JSON.stringify(result)).not.toMatch(/secret body|PRIVATE_TEST_TOKEN/);
  });

  it("probe refuses an explicitly closed license and quota denial, and sends at most one call", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(event([book("dk", pair())])), { status: 200 }));
    const provider = createTheOddsApiNbaProvider({ apiKey: "PRIVATE_TEST_TOKEN_123456", fetchImpl });
    const settle = vi.fn(async () => undefined);
    const reserve = vi.fn(async () => ({ ok: true as const, settle }));
    const gate: RequestGate = { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve };
    const closed = oneCreditNbaProbe({ eventId: request.sourceEventId, provider, gate, license: { ...grant, permittedUses: [] }, claim, approvalId: "test-closed" });
    expect((await closed()).status).toBe("error");
    expect(reserve).not.toHaveBeenCalled();
    const denied = oneCreditNbaProbe({ eventId: request.sourceEventId, provider, gate: { ...gate, reserve: async () => ({ ok: false, code: "NBA_STALE_EVIDENCE", message: "stale" }) }, license: grant, claim, approvalId: "test-denied" });
    expect((await denied()).status).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
    const probe = oneCreditNbaProbe({ eventId: request.sourceEventId, provider, gate, license: grant, claim, approvalId: "test-probe" });
    expect((await probe()).status).toBe("ok");
    expect((await probe()).status).toBe("error");
    expect(reserve).toHaveBeenCalledWith(1, "/events/{id}/odds");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});
