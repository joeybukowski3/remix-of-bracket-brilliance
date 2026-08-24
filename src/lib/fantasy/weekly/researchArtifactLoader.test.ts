import { describe, expect, it } from "vitest";
import {
  WeeklyFantasyResearchArtifactNotFoundError,
  loadWeeklyFantasyResearchArtifact,
  loadWeeklyFantasyResearchState,
} from "@/lib/fantasy/weekly/researchArtifactLoader";

function response(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("weekly fantasy research artifact loader", () => {
  it("treats a missing companion as non-projection missing state", async () => {
    const state = await loadWeeklyFantasyResearchState(2026, 2, async () => response(404, {}));
    expect(state.status).toBe("missing");
  });

  it("does not accept an SPA HTML fallback as research JSON", async () => {
    await expect(loadWeeklyFantasyResearchArtifact(2026, 1, async () => response(200, "<html />", "text/html")))
      .rejects.toBeInstanceOf(WeeklyFantasyResearchArtifactNotFoundError);
  });

  it("fails malformed research without affecting the projection loader contract", async () => {
    const state = await loadWeeklyFantasyResearchState(2026, 1, async () => response(200, { schemaVersion: "wrong" }));
    expect(state.status).toBe("error");
  });
});
