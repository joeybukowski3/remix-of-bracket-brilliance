import { describe, expect, it } from "vitest";
import {
  COLUMN_IDS,
  COLUMN_PREFERENCE_KEY,
  DEFAULT_COLUMNS,
  clearColumnPreference,
  defaultSelection,
  loadColumnPreference,
  needsSeasonStats,
  parseColumnPreference,
  saveColumnPreference,
  visibleColumns,
  withColumn,
} from "./boardColumns";

/** A throwaway in-memory Storage so no test touches the real one. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("default columns", () => {
  it("are, in order: MPG, per game, per minute, player L10, opponent L10 allowed, matchup, JKB projection", () => {
    expect([...DEFAULT_COLUMNS]).toEqual(["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "jkbProjection"]);
  });

  it("are all registered columns, and display in registry order whatever order they were chosen in", () => {
    expect(DEFAULT_COLUMNS.every((id) => (COLUMN_IDS as readonly string[]).includes(id))).toBe(true);
    const shuffled = new Set(["jkbProjection", "mpg", "last10", "dvpAllowed"] as const);
    expect(visibleColumns(shuffled, true)).toEqual(["mpg", "last10", "dvpAllowed", "jkbProjection"]);
  });

  it("leave the sportsbook line, prices, JKB minutes, your minutes, adjusted values and the edge as optional columns", () => {
    const optional = COLUMN_IDS.filter((id) => !DEFAULT_COLUMNS.includes(id));
    for (const id of ["line", "overUnder", "jkbMinutes", "userMinutes", "adjustedProjection", "adjustedDifference", "modelEdge", "last5", "dvpAllowed", "dvpPrior", "dvpCurrent", "seasonRateEstimate", "seasonSample", "lastSeason"] as const) {
      expect(optional).toContain(id);
    }
  });

  it("each selection starts as a fresh set, so one viewer's change cannot alter the default", () => {
    const a = defaultSelection();
    a.add("line");
    expect(defaultSelection().has("line")).toBe(false);
  });
});

describe("visibleColumns", () => {
  it("drops season-dependent columns on a board without season statistics, and keeps the others", () => {
    const all = new Set(COLUMN_IDS);
    const shown = visibleColumns(all, false);
    expect(shown.some(needsSeasonStats)).toBe(false);
    expect(shown).toEqual(expect.arrayContaining(["dvpAllowed", "matchup", "jkbProjection", "line", "userMinutes", "adjustedProjection"]));
    expect(visibleColumns(all, true)).toEqual([...COLUMN_IDS]);
  });
});

describe("withColumn", () => {
  it("returns a new selection and leaves the input alone", () => {
    const base = defaultSelection();
    const added = withColumn(base, "line", true);
    expect(added.has("line")).toBe(true);
    expect(base.has("line")).toBe(false);
    expect(withColumn(added, "line", false).has("line")).toBe(false);
  });
});

describe("column preference", () => {
  it("round-trips a selection through storage, in registry order, as column ids and nothing else", () => {
    const storage = memoryStorage();
    expect(saveColumnPreference(() => storage, new Set(["jkbProjection", "mpg", "line"] as const))).toBe(true);
    const stored = storage.data.get(COLUMN_PREFERENCE_KEY) ?? "";
    expect(JSON.parse(stored)).toEqual({ version: 1, columns: ["mpg", "line", "jkbProjection"] });
    expect(loadColumnPreference(() => storage)).toEqual(new Set(["mpg", "line", "jkbProjection"]));
  });

  it("writes only to its own key", () => {
    const storage = memoryStorage();
    saveColumnPreference(() => storage, defaultSelection());
    expect([...storage.data.keys()]).toEqual([COLUMN_PREFERENCE_KEY]);
  });

  it("falls back to null for a missing, corrupt or foreign value, and ignores ids it does not know", () => {
    expect(parseColumnPreference(null)).toBeNull();
    for (const bad of ["", "not json", "42", "null", "[]", '{"columns":"mpg"}', '{"columns":null}']) expect(parseColumnPreference(bad)).toBeNull();
    expect(parseColumnPreference('{"columns":["mpg","Demo Guard One","__proto__",7,null,"line"]}')).toEqual(new Set(["mpg", "line"]));
  });

  it("ignores a stored list whose ids are all unknown (for example after a rename), so the table is never blanked by it", () => {
    expect(parseColumnPreference('{"columns":["renamedColumn","other"]}')).toBeNull();
    expect(parseColumnPreference('{"columns":["renamedColumn","mpg"]}')).toEqual(new Set(["mpg"]));
  });

  it("treats an emptied selection as a valid choice (no optional columns), distinct from nothing stored", () => {
    expect(parseColumnPreference('{"columns":[]}')).toEqual(new Set());
  });

  it("survives storage that is missing, blocked or throws", () => {
    const throwing = () => {
      throw new Error("blocked");
    };
    expect(loadColumnPreference(() => null)).toBeNull();
    expect(loadColumnPreference(throwing)).toBeNull();
    expect(loadColumnPreference(() => ({ getItem: throwing, setItem: throwing, removeItem: throwing }))).toBeNull();
    expect(saveColumnPreference(() => null, defaultSelection())).toBe(false);
    expect(saveColumnPreference(throwing, defaultSelection())).toBe(false);
    expect(saveColumnPreference(() => ({ getItem: () => null, setItem: throwing, removeItem: throwing }), defaultSelection())).toBe(false);
    expect(() => clearColumnPreference(throwing)).not.toThrow();
  });

  it("clears the stored choice", () => {
    const storage = memoryStorage({ [COLUMN_PREFERENCE_KEY]: '{"columns":["mpg"]}' });
    clearColumnPreference(() => storage);
    expect(storage.data.size).toBe(0);
  });
});
