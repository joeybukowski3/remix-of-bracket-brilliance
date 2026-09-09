import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureFilePath, gameDir, readJsonIfExists, shouldWriteCapture, weekDir, writeJson } from "./storage.mjs";

describe("shouldWriteCapture", () => {
  it("allows writing when no capture exists yet", () => {
    expect(shouldWriteCapture(null, { parseStatus: "ok" })).toBe(true);
    expect(shouldWriteCapture(null, { parseStatus: "partial" })).toBe(true);
  });

  it("never lets a partial/failed capture overwrite a good one", () => {
    expect(shouldWriteCapture({ parseStatus: "ok" }, { parseStatus: "partial" })).toBe(false);
    expect(shouldWriteCapture({ parseStatus: "ok" }, { parseStatus: "failed" })).toBe(false);
  });

  it("allows an ok capture to overwrite a prior partial/failed one, or itself", () => {
    expect(shouldWriteCapture({ parseStatus: "partial" }, { parseStatus: "ok" })).toBe(true);
    expect(shouldWriteCapture({ parseStatus: "ok" }, { parseStatus: "ok" })).toBe(true);
    expect(shouldWriteCapture({ parseStatus: "partial" }, { parseStatus: "partial" })).toBe(true);
  });
});

describe("path helpers", () => {
  it("builds the expected week and game directory layout", () => {
    const root = "C:/repo";
    expect(weekDir(root, 2026, 1)).toBe(join(root, "data", "walter", "2026", "week-01"));
    expect(gameDir(root, 2026, 1, "2026_01_NE_SEA")).toBe(join(root, "data", "walter", "2026", "week-01", "games", "NE-SEA"));
    expect(captureFilePath(root, 2026, 1, "2026_01_NE_SEA", "wednesday")).toBe(
      join(root, "data", "walter", "2026", "week-01", "games", "NE-SEA", "wednesday.json"),
    );
  });
});

describe("readJsonIfExists / writeJson round-trip", () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "walter-storage-test-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns null for a missing file and round-trips a written one", () => {
    const filePath = captureFilePath(tempRoot, 2026, 1, "2026_01_NE_SEA", "wednesday");
    expect(readJsonIfExists(filePath)).toBeNull();

    writeJson(filePath, { parseStatus: "ok", value: 42 });
    expect(readJsonIfExists(filePath)).toEqual({ parseStatus: "ok", value: 42 });
  });
});
