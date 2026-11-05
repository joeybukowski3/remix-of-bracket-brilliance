import { describe, expect, it, vi } from "vitest";
import { RELOAD_GUARD_KEY, RELOAD_GUARD_MS, isChunkLoadError, reloadForNewDeploy } from "./chunkRecovery";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("isChunkLoadError", () => {
  it.each([
    ["Chrome", new TypeError("Failed to fetch dynamically imported module: https://x.test/assets/Page-abc123.js")],
    ["Firefox", new TypeError("error loading dynamically imported module: https://x.test/assets/Page-abc123.js")],
    ["Safari", new TypeError("Importing a module script failed.")],
    ["a CSS preload", new Error("Unable to preload CSS for /assets/Page-abc123.css")],
    ["webpack-style", Object.assign(new Error("Loading chunk 7 failed."), { name: "ChunkLoadError" })],
    ["a bare string", "Failed to fetch dynamically imported module"],
  ])("recognises %s", (_name, error) => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it.each([
    ["an ordinary render error", new TypeError("Cannot read properties of undefined (reading 'map')")],
    ["a network error in a data fetch", new TypeError("Failed to fetch")],
    ["null", null],
    ["an object with no message", {}],
  ])("does not mistake %s for one", (_name, error) => {
    expect(isChunkLoadError(error)).toBe(false);
  });
});

describe("reloadForNewDeploy", () => {
  it("reloads and records the time on the first failure", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadForNewDeploy({ now: 1_000_000, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(RELOAD_GUARD_KEY)).toBe("1000000");
  });

  it("does not reload again within the guard window, so a chunk that stays missing cannot loop", () => {
    const reload = vi.fn();
    const storage = memoryStorage({ [RELOAD_GUARD_KEY]: "1000000" });
    expect(reloadForNewDeploy({ now: 1_000_000 + RELOAD_GUARD_MS - 1, storage, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again once the window has passed (a later deploy)", () => {
    const reload = vi.fn();
    const storage = memoryStorage({ [RELOAD_GUARD_KEY]: "1000000" });
    expect(reloadForNewDeploy({ now: 1_000_000 + RELOAD_GUARD_MS, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads on its own when it cannot remember that it did (storage missing or blocked)", () => {
    const reload = vi.fn();
    expect(reloadForNewDeploy({ now: 1, storage: null, reload })).toBe(false);
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
    expect(reloadForNewDeploy({ now: 1, storage: blocked, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a corrupt stored value", () => {
    const reload = vi.fn();
    expect(reloadForNewDeploy({ now: 5_000_000, storage: memoryStorage({ [RELOAD_GUARD_KEY]: "not a number" }), reload })).toBe(true);
  });
});
