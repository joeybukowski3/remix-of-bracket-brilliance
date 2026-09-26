import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { DEFAULT_DESCRIPTION, DEFAULT_ROBOTS, DEFAULT_TITLE, usePageSeo } from "./usePageSeo";

/**
 * Metadata lifecycle: a route owns the document head only while it is
 * mounted. Client-side navigation must never leave the previous route's
 * title, description, canonical, robots, social tags or JSON-LD behind.
 */

function head() {
  const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute("content") ?? null;
  return {
    title: document.title,
    description: meta('meta[name="description"]'),
    robots: meta('meta[name="robots"]'),
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogUrl: meta('meta[property="og:url"]'),
    twitterTitle: meta('meta[name="twitter:title"]'),
    twitterDescription: meta('meta[name="twitter:description"]'),
    jsonLd: Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map((n) => n.textContent),
  };
}

let navigateTo: (path: string) => void = () => {};

function NavigationProbe() {
  const navigate = useNavigate();
  navigateTo = (path) => navigate(path);
  return null;
}

function IndexedPage() {
  usePageSeo({
    title: "Indexed Page",
    description: "Indexed page description.",
    path: "/indexed",
    structuredData: { "@context": "https://schema.org", "@type": "WebPage", name: "Indexed Page" },
  });
  return <h1>Indexed</h1>;
}

function NoindexPage() {
  usePageSeo({ title: "Private Tool", description: "Private tool description.", path: "/private", noindex: true });
  return <h1>Private</h1>;
}

function SecondIndexedPage() {
  usePageSeo({ title: "Second Page", description: "Second page description.", path: "/second" });
  return <h1>Second</h1>;
}

function PageWithoutSeo() {
  return <h1>No SEO</h1>;
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationProbe />
      <Routes>
        <Route path="/indexed" element={<IndexedPage />} />
        <Route path="/private" element={<NoindexPage />} />
        <Route path="/second" element={<SecondIndexedPage />} />
        <Route path="/plain" element={<PageWithoutSeo />} />
      </Routes>
    </MemoryRouter>
  );
}

async function go(path: string, heading: string) {
  act(() => navigateTo(path));
  await screen.findByRole("heading", { name: heading });
}

function clearHead() {
  document.head.innerHTML = "";
  document.title = "";
}

beforeEach(clearHead);
afterEach(() => {
  cleanup();
  clearHead();
});

describe("usePageSeo -- route lifecycle", () => {
  it("replaces every field when navigating between two pages with metadata", async () => {
    renderApp("/indexed");
    expect(head().canonical).toBe("https://www.joeknowsball.com/indexed");
    expect(head().jsonLd).toHaveLength(1);

    await go("/second", "Second");

    expect(head()).toEqual({
      title: "Second Page | Joe Knows Ball",
      description: "Second page description.",
      robots: "index, follow, max-image-preview:large",
      canonical: "https://www.joeknowsball.com/second",
      ogTitle: "Second Page | Joe Knows Ball",
      ogDescription: "Second page description.",
      ogUrl: "https://www.joeknowsball.com/second",
      twitterTitle: "Second Page | Joe Knows Ball",
      twitterDescription: "Second page description.",
      jsonLd: [],
    });
  });

  it("a page with no SEO call does not inherit the previous page's metadata", async () => {
    renderApp("/indexed");
    await go("/plain", "No SEO");

    const state = head();
    expect(state.title).toBe(DEFAULT_TITLE);
    expect(state.description).toBe(DEFAULT_DESCRIPTION);
    expect(state.ogTitle).toBe(DEFAULT_TITLE);
    expect(state.ogDescription).toBe(DEFAULT_DESCRIPTION);
    expect(state.twitterTitle).toBe(DEFAULT_TITLE);
    expect(state.twitterDescription).toBe(DEFAULT_DESCRIPTION);
    expect(state.robots).toBe(DEFAULT_ROBOTS);
    // No stale URL signals: an absent canonical is safe, a wrong one is not.
    expect(state.canonical).toBeNull();
    expect(state.ogUrl).toBeNull();
    expect(state.jsonLd).toEqual([]);
  });

  it("noindex does not carry over into the next route", async () => {
    renderApp("/private");
    expect(head().robots).toBe("noindex, follow");

    await go("/second", "Second");
    expect(head().robots).toBe("index, follow, max-image-preview:large");

    await go("/private", "Private");
    await go("/plain", "No SEO");
    expect(head().robots).toBe(DEFAULT_ROBOTS);
  });

  it("canonical never carries over from the previous route", async () => {
    renderApp("/second");
    expect(head().canonical).toBe("https://www.joeknowsball.com/second");

    await go("/private", "Private");
    expect(head().canonical).toBe("https://www.joeknowsball.com/private");
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);

    await go("/plain", "No SEO");
    expect(head().canonical).toBeNull();
  });
});
