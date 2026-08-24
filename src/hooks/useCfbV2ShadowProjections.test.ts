import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCfbV2ShadowProjections } from "./useCfbV2ShadowProjections";

function mockFetch(impl: (url: string) => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VALID_ARTIFACT = {
  schemaVersion: "cfb-v2-public-projections-1",
  season: 2026,
  asOfWeek: 0,
  dataAsOf: "2026-01-20T00:00:00.000Z",
  generatedAt: "2026-08-24T12:00:00.000Z",
  configVersion: "cfb-v2-config-test",
  modelVersion: "cfb-v2.0",
  scoringVersion: "cfb-scoring-v2.0",
  calibrationVersion: "cfb-calibration-v2.0",
  probabilityVersion: "cfb-probability-v2.0",
  ratingsContentHash: "sha-fnv1a-r0000000",
  projectionsContentHash: "sha-fnv1a-p0000000",
  healthState: "DEGRADED",
  degradedFlags: ["PRESEASON_ZERO_COMPLETED_GAMES"],
  records: [],
};

describe("useCfbV2ShadowProjections — WU7A §9/§14 absence and error safety", () => {
  it("404 (artifact absent) resolves to status 'absent', never throws", async () => {
    mockFetch(async () => new Response(null, { status: 404 }));
    const { result } = renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.status).toBe("absent");
  });

  it("network error resolves to status 'absent', never throws", async () => {
    mockFetch(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.status).toBe("absent");
  });

  it("malformed JSON body resolves to status 'absent' (json() throws), never throws to the caller", async () => {
    mockFetch(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) as unknown as Response);
    const { result } = renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.status).toBe("absent");
  });

  it("valid but schema-invalid payload resolves to status 'invalid' with a reason, never throws", async () => {
    mockFetch(async () => new Response(JSON.stringify({ ...VALID_ARTIFACT, schemaVersion: "wrong" }), { status: 200 }));
    const { result } = renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.status).toBe("invalid");
    if (result.current.status === "invalid") expect(result.current.reason).toMatch(/schemaVersion/);
  });

  it("a real valid, healthy-shaped artifact loads successfully", async () => {
    mockFetch(async () => new Response(JSON.stringify(VALID_ARTIFACT), { status: 200 }));
    const { result } = renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.status).toBe("loaded");
    if (result.current.status === "loaded") expect(result.current.artifact.season).toBe(2026);
  });

  it("fetches with cache: 'no-store', matching the repo's existing runtime-data convention", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(VALID_ARTIFACT), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useCfbV2ShadowProjections(2026));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith("/data/cfb/v2/shadow-projections.json", { cache: "no-store" });
  });
});
