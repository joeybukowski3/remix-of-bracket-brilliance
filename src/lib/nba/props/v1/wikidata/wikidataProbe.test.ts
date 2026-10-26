import { describe, expect, it, vi } from "vitest";
import { assertDescriptiveUserAgent, cooldownRemainingMs, DEFAULT_COOLDOWN_SECONDS, DEFAULT_USER_AGENT, MIN_RERUN_INTERVAL_MS, parseRetryAfter, rerunWaitMs, runProbe, type ProbeDeps } from "./wikidataProbe";
import { PROBE_LIMITS, type ProbeQuery } from "./wikidataQueries";

const queries = (n: number): ProbeQuery[] => Array.from({ length: n }, (_, i) => ({ id: (["meta", "ids", "labels", "positions", "positionRefs", "positionQualifiers", "openTeams", "modified"] as const)[i], sparql: `SELECT ?x WHERE { ?x ?p ?o } LIMIT ${i + 1}` }));

const okBody = (rows: number) => JSON.stringify({ head: { vars: ["x"] }, results: { bindings: Array.from({ length: rows }, () => ({ x: { type: "literal", value: "1" } })) } });
const ok = (rows = 1) => new Response(okBody(rows), { status: 200 });

interface Harness {
  deps: ProbeDeps;
  calls: { url: string; init: RequestInit }[];
  sleeps: number[];
}

/** A virtual clock: sleep advances it, and each fetch costs `durationMs` of it. */
function harness(responder: (callNumber: number) => Response | Promise<Response>, durationMs = 100): Harness {
  let clock = 1_000_000;
  const calls: Harness["calls"] = [];
  const sleeps: number[] = [];
  const deps: ProbeDeps = {
    userAgent: DEFAULT_USER_AGENT,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      clock += durationMs;
      return responder(calls.length);
    }) as unknown as typeof fetch,
  };
  return { deps, calls, sleeps };
}

describe("runProbe hardening", () => {
  it("refuses to follow redirects, so a 3xx can never send the request or the User-Agent to another host", async () => {
    const h = harness(() => ok());
    await runProbe(queries(1), h.deps);
    expect(h.calls[0].init.redirect).toBe("error");
    const post = harness(() => ok());
    await runProbe([{ id: "meta", sparql: `SELECT ?x WHERE { VALUES ?x { ${"wd:Q1 ".repeat(400)} } } LIMIT 5` }], post.deps);
    expect(post.calls[0].init.redirect).toBe("error");
  });

  it("treats a redirect error as an abort without a second request", async () => {
    const h = harness(() => {
      throw new TypeError("fetch failed: redirect mode is set to error");
    });
    const result = await runProbe(queries(3), h.deps);
    expect(result.outcome).toBe("aborted");
    expect(result.abortReason).toContain("failed");
    expect(h.calls).toHaveLength(1);
  });

  it("abandons a streamed body once it passes the byte cap, without reading the rest", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const result = await runProbe(queries(1), harness(() => new Response(stream, { status: 200 })).deps);
    expect(result.abortReason).toMatch(/exceeded/);
    expect(pulled).toBeLessThan(PROBE_LIMITS.maxResponseBytes / chunk.byteLength + 5);
  });

  it("refuses on a declared Content-Length above the cap before reading anything", async () => {
    const response = new Response("{}", { status: 200, headers: { "content-length": String(PROBE_LIMITS.maxResponseBytes + 1) } });
    const result = await runProbe(queries(1), harness(() => response).deps);
    expect(result.abortReason).toMatch(/exceeded/);
  });

  it.each([["a string", '{"results":{"bindings":"nope"}}'], ["missing", '{"results":{}}'], ["null body", "null"]])("rejects a result whose bindings are %s", async (_name, body) => {
    const h = harness(() => new Response(body, { status: 200 }));
    const result = await runProbe(queries(2), h.deps);
    expect(result.outcome).toBe("aborted");
    expect(result.abortReason).toMatch(/not a SPARQL JSON result|failed/);
    expect(h.calls).toHaveLength(1);
  });

  it("stops on a 503 and reports its Retry-After, like a 429", async () => {
    const h = harness((n) => (n === 1 ? new Response("", { status: 503, headers: { "retry-after": "90" } }) : ok()));
    const result = await runProbe(queries(3), h.deps);
    expect(result.retryAfterSeconds).toBe(90);
    expect(result.abortReason).toContain("503");
    expect(h.calls).toHaveLength(1);
  });

  it("stops on a 429 with a missing or unusable Retry-After, without retrying", async () => {
    for (const headers of [{}, { "retry-after": "soon" }] as Record<string, string>[]) {
      const h = harness(() => new Response("", { status: 429, headers }));
      const result = await runProbe(queries(3), h.deps);
      expect(result.outcome).toBe("aborted");
      expect(result.retryAfterSeconds).toBeNull();
      expect(h.calls).toHaveLength(1);
    }
  });

  it("aborts the in-flight request when the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const seen: { signal: AbortSignal | null } = { signal: null };
      const never = ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          seen.signal = init.signal as AbortSignal;
          seen.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })) as unknown as typeof fetch;
      const pending = runProbe(queries(2), { userAgent: DEFAULT_USER_AGENT, now: Date.now, sleep: async () => undefined, fetch: never });
      await vi.advanceTimersByTimeAsync(PROBE_LIMITS.requestTimeoutMs - 1);
      expect(seen.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      const result = await pending;
      expect(seen.signal?.aborted).toBe(true);
      expect(result.abortReason).toContain("timed out");
      expect(result.requests).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");

  it("reads delta-seconds and HTTP dates, and nothing else", () => {
    expect(parseRetryAfter("37", now)).toBe(37);
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter("Fri, 23 Oct 2026 12:02:00 GMT", now)).toBe(120);
    expect(parseRetryAfter("Fri, 23 Oct 2026 11:00:00 GMT", now)).toBe(0);
    for (const bad of [null, "", "  ", "-5", "soon"]) expect(parseRetryAfter(bad, now)).toBeNull();
  });
});

