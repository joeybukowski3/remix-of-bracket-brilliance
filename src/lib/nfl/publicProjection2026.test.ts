import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPublicProjectionBoard,
  sanitizePublicNote,
} from "@/lib/nfl/publicProjection2026";
import { validateNflV04ProjectionArtifact } from "@/lib/nfl/v04Projection";
import { loadNflV04Projection, NFL_V04_PROJECTION_PATH } from "@/hooks/useNflV04Projection";

const ROOT = resolve(__dirname, "../../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");
const ARTIFACT_PATH = join(NFL_DATA, "2026", "projected-power-ratings-v04.json");

function loadBoard() {
  const artifact = validateNflV04ProjectionArtifact(JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")));
  return buildPublicProjectionBoard(artifact);
}

const FORBIDDEN_SERIALIZED_TERMS = [
  "betting",
  "odds",
  "picks",
  "pick'em",
  "spread",
  "claude",
  "anthropic",
  "vsin",
  "warren sharp",
  "sportsbook",
  "wager",
];

async function committedFetch(input: RequestInfo | URL): Promise<Response> {
  const requestPath = String(input);
  const relative = requestPath.replace(/^\/data\/nfl\//, "").replaceAll("/", "\\");
  const path = join(NFL_DATA, relative);
  if (!existsSync(path)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(path, "utf8"), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("public 2026 projection board", () => {
  it("loads all 32 teams", () => {
    const board = loadBoard();
    expect(board.teams).toHaveLength(32);
    expect(board.season).toBe(2026);
    expect(board.sourceSeason).toBe(2025);
    expect(board.modelVersion).toBe("nfl-power-v0.4-beta");
  });

  it("ranks teams 1..32 in order", () => {
    const board = loadBoard();
    expect(board.teams.map((team) => team.rank)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it("does not expose guideRating, guideCalibrationAdjustment, luckAverageRank, luckAdjustment, or internal components", () => {
    const board = loadBoard();
    for (const team of board.teams) {
      expect(team).not.toHaveProperty("components");
      expect(team).not.toHaveProperty("guideRating");
      expect(team).not.toHaveProperty("guideCalibrationAdjustment");
      expect(team).not.toHaveProperty("luckAverageRank");
      expect(team).not.toHaveProperty("luckAdjustment");
      expect(team).not.toHaveProperty("personnelAdjustment");
      expect(team).not.toHaveProperty("coachAdjustment");
      expect(team).not.toHaveProperty("returningInjuryAdjustment");
      expect(team).not.toHaveProperty("jkbV03Rating");
    }
  });

  it("exposes only the approved public fields per team", () => {
    const board = loadBoard();
    const allowedKeys = new Set([
      "team",
      "abbr",
      "division",
      "rank",
      "rating2025Adjusted",
      "projectionAdjustment2026",
      "rating2026",
      "sosRank",
      "sosAvgOpponentRating",
      "confidence",
      "notes",
    ]);
    for (const team of board.teams) {
      for (const key of Object.keys(team)) {
        expect(allowedKeys.has(key), `unexpected public field "${key}"`).toBe(true);
      }
    }
  });

  it("never exposes offense or defense ratings for 2026", () => {
    const board = loadBoard();
    for (const team of board.teams) {
      expect(team).not.toHaveProperty("offenseRating");
      expect(team).not.toHaveProperty("defenseRating");
      expect(team).not.toHaveProperty("offRank");
      expect(team).not.toHaveProperty("defRank");
    }
  });

  it("produces serialized JSON with no betting/odds/picks/spread/vendor terminology", () => {
    const board = loadBoard();
    const serialized = JSON.stringify(board).toLowerCase();
    for (const term of FORBIDDEN_SERIALIZED_TERMS) {
      expect(serialized.includes(term), `found forbidden term "${term}" in public board`).toBe(false);
    }
  });

  it("sanitizes a note containing guide/vendor language by omitting it", () => {
    expect(sanitizePublicNote("Confirmed by the guide calibration source.")).toBeNull();
    expect(sanitizePublicNote("Vegas odds moved after the signing.")).toBeNull();
    expect(sanitizePublicNote("Mike Evans addition creates a modest offensive upgrade.")).toBe(
      "Mike Evans addition creates a modest offensive upgrade."
    );
  });

  it("loads via the fetch-based loader against the committed artifact", async () => {
    const board = await loadNflV04Projection(committedFetch);
    expect(board.teams).toHaveLength(32);
    expect(NFL_V04_PROJECTION_PATH).toBe("/data/nfl/2026/projected-power-ratings-v04.json");
  });

  it("surfaces a clear error when the artifact is missing", async () => {
    await expect(
      loadNflV04Projection(async () => new Response("not found", { status: 404 }))
    ).rejects.toThrow(/is missing/);
  });
});
