import { describe, expect, it } from "vitest";
import { buildCanonicalUrl, buildRobots, resolvePageSeo, CANONICAL_BASE, DEFAULT_OG_IMAGE } from "./pageSeoHead";

const metaValue = (head: ReturnType<typeof resolvePageSeo>, key: string) =>
  head.metas.filter((tag) => tag.key === key).map((tag) => tag.content);

describe("resolvePageSeo", () => {
  it("appends the site name once and mirrors it into og/twitter titles", () => {
    const head = resolvePageSeo({ title: "NFL Hub", description: "d", path: "/nfl" });
    expect(head.title).toBe("NFL Hub | Joe Knows Ball");
    expect(metaValue(head, "og:title")).toEqual(["NFL Hub | Joe Knows Ball"]);
    expect(metaValue(head, "twitter:title")).toEqual(["NFL Hub | Joe Knows Ball"]);
    expect(resolvePageSeo({ title: "X | Joe Knows Ball", description: "d" }).title).toBe("X | Joe Knows Ball");
  });

  it("emits every tag key exactly once, canonical and og:url agreeing", () => {
    const head = resolvePageSeo({ title: "T", description: "D", path: "/nfl/teams/buffalo-bills" });
    const keys = head.metas.map((tag) => tag.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(head.canonicalUrl).toBe(`${CANONICAL_BASE}/nfl/teams/buffalo-bills`);
    expect(metaValue(head, "og:url")).toEqual([head.canonicalUrl]);
    expect(metaValue(head, "description")).toEqual(["D"]);
    expect(metaValue(head, "og:image")).toEqual([DEFAULT_OG_IMAGE]);
  });

  it("keeps the historical tag order usePageSeo writes", () => {
    const keys = resolvePageSeo({ title: "T", description: "D" }).metas.map((tag) => tag.key);
    expect(keys[0]).toBe("description");
    expect(keys.indexOf("og:url")).toBeLessThan(keys.indexOf("og:image"));
    expect(keys[keys.length - 1]).toBe("robots");
  });

  it("prefers an explicit canonical over path and normalizes query, hash and trailing slash", () => {
    expect(resolvePageSeo({ title: "T", description: "D", path: "/a", canonical: "/b/" }).canonicalUrl).toBe(`${CANONICAL_BASE}/b`);
    expect(buildCanonicalUrl("/x/?q=1#h")).toBe(`${CANONICAL_BASE}/x`);
    expect(buildCanonicalUrl("https://example.com/y")).toBe(`${CANONICAL_BASE}/y`);
  });

  it("builds robots for every index/follow combination", () => {
    expect(buildRobots(false, false)).toBe("index, follow, max-image-preview:large");
    expect(buildRobots(true, false)).toBe("noindex, follow");
    expect(buildRobots(false, true)).toBe("index, nofollow, max-image-preview:large");
  });

  it("normalizes structured data to an array", () => {
    expect(resolvePageSeo({ title: "T", description: "D" }).structuredData).toEqual([]);
    expect(resolvePageSeo({ title: "T", description: "D", structuredData: { "@type": "A" } }).structuredData).toEqual([{ "@type": "A" }]);
    expect(
      resolvePageSeo({ title: "T", description: "D", structuredData: [{ "@type": "A" }, { "@type": "B" }] }).structuredData,
    ).toHaveLength(2);
  });
});
