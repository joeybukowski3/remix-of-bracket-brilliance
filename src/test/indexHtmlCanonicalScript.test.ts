import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * index.html's inline bootstrap script rewrites the shell's homepage canonical
 * to the current path for SPA-fallback documents. Prerendered documents carry
 * their own canonical and are marked data-jkb-prerendered, so the script must
 * leave them alone -- and keep doing its job everywhere else.
 */
const INDEX_HTML = readFileSync(resolve(__dirname, "..", "..", "index.html"), "utf8");
const BOOTSTRAP = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((script) => script.includes('link[rel="canonical"]'));

function runBootstrap() {
  if (!BOOTSTRAP) throw new Error("canonical bootstrap script not found in index.html");
  new Function(BOOTSTRAP)();
}

function setHead(canonical: string) {
  document.head.innerHTML = `<link rel="canonical" href="${canonical}" /><meta property="og:url" content="${canonical}" />`;
}

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");
const ogUrl = () => document.head.querySelector('meta[property="og:url"]')?.getAttribute("content");

afterEach(() => {
  document.documentElement.removeAttribute("data-jkb-prerendered");
  document.head.innerHTML = "";
  window.history.pushState({}, "", "/");
});

describe("index.html canonical bootstrap script", () => {
  it("still rewrites the homepage canonical to the current path on SPA-fallback documents", () => {
    setHead("https://www.joeknowsball.com/");
    window.history.pushState({}, "", "/nfl/standings");
    runBootstrap();
    expect(canonical()).toBe("https://www.joeknowsball.com/nfl/standings");
    expect(ogUrl()).toBe("https://www.joeknowsball.com/nfl/standings");
  });

  it("leaves a prerendered document's own canonical and og:url untouched", () => {
    const own = "https://www.joeknowsball.com/nfl/teams/buffalo-bills";
    setHead(own);
    document.documentElement.setAttribute("data-jkb-prerendered", "true");
    // A trailing-slash request would otherwise be copied into the canonical.
    window.history.pushState({}, "", "/nfl/teams/buffalo-bills/");
    runBootstrap();
    expect(canonical()).toBe(own);
    expect(ogUrl()).toBe(own);
  });
});