describe("cooldownRemainingMs", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");

  it("waits the Retry-After from the abort time, or the default when there was none", () => {
    expect(cooldownRemainingMs({ abortedAtUtc: "2026-10-23T11:59:00Z", retryAfterSeconds: 90 }, now)).toBe(30_000);
    expect(cooldownRemainingMs({ abortedAtUtc: "2026-10-23T11:58:00Z", retryAfterSeconds: 90 }, now)).toBe(0);
    expect(cooldownRemainingMs({ abortedAtUtc: "2026-10-23T11:58:00Z", retryAfterSeconds: null }, now)).toBe(DEFAULT_COOLDOWN_SECONDS * 1000 - 120_000);
    expect(cooldownRemainingMs({ abortedAtUtc: "2026-10-23T11:00:00Z", retryAfterSeconds: null }, now)).toBe(0);
  });

  it("treats an unreadable abort time as a full cool-down rather than none", () => {
    expect(cooldownRemainingMs({ abortedAtUtc: "undefined", retryAfterSeconds: null }, now)).toBe(DEFAULT_COOLDOWN_SECONDS * 1000);
  });
});

describe("assertDescriptiveUserAgent", () => {
  it("accepts the default agent, which names the client, a version and a contact URL", () => {
    expect(() => assertDescriptiveUserAgent(DEFAULT_USER_AGENT)).not.toThrow();
    expect(() => assertDescriptiveUserAgent("Audit/1.0 (ops@example.org) node-fetch")).not.toThrow();
  });

  it.each(["", "curl/8.0", "python-requests/2.31", "node-fetch/3.0 (https://example.org)", "Mozilla/5.0 (X11; Linux x86_64) https://x.org", "MyBot/1.0", "MyBot/1.0 (no contact here)"])(
    "rejects %j",
    (agent) => {
      expect(() => assertDescriptiveUserAgent(agent)).toThrow(/User-Agent policy/);
    },
  );

  it("refuses to run with a generic agent, before any request", async () => {
    const h = harness(() => ok());
    await expect(runProbe(queries(1), { ...h.deps, userAgent: "curl/8.0" })).rejects.toThrow(/User-Agent/);
    expect(h.calls).toHaveLength(0);
  });
});

