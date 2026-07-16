import { describe, expect, it } from "vitest";
import {
  getMlbTool,
  getMlbToolByRoute,
  getRelatedMlbTools,
  getVisibleMlbTools,
  MLB_TOOLS,
  type MlbToolId,
} from "./tools";
import { MLB_NAV_ITEMS } from "./sectionNav";

const ALL_TOOL_IDS: MlbToolId[] = [
  "game-matchups",
  "hr-props",
  "strikeout-props",
  "batter-vs-pitcher",
  "props-hub",
  "power-rankings",
  "sin-city",
  "numerology",
];

/**
 * Explicit expected public-route list for `/mlb`'s child routes, hand-verified
 * against `App.tsx`'s `<Route path="/mlb" element={<MlbLayout />}>` subtree
 * rather than parsed from source text (source-text parsing of JSX route
 * trees is brittle -- this list must be updated by hand alongside App.tsx).
 *
 * Deliberately excludes routes that exist in App.tsx but are not ordinary
 * public MLB tools:
 *   - "/mlb/numerology/x-export", "/mlb/hr-props/x-export",
 *     "/mlb/strikeout-props/x-export" -- social-export routes, rendered
 *     outside MlbLayout, scraped by the poster; not public-facing tools.
 *   - "/mlb-demo" -- an internal percentile demo page, not nested under
 *     MlbLayout and not part of the public MLB tool set.
 *   - "/mlb#schedule", "/mlb#moneylines", "/mlb#pitcher-regression",
 *     "/mlb/hr-props#overdue", "/mlb/hr-props#mismatches" -- in-page hash
 *     sub-states of existing routes, not distinct router paths.
 */
const EXPECTED_MLB_TOOL_ROUTES = [
  "/mlb",
  "/mlb/props",
  "/mlb/hr-props",
  "/mlb/sin-city",
  "/mlb/strikeout-props",
  "/mlb/batter-vs-pitcher",
  "/mlb/numerology",
  "/mlb/power-rankings",
] as const;

const BANNED_PUBLIC_LABELS = ["K Props", "Hit Props", "Prop Optimizer", "Batter Matchups", "BvP Props"];

