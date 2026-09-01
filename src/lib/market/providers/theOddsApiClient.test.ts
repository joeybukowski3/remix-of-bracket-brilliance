import { describe, expect, it, vi } from "vitest";
import {
  createTheOddsApiClient,
  TheOddsApiError,
  THE_ODDS_API_BASE_URL,
} from "./theOddsApiClient";
import { THE_ODDS_API_NFL_ODDS_FIXTURE } from "./__fixtures__/theOddsApiWireFixtures";

const KEY = "odds-api-secret-abc123";

function response(
  body: unknown,
  init: Partial<{ status: number; statusText: string; headers: Record<string, string> }> = {},
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: {
      "content-type": "application/json",
      "x-requests-remaining": "437",
      "x-requests-used": "63",
      "x-requests-last": "3",
      ...(init.headers ?? {}),
    },
  });
}

describe("createTheOddsApiClient", () => {
  it("throws missing-api-key before any request when the key is blank", () => {
    const fetchImpl = vi.fn();
    expect(() =>
      createTheOddsApiClient({ apiKey: "   ", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).toThrow(TheOddsApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("builds the NFL league-wide odds URL with one request, us region, american odds, all three markets", async () => {
    const fetchImpl = vi.fn(async () => response(THE_ODDS_API_NFL_ODDS_FIXTURE));
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getCurrentOdds({ league: "nfl" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      `${THE_ODDS_API_BASE_URL}/v4/sports/americanfootball_nfl/odds`,
    );
    expect(url.searchParams.get("regions")).toBe("us");
    expect(url.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(url.searchParams.get("oddsFormat")).toBe("american");
    expect(url.searchParams.get("apiKey")).toBe(KEY);
  });

  it("parses the quota response headers", async () => {
    const fetchImpl = vi.fn(async () => response([]));
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.getCurrentOdds({ league: "nfl" });
    expect(result.quota).toEqual({ remaining: 437, used: 63, lastCost: 3 });
  });

  it("never leaks the api key in a thrown error path", async () => {
    const fetchImpl = vi.fn(async () =>
      response("nope", { status: 500, statusText: "Server Error" }),
    );
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await client.getCurrentOdds({ league: "nfl" });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TheOddsApiError);
      const err = error as TheOddsApiError;
      expect(err.message).not.toContain(KEY);
      expect(err.path).not.toContain(KEY);
      expect(JSON.stringify(err)).not.toContain(KEY);
    }
  });

  it("maps 401 to unauthorized", async () => {
    const fetchImpl = vi.fn(async () => response("bad key", { status: 401 }));
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getCurrentOdds({ league: "nfl" })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("maps 429 to rate-limited", async () => {
    const fetchImpl = vi.fn(async () => response("slow down", { status: 429 }));
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getCurrentOdds({ league: "nfl" })).rejects.toMatchObject({
      kind: "rate-limited",
    });
  });

  it("maps 5xx to http-error", async () => {
    const fetchImpl = vi.fn(async () => response("boom", { status: 503 }));
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getCurrentOdds({ league: "nfl" })).rejects.toMatchObject({
      kind: "http-error",
    });
  });

  it("maps an unparseable body to invalid-json", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const client = createTheOddsApiClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getCurrentOdds({ league: "nfl" })).rejects.toMatchObject({
      kind: "invalid-json",
    });
  });
});
