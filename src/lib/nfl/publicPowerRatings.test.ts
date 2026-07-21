import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPublicPowerBoard,
  loadPublicPowerBoard,
  NFL_V03_PUBLIC_ALLOWED_ARTIFACT_FILES,
  NFL_V03_PUBLIC_FULL_SEASON_FILENAME,
  NFL_V03_PUBLIC_MODEL_VERSION,
  NFL_V03_PUBLIC_PRESEASON_FILENAME,
  NFL_V03_PUBLIC_PRESEASON_SEASON,
  parseCanonicalTeamsJson,
  rankByDescending,
} from "@/lib/nfl/publicPowerRatings";
import { validateNflV03ReviewArtifact } from "@/lib/nfl/v03Review";

const ROOT = resolve(__dirname, "../../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");
const REVIEW_ONLY_FILES = ["context-flags.json", "manual-adjustments.json", "final-eight-team-metrics.json"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

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

describe("public power board projection", () => {
  it("projects committed 2026 preseason ratings with source-season records and colors", async () => {
    const board = await loadPublicPowerBoard(NFL_V03_PUBLIC_PRESEASON_SEASON, committedFetch);
    expect(board.modelVersion).toBe(NFL_V03_PUBLIC_MODEL_VERSION);
    expect(board.season).toBe(2026);
    expect(board.sourceSeason).toBe(2025);
    expect(board.teams).toHaveLength(32);
    expect(board.teams.map((team) => team.rank)).toEqual(
      [...Array(32)].map((_, index) => index + 1)
    );

    const top = board.teams[0];
    expect(top.rank).toBe(1);
    expect(top.abbr).toBe("lar");
    expect(top.publicRating).toBeCloseTo(75.815696, 5);
    expect(top.overallVsCenter).toBeCloseTo(25.815696, 5);
    expect(top.color).toMatch(/^#/);
    expect(top.sourceRecord).toBe("12-5");
    expect(top.offRank).toBeGreaterThanOrEqual(1);
    expect(top.offRank).toBeLessThanOrEqual(32);

    const serialized = JSON.stringify(board);
    expect(serialized).not.toMatch(/internalZ|trajectoryRaw|manualAdjustments|contextFlags|uncertainty/);
    expect(serialized).not.toMatch(/\b(betting|odds?|moneyline|spread|markets?|picks?)\b/i);
  });

  it("ranks offense and defense deterministically without mutating input ratings", () => {
    const preseasonPath = join(NFL_DATA, "2026", NFL_V03_PUBLIC_PRESEASON_FILENAME);
    const json = JSON.parse(readFileSync(preseasonPath, "utf8"));
    const snapshot = JSON.stringify(json);
    const preseason = validateNflV03ReviewArtifact("preseason", 2026, json, preseasonPath);
    const board = buildPublicPowerBoard({ season: 2026, preseason, colors: [] });
    expect(JSON.stringify(json)).toBe(snapshot);

    const offOrder = rankByDescending(
      preseason.ratings.map((row) => ({
        key: row.teamId,
        value: row.offenseRating,
        name: row.name,
        teamId: row.teamId,
      }))
    );
    for (const team of board.teams) {
      expect(team.offRank).toBe(offOrder.get(team.teamId));
    }
  });

  it("parses canonical team colors from teams.json", () => {
    const teams = parseCanonicalTeamsJson(
      JSON.parse(readFileSync(join(NFL_DATA, "teams.json"), "utf8"))
    );
    expect(teams).toHaveLength(32);
    expect(teams.find((team) => team.abbr === "buf")?.primaryColor).toBe("#00338d");
  });

  it("fails when the preseason artifact is missing", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input).includes(NFL_V03_PUBLIC_PRESEASON_FILENAME)) {
        return new Response("missing", { status: 404 });
      }
      return committedFetch(input);
    };
    await expect(loadPublicPowerBoard(2026, fetcher)).rejects.toThrow(/missing/);
  });
});

describe("public power integration isolation", () => {
  it("allows only the dedicated public and internal loaders to reference Stage-1 files", () => {
    const allowedBasenames = new Set(["useNflV03Artifacts.ts", "publicPowerRatings.ts"]);
    const references = sourceFiles(join(ROOT, "src"))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) =>
        NFL_V03_PUBLIC_ALLOWED_ARTIFACT_FILES.some((filename) =>
          readFileSync(path, "utf8").includes(filename)
        )
      )
      .map((path) => basename(path))
      .sort();
    expect(references).toEqual([...allowedBasenames].sort());
  });

  it("never references review-only Stage-1 files from the public loader path", () => {
    const publicSources = [
      join(ROOT, "src", "lib", "nfl", "publicPowerRatings.ts"),
      join(ROOT, "src", "hooks", "useNflV03PublicPowerRatings.ts"),
      join(ROOT, "src", "pages", "NFL.tsx"),
    ];
    for (const path of publicSources) {
      const source = readFileSync(path, "utf8");
      for (const filename of REVIEW_ONLY_FILES) {
        expect(source, `${basename(path)} must not reference ${filename}`).not.toContain(
          filename
        );
      }
    }
  });

  it("wires the public NFL page to the v0.3 public loader instead of static preseason ratings", () => {
    const page = readFileSync(join(ROOT, "src", "pages", "NFL.tsx"), "utf8");
    expect(page).toContain("useNflV03PublicPowerRatings");
    expect(page).toContain("model v0.3");
    expect(page).not.toContain("NFL_POWER_RATINGS");
    expect(page).not.toContain("context-flags");
    expect(page).not.toContain("manual-adjustments");
    expect(page).not.toContain("winTotal");
  });

  it("keeps the full-season filename reference limited to public record enrichment and internal review", () => {
    const references = sourceFiles(join(ROOT, "src"))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => readFileSync(path, "utf8").includes(NFL_V03_PUBLIC_FULL_SEASON_FILENAME))
      .map((path) => basename(path))
      .sort();
    expect(references).toEqual(
      ["publicPowerRatings.ts", "useNflV03Artifacts.ts"].sort()
    );
  });
});