describe("MLB_TOOLS registry uniqueness", () => {
  it("has exactly one entry per canonical MlbToolId, no more, no fewer", () => {
    expect(MLB_TOOLS.map((tool) => tool.id).sort()).toEqual([...ALL_TOOL_IDS].sort());
  });

  it("has no duplicate ids", () => {
    const ids = MLB_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate routes", () => {
    const routes = MLB_TOOLS.map((tool) => tool.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe("MLB_TOOLS immutability", () => {
  it("freezes the top-level registry array", () => {
    expect(Object.isFrozen(MLB_TOOLS)).toBe(true);
    expect(() => {
      (MLB_TOOLS as unknown as unknown[]).push({});
    }).toThrow();
  });

  it("freezes each tool definition", () => {
    for (const tool of MLB_TOOLS) {
      expect(Object.isFrozen(tool)).toBe(true);
      expect(() => {
        (tool as { displayName: string }).displayName = "mutated";
      }).toThrow();
    }
  });

  it("freezes each tool's relatedToolIds array", () => {
    for (const tool of MLB_TOOLS) {
      expect(Object.isFrozen(tool.relatedToolIds)).toBe(true);
      expect(() => {
        tool.relatedToolIds.push("numerology");
      }).toThrow();
    }
  });
});

describe("getMlbTool", () => {
  it("returns the correct, matching entry for every registered id", () => {
    for (const id of ALL_TOOL_IDS) {
      expect(getMlbTool(id).id).toBe(id);
    }
  });
});

describe("getMlbToolByRoute", () => {
  it("resolves every registered route to its own tool", () => {
    for (const tool of MLB_TOOLS) {
      expect(getMlbToolByRoute(tool.route)?.id).toBe(tool.id);
    }
  });

  it("returns undefined for an unregistered route rather than falling back to a wrong tool", () => {
    expect(getMlbToolByRoute("/mlb/does-not-exist")).toBeUndefined();
  });

  it("returns undefined for non-tool MLB routes (x-export, demo, hash-only)", () => {
    expect(getMlbToolByRoute("/mlb/hr-props/x-export")).toBeUndefined();
    expect(getMlbToolByRoute("/mlb/strikeout-props/x-export")).toBeUndefined();
    expect(getMlbToolByRoute("/mlb/numerology/x-export")).toBeUndefined();
    expect(getMlbToolByRoute("/mlb-demo")).toBeUndefined();
    expect(getMlbToolByRoute("/mlb#schedule")).toBeUndefined();
  });

  it("does not throw for an unknown route", () => {
    expect(() => getMlbToolByRoute("/totally/unknown")).not.toThrow();
  });
});

describe("related-tool integrity", () => {
  it("every relatedToolId references a real registry entry", () => {
    for (const tool of MLB_TOOLS) {
      for (const relatedId of tool.relatedToolIds) {
        expect(ALL_TOOL_IDS).toContain(relatedId);
      }
    }
  });

  it("a tool never lists itself as related", () => {
    for (const tool of MLB_TOOLS) {
      expect(tool.relatedToolIds).not.toContain(tool.id);
    }
  });

  it("getRelatedMlbTools returns full tool definitions matching the tool's relatedToolIds", () => {
    const hrProps = getMlbTool("hr-props");
    const related = getRelatedMlbTools("hr-props");
    expect(related.map((tool) => tool.id).sort()).toEqual([...hrProps.relatedToolIds].sort());
    expect(related.some((tool) => tool.id === "hr-props")).toBe(false);
  });
});

describe("getVisibleMlbTools", () => {
  it("returns only tools flagged showInNav, in canonical registry order", () => {
    const visible = getVisibleMlbTools();
    expect(visible.every((tool) => tool.showInNav)).toBe(true);
    expect(visible.map((tool) => tool.id)).toEqual(MLB_TOOLS.filter((tool) => tool.showInNav).map((tool) => tool.id));
  });
});

describe("canonical naming", () => {
  it("does not use any banned public label as a displayName or shortName", () => {
    for (const tool of MLB_TOOLS) {
      for (const banned of BANNED_PUBLIC_LABELS) {
        expect(tool.displayName).not.toBe(banned);
        expect(tool.shortName).not.toBe(banned);
        expect(tool.displayName.toLowerCase()).not.toContain(banned.toLowerCase());
        expect(tool.shortName.toLowerCase()).not.toContain(banned.toLowerCase());
      }
    }
  });

  it("maps /mlb/batter-vs-pitcher to the Batter vs Pitcher tool", () => {
    const tool = getMlbToolByRoute("/mlb/batter-vs-pitcher");
    expect(tool?.id).toBe("batter-vs-pitcher");
    expect(tool?.shortName).toBe("Batter vs Pitcher");
  });

  it("maps /mlb/strikeout-props to the Strikeout Props tool", () => {
    const tool = getMlbToolByRoute("/mlb/strikeout-props");
    expect(tool?.id).toBe("strikeout-props");
    expect(tool?.shortName).toBe("Strikeout Props");
  });

  it("maps /mlb/props to the Props Hub tool", () => {
    const tool = getMlbToolByRoute("/mlb/props");
    expect(tool?.id).toBe("props-hub");
    expect(tool?.shortName).toBe("Props Hub");
  });

  it("uses exactly the approved canonical shortName for every tool", () => {
    const shortNamesById = Object.fromEntries(MLB_TOOLS.map((tool) => [tool.id, tool.shortName]));
    expect(shortNamesById).toEqual({
      "game-matchups": "Game Matchups",
      "hr-props": "HR Props",
      "strikeout-props": "Strikeout Props",
      "batter-vs-pitcher": "Batter vs Pitcher",
      "props-hub": "Props Hub",
      "power-rankings": "Power Rankings",
      "sin-city": "Sin City",
      numerology: "Numerology",
    });
  });
});

describe("public route coverage against App.tsx", () => {
  it("every registry route exists in the current App.tsx MLB route tree", () => {
    const registryRoutes = MLB_TOOLS.map((tool) => tool.route).sort();
    expect(registryRoutes).toEqual([...EXPECTED_MLB_TOOL_ROUTES].sort());
  });

  it("every intended public MLB route in App.tsx has exactly one registry entry", () => {
    for (const route of EXPECTED_MLB_TOOL_ROUTES) {
      const matches = MLB_TOOLS.filter((tool) => tool.route === route);
      expect(matches).toHaveLength(1);
    }
  });

  it("does not register any non-tool MLB route (x-export, demo, hash-only)", () => {
    const registryRoutes = new Set(MLB_TOOLS.map((tool) => tool.route));
    expect(registryRoutes.has("/mlb/hr-props/x-export")).toBe(false);
    expect(registryRoutes.has("/mlb/strikeout-props/x-export")).toBe(false);
    expect(registryRoutes.has("/mlb/numerology/x-export")).toBe(false);
    expect(registryRoutes.has("/mlb-demo")).toBe(false);
  });
});

describe("consistency with sectionNav.ts", () => {
  // Only sectionNav items whose stable `id` matches a real MlbToolId are
  // standalone tools with a registry counterpart. sectionNav.ts also
  // intentionally contains non-tool utility items (moneyline-edges,
  // pitcher-regression, overdue-batters, biggest-mismatches) and a section
  // header ("Models & Specials") -- those are deliberately not forced into
  // a one-to-one mapping here.
  const toolNavItems = MLB_NAV_ITEMS.filter((item): item is typeof item & { id: MlbToolId } =>
    (ALL_TOOL_IDS as string[]).includes(item.id),
  );

  it("finds a sectionNav counterpart for every registry tool", () => {
    expect(toolNavItems.map((item) => item.id).sort()).toEqual([...ALL_TOOL_IDS].sort());
  });

  it("uses the same canonical label in the registry and the sidebar for every matched tool", () => {
    for (const navItem of toolNavItems) {
      const tool = getMlbTool(navItem.id);
      expect(tool.shortName).toBe(navItem.label);
    }
  });

  it("uses the same canonical route in the registry and the sidebar for every matched tool (hash-stripped)", () => {
    for (const navItem of toolNavItems) {
      const tool = getMlbTool(navItem.id);
      const [basePath] = navItem.href.split("#");
      expect(tool.route).toBe(basePath);
    }
  });

  it("preserves the same relative ordering as sectionNav.ts for the matched tools", () => {
    expect(toolNavItems.map((item) => item.id)).toEqual(MLB_TOOLS.map((tool) => tool.id));
  });
});