describe("runProbe", () => {
  it("runs the queries serially, each with the User-Agent and JSON accept header, against the public endpoint", async () => {
    const h = harness(() => ok(2));
    const result = await runProbe(queries(3), h.deps);
    expect(result.outcome).toBe("complete");
    expect(h.calls).toHaveLength(3);
    for (const call of h.calls) {
      expect(call.url.startsWith("https://query.wikidata.org/sparql?query=")).toBe(true);
      const headers = call.init.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
      expect(headers.Accept).toBe("application/sparql-results+json");
    }
    expect(Object.keys(result.raw)).toEqual(["meta", "ids", "labels"]);
    expect(result.requests.map((r) => [r.queryId, r.status, r.rows])).toEqual([["meta", 200, 2], ["ids", 200, 2], ["labels", 200, 2]]);
  });

  it("never has two requests in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const h = harness(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return ok();
    });
    await runProbe(queries(4), h.deps);
    expect(peak).toBe(1);
  });

  it("waits at least the minimum interval between requests, and at least as long as the previous request took", async () => {
    const quick = harness(() => ok(), 100);
    await runProbe(queries(3), quick.deps);
    expect(quick.sleeps).toHaveLength(2);
    expect(quick.sleeps.every((ms) => ms >= PROBE_LIMITS.minIntervalMs - 100)).toBe(true);

    const slow = harness(() => ok(), 20_000);
    await runProbe(queries(2), slow.deps);
    expect(slow.sleeps[0]).toBe(20_000);
  });

  it("stops at the first 429 without retrying, and reports Retry-After", async () => {
    const h = harness((n) => (n === 2 ? new Response("", { status: 429, headers: { "retry-after": "37" } }) : ok()));
    const result = await runProbe(queries(5), h.deps);
    expect(result.outcome).toBe("aborted");
    expect(result.retryAfterSeconds).toBe(37);
    expect(result.abortReason).toContain("429");
    expect(h.calls).toHaveLength(2);
    expect(Object.keys(result.raw)).toEqual(["meta"]);
  });

  it("stops on a server error and on a non-JSON body without retrying", async () => {
    const serverError = harness((n) => (n === 2 ? new Response("boom", { status: 500 }) : ok()));
    expect((await runProbe(queries(4), serverError.deps)).abortReason).toContain("HTTP 500");
    expect(serverError.calls).toHaveLength(2);

    const truncated = harness(() => new Response('{"results": {"bindings": [', { status: 200 }));
    const result = await runProbe(queries(3), truncated.deps);
    expect(result.outcome).toBe("aborted");
    expect(result.abortReason).toContain("failed");
    expect(truncated.calls).toHaveLength(1);
  });

  it("treats a result at the row cap as possibly truncated and refuses it", async () => {
    const h = harness(() => ok(PROBE_LIMITS.maxRowsPerQuery));
    const result = await runProbe(queries(2), h.deps);
    expect(result.outcome).toBe("aborted");
    expect(result.abortReason).toMatch(/row cap/);
    expect(result.raw).toEqual({});
  });

  it("refuses a response larger than the byte cap", async () => {
    const huge = "x".repeat(PROBE_LIMITS.maxResponseBytes + 1);
    const result = await runProbe(queries(1), harness(() => new Response(huge, { status: 200 })).deps);
    expect(result.outcome).toBe("aborted");
    expect(result.abortReason).toMatch(/bytes/);
  });

  it("reports a timeout as an abort", async () => {
    const h = harness(() => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const result = await runProbe(queries(2), h.deps);
    expect(result.abortReason).toContain("timed out");
    expect(h.calls).toHaveLength(1);
  });

  it("rejects a plan over the request cap before sending anything", async () => {
    const h = harness(() => ok());
    const tooMany = Array.from({ length: PROBE_LIMITS.maxRequests + 1 }, (_, i) => ({ id: "meta" as const, sparql: `SELECT ?x WHERE { ?x ?p ?o } LIMIT ${i + 1}` }));
    await expect(runProbe(tooMany, h.deps)).rejects.toThrow(/cap/);
    expect(h.calls).toHaveLength(0);
  });

  it("sends a long query in a POST body instead of the URL", async () => {
    const h = harness(() => ok());
    const long: ProbeQuery = { id: "meta", sparql: `SELECT ?x WHERE { VALUES ?x { ${"wd:Q1 ".repeat(400)} } } LIMIT 5` };
    await runProbe([long], h.deps);
    expect(h.calls[0].init.method).toBe("POST");
    expect(h.calls[0].url).toBe("https://query.wikidata.org/sparql");
    expect(String(h.calls[0].init.body).startsWith("query=")).toBe(true);
  });

  it("records a hash of each query and no secrets or contact beyond the User-Agent", async () => {
    const h = harness(() => ok());
    const result = await runProbe(queries(1), h.deps);
    expect(result.requests[0].queryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.requests)).not.toMatch(/api[_-]?key|authorization|@/i);
  });
});

describe("rerunWaitMs", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");

  it("spaces the starts of two runs even when the first one succeeded", () => {
    expect(MIN_RERUN_INTERVAL_MS).toBe(600_000);
    expect(rerunWaitMs({ lastStartedAtUtc: "2026-10-23T11:55:00Z", aborted: null }, now)).toBe(300_000);
    expect(rerunWaitMs({ lastStartedAtUtc: "2026-10-23T11:50:00Z", aborted: null }, now)).toBe(0);
    expect(rerunWaitMs({ lastStartedAtUtc: "2026-10-23T09:00:00Z", aborted: null }, now)).toBe(0);
  });

  it("takes the longer of the spacing and the abort cool-down", () => {
    const aborted = { abortedAtUtc: "2026-10-23T11:59:00Z", retryAfterSeconds: 3600 };
    expect(rerunWaitMs({ lastStartedAtUtc: "2026-10-23T11:00:00Z", aborted }, now)).toBe(3_540_000);
    expect(rerunWaitMs({ lastStartedAtUtc: "2026-10-23T11:59:30Z", aborted: { abortedAtUtc: "2026-10-23T11:59:40Z", retryAfterSeconds: 1 } }, now)).toBe(570_000);
  });

  it("treats an unreadable start time as a full interval rather than none", () => {
    expect(rerunWaitMs({ lastStartedAtUtc: "unreadable", aborted: null }, now)).toBe(MIN_RERUN_INTERVAL_MS);
  });
});
