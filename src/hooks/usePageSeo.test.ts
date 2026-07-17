import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePageSeo } from "./usePageSeo";

const DEFAULT_OG_IMAGE = "https://www.joeknowsball.com/og/joeknowsball-social-preview-v2.png";

function metaContent(selector: string) {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

afterEach(() => {
  document.head.querySelectorAll("meta[property], meta[name]").forEach((node) => node.remove());
});

describe("usePageSeo -- default social preview image", () => {
  it("resolves og:image and twitter:image to the new banner when no route override is given", () => {
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description" }));
    expect(metaContent('meta[property="og:image"]')).toBe(DEFAULT_OG_IMAGE);
    expect(metaContent('meta[name="twitter:image"]')).toBe(DEFAULT_OG_IMAGE);
  });

  it("sets og:image:secure_url and og:image:type alongside the image URL", () => {
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description" }));
    expect(metaContent('meta[property="og:image:secure_url"]')).toBe(DEFAULT_OG_IMAGE);
    expect(metaContent('meta[property="og:image:type"]')).toBe("image/png");
  });

  it("sets the 1200x630 dimensions matching the actual asset", () => {
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description" }));
    expect(metaContent('meta[property="og:image:width"]')).toBe("1200");
    expect(metaContent('meta[property="og:image:height"]')).toBe("630");
  });

  it("sets non-empty alt text for both og:image and twitter:image", () => {
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description" }));
    const ogAlt = metaContent('meta[property="og:image:alt"]');
    const twitterAlt = metaContent('meta[name="twitter:image:alt"]');
    expect(ogAlt).toBeTruthy();
    expect(twitterAlt).toBeTruthy();
    expect(ogAlt).toBe(twitterAlt);
  });

  it("always uses summary_large_image, never the smaller summary card", () => {
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description" }));
    expect(metaContent('meta[name="twitter:card"]')).toBe("summary_large_image");
  });

  it("lets an explicit route-level ogImage override the shared default", () => {
    const customImage = "https://www.joeknowsball.com/og/some-route-specific-image.png";
    renderHook(() => usePageSeo({ title: "Test Page", description: "Test description", ogImage: customImage }));
    expect(metaContent('meta[property="og:image"]')).toBe(customImage);
    expect(metaContent('meta[name="twitter:image"]')).toBe(customImage);
  });
});
