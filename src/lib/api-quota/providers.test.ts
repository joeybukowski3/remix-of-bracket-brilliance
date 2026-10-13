import { describe, expect, it } from "vitest";
import { estimates, inspectApiSportsBody, parseApiSportsHeaders, parseApiSportsStatusBody, parseRequestsHeaders } from "./providers";

const at = "2026-10-13T12:00:00.000Z";

describe("header parsers", () => {
  it("reads API-Sports daily quota headers", () => {
    const headers = new Headers({ "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": "97", "X-RateLimit-Remaining": "9" });
    expect(parseApiSportsHeaders(headers, at)).toEqual({
      snapshots: [{ window: "day", observedAt: at, used: null, remaining: 97, limit: 100 }],
      lastCallUnits: null,
    });
  });

  it("reads x-requests-* headers including the per-call cost, and treats absent headers as unknown", () => {
    const headers = new Headers({ "x-requests-used": "146", "x-requests-remaining": "354", "x-requests-last": "3" });
    expect(parseRequestsHeaders(headers, at)).toEqual({
      snapshots: [{ window: "month", observedAt: at, used: 146, remaining: 354, limit: 500 }],
      lastCallUnits: 3,
    });
    expect(parseRequestsHeaders(new Headers(), at)).toEqual({ snapshots: [], lastCallUnits: null });
  });
});

describe("API-Sports body inspection", () => {
  it("flags HTTP-200 bodies that carry errors", () => {
    expect(inspectApiSportsBody(JSON.stringify({ errors: { plan: "Free plans do not have access to this season" }, response: [] }))).toBe(
      "plan: Free plans do not have access to this season",
    );
    expect(inspectApiSportsBody(JSON.stringify({ errors: ["Too many requests"] }))).toBe("Too many requests");
  });

  it("accepts empty error collections and rejects non-JSON", () => {
    expect(inspectApiSportsBody(JSON.stringify({ errors: [], response: [] }))).toBeNull();
    expect(inspectApiSportsBody(JSON.stringify({ errors: {}, response: [] }))).toBeNull();
    expect(inspectApiSportsBody("<html>")).toBe("body is not JSON");
  });

  it("parses /status usage without reading account identity fields", () => {
    const body = JSON.stringify({ response: { account: { email: "x@example.com" }, subscription: { plan: "Free", active: true }, requests: { current: 12, limit_day: 100 } } });
    expect(parseApiSportsStatusBody(body, at)).toEqual({
      snapshot: { window: "day", observedAt: at, used: 12, remaining: 88, limit: 100 },
      plan: "Free",
      active: true,
    });
  });
});

describe("cost estimates", () => {
  it("never estimates a request as free", () => {
    expect(estimates.apiSports("/games").units).toBe(1);
    expect(estimates.apiSports("/status")).toMatchObject({ units: 1, isUsageCheck: true });
    expect(estimates.parlayProps(2).units).toBe(6);
    expect(estimates.theOddsApiOdds(3, 1).units).toBe(3);
  });
});
