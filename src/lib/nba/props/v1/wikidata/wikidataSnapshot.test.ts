import { describe, expect, it } from "vitest";
import { loadRecordedRaw, loadRecordedSnapshot, RECORDED_ITEMS } from "./__fixtures__/loadRecorded";
import { buildSnapshot, checkVocabulary, type SnapshotInput } from "./wikidataSnapshot";
import { FIVE_POSITION_QIDS, SNAPSHOT_SCHEMA_VERSION, WIKIDATA_LICENSE } from "./wikidataTypes";

const input = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
  raw: loadRecordedRaw(),
  retrievedAtUtc: "2026-10-23T14:00:00.000Z",
  userAgent: "Test/1.0 (https://example.org)",
  endpoint: "https://query.wikidata.org/sparql",
  requests: [],
  restrictedToItems: [...RECORDED_ITEMS],
  ...overrides,
});

const FIVE = new Set(Object.keys(FIVE_POSITION_QIDS));
const Q25075_IS_FIVE = FIVE.has("Q25075");
const liveFive = (player: { positions: Array<{ positionQid: string; rank: string }> }) => player.positions.filter((s) => s.rank !== "deprecated" && FIVE.has(s.positionQid)).map((s) => FIVE_POSITION_QIDS[s.positionQid]);

const byLabel = (label: string) => {
  const player = buildSnapshot(input()).players.find((p) => p.label === label);
  if (!player) throw new Error(`fixture has no ${label}`);
  return player;
};

