import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsCompactLayout } from "./useIsCompactLayout";

type Listener = (event: MediaQueryListEvent) => void;

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(max-width: 1023px)",
    addEventListener: vi.fn((_event: string, listener: Listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: Listener) => listeners.delete(listener)),
    addListener: vi.fn((listener: Listener) => listeners.add(listener)),
    removeListener: vi.fn((listener: Listener) => listeners.delete(listener)),
  };
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal("matchMedia", matchMedia);

  return {
    matchMedia,
    mql,
    fireChange: (next: boolean) => {
      matches = next;
      act(() => {
        listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsCompactLayout", () => {
  it("resolves the initial value synchronously from matchMedia -- no desktop-then-mobile flash", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsCompactLayout());
    // No act()/effect flush yet: the lazy useState initializer must already reflect the real viewport.
    expect(result.current).toBe(true);
  });

  it("starts false when matchMedia reports desktop width", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsCompactLayout());
    expect(result.current).toBe(false);
  });

  it("updates when the media query listener fires a change", () => {
    const { fireChange } = stubMatchMedia(false);
    const { result } = renderHook(() => useIsCompactLayout());
    expect(result.current).toBe(false);

    fireChange(true);
    expect(result.current).toBe(true);

    fireChange(false);
    expect(result.current).toBe(false);
  });

  it("registers the change listener via addEventListener and cleans it up on unmount", () => {
    const { mql } = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsCompactLayout());

    expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(mql.removeEventListener).not.toHaveBeenCalled();

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("falls back to false and does not throw when matchMedia is unavailable (jsdom without a mock)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsCompactLayout());
    expect(result.current).toBe(false);
  });

  it("respects a custom query string", () => {
    const { matchMedia } = stubMatchMedia(true);
    renderHook(() => useIsCompactLayout("(max-width: 480px)"));
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 480px)");
  });
});
