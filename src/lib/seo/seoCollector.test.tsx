import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { usePageSeo } from "@/hooks/usePageSeo";
import { createSeoCollector, SeoCollectorContext, type SeoCollector } from "./seoCollector";

function Page({ title = "Bills", structured = true }: { title?: string; structured?: boolean }) {
  usePageSeo({
    title,
    description: "Team page",
    path: "/nfl/teams/buffalo-bills",
    structuredData: structured ? [{ "@type": "SportsTeam" }, { "@type": "BreadcrumbList" }] : undefined,
  });
  return <h1>{title}</h1>;
}

const withCollector = (collector: SeoCollector, node: JSX.Element) => (
  <SeoCollectorContext.Provider value={collector}>{node}</SeoCollectorContext.Provider>
);

afterEach(() => {
  document.head.innerHTML = "";
  document.title = "";
});

describe("SEO collector (build-time prerender)", () => {
  it("captures usePageSeo arguments synchronously during renderToString, where effects never run", () => {
    const collector = createSeoCollector();
    const html = renderToString(withCollector(collector, <Page />));

    expect(html).toContain("<h1>Bills</h1>");
    const { pages } = collector.result();
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Bills | Joe Knows Ball");
    expect(pages[0].canonicalUrl).toBe("https://www.joeknowsball.com/nfl/teams/buffalo-bills");
    expect(pages[0].structuredData.map((item) => item["@type"])).toEqual(["SportsTeam", "BreadcrumbList"]);
    // Effects did not run: the document head was not touched.
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("records each declaration so a route with more than one is detectable", () => {
    const collector = createSeoCollector();
    renderToString(withCollector(collector, <><Page title="A" /><Page title="B" /></>));
    expect(collector.result().pages.map((page) => page.title)).toEqual(["A | Joe Knows Ball", "B | Joe Knows Ball"]);
  });

  it("captures SeoJsonLd blocks by id, keeping the last value for a repeated id", () => {
    const collector = createSeoCollector();
    renderToString(
      withCollector(
        collector,
        <>
          <SeoJsonLd id="faq" data={{ "@type": "FAQPage", v: 1 }} />
          <SeoJsonLd id="list" data={[{ "@type": "ItemList" }]} />
          <SeoJsonLd id="faq" data={{ "@type": "FAQPage", v: 2 }} />
        </>,
      ),
    );
    expect(collector.result().jsonLd).toEqual([
      { id: "list", data: [{ "@type": "ItemList" }] },
      { id: "faq", data: { "@type": "FAQPage", v: 2 } },
    ]);
  });

  it("returns snapshots that later records cannot mutate", () => {
    const collector = createSeoCollector();
    const before = collector.result();
    collector.recordPage({ title: "Late", description: "d" });
    expect(before.pages).toHaveLength(0);
    expect(collector.result().pages).toHaveLength(1);
  });

  it("leaves browser behavior unchanged: without a provider nothing is collected and the effect writes one set", () => {
    const { unmount } = render(<Page />);

    expect(document.title).toBe("Bills | Joe Knows Ball");
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script[data-jkb-structured-data="true"]')).toHaveLength(2);
    unmount();
    expect(document.head.querySelectorAll('script[data-jkb-structured-data="true"]')).toHaveLength(0);
  });

  it("replaces prerendered JSON-LD and head tags on the first client effect instead of duplicating them", () => {
    // Simulates a prerendered document: head already carries the page's tags.
    document.head.innerHTML = [
      "<title>Bills | Joe Knows Ball</title>",
      '<meta name="description" content="Team page" />',
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      '<meta property="og:url" content="https://www.joeknowsball.com/nfl/teams/buffalo-bills" />',
      '<link rel="canonical" href="https://www.joeknowsball.com/nfl/teams/buffalo-bills" />',
      '<script type="application/ld+json" data-jkb-structured-data="true">{"@type":"SportsTeam"}</script>',
      '<script type="application/ld+json" data-jkb-structured-data="true">{"@type":"BreadcrumbList"}</script>',
    ].join("");

    render(<Page />);

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(2);
  });

  it("replaces a prerendered SeoJsonLd block with the same id instead of duplicating it", () => {
    document.head.innerHTML = '<script type="application/ld+json" data-seo-jsonld="faq">{"v":1}</script>';
    render(<SeoJsonLd id="faq" data={{ v: 2 }} />);
    const blocks = document.head.querySelectorAll('script[data-seo-jsonld="faq"]');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toBe('{"v":2}');
  });
});