describe("buildSnapshot on recorded Wikidata responses", () => {
  it("reproduces the snapshot the probe wrote, player for player", () => {
    expect(buildSnapshot(input()).players).toEqual(loadRecordedSnapshot().players);
  });

  it("is deterministic and ordered by item number", () => {
    const first = buildSnapshot(input());
    expect(buildSnapshot(input())).toEqual(first);
    const numbers = first.players.map((p) => Number(p.qid.slice(1)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(first.players).toHaveLength(RECORDED_ITEMS.length);
  });

  it("carries provenance and the CC0 license record, with no vocabulary drift", () => {
    const snapshot = buildSnapshot(input());
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.provenance.license).toEqual(WIKIDATA_LICENSE);
    expect(snapshot.provenance.license.spdx).toBe("CC0-1.0");
    expect(snapshot.provenance.vocabularyIssues).toEqual([]);
    expect(snapshot.provenance.retrievedAtUtc).toBe("2026-10-23T14:00:00.000Z");
  });

  it("keeps all three id schemes per item", () => {
    const kobe = byLabel("Kobe Bryant");
    expect(kobe.ids.espn).toEqual([{ value: "110", rank: "normal" }]);
    expect(kobe.ids["nba-com"]).toEqual([{ value: "977", rank: "normal" }]);
    expect(kobe.ids.bbref).toEqual([{ value: "b/bryanko01", rank: "normal" }]);
  });

  it("preserves multi-position statements without merging them into one label", () => {
    const kobe = byLabel("Kobe Bryant");
    expect([...liveFive(kobe)].sort()).toEqual(["PG", "SF", "SG"]);
    expect(kobe.positions.map((s) => s.positionQid)).toContain("Q2302133");
    expect([...liveFive(byLabel("LeBron James"))].sort()).toEqual(["PF", "PG", "SF"]);
  });

  it("keeps rank: a preferred position statement and a deprecated one", () => {
    expect(byLabel("Hidayet Türkoğlu").positions.some((s) => s.rank === "preferred")).toBe(true);
    const vesely = byLabel("Jan Veselý");
    expect(vesely.positions.filter((s) => s.rank === "deprecated")).toHaveLength(1);
    expect(liveFive(vesely).length).toBeGreaterThan(0);
  });

  it("keeps a preferred-rank id next to a second id for the same item", () => {
    const kaun = byLabel("Sasha Kaun");
    expect(kaun.ids.espn.map((i) => `${i.value}:${i.rank}`).sort()).toEqual(["3443:preferred", "3879:normal"]);
  });

  it("does not turn a football center into a basketball position", () => {
    const melli = byLabel("Nicolò Melli");
    expect(melli.positions.map((s) => s.positionQid)).toContain("Q25075");
    expect(Q25075_IS_FIVE).toBe(false);
    expect(liveFive(melli)).toEqual(["PF"]);
  });

  it("records references with retrieved dates and season qualifiers for other leagues' seasons", () => {
    const zipser = byLabel("Paul Zipser");
    const dates = zipser.positions.flatMap((s) => s.references.map((r) => r.retrievedOn)).filter(Boolean);
    expect(dates).toContain("2026-10-04");
    const seasons = zipser.positions.flatMap((s) => s.qualifiers.seasons.map((q) => q.label));
    expect(seasons).toContain("2026–27 ProA");
    expect(seasons.some((s) => / NBA season$/.test(String(s)))).toBe(false);
  });

  it("records open current-franchise memberships and which are dated", () => {
    expect(byLabel("Walker Kessler").openTeamMemberships).toEqual([{ teamQid: expect.stringMatching(/^Q\d+$/), start: "2026-01-01" }]);
    expect(byLabel("Marreese Speights").openTeamMemberships.every((m) => m.start === null)).toBe(true);
  });

  it("records no position for current players Wikidata has no label for", () => {
    expect(liveFive(byLabel("Walker Kessler"))).toEqual([]);
    expect(liveFive(byLabel("Ochai Agbaji"))).toEqual([]);
  });

  it("refuses to build from an incomplete set of result sets", () => {
    const raw = loadRecordedRaw();
    const { positionRefs: _omitted, ...rest } = raw;
    expect(() => buildSnapshot(input({ raw: rest }))).toThrow(/positionRefs/);
  });

  it("ignores rows it cannot interpret instead of inventing a record", () => {
    const raw = loadRecordedRaw();
    raw.positions = { results: { bindings: [{ item: { type: "uri", value: "not-a-wikidata-uri" }, st: { type: "uri", value: "x" } }, ...raw.positions.results.bindings] } };
    expect(buildSnapshot(input({ raw })).players).toEqual(loadRecordedSnapshot().players);
  });
});

describe("buildSnapshot robustness", () => {
  const uri = (value: string) => ({ type: "uri", value });
  const lit = (value: string) => ({ type: "literal", value });
  const withRows = (patch: (raw: ReturnType<typeof loadRecordedRaw>) => void) => {
    const raw = loadRecordedRaw();
    patch(raw);
    return buildSnapshot(input({ raw }));
  };

  it("keeps every season of a multi-season statement, each with its own label, in a fixed order", () => {
    const zipser = byLabel("Paul Zipser");
    const multi = zipser.positions.find((s) => s.qualifiers.seasons.length > 1);
    expect(multi?.qualifiers.seasons.length).toBe(7);
    const qids = multi?.qualifiers.seasons.map((s) => s.qid) ?? [];
    expect(qids).toEqual([...qids].sort());
    expect(multi?.qualifiers.seasons.every((s) => /Basketball Bundesliga$/.test(String(s.label)))).toBe(true);
    expect(multi?.qualifiers.teamQids).toEqual(["Q466143", "Q600149"]);
  });

  it("does not depend on the order of qualifier rows", () => {
    const reversed = withRows((raw) => {
      raw.positionQualifiers = { results: { bindings: [...raw.positionQualifiers.results.bindings].reverse() } };
      raw.positionRefs = { results: { bindings: [...raw.positionRefs.results.bindings].reverse() } };
      raw.positions = { results: { bindings: [...raw.positions.results.bindings].reverse() } };
    });
    expect(reversed.players).toEqual(loadRecordedSnapshot().players);
  });

  it("pairs a season item with the label from its own row, never another season's", () => {
    const snapshot = withRows((raw) => {
      const st = raw.positions.results.bindings[0].st?.value ?? "";
      raw.positionQualifiers = {
        results: {
          bindings: [
            { st: uri(st), season: uri("http://www.wikidata.org/entity/Q20"), seasonLabel: lit("2020–21 NBA season") },
            { st: uri(st), season: uri("http://www.wikidata.org/entity/Q10"), seasonLabel: lit("2010–11 NBA season") },
            { st: uri(st), season: uri("http://www.wikidata.org/entity/Q10") },
          ],
        },
      };
    });
    const qualified = snapshot.players.flatMap((p) => p.positions).filter((s) => s.qualifiers.seasons.length > 0);
    expect(qualified).toHaveLength(1);
    expect(qualified[0].qualifiers.seasons).toEqual([{ qid: "Q10", label: "2010–11 NBA season" }, { qid: "Q20", label: "2020–21 NBA season" }]);
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("rejects a statement whose rank is the inherited name %s", (rank) => {
    const snapshot = withRows((raw) => {
      raw.positions = { results: { bindings: raw.positions.results.bindings.map((b) => ({ ...b, rank: lit(rank) })) } };
    });
    expect(snapshot.players.every((p) => p.positions.length === 0)).toBe(true);
  });

  it("rejects an id whose rank is an inherited name", () => {
    const snapshot = withRows((raw) => {
      raw.ids = { results: { bindings: raw.ids.results.bindings.map((b) => ({ ...b, rank: lit("constructor") })) } };
    });
    expect(snapshot.players).toEqual([]);
  });

  it("stores no label when the label service fell back to printing the item id", () => {
    const snapshot = withRows((raw) => {
      raw.labels = { results: { bindings: raw.labels.results.bindings.map((b) => ({ ...b, label: lit((b.item?.value ?? "").split("/").pop() ?? "") })) } };
    });
    expect(snapshot.players.every((p) => p.label === null)).toBe(true);
  });
});

describe("checkVocabulary", () => {
  const meta = (overrides: Record<string, string> = {}) => {
    const labels: Record<string, string> = {
      P3685: "ESPN.com NBA player ID", P3647: "NBA.com player ID", P2685: "Basketball Reference NBA player ID", P413: "position played on team / speciality",
      P54: "member of sports team", Q212413: "point guard", Q273199: "shooting guard", Q308879: "small forward", Q462471: "power forward", Q222052: "center", ...overrides,
    };
    return { results: { bindings: Object.entries(labels).map(([id, label]) => ({ entity: { type: "uri", value: `http://www.wikidata.org/entity/${id}` }, label: { type: "literal", value: label } })) } };
  };

  it("passes when every label is as expected", () => {
    expect(checkVocabulary(meta())).toEqual([]);
    expect(checkVocabulary(loadRecordedRaw().meta)).toEqual([]);
  });

  it("reports a renamed property or position", () => {
    expect(checkVocabulary(meta({ P3685: "ESPN player id v2" }))).toEqual(['P3685: label is "ESPN player id v2", expected "ESPN.com NBA player ID"']);
  });

  it("reports an entity that returned no label", () => {
    const missing = meta();
    missing.results.bindings = missing.results.bindings.filter((b) => !b.entity.value.endsWith("Q222052"));
    expect(checkVocabulary(missing)).toEqual(['Q222052: no English label returned (expected "center")']);
  });
});
