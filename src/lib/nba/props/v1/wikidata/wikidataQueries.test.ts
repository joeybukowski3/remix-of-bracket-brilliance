import { describe, expect, it } from "vitest";
import { buildQueries, PROBE_LIMITS, WIKIDATA_SPARQL_ENDPOINT } from "./wikidataQueries";

describe("probe queries", () => {
  const queries = buildQueries();

  it("plans no more requests than the cap", () => {
    expect(queries.length).toBeLessThanOrEqual(PROBE_LIMITS.maxRequests);
    expect(new Set(queries.map((q) => q.id)).size).toBe(queries.length);
  });

  it("uses only the public Wikidata query endpoint", () => {
    expect(WIKIDATA_SPARQL_ENDPOINT).toBe("https://query.wikidata.org/sparql");
  });

  it("issues read-only SELECTs, each with a LIMIT within the row cap", () => {
    for (const { id, sparql } of queries) {
      expect(sparql.startsWith("SELECT"), id).toBe(true);
      expect(sparql, id).not.toMatch(/\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE)\b/i);
      const limit = /LIMIT (\d+)\s*$/.exec(sparql);
      expect(limit, id).not.toBeNull();
      expect(Number(limit?.[1]), id).toBeLessThanOrEqual(PROBE_LIMITS.maxRowsPerQuery);
    }
  });

  it("never federates to another endpoint", () => {
    for (const { id, sparql } of queries) expect(sparql, id).not.toMatch(/SERVICE\s*<|SERVICE\s+(?!wikibase:label)/i);
  });

  it("builds the population as a DISTINCT sub-select so ids that appear under several schemes are not multiplied", () => {
    for (const id of ["ids", "labels", "positions", "positionRefs", "positionQualifiers", "openTeams", "modified"] as const) {
      expect(queries.find((q) => q.id === id)?.sparql, id).toContain("SELECT DISTINCT ?item");
    }
  });

  it("joins the ESPN, NBA.com and Basketball-Reference id properties and the position property", () => {
    const text = queries.map((q) => q.sparql).join("\n");
    for (const property of ["P3685", "P3647", "P2685", "P413", "P54"]) expect(text).toContain(property);
  });

  it("forces written-order evaluation on the heavy joins", () => {
    for (const id of ["positions", "positionRefs", "positionQualifiers", "openTeams", "modified"] as const) {
      expect(queries.find((q) => q.id === id)?.sparql, id).toContain('hint:optimizer "None"');
    }
  });

  it("restricts to explicit items when given and rejects anything that is not an item id", () => {
    const restricted = buildQueries(["Q24200", "Q29604"]);
    expect(restricted.find((q) => q.id === "positions")?.sparql).toContain("VALUES ?item { wd:Q24200 wd:Q29604 }");
    expect(() => buildQueries(["Q1 } DROP"])).toThrow(/Not a Wikidata item id/);
    expect(() => buildQueries(["P413"])).toThrow(/Not a Wikidata item id/);
  });
});
