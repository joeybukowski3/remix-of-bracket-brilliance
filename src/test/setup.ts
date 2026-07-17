import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom doesn't implement scrollIntoView; stub it globally so components
// that call it (e.g. hash-driven scroll-into-view navigation) don't spam
// "not implemented" console noise, and so tests can assert it was called.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
