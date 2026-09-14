import { describe, expect, it } from "vitest";
import { classifyCitationSpecificity } from "./nfl-evidence-policy";

describe("classifyCitationSpecificity (WU3.1)", () => {
  it("classifies a specific hyphenated article slug as exact_document", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news/specific-article-slug")).toBe("exact_document");
  });

  it("classifies a real-world article URL with a numeric id and slug as exact_document", () => {
    expect(
      classifyCitationSpecificity("https://www.baltimorebeatdown.com/baltimore-ravens-news/84864/zay-flowers-upgraded-on-ravens-week-1-injury-report")
    ).toBe("exact_document");
  });

  it("classifies a trailing-slash section/index URL as section_or_index", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news/")).toBe("section_or_index");
  });

  it("classifies a bare category word with no trailing slash as section_or_index", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news")).toBe("section_or_index");
  });

  it("classifies a multi-segment index page without an article slug as section_or_index", () => {
    expect(classifyCitationSpecificity("https://www.baltimoreravens.com/team/injury-report/")).toBe("section_or_index");
  });

  it("classifies a bare site root as homepage", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/")).toBe("homepage");
    expect(classifyCitationSpecificity("https://www.colts.com")).toBe("homepage");
  });

  it("classifies null/unparseable URLs as unknown", () => {
    expect(classifyCitationSpecificity(null)).toBe("unknown");
    expect(classifyCitationSpecificity("not a url")).toBe("unknown");
  });
});

describe("classifyCitationSpecificity (WU3.3.2 -- trailing-slash numeric-id regression)", () => {
  it("1. category/index page with trailing slash -> section_or_index", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news/")).toBe("section_or_index");
  });

  it("2. bare site root -> homepage", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/")).toBe("homepage");
  });

  it("3. slugged article page, no trailing slash -> exact_document", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news/specific-article-slug")).toBe("exact_document");
  });

  it("4. numeric article-id segment WITH a trailing slash -> exact_document (the live-run regression case)", () => {
    expect(classifyCitationSpecificity("https://ravenswire.usatoday.com/story/sports/nfl/ravens/2026/09/11/calais-campbell-injury-ravens-colts-week-1-2026/91712815007/")).toBe(
      "exact_document"
    );
  });

  it("5. category segment followed by a numeric article-id segment with a trailing slash -> exact_document", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/news/91712815007/")).toBe("exact_document");
  });

  it("6. an ambiguous non-article trailing-slash path (bare team/category word, no digits or slug hyphenation) remains section_or_index", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/team/colts/")).toBe("section_or_index");
  });

  it("6b. a recognized index-word segment followed by a trailing slash still classifies as section_or_index even though it contains a hyphen", () => {
    expect(classifyCitationSpecificity("https://www.baltimoreravens.com/team/injury-report/")).toBe("section_or_index");
  });

  it("does not broadly assume every trailing-slash URL is an article -- only genuinely slug/numeric-id-shaped segments qualify", () => {
    expect(classifyCitationSpecificity("https://www.colts.com/roster/")).toBe("section_or_index");
    expect(classifyCitationSpecificity("https://www.colts.com/media/")).toBe("section_or_index");
  });

  it("unknown shapes (unparseable URL) are unaffected by the fix", () => {
    expect(classifyCitationSpecificity("not a url")).toBe("unknown");
    expect(classifyCitationSpecificity(null)).toBe("unknown");
  });
});
