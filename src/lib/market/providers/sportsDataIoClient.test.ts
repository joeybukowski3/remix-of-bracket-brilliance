import { describe, expect, it, vi } from "vitest";
import {
  createSportsDataIoClient,
  SportsDataIoApiError,
  SPORTSDATAIO_API_KEY_HEADER,
} from "./sportsDataIoClient";

const KEY = "test-secret-key-123";

function jsonResponse(body: unknown, init: Partial<{ status: number; statusText: string }> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: { "content-type": "application/json" },
  });
}

describe("createSportsDataIoClient", () => {
  it("throws a missing-api-key error before any request when the key is blank", () => {
    const fetchImpl = vi.fn();
    expect(() => createSportsDataIoClient({ apiKey: "  ", fetchImpl: fetchImpl as unknown as typeof fetch }))
      .toThrow(SportsDataIoApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the key in the Ocp-Apim-Subscription-Key header, never in the URL", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get(SPORTSDATAIO_API_KEY_HEADER)).toBe(KEY);
      return jsonResponse([]);
    });
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getNflScoresByWeek(2026, "REG", 1);

    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain(KEY);
    expect(calledUrl).toBe(
      "https://api.sportsdata.io/v3/nfl/scores/json/ScoresByWeek/2026REG/1",
    );
  });

  it("builds the verified BettingSplitsByScoreId path", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ScoreId: 1 }));
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getNflBettingSplitsByScoreId("18001");
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.sportsdata.io/v3/nfl/odds/json/BettingSplitsByScoreId/18001",
    );
  });

  it("maps HTTP 401 to an unauthorized error without leaking the key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("Access denied due to invalid subscription key", { status: 401, statusText: "Unauthorized" }),
    );
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getNflScoresByWeek(2026, "REG", 1)).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
    await client.getNflScoresByWeek(2026, "REG", 1).catch((error) => {
      expect(String(error)).not.toContain(KEY);
    });
  });

  it("maps a non-2xx response to an http-error", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500, statusText: "Server Error" }));
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getNflBettingSplitsByScoreId("1")).rejects.toMatchObject({
      kind: "http-error",
      status: 500,
    });
  });

  it("maps invalid JSON to an invalid-json error", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getNflScoresByWeek(2026, "REG", 1)).rejects.toMatchObject({
      kind: "invalid-json",
    });
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createSportsDataIoClient({
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });
    await expect(client.getNflScoresByWeek(2026, "REG", 1)).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
