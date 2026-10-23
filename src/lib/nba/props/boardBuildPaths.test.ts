/**
 * Filesystem containment for the offline board build and the capture ledger: links, output names and temp files.
 * Directory links use junctions so the cases run without elevated rights on Windows; file links are skipped where the OS refuses them.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBoardBuild } from "./pipeline/boardBuildRun";
import { readLineCaptures } from "./pipeline/lineCapture";

const BUILD_AT = "2026-11-09T22:00:00Z";
const dirs: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "nba-paths-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A directory link that resolves outside the project root. */
function linkDir(target: string, at: string): void {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, "junction");
}
function linkFile(target: string, at: string): void {
  symlinkSync(target, at, "file");
}
/** File links need a privilege on Windows; the two tests that use them are reported as skipped where it is missing. */
const CAN_LINK_FILES = ((): boolean => {
  const dir = mkdtempSync(path.join(tmpdir(), "nba-probe-"));
  try {
    writeFileSync(path.join(dir, "a"), "");
    symlinkSync(path.join(dir, "a"), path.join(dir, "b"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

describe("board build containment", () => {
  it("refuses an output directory that is a link to somewhere outside the project", async () => {
    const root = temp();
    const outside = temp();
    linkDir(outside, path.join(root, "public", "data"));
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT })).rejects.toThrow(/output file must be under/);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("refuses an input directory that is a link to somewhere outside the project", async () => {
    const root = temp();
    const outside = temp();
    writeFileSync(path.join(outside, "roster.json"), JSON.stringify({ players: {} }));
    linkDir(outside, path.join(root, "data", "nba", "board-inputs"));
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT, rosterFile: "data/nba/board-inputs/roster.json" })).rejects.toThrow(/roster file must be under/);
  });

  it("will not overwrite other public data files", async () => {
    const root = temp();
    const other = path.join(root, "public", "data", "nfl-schedule.json");
    mkdirSync(path.dirname(other), { recursive: true });
    writeFileSync(other, "keep");
    await expect(runBoardBuild({ root, generatedAtUtc: BUILD_AT, outFile: "public/data/nfl-schedule.json" })).rejects.toThrow(/output file must be named/);
    expect(readFileSync(other, "utf8")).toBe("keep");
  });

  it.skipIf(!CAN_LINK_FILES)("never writes through a link planted at the temporary file name", async () => {
    const root = temp();
    const victim = path.join(temp(), "victim.txt");
    writeFileSync(victim, "keep");
    const dataDir = path.join(root, "public", "data");
    mkdirSync(dataDir, { recursive: true });
    linkFile(victim, path.join(dataDir, "nba-props-board.json.tmp"));
    const result = await runBoardBuild({ root, generatedAtUtc: BUILD_AT });
    expect(readFileSync(victim, "utf8")).toBe("keep");
    expect(JSON.parse(readFileSync(result.outFile, "utf8"))).toMatchObject({ schemaVersion: "nba-props-board-v1" });
  });

  it("leaves no temporary file behind after a successful build", async () => {
    const root = temp();
    await runBoardBuild({ root, generatedAtUtc: BUILD_AT });
    expect(readdirSync(path.join(root, "public", "data"))).toEqual(["nba-props-board.json"]);
  });

  it.skipIf(!CAN_LINK_FILES)("does not follow a link inside the capture ledger", () => {
    const dir = temp();
    const outside = path.join(temp(), "secret.json");
    writeFileSync(outside, JSON.stringify({ not: "a capture" }));
    linkFile(outside, path.join(dir, "2026-11-09T21-30-00-000Z_evt_deadbeef.json"));
    expect(() => readLineCaptures(dir)).toThrow(/not a regular file/);
    expect(existsSync(outside)).toBe(true);
  });
});
