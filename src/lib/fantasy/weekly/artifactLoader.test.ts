import { describe, expect, it, vi } from "vitest";
import { loadWeeklyFantasyRankingArtifact, loadWeeklyFantasyRankingState, WeeklyFantasyArtifactNotFoundError, weeklyFantasyArtifactLoadingState, weeklyFantasyArtifactPath } from "./artifactLoader";
import { buildWeeklyFantasyRankingArtifact, type ProductionRankingCandidate } from "./productionAuthority";

const hash = "b".repeat(64);
const emptyArtifact = () => buildWeeklyFantasyRankingArtifact({
  season: 2026, week: 1, generatedAt: "2026-08-21T16:00:00.000Z", inputAsOf: "2026-08-20T00:00:00.000Z",
  candidates: [] as ProductionRankingCandidate[],
  provenance: [{ source: "test", sourceVersion: "v1", sourceHash: hash, inputAsOf: "2026-08-20T00:00:00.000Z" }],
});

describe("weekly fantasy artifact loader", () => {
  it("builds the canonical zero-padded path", () => {
    expect(weeklyFantasyArtifactPath(2026, 1)).toBe("/data/fantasy/weekly/2026/week-01.json");
  });

  it("loads and validates without calculating rankings", async () => {
    const artifact = emptyArtifact();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(artifact), { status: 200 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingArtifact(2026, 1, fetcher)).resolves.toEqual(artifact);
    expect(fetcher).toHaveBeenCalledWith("/data/fantasy/weekly/2026/week-01.json", { cache: "no-store" });
  });

  it("reports a missing artifact explicitly", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingArtifact(2026, 2, fetcher)).rejects.toBeInstanceOf(WeeklyFantasyArtifactNotFoundError);
  });

  it("treats an SPA HTML fallback as a missing static artifact", async () => {
    const fetcher = vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingState(2026, 2, fetcher)).resolves.toMatchObject({ status: "missing" });
  });

  it("rejects an invalid artifact contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ season: 2026 }), { status: 200 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingArtifact(2026, 1, fetcher)).rejects.toThrow();
  });

  it("provides explicit loading, ready, missing, and error states", async () => {
    expect(weeklyFantasyArtifactLoadingState(2026, 1)).toEqual({ status: "loading", season: 2026, week: 1 });
    const readyFetcher = vi.fn(async () => new Response(JSON.stringify(emptyArtifact()), { status: 200 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingState(2026, 1, readyFetcher)).resolves.toMatchObject({ status: "ready" });
    const missingFetcher = vi.fn(async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingState(2026, 2, missingFetcher)).resolves.toMatchObject({ status: "missing" });
    const errorFetcher = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    await expect(loadWeeklyFantasyRankingState(2026, 3, errorFetcher)).resolves.toMatchObject({ status: "error" });
  });
});
