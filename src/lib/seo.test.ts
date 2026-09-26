import { describe, expect, it } from "vitest";
import { getSeoMeta, type SeoPage } from "./seo";

describe("SEO registry", () => {
  it("the /nfl entry is indexable and describes only the hub", () => {
    const nfl = getSeoMeta("nfl");
    expect(nfl.noindex).toBeUndefined();
    expect(nfl.path).toBe("/nfl");
    expect(nfl.description).not.toMatch(/coming soon/i);
  });

  it("power ratings has its own accurate, indexable entry", () => {
    const meta = getSeoMeta("nfl-power-ratings");
    expect(meta).toMatchObject({ path: "/nfl/power-ratings", title: "2026 NFL Power Ratings | Joe Knows Ball" });
    expect(meta.noindex).toBeUndefined();
  });

  it.each<SeoPage>(["nfl-dfs", "pga-custom", "pga-dfs", "nba", "ncaa"])(
    "%s stays intentionally noindex",
    (page) => {
      expect(getSeoMeta(page).noindex).toBe(true);
    }
  );
});
