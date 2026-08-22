import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "./cfbdClient";
import { writeRawDataset } from "./manifestWriter";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cfb-research-manifest-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeRawDataset", () => {
  it("hashes identical content deterministically", () => {
    const data = [{ id: 1 }, { id: 2 }];
    const entryA = writeRawDataset({
      filePath: join(dir, "games.json"),
      data,
      endpoint: "/games",
      params: { year: 2019 },
      season: 2019,
      week: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const entryB = writeRawDataset({
      filePath: join(dir, "games-copy.json"),
      data,
      endpoint: "/games",
      params: { year: 2019 },
      season: 2019,
      week: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(entryA.sha256).toBe(entryB.sha256);
    expect(entryA.sha256).toBe(sha256(`${JSON.stringify(data, null, 2)}\n`));
  });

  it("changes the hash when the data changes", () => {
    const entryA = writeRawDataset({
      filePath: join(dir, "a.json"),
      data: [{ id: 1 }],
      endpoint: "/games",
      params: {},
      season: 2019,
      week: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const entryB = writeRawDataset({
      filePath: join(dir, "b.json"),
      data: [{ id: 2 }],
      endpoint: "/games",
      params: {},
      season: 2019,
      week: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(entryA.sha256).not.toBe(entryB.sha256);
  });

  it("writes a sibling manifest file with provenance fields", () => {
    writeRawDataset({
      filePath: join(dir, "plays", "week01.json"),
      data: [{ id: "p1" }],
      endpoint: "/plays",
      params: { year: 2019, week: 1, seasonType: "regular" },
      season: 2019,
      week: 1,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const manifest = JSON.parse(readFileSync(join(dir, "plays", "week01.manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      provider: "CollegeFootballData.com API v2",
      endpoint: "/plays",
      season: 2019,
      week: 1,
      recordCount: 1,
    });
    expect(typeof manifest.sha256).toBe("string");
    expect(manifest.sha256).toHaveLength(64);
  });

  it("never writes the CFBD_API_KEY value anywhere in the manifest or data file", () => {
    writeRawDataset({
      filePath: join(dir, "teams.json"),
      data: [{ id: 1 }],
      endpoint: "/teams",
      params: { year: 2019 },
      season: 2019,
      week: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    const dataText = readFileSync(join(dir, "teams.json"), "utf8");
    const manifestText = readFileSync(join(dir, "teams.manifest.json"), "utf8");
    expect(dataText).not.toMatch(/Bearer /);
    expect(manifestText).not.toMatch(/Bearer /);
  });
});
