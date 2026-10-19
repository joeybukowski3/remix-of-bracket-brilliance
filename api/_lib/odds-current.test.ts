// @vitest-environment node
// Lives in api/_lib (underscore-prefixed) on purpose: Vercel deploys every other file under api/ as a function.
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../odds/current";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/odds/current (NCAAB odds pause)", () => {
  it("makes no upstream request and returns an empty success while paused, even with a key set", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    vi.stubEnv("ODDS_API_KEY", "test-key");
    vi.stubEnv("NCAAB_ODDS_ENABLED", "");

    const response = await GET();
    const body = (await response.json()) as { success: boolean; odds: unknown[]; count: number; paused?: boolean };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, odds: [], count: 0, paused: true });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only the exact value true resumes the upstream call", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    vi.stubEnv("ODDS_API_KEY", "test-key");
    for (const value of ["1", "TRUE", "yes", "false"]) {
      vi.stubEnv("NCAAB_ODDS_ENABLED", value);
      await GET();
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("resumes the upstream NCAAB request when explicitly enabled", async () => {
    const upstream = vi.fn(async () => Response.json([], { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    vi.stubEnv("ODDS_API_KEY", "test-key");
    vi.stubEnv("NCAAB_ODDS_ENABLED", "true");

    await GET();

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String((upstream.mock.calls[0] as unknown[])[0])).toContain("basketball_ncaab");
  });
});
