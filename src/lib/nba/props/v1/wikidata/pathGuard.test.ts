import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveInside, writeFileGuarded } from "./pathGuard";

describe("resolveInside", () => {
  let root = "";
  let outside = "";
  let linkError: unknown = null;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "jkb-pathguard-root-"));
    outside = mkdtempSync(path.join(os.tmpdir(), "jkb-pathguard-outside-"));
    mkdirSync(path.join(root, "data", "nba", "wikidata-positions"), { recursive: true });
    writeFileSync(path.join(outside, "secret.json"), "{}");
    try {
      // A junction needs no privilege on Windows; on POSIX it is an ordinary directory symlink.
      symlinkSync(outside, path.join(root, "data", "nba", "escape"), "junction");
    } catch (error) {
      linkError = error;
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const allowed = ["data/nba"];

  it("accepts existing and not-yet-existing paths under an allowed directory", () => {
    expect(resolveInside(root, "data/nba/wikidata-positions", allowed)).toBe(path.join(root, "data", "nba", "wikidata-positions"));
    expect(resolveInside(root, "data/nba/wikidata-positions/new/deeper/snapshot.json", allowed)).toBe(path.join(root, "data", "nba", "wikidata-positions", "new", "deeper", "snapshot.json"));
  });

  it("accepts any of several allowed directories", () => {
    expect(resolveInside(root, "fixtures/recorded", ["data/nba", "fixtures"])).toBe(path.join(root, "fixtures", "recorded"));
  });

  it("rejects paths outside the allowed directories, however they are spelled", () => {
    for (const requested of ["src/lib/x.json", "data/other/x.json", "data/nba/../../src/x.json", "../outside.json", "data", "data/nbaX/x.json", path.join(outside, "secret.json")]) {
      expect(() => resolveInside(root, requested, allowed), requested).toThrow(/must be under/);
    }
  });

  it("rejects a dangling link, whose target could be created later to redirect a write", (context) => {
    const missing = path.join(os.tmpdir(), `jkb-pathguard-missing-${process.pid}-${Date.now()}`);
    try {
      symlinkSync(missing, path.join(root, "data", "nba", "dangling"), "junction");
    } catch {
      context.skip();
    }
    expect(() => resolveInside(root, "data/nba/dangling/x.json", allowed)).toThrow(/dangling link/);
    expect(() => resolveInside(root, "data/nba/dangling", allowed)).toThrow(/dangling link|resolves outside/);
  });

  it("writeFileGuarded writes the file atomically and leaves no temporary file behind", () => {
    const written = writeFileGuarded(root, "data/nba/wikidata-positions/new/out.json", allowed, '{"ok":true}\n');
    expect(readFileSync(written, "utf8")).toBe('{"ok":true}\n');
    expect(readdirSync(path.dirname(written))).toEqual(["out.json"]);
    writeFileGuarded(root, "data/nba/wikidata-positions/new/out.json", allowed, '{"ok":2}\n');
    expect(readFileSync(written, "utf8")).toBe('{"ok":2}\n');
    expect(readdirSync(path.dirname(written))).toEqual(["out.json"]);
  });

  it("writeFileGuarded refuses a path outside the allowed directories and writes nothing", () => {
    expect(() => writeFileGuarded(root, "src/x.json", allowed, "{}")).toThrow(/must be under/);
    expect(existsSync(path.join(root, "src"))).toBe(false);
  });

  it("writeFileGuarded refuses to write through a link out of the project and leaves the outside untouched", (context) => {
    if (linkError !== null) context.skip();
    expect(() => writeFileGuarded(root, "data/nba/escape/planted.json", allowed, "{}")).toThrow(/resolves outside/);
    expect(existsSync(path.join(outside, "planted.json"))).toBe(false);
  });

  it("rejects a read or write that goes through a directory link out of the project", (context) => {
    if (linkError !== null) context.skip();
    expect(() => resolveInside(root, "data/nba/escape/secret.json", allowed)).toThrow(/resolves outside/);
    expect(() => resolveInside(root, "data/nba/escape/new-output.json", allowed)).toThrow(/resolves outside/);
  });
});
